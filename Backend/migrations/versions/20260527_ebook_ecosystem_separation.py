"""ebook ecosystem separation

Crée la table `ebook_categories`, ajoute les colonnes `is_ebook` et
`ebook_category_id` sur `products`, puis migre les ebooks existants
(ceux dont la catégorie avait service_type == 'ebook').

Revision ID: 20260527_ebooks
Revises: <REMPLACER_PAR_LA_DERNIERE_REVISION>
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260527_ebooks"
# ⚠️ Remplacez `down_revision` par l'identifiant de la dernière révision
#    Alembic existante dans votre projet (cf. `alembic history`).
down_revision = "20260527_ebook_only"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Table ebook_categories
    op.create_table(
        "ebook_categories",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.func.current_timestamp(),
        ),
        sa.UniqueConstraint("name", name="uq_ebook_categories_name"),
        sa.UniqueConstraint("slug", name="uq_ebook_categories_slug"),
    )

    # 2) products.is_ebook
    op.add_column(
        "products",
        sa.Column(
            "is_ebook",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    # 3) products.ebook_category_id + FK
    op.add_column(
        "products",
        sa.Column("ebook_category_id", sa.Integer, nullable=True),
    )
    op.create_index(
        "ix_products_ebook_category_id",
        "products",
        ["ebook_category_id"],
    )
    op.create_foreign_key(
        "fk_products_ebook_category",
        "products",
        "ebook_categories",
        ["ebook_category_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 4) Data migration : flag les produits dont la catégorie était de
    #    type 'ebook' (ancien système basé sur Category.service_type).
    op.execute(
        """
        UPDATE products p
        INNER JOIN categories c ON p.category_id = c.id
        SET p.is_ebook = 1
        WHERE c.service_type = 'ebook'
        """
    )


    # 5) Rendre products.category_id nullable (les ebooks n'en ont plus besoin)
    op.alter_column(
        "products", "category_id",
        existing_type=sa.Integer(),
        nullable=True,
    )

def downgrade() -> None:
    op.alter_column(
        "products", "category_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.drop_constraint("fk_products_ebook_category", "products", type_="foreignkey")
    op.drop_index("ix_products_ebook_category_id", table_name="products")
    op.drop_column("products", "ebook_category_id")
    op.drop_column("products", "is_ebook")
    op.drop_table("ebook_categories")