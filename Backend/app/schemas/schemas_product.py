from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator


class FieldDefinition(BaseModel):
    key: str
    label: str
    placeholder: str | None = None
    required: bool = True
    regex: str | None = None


class CategoryCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    service_type: str = "none"
    parent_id: int | None = None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None = None
    service_type: str
    parent_id: int | None = None
    is_active: bool
    image_path: str | None = None
    image_url: str | None = None

    @classmethod
    def from_orm_with_url(cls, obj, base_url: str) -> "CategoryResponse":
        data = cls.model_validate(obj)
        if obj.image_path:
            data.image_url = f"{base_url}/uploads/{obj.image_path}"
        return data


class ProductCreate(BaseModel):
    category_id: int
    name: str
    description: str | None = None
    price: float
    discount_percent: float | None = None
    stock: int = 0
    required_fields: list[FieldDefinition] | None = None
    whatsapp_redirect: bool = False

    @field_validator('discount_percent')
    @classmethod
    def validate_discount(cls, v):
        if v is not None and not (0 < v < 100):
            raise ValueError('La réduction doit être entre 1 et 99%')
        return v


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    name: str
    description: str | None = None
    price: float
    discount_percent: float | None = None
    final_price: float = 0.0
    stock: int | None = None
    is_active: bool
    image_path: str | None = None
    image_url: str | None = None
    required_fields: list[Any] | None = None
    whatsapp_redirect: bool = False
    avg_rating: float | None = None
    review_count: int = 0
    created_at: datetime

    @classmethod
    def from_orm_with_url(cls, obj, base_url: str,
                           avg_rating: float | None = None,
                           review_count: int = 0,
                           fallback_image: str | None = None) -> "ProductResponse":
        data = cls.model_validate(obj)
        # Image produit en priorité, sinon image de la catégorie en fallback
        if obj.image_path:
            data.image_url = f"{base_url}/uploads/{obj.image_path}"
        elif fallback_image:
            data.image_url = fallback_image
        discount = getattr(obj, "discount_percent", None)
        data.discount_percent = discount
        data.final_price  = getattr(obj, "final_price", obj.price)
        data.avg_rating   = avg_rating
        data.review_count = review_count
        return data
