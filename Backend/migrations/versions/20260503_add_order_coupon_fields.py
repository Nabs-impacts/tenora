"""add coupon_code to orders

Revision ID: 20260503_add_order_coupon_fields
Revises: 20260503_add_coupons
Create Date: 2026-05-03

Ajoute uniquement orders.coupon_code.
(claimed_by_id et claimed_at sont déjà présents via 20260502_add_order_claim)
"""
from alembic import op
import sqlalchemy as sa


revision = "20260503_add_order_coupon_fields"
down_revision = "20260503_add_coupons"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("coupon_code", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("orders", "coupon_code")
