"""add coupons table + order coupon link

Revision ID: 20260503_add_coupons
Revises: 20260502_add_order_claim
Create Date: 2026-05-03

Crée :
  - coupons              (code unique, %/montant, restrictions)
  - coupon_products      (M:N coupons ↔ products)
  - coupon_categories    (M:N coupons ↔ categories)
Et ajoute :
  - orders.coupon_id     (FK SET NULL)
  - orders.discount_amount (Float, default 0)
"""
from alembic import op
import sqlalchemy as sa


revision = "20260503_add_coupons"
down_revision = "20260502_add_order_claim"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coupons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("discount_percent", sa.Float(), nullable=True),
        sa.Column("discount_amount",  sa.Float(), nullable=True),
        sa.Column("user_id",   sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("max_uses",  sa.Integer(), nullable=True),
        sa.Column("times_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("is_active",  sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_coupons_code"),
    )
    op.create_index("ix_coupons_code",    "coupons", ["code"])
    op.create_index("ix_coupons_user_id", "coupons", ["user_id"])

    op.create_table(
        "coupon_products",
        sa.Column("coupon_id",  sa.Integer(), sa.ForeignKey("coupons.id",  ondelete="CASCADE"), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "coupon_categories",
        sa.Column("coupon_id",   sa.Integer(), sa.ForeignKey("coupons.id",    ondelete="CASCADE"), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
    )

    op.add_column("orders", sa.Column("coupon_id", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("discount_amount", sa.Float(), nullable=False, server_default="0"))
    op.create_foreign_key(
        "fk_orders_coupon_id", "orders", "coupons", ["coupon_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_orders_coupon_id", "orders", ["coupon_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_coupon_id", table_name="orders")
    op.drop_constraint("fk_orders_coupon_id", "orders", type_="foreignkey")
    op.drop_column("orders", "discount_amount")
    op.drop_column("orders", "coupon_id")

    op.drop_table("coupon_categories")
    op.drop_table("coupon_products")
    op.drop_index("ix_coupons_user_id", table_name="coupons")
    op.drop_index("ix_coupons_code",    table_name="coupons")
    op.drop_table("coupons")
