from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.order import OrderStatus


class OrderCreate(BaseModel):
    product_id:     int
    quantity:       int = 1
    customer_info:  dict[str, str] = {}
    payment_method: str | None = None
    coupon_code:    str | None = None


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:              int
    user_id:         int
    product_id:      int
    quantity:        int
    total_price:     float
    discount_amount: float = 0.0
    coupon_code:     str | None = None
    status:          str
    screenshot_path: str | None = None
    customer_info:   dict | None = None
    staff_note:      str | None = None
    payment_method:  str | None = None
    created_at:      datetime
    updated_at:      datetime


class OrderStatusUpdate(BaseModel):
    status:     OrderStatus
    staff_note: str | None = None
