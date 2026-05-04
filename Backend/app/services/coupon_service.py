"""
Logique métier autour des coupons.

Centralise :
  - la génération d'un code unique au format TENORA-XXXXXX...
  - la validation complète d'un coupon pour un produit/utilisateur donné

La validation est partagée entre :
  - POST /coupons/validate     (prévisualisation côté front user)
  - POST /orders/              (application réelle au moment de la commande)
"""
import re
import secrets
from datetime import datetime
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.models.coupon import Coupon
from app.models.product import Product
from app.schemas.coupon import COUPON_MAX_LEN, COUPON_MIN_LEN, COUPON_PREFIX

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sans 0/O/1/I → moins d'erreurs de saisie
_CODE_RE  = re.compile(rf"^{re.escape(COUPON_PREFIX)}[A-Z0-9]{{{COUPON_MIN_LEN},{COUPON_MAX_LEN}}}$")


def normalize_code(raw: str) -> str:
    """Trim + uppercase. Le préfixe TENORA- est ajouté si manquant."""
    s = (raw or "").strip().upper().replace(" ", "")
    if not s:
        return ""
    if not s.startswith(COUPON_PREFIX):
        # tolère que l'utilisateur oublie le préfixe
        s = COUPON_PREFIX + s
    return s


def is_valid_format(code: str) -> bool:
    return bool(_CODE_RE.match(code or ""))


def generate_code(db: Session, length: int = 10) -> str:
    """Génère un code unique. Retente jusqu'à 10 fois en cas de collision."""
    length = max(COUPON_MIN_LEN, min(COUPON_MAX_LEN, length))
    for _ in range(10):
        suffix = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        code = f"{COUPON_PREFIX}{suffix}"
        if not db.query(Coupon.id).filter(Coupon.code == code).first():
            return code
    # Fallback ultra rare : on rallonge d'un caractère
    return generate_code(db, min(length + 1, COUPON_MAX_LEN))


def validate_for_order(
    db: Session,
    raw_code: str,
    product: Product,
    user_id: int,
    quantity: int,
) -> Tuple[Optional[Coupon], float, Optional[str]]:
    """
    Retourne (coupon, discount_amount, error).
      - error None  → coupon utilisable, on applique discount_amount
      - error str   → message à afficher au client, coupon=None, discount=0
    """
    code = normalize_code(raw_code)
    if not is_valid_format(code):
        return None, 0.0, "Format de code invalide."

    coupon: Optional[Coupon] = db.query(Coupon).filter(Coupon.code == code).first()
    if not coupon or not coupon.is_active:
        return None, 0.0, "Code promo introuvable ou désactivé."

    if coupon.expires_at and coupon.expires_at < datetime.utcnow():
        return None, 0.0, "Ce code promo a expiré."

    if coupon.max_uses is not None and coupon.times_used >= coupon.max_uses:
        return None, 0.0, "Ce code promo a atteint sa limite d'utilisations."

    if coupon.user_id is not None and coupon.user_id != user_id:
        return None, 0.0, "Ce code promo est réservé à un autre utilisateur."

    if not coupon.applies_to_product(product):
        return None, 0.0, "Ce code promo ne s'applique pas à ce produit."

    base_total = (product.final_price if hasattr(product, "final_price") else product.price) * max(1, quantity)
    discount = coupon.compute_discount(base_total)
    if discount <= 0:
        return None, 0.0, "Ce code promo n'apporte aucune réduction."

    return coupon, discount, None
