"""
Routes e-books publiques — app/routes/ebooks.py
À inclure dans main.py :
    from app.routes.ebooks import router as ebooks_router
    app.include_router(ebooks_router, prefix="/ebooks", tags=["Ebooks"])
"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.ebook import EbookCategory
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.user import User
from app.services.storage_service import (
    USE_R2,
    get_display_url,
    get_presigned_url,
)

router = APIRouter()


# ── Liste publique des ebooks ────────────────────────────────────────────────

@router.get("/")
def list_ebooks(request: Request, db: Session = Depends(get_db)):
    """Tous les produits flaggés `is_ebook = True` et actifs."""
    base_url = str(request.base_url).rstrip("/")
    ebooks = (
        db.query(Product)
        .options(joinedload(Product.ebook_category))
        .filter(
            Product.is_ebook == True,   # noqa: E712
            Product.is_active == True,  # noqa: E712
        )
        .order_by(Product.created_at.desc())
        .all()
    )
    return [
        {
            "id":                  p.id,
            "name":                p.name,
            "description":         p.description,
            "price":               p.price,
            "discount_percent":    p.discount_percent,
            "final_price":         p.final_price,
            "image_path":          p.image_path,
            "image_url":           get_display_url(p.image_path, base_url),
            "has_pdf":             bool(p.pdf_path),
            "ebook_category_id":   p.ebook_category_id,
            "ebook_category_name": p.ebook_category.name if p.ebook_category else None,
            "required_fields":     p.required_fields,
        }
        for p in ebooks
    ]


# ── Helpers internes ─────────────────────────────────────────────────────────

def _check_access_and_get_product(
    product_id: int,
    db: Session,
    user: User,
) -> Product:
    """Vérifie qu'un user a bien acheté l'ebook et retourne le produit."""
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.is_active == True,  # noqa: E712
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable.")

    if not product.pdf_path:
        raise HTTPException(
            status_code=404,
            detail="Aucun fichier PDF disponible pour ce produit.",
        )

    order = db.query(Order).filter(
        Order.user_id    == user.id,
        Order.product_id == product_id,
        Order.status     == OrderStatus.completed,
    ).first()

    if not order:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé. Vous devez acheter cet e-book pour le télécharger.",
        )

    return product


def _safe_filename(name: str) -> str:
    safe = "".join(c for c in name if c.isalnum() or c in " -_").strip()
    return f"{safe or 'ebook'}.pdf"


def _presigned_r2_url(pdf_path: str, filename: str, inline: bool) -> str:
    """Génère une URL pré-signée R2 avec Content-Disposition forcé."""
    disposition = "inline" if inline else "attachment"
    # On passe ResponseContentDisposition pour forcer le header côté R2.
    return get_presigned_url(
        pdf_path,
        expires_in=3600,
        response_content_disposition=f'{disposition}; filename="{filename}"',
        response_content_type="application/pdf",
    )


# ── Téléchargement protégé (302 redirect) ────────────────────────────────────

@router.get("/{product_id}/download")
def download_ebook(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    mode: str = Query("download", regex="^(download|read)$"),
):
    """
    Télécharge (ou ouvre en lecture) le PDF d'un ebook — réservé aux acheteurs.

    - `mode=download` (défaut) : Content-Disposition: attachment → téléchargement
    - `mode=read`              : Content-Disposition: inline     → lecture navigateur

    En prod (R2)  → 302 redirect vers URL pré-signée (1 h).
    En dev (local) → FileResponse direct.
    """
    product = _check_access_and_get_product(product_id, db, user)
    inline = mode == "read"
    filename = _safe_filename(product.name)

    if USE_R2:
        presigned_url = _presigned_r2_url(product.pdf_path, filename, inline)
        return RedirectResponse(url=presigned_url, status_code=302)

    pdf_file = Path(settings.UPLOAD_FOLDER) / product.pdf_path
    if not pdf_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Fichier PDF introuvable sur le serveur.",
        )

    disposition = "inline" if inline else "attachment"
    return FileResponse(
        path=str(pdf_file),
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


# ── Endpoint JSON : URL pré-signée (fallback Bearer token) ───────────────────

@router.get("/{product_id}/download-url")
def get_ebook_download_url(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    mode: str = Query("download", regex="^(download|read)$"),
):
    """
    Retourne en JSON l'URL pré-signée R2 pour télécharger / lire l'ebook.
    Utile si l'auth est par Bearer token (impossible de l'envoyer via window.open).
    Le frontend fait : window.open(json.url, "_blank").

    En dev (local, pas de R2), retourne simplement l'URL du endpoint /download
    qui sera servi en FileResponse.
    """
    product = _check_access_and_get_product(product_id, db, user)
    inline = mode == "read"
    filename = _safe_filename(product.name)

    if USE_R2:
        url = _presigned_r2_url(product.pdf_path, filename, inline)
        return {"url": url, "mode": mode, "filename": filename}

    # Fallback dev — pas d'URL signée, on laisse le frontend appeler /download
    return {
        "url": None,
        "mode": mode,
        "filename": filename,
        "fallback_endpoint": f"/ebooks/{product_id}/download?mode={mode}",
    }