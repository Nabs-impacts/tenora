from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings
from app.database import Base

# ── Imports de TOUS les modèles ───────────────────────────────────────────────
# CRITIQUE : tout modèle absent ici sera considéré comme "à supprimer" par
# `alembic revision --autogenerate`. Ajouter ici chaque nouveau modèle créé.
from app.models.coupon import Coupon          # importe aussi coupon_products & coupon_categories
from app.models.ebook import EbookCategory
from app.models.import_request import ImportRequest
from app.models.order import Order
from app.models.otp import OTPCode
from app.models.product import Category, Product
from app.models.session import Session
from app.models.site_settings import SiteSettings
from app.models.user import User

# ─────────────────────────────────────────────────────────────────────────────

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
