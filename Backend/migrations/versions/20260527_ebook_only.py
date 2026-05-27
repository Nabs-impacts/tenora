"""add ebook_only to coupons

Revision ID: 20260527_ebook_only
Revises: 20260503_add_order_coupon_fields
Create Date: 2026-05-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260527_ebook_only"
down_revision: Union[str, None] = "20260503_add_order_coupon_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = inspector.get_columns(table_name)
    return any(column["name"] == column_name for column in columns)


def upgrade() -> None:
    if not _column_exists("coupons", "ebook_only"):
        op.add_column(
            "coupons",
            sa.Column(
                "ebook_only",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )


def downgrade() -> None:
    if _column_exists("coupons", "ebook_only"):
        op.drop_column("coupons", "ebook_only")
