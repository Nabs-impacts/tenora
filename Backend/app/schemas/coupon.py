from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ── Génération de code côté backend ───────────────────────────────────────────
# Format obligatoire : TENORA-XXXXXXXX..XXXXXXXXXXXX (8 à 12 chars [A-Z0-9])
COUPON_PREFIX = "TENORA-"
COUPON_MIN_LEN = 8
COUPON_MAX_LEN = 12


class CouponBase(BaseModel):
    discount_percent: Optional[float] = Field(None, gt=0, le=100)
    discount_amount:  Optional[float] = Field(None, gt=0)
    user_id:    Optional[int] = None
    max_uses:   Optional[int] = Field(None, gt=0)
    expires_at: Optional[datetime] = None
    is_active:  bool = True
    product_ids:  list[int] = []
    category_ids: list[int] = []

    @model_validator(mode="after")
    def _exactly_one_discount(self):
        if (self.discount_percent is None) == (self.discount_amount is None):
            raise ValueError("Renseignez soit un pourcentage, soit un montant fixe (pas les deux).")
        return self


class CouponCreate(CouponBase):
    # code optionnel : si absent, le service en génère un au format TENORA-XXXX
    code: Optional[str] = None
    code_length: int = Field(10, ge=COUPON_MIN_LEN, le=COUPON_MAX_LEN)


class CouponUpdate(BaseModel):
    """Tous les champs sont optionnels — PATCH partiel."""
    discount_percent: Optional[float] = Field(None, gt=0, le=100)
    discount_amount:  Optional[float] = Field(None, gt=0)
    user_id:    Optional[int] = None
    max_uses:   Optional[int] = Field(None, gt=0)
    expires_at: Optional[datetime] = None
    is_active:  Optional[bool] = None
    product_ids:  Optional[list[int]] = None
    category_ids: Optional[list[int]] = None


class CouponResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    discount_percent: Optional[float] = None
    discount_amount:  Optional[float] = None
    user_id:    Optional[int] = None
    max_uses:   Optional[int] = None
    times_used: int
    expires_at: Optional[datetime] = None
    is_active:  bool
    created_at: datetime
    product_ids:  list[int] = []
    category_ids: list[int] = []

    @classmethod
    def from_orm_full(cls, obj) -> "CouponResponse":
        return cls(
            id=obj.id, code=obj.code,
            discount_percent=obj.discount_percent, discount_amount=obj.discount_amount,
            user_id=obj.user_id, max_uses=obj.max_uses, times_used=obj.times_used,
            expires_at=obj.expires_at, is_active=obj.is_active, created_at=obj.created_at,
            product_ids=[p.id for p in obj.products],
            category_ids=[c.id for c in obj.categories],
        )


# ── Endpoint public de prévisualisation (utilisé sur la page produit) ────────
class CouponValidateRequest(BaseModel):
    code: str = Field(..., min_length=len(COUPON_PREFIX) + COUPON_MIN_LEN,
                      max_length=len(COUPON_PREFIX) + COUPON_MAX_LEN)
    product_id: int
    quantity:   int = Field(1, ge=1)


class CouponValidateResponse(BaseModel):
    valid: bool
    code: str
    discount_amount: float = 0.0
    final_price:     float = 0.0
    reason: Optional[str] = None
