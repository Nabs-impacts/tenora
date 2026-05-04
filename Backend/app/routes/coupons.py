"""
Endpoint public : prévisualisation d'un coupon depuis la page produit.

POST /coupons/validate
  body : { code, product_id, quantity }
  → { valid, code, discount_amount, final_price, reason? }

Volontairement pas de GET (évite l'énumération via les logs / referrers).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_verified_user
from app.models.product import Product
from app.models.user import User
from app.schemas.coupon import CouponValidateRequest, CouponValidateResponse
from app.services.coupon_service import validate_for_order
from app.services.rate_limiter import limiter

router = APIRouter()


@router.post("/validate", response_model=CouponValidateResponse)
@limiter.limit("20/minute")
def validate_coupon(
    request: Request,
    data: CouponValidateRequest,
    db: Session = Depends(get_db),
    user: User  = Depends(get_verified_user),
):
    product = db.query(Product).filter(
        Product.id == data.product_id,
        Product.is_active == True,  # noqa: E712
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable.")

    coupon, discount, error = validate_for_order(
        db, data.code, product, user.id, data.quantity,
    )
    base_total = (product.final_price if hasattr(product, "final_price") else product.price) * max(1, data.quantity)

    if error or not coupon:
        return CouponValidateResponse(
            valid=False, code=data.code.upper(),
            discount_amount=0.0, final_price=base_total, reason=error or "Coupon invalide.",
        )

    return CouponValidateResponse(
        valid=True, code=coupon.code,
        discount_amount=discount,
        final_price=max(0.0, base_total - discount),
    )
