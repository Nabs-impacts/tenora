from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class EbookCategory(Base):
    """
    Catégorie / genre dédié aux ebooks.
    Écosystème totalement indépendant de `categories` — pas de service_type,
    pas de produits "classiques" rattachés ici.
    """
    __tablename__ = "ebook_categories"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(100), nullable=False, unique=True)
    slug        = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    is_active   = Column(Boolean, default=True, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Backref vers Product.ebook_category — voir app/models/product.py
    ebooks = relationship(
        "Product",
        back_populates="ebook_category",
        foreign_keys="Product.ebook_category_id",
    )

    def __str__(self) -> str:
        return self.name