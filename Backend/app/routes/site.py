import hashlib
import json
import time

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import and_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.product import Product
from app.schemas.schemas_product import ProductResponse
from app.services.settings_service import (
    DEFAULT_ANNOUNCEMENT,
    DEFAULT_PAYMENT_METHODS,
    get_setting,
)

router = APIRouter(prefix="/site", tags=["Site"])

# ── Cache TTL simple (thread-safe en lecture, suffisant pour un process unique) ──
_CACHE: dict = {}
_CACHE_TTL = 300  # secondes


def _cache_get(key: str):
    entry = _CACHE.get(key)
    if entry and time.monotonic() < entry["exp"]:
        return entry["value"]
    return None


def _cache_set(key: str, value, ttl: int = _CACHE_TTL):
    _CACHE[key] = {"value": value, "exp": time.monotonic() + ttl}


def _cache_invalidate(key: str):
    _CACHE.pop(key, None)


def _etag(data: dict) -> str:
    """ETag léger basé sur le contenu JSON sérialisé."""
    return hashlib.md5(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _set_cache_headers(response: Response, data: dict) -> str:
    """Applique ETag + Cache-Control no-cache sur la réponse.
    On garde le cache serveur (dict Python) pour les perfs, mais on interdit
    au navigateur de mettre en cache la réponse : ainsi, dès que
    invalidate_site_cache() est appelé (toggle maintenance, etc.),
    la prochaine requête du frontend obtient les données fraîches.
    Avec ETag + If-None-Match, les réponses inchangées coûtent un aller-réseau
    mais reviennent en 304 sans corps — zéro bande passante gaspillée.
    """
    tag = _etag(data)
    response.headers["Cache-Control"] = "private, no-cache, must-revalidate"
    response.headers["ETag"] = f'"{tag}"'
    return tag


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_site_data(db: Session) -> dict:
    """Construit le payload complet des paramètres publics (mis en cache)."""
    maintenance     = get_setting(db, "maintenance_mode", False)
    announcement    = get_setting(db, "announcement", DEFAULT_ANNOUNCEMENT)
    payment_methods = get_setting(db, "payment_methods", DEFAULT_PAYMENT_METHODS)
    featured_ids    = get_setting(db, "featured_product_ids", [])

    active_methods = [m for m in payment_methods if m.get("enabled", True)]

    if not isinstance(featured_ids, list):
        featured_ids = []
    featured_ids = [
        int(x)
        for x in featured_ids
        if isinstance(x, (int, str)) and str(x).lstrip("-").isdigit()
    ]

    return {
        "maintenance":          bool(maintenance),
        "announcement":         announcement if isinstance(announcement, dict) else DEFAULT_ANNOUNCEMENT,
        "payment_methods":      active_methods,
        "featured_product_ids": featured_ids,
    }


def _base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/init")
def site_init(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    ✅ ENDPOINT UNIFIÉ — remplace :
        GET /site/settings
        GET /orders/payment-methods
    Le frontend n'a plus besoin que d'UN seul appel au démarrage.
    Cache serveur (dict Python) 5 min pour éviter les hits DB répétés.
    Cache navigateur DÉSACTIVÉ (no-cache) : ainsi, dès que le mode
    maintenance change, la prochaine requête obtient les données fraîches
    sans attendre l'expiration du cache HTTP.
    Supporte If-None-Match → 304 Not Modified pour économiser la bande passante.
    """
    cached = _cache_get("site_init")
    if cached is not None:
        data = cached
    else:
        data = _build_site_data(db)
        _cache_set("site_init", data)

    tag = _set_cache_headers(response, data)

    # 304 Not Modified si le client a déjà cette version exacte
    if request.headers.get("if-none-match") == f'"{tag}"':
        return Response(status_code=304)

    return data


@router.get("/settings")
def public_settings(response: Response, db: Session = Depends(get_db)):
    """
    Rétro-compatibilité — utilise le même cache que /init.
    Retourne maintenance + announcement uniquement (sans payment_methods).
    """
    cached = _cache_get("site_init")
    if cached is not None:
        partial = {"maintenance": cached["maintenance"], "announcement": cached["announcement"]}
        _set_cache_headers(response, partial)
        return partial

    maintenance  = get_setting(db, "maintenance_mode", False)
    announcement = get_setting(db, "announcement", DEFAULT_ANNOUNCEMENT)

    partial = {
        "maintenance":  bool(maintenance),
        "announcement": announcement if isinstance(announcement, dict) else DEFAULT_ANNOUNCEMENT,
    }
    _set_cache_headers(response, partial)
    return partial


@router.get("/home")
def site_home(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Endpoint optimisé pour la page d'accueil :
    settings publics + produits "featured" résolus, en une seule réponse.
    Cache serveur 5 min + Cache-Control navigateur (304 possible).
    """
    cached = _cache_get("site_home")
    if cached is not None:
        _set_cache_headers(response, cached)
        return cached

    base = _build_site_data(db)
    featured_ids = base["featured_product_ids"]
    base_url = _base_url(request)

    products: list[dict] = []
    if featured_ids:
        rows = (
            db.query(Product)
            .options(joinedload(Product.category))
            .filter(and_(Product.id.in_(featured_ids), Product.is_active == True))
            .all()
        )
        by_id = {p.id: p for p in rows}
        ordered = [by_id[i] for i in featured_ids if i in by_id][:8]
        products = [
            ProductResponse.from_orm_with_url(
                p,
                base_url=base_url,
                fallback_image=(
                    f"{base_url}/uploads/{p.category.image_path}"
                    if p.category and p.category.image_path
                    else None
                ),
            ).model_dump()
            for p in ordered
        ]

    payload = {**base, "featured_products": products}
    _cache_set("site_home", payload)
    _set_cache_headers(response, payload)
    return payload


# ── Exposition de l'invalidation du cache ────────────────────────────────────
def invalidate_site_cache():
    """Invalide le cache dès qu'un paramètre est modifié via le panel admin."""
    _cache_invalidate("site_init")
    _cache_invalidate("site_home")
