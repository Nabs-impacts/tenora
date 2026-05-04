from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table, UniqueConstraint
)
from sqlalchemy.orm import relationship

from app.database import Base


# ── Tables d'association : un coupon peut être restreint à une liste de
#    produits et/ou de catégories. Si les deux listes sont vides, le coupon
#    s'applique à tout le catalogue.
coupon_products = Table(
    "coupon_products",
    Base.metadata,
    Column("coupon_id",  Integer, ForeignKey("coupons.id",  ondelete="CASCADE"), primary_key=True),
    Column("product_id", Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
)

coupon_categories = Table(
    "coupon_categories",
    Base.metadata,
    Column("coupon_id",    Integer, ForeignKey("coupons.id",      ondelete="CASCADE"), primary_key=True),
    Column("category_id",  Integer, ForeignKey("categories.id",   ondelete="CASCADE"), primary_key=True),
)


class Coupon(Base):
    __tablename__ = "coupons"

    id              = Column(Integer, primary_key=True, index=True)
    code            = Column(String(32), unique=True, nullable=False, index=True)

    # Réduction : pourcentage (1..100) OU montant fixe (XOF). Un seul des deux.
    discount_percent = Column(Float, nullable=True)
    discount_amount  = Column(Float, nullable=True)

    # Restrictions
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                             nullable=True, index=True)  # NULL = tous les utilisateurs
    max_uses        = Column(Integer, nullable=True)     # NULL = illimité
    times_used      = Column(Integer, default=0, nullable=False)
    expires_at      = Column(DateTime, nullable=True)    # NULL = sans expiration
    is_active       = Column(Boolean, default=True, nullable=False)

    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)

    products    = relationship("Product",  secondary=coupon_products,   lazy="selectin")
    categories  = relationship("Category", secondary=coupon_categories, lazy="selectin")
    user        = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("code", name="uq_coupons_code"),
    )

    def __str__(self):
        return self.code

    # ── Helpers ───────────────────────────────────────────────────────────
    def applies_to_product(self, product) -> bool:
        """Vérifie qu'un produit est éligible au coupon."""
        if not self.products and not self.categories:
            return True
        if any(p.id == product.id for p in self.products):
            return True
        if any(c.id == product.category_id for c in self.categories):
            return True
        return False

    def compute_discount(self, base_total: float) -> float:
        """Retourne le montant de réduction en XOF (>= 0)."""
        if self.discount_percent:
            return round(base_total * (self.discount_percent / 100.0), 2)
        if self.discount_amount:
            return round(min(self.discount_amount, base_total), 2)
        return 0.0
