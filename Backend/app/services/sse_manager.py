"""
SSE Manager — broker central pour les notifications temps réel admin.

Architecture :
  - Un asyncio.Queue par admin connecté (stocké dans `_clients`)
  - `subscribe()` / `unsubscribe()` gèrent le cycle de vie des connexions
  - `notify_new_order()` est thread-safe : peut être appelé depuis une route
    synchrone FastAPI (qui tourne dans un threadpool executor)
  - `event_stream()` est le générateur async branché sur la StreamingResponse
"""

import asyncio
import json
from typing import AsyncGenerator
from uuid import uuid4

from loguru import logger

# Dict { client_id → asyncio.Queue } — modifié depuis le thread principal uniquement
_clients: dict[str, asyncio.Queue] = {}

# Référence à la boucle uvicorn, capturée au démarrage via init_loop()
_loop: asyncio.AbstractEventLoop | None = None

HEARTBEAT_INTERVAL = 25   # secondes — keepalive pour les proxies/Nginx
QUEUE_MAX_SIZE     = 30   # si la queue est pleine, l'admin est considéré mort


def init_loop(loop: asyncio.AbstractEventLoop) -> None:
    """À appeler dans le lifespan FastAPI pour capturer la boucle uvicorn."""
    global _loop
    _loop = loop
    logger.info("[SSE] Event loop capturée")


async def subscribe() -> tuple[str, asyncio.Queue]:
    """Enregistre un nouvel admin SSE. Retourne (client_id, queue)."""
    client_id = str(uuid4())
    queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAX_SIZE)
    _clients[client_id] = queue
    logger.info(f"[SSE] Admin connecté | id={client_id[:8]} | total={len(_clients)}")
    return client_id, queue


def unsubscribe(client_id: str) -> None:
    """Retire un admin de la liste des connexions actives."""
    _clients.pop(client_id, None)
    logger.info(f"[SSE] Admin déconnecté | id={client_id[:8]} | total={len(_clients)}")


async def _broadcast(payload: str) -> None:
    """Envoie le payload à tous les admins connectés. Retire les clients morts."""
    dead: list[str] = []
    for cid, queue in list(_clients.items()):
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            logger.warning(f"[SSE] Queue pleine → client retiré | id={cid[:8]}")
            dead.append(cid)
    for cid in dead:
        unsubscribe(cid)


def notify_new_order(order: dict) -> None:
    """
    Thread-safe. Appelé depuis une route sync FastAPI après db.commit().
    Sérialise la commande en SSE et la pousse à tous les admins connectés.
    """
    if not _clients:
        return   # Personne de connecté → rien à faire

    if _loop is None or not _loop.is_running():
        logger.warning("[SSE] Loop indisponible, notification ignorée")
        return

    payload = f"event: new_order\ndata: {json.dumps(order, ensure_ascii=False)}\n\n"
    asyncio.run_coroutine_threadsafe(_broadcast(payload), _loop)


async def event_stream(queue: asyncio.Queue, client_id: str) -> AsyncGenerator[str, None]:
    """
    Générateur async branché sur la StreamingResponse.
    Envoie un heartbeat toutes les HEARTBEAT_INTERVAL secondes pour que Nginx
    ne coupe pas la connexion silencieusement (X-Accel-Buffering: no requis aussi).
    """
    try:
        while True:
            try:
                data = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
                yield data
            except asyncio.TimeoutError:
                yield "event: ping\ndata: {}\n\n"
    except asyncio.CancelledError:
        pass   # Déconnexion propre
    finally:
        unsubscribe(client_id)
