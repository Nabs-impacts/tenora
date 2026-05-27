from datetime import datetime

from sqlalchemy import (
    JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(100), nullable=False)
    slug         = Column(String(100), unique=True, nullable=False)
    description  = Column(Text, nullable=True)
    service_type = Column(String(50), default="none")
    parent_id    = Column(Integer, ForeignKey("categories.id"), nullable=True)
    is_active    = Column(Boolean, default=True)
    image_path   = Column(String(255), nullable=True)

    parent   = relationship("Category", remote_side=[id], backref="subcategories")
    products = relationship("Product", back_populates="category")

    def __str__(self):
        return self.name


class Product(Base):
    __tablename__ = "products"

    id                 = Column(Integer, primary_key=True, index=True)
    category_id        = Column(Integer, ForeignKey("categories.id"), nullable=True)
    name               = Column(String(200), nullable=False)
    description        = Column(Text, nullable=True)
    price              = Column(Float, nullable=False)
    discount_percent   = Column(Float, nullable=True, default=None)
    stock              = Column(Integer, default=0)
    is_active          = Column(Boolean, default=True)
    image_path         = Column(String(255), nullable=True)
    pdf_path           = Column(String(500), nullable=True)   # ← PDF de l'ebook
    required_fields    = Column(JSON, nullable=True)
    whatsapp_redirect  = Column(Boolean, default=False, nullable=False)
    created_at         = Column(DateTime, default=datetime.utcnow)

    # ── Écosystème Ebooks (autonome) ──────────────────────────────────────
    is_ebook           = Column(
        Boolean, default=False, nullable=False, server_default="0",
    )
    ebook_category_id  = Column(
        Integer,
        ForeignKey("ebook_categories.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    category       = relationship("Category", back_populates="products")
    ebook_category = relationship(
        "EbookCategory",
        back_populates="ebooks",
        foreign_keys=[ebook_category_id],
    )
    orders         = relationship("Order", back_populates="product")

    @property
    def final_price(self) -> float:
        if self.discount_percent and 0 < self.discount_percent < 100:
            return round(self.price * (1 - self.discount_percent / 100), 2)
        return self.price

    @property
    def image_url(self) -> str | None:
        if self.image_path:
            return f"/uploads/{self.image_path}"
        return None

    def __str__(self):
        return self.name