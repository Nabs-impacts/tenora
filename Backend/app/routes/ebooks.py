"""
Routes e-books publiques — app/routes/ebooks.py
À inclure dans main.py :
    from app.routes.ebooks import router as ebooks_router
    app.include_router(ebooks_router, prefix="/ebooks", tags=["Ebooks"])
"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.ebook import EbookCategory
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.user import User
from app.services.storage_service import USE_R2, get_display_url, get_presigned_url

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


# ── Téléchargement protégé ───────────────────────────────────────────────────

@router.get("/{product_id}/download")
def download_ebook(
    product_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Télécharge le PDF d'un ebook — réservé aux acheteurs.
    En prod (R2)  → URL pré-signée (1 h).
    En dev (local) → FileResponse direct.
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.is_active == True,  # noqa: E712
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable.")

    if not product.pdf_path:
        raise HTTPException(status_code=404, detail="Aucun fichier PDF disponible pour ce produit.")

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

    if USE_R2:
        presigned_url = get_presigned_url(product.pdf_path, expires_in=3600)
        return RedirectResponse(url=presigned_url, status_code=302)

    pdf_file = Path(settings.UPLOAD_FOLDER) / product.pdf_path
    if not pdf_file.exists():
        raise HTTPException(status_code=404, detail="Fichier PDF introuvable sur le serveur.")

    safe_name = "".join(c for c in product.name if c.isalnum() or c in " -_").strip()
    filename  = f"{safe_name}.pdf"

    return FileResponse(
        path=str(pdf_file),
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )