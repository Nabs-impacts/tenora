"""add_perf_indexes

Revision ID: b3c7f2a1d950
Revises: 514619ba3eed
Create Date: 2026-05-30

Indexes manquants sur les colonnes de tri/filtrage les plus sollicitées :
  - orders.created_at  (toutes les routes /panel/statistics)
  - users.created_at   (stats_customers)
"""
from alembic import op

revision = "b3c7f2a1d950"
down_revision = "514619ba3eed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("idx_order_created_at", "orders", ["created_at"], unique=False)
    op.create_index("idx_user_created_at",  "users",  ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_order_created_at", table_name="orders")
    op.drop_index("idx_user_created_at",  table_name="users")
