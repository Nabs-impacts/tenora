"""
app/services/storage_service.py

Couche d'abstraction stockage : Cloudflare R2 en production, disque local en dev.

Usage :
    from app.services.storage_service import (
        upload_file, delete_file, get_display_url, get_presigned_url,
    )

- upload_file()       → retourne l'URL complète (R2) ou le chemin relatif (local)
- delete_file()       → supprime depuis R2 ou le disque selon l'env
- get_display_url()   → convertit n'importe quel format en URL affichable dans <img>
- get_presigned_url() → URL pré-signée temporaire pour téléchargement sécurisé (ebooks PDF)
                        Supporte response_content_disposition / response_content_type
                        pour forcer le comportement du navigateur (download vs inline).
"""

import uuid
from pathlib import Path

from loguru import logger

from app.config import settings

# ── Détection de l'environnement ──────────────────────────────────────────────

USE_R2: bool = bool(
    getattr(settings, "R2_ACCOUNT_ID",        "").strip() and
    getattr(settings, "R2_ACCESS_KEY_ID",     "").strip() and
    getattr(settings, "R2_SECRET_ACCESS_KEY", "").strip() and
    getattr(settings, "R2_BUCKET_NAME",       "").strip() and
    getattr(settings, "R2_PUBLIC_URL",        "").strip()
)

if USE_R2:
    logger.info("Storage → Cloudflare R2 activé")
else:
    logger.info("Storage → disque local (dev)")


# ── Client R2 (lazy) ──────────────────────────────────────────────────────────

def _get_r2_client():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def _content_type(extension: str) -> str:
    return {
        "jpg":  "image/jpeg",
        "jpeg": "image/jpeg",
        "png":  "image/png",
        "webp": "image/webp",
        "pdf":  "application/pdf",
    }.get(extension.lower(), "application/octet-stream")


# ── API publique ──────────────────────────────────────────────────────────────

def upload_file(file_data: bytes, extension: str, subfolder: str) -> str:
    """
    Upload un fichier et retourne :
    - En production (R2) : l'URL publique complète, ex. https://pub-xxx.r2.dev/products/uuid.webp
    - En dev (local)     : le chemin relatif,       ex. products/uuid.webp
    """
    extension = extension.lower().lstrip(".")
    filename  = f"{uuid.uuid4().hex}.{extension}"
    key       = f"{subfolder}/{filename}"

    if not USE_R2:
        path = Path(settings.UPLOAD_FOLDER) / subfolder
        path.mkdir(parents=True, exist_ok=True)
        (path / filename).write_bytes(file_data)
        logger.debug(f"[Storage-local] upload → {key}")
        return key

    try:
        client = _get_r2_client()
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=key,
            Body=file_data,
            ContentType=_content_type(extension),
        )
        url = f"{settings.R2_PUBLIC_URL.rstrip('/')}/{key}"
        logger.debug(f"[Storage-R2] upload → {url}")
        return url
    except Exception as e:
        logger.error(f"[Storage-R2] échec upload | key={key} | {e}")
        raise


def delete_file(path_or_url: str | None) -> None:
    if not path_or_url:
        return

    if not USE_R2:
        if path_or_url.startswith("http"):
            return
        full = Path(settings.UPLOAD_FOLDER) / path_or_url
        try:
            if full.exists():
                full.unlink()
                logger.debug(f"[Storage-local] supprimé → {full}")
        except OSError as e:
            logger.warning(f"[Storage-local] impossible de supprimer {full} | {e}")
        return

    key = path_or_url
    if path_or_url.startswith("http"):
        base = settings.R2_PUBLIC_URL.rstrip("/")
        key  = path_or_url[len(base):].lstrip("/")

    try:
        _get_r2_client().delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
        logger.debug(f"[Storage-R2] supprimé → {key}")
    except Exception as e:
        logger.warning(f"[Storage-R2] impossible de supprimer | key={key} | {e}")


def get_display_url(path_or_url: str | None, base_url: str = "") -> str | None:
    if not path_or_url:
        return None
    if path_or_url.startswith("http"):
        return path_or_url
    return f"{base_url}/uploads/{path_or_url}"


def get_presigned_url(
    path_or_url: str,
    expires_in: int = 3600,
    response_content_disposition: str | None = None,
    response_content_type: str | None = None,
) -> str | None:
    """
    Génère une URL pré-signée pour téléchargement sécurisé (ebooks PDF).

    - `expires_in`                    : durée de validité (s), défaut 1 h.
    - `response_content_disposition`  : ex. 'attachment; filename="x.pdf"' ou 'inline; filename="x.pdf"'.
    - `response_content_type`         : ex. 'application/pdf'.

    Retourne None si le storage local est utilisé (caller gère le fallback FileResponse).
    """
    if not USE_R2:
        return None

    key = path_or_url
    if path_or_url.startswith("http"):
        base = settings.R2_PUBLIC_URL.rstrip("/")
        key  = path_or_url[len(base):].lstrip("/")

    params: dict = {"Bucket": settings.R2_BUCKET_NAME, "Key": key}
    if response_content_disposition:
        params["ResponseContentDisposition"] = response_content_disposition
    if response_content_type:
        params["ResponseContentType"] = response_content_type

    try:
        url = _get_r2_client().generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expires_in,
        )
        logger.debug(
            f"[Storage-R2] presigned URL générée | key={key} | "
            f"expires_in={expires_in}s | disposition={response_content_disposition}"
        )
        return url
    except Exception as e:
        logger.error(f"[Storage-R2] échec presigned URL | key={key} | {e}")
        raise