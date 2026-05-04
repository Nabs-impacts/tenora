import enum

from sqlalchemy import JSON, Column, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class OrderStatus(enum.Enum):
    pending    = "pending"
    processing = "processing"
    completed  = "completed"
    rejected   = "rejected"
    refunded   = "refunded"


class Order(Base):
    __tablename__ = "orders"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    user_id          = Column(Integer, ForeignKey("users.id"), nullable=False)
    product_id       = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity         = Column(Integer, default=1, nullable=False)
    total_price      = Column(Float, nullable=False)
    status           = Column(Enum(OrderStatus), default=OrderStatus.pending, nullable=False)
    screenshot_path  = Column(String(255), nullable=True)
    staff_note       = Column(Text, nullable=True)
    customer_info    = Column(JSON, nullable=True)
    payment_method   = Column(String(50), nullable=True)
    created_at       = Column(DateTime, server_default=func.now())
    updated_at       = Column(DateTime, server_default=func.now(), onupdate=func.now())

    coupon_code      = Column(String, nullable=True)
    coupon_id        = Column(Integer, ForeignKey("coupons.id", ondelete="SET NULL"),
                              nullable=True, index=True)
    discount_amount  = Column(Float, nullable=False, server_default="0", default=0.0)

    claimed_by_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    claimed_at = Column(DateTime, nullable=True)

    user       = relationship("User", back_populates="orders", foreign_keys=[user_id])
    claimed_by = relationship("User", foreign_keys=[claimed_by_id], lazy="joined")
    product    = relationship("Product", back_populates="orders")
    coupon     = relationship("Coupon", foreign_keys=[coupon_id], lazy="joined")

    __table_args__ = (
        Index("idx_order_user",   "user_id"),
        Index("idx_order_status", "status"),
    )

    def __str__(self):
        return f"Commande #{self.id}"
