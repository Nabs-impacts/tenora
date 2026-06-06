import csv
import io
import re
import time as _time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import and_, case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import SessionLocal, get_db

# Cache dashboard 30 s — évite de re-requêter à chaque refresh admin
_dashboard_cache: dict = {}
_DASHBOARD_TTL = 30  # secondes
from app.dependencies import get_admin_user
from app.models.coupon import Coupon
from app.models.ebook import EbookCategory
from app.models.import_request import ImportRequest
from app.models.order import Order, OrderStatus
from app.models.product import Category, Product
from app.models.user import User
from app.routes.order_claim import (
    ensure_can_edit_order,
    release_claim,
    serialize_claim,
)
from app.routes.site import invalidate_site_cache
from app.schemas.coupon import CouponCreate, CouponUpdate, CouponResponse
from app.services.coupon_service import generate_code, normalize_code, is_valid_format
from app.services.settings_service import (
    DEFAULT_ANNOUNCEMENT,
    DEFAULT_PAYMENT_METHODS,
    get_setting,
    set_setting,
)
from app.services.storage_service import (
    delete_file as storage_delete,
)
from app.services.storage_service import (
    upload_file as storage_upload,
)

# Import différé pour éviter la dépendance circulaire ; appelé seulement
# depuis update_order_status() pour invalider le cache stats après un changement.
def _invalidate_stats() -> None:
    try:
        from app.routes.panel_statistics import invalidate_stats_cache
        invalidate_stats_cache()
    except Exception:
        pass


try:
    from PIL import Image as _PilImage
    _HAS_PIL = True
except ImportError:
    _HAS_PIL = False

router = APIRouter(prefix="/panel", tags=["Admin Panel"])

ALLOWED_EXT    = {"jpg", "jpeg", "png", "webp"}
ORDER_STATUSES  = ["pending", "processing", "completed", "rejected", "refunded"]
IMPORT_STATUSES = ["pending", "contacted", "in_progress", "delivered", "cancelled"]


# ─── SCHEMAS PYDANTIC ─────────────────────────────────────────────────────────

class OrderStatusUpdate(BaseModel):
    status: str
    staff_note: str = ""

class ImportStatusUpdate(BaseModel):
    status: str
    staff_note: str = ""

class SettingMaintenance(BaseModel):
    enabled: bool

class SettingAnnouncement(BaseModel):
    enabled: bool
    text: str

class SettingWhatsapp(BaseModel):
    number: str

class PaymentMethodUpdate(BaseModel):
    id: str
    enabled: bool
    instructions: str = ""

class SettingPaymentMethods(BaseModel):
    methods: list[PaymentMethodUpdate]

class SettingFeaturedProducts(BaseModel):
    product_ids: list[int]

class CategoryCreate(BaseModel):
    name: str
    slug: str
    service_type: str = "none"
    parent_id: int | None = None
    is_active: bool = True
    description: str | None = None

class CategoryUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    service_type: str | None = None
    is_active: bool | None = None
    parent_id: int | None = None
    description: str | None = None

class ProductCreate(BaseModel):
    category_id: int
    name: str
    description: str = ""
    price: float
    discount_percent: float | None = None
    stock: int | None = None
    required_fields: list[dict] | None = None
    whatsapp_redirect: bool = False

class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: float | None = None
    discount_percent: float | None = None
    stock: int | None = None
    required_fields: list[dict] | None = None
    whatsapp_redirect: bool | None = None
    is_active: bool | None = None
    category_id: int | None = None


# ─── SCHEMAS EBOOKS ───────────────────────────────────────────────────────────

class EbookCreate(BaseModel):
    name: str
    description: str = ""
    price: float
    discount_percent: float = 0
    is_active: bool = True
    ebook_category_id: int | None = None     # optionnel à la création

class EbookUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: float | None = None
    discount_percent: float | None = None
    is_active: bool | None = None
    ebook_category_id: int | None = None


# ─── SCHEMAS EBOOK CATEGORIES (genres / bibliothèque) ─────────────────────────

class EbookCategoryCreate(BaseModel):
    name: str
    slug: str
    description: str = ""
    is_active: bool = True

class EbookCategoryUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    is_active: bool | None = None


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _compress_image(data: bytes, ext: str, max_px: int = 1400) -> bytes:
    if not _HAS_PIL:
        return data
    try:
        img = _PilImage.open(io.BytesIO(data))
        if ext in ("jpg", "jpeg") and img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        if max(img.size) > max_px:
            img.thumbnail((max_px, max_px), _PilImage.LANCZOS)
        buf = io.BytesIO()
        fmt_map = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}
        fmt = fmt_map.get(ext, "JPEG")
        save_kwargs: dict = {"optimize": True}
        if fmt in ("JPEG", "WEBP"):
            save_kwargs["quality"] = 82
        img.save(buf, format=fmt, **save_kwargs)
        compressed = buf.getvalue()
        return compressed if len(compressed) < len(data) else data
    except Exception:
        return data


def save_image(file_data: bytes, filename: str, subfolder: str, max_px: int = 1400) -> str:
    """
    Compresse puis upload une image. `max_px` permet d'augmenter la résolution
    cible pour des contextes spécifiques (ex: couvertures d'ebooks → 2000 px).
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Format non supporté — JPG, PNG ou WEBP uniquement.")
    if len(file_data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 5 MB).")
    file_data = _compress_image(file_data, ext, max_px=max_px)
    return storage_upload(file_data, ext, subfolder)


# ─── DASHBOARD ────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    # Cache 30 s — le dashboard est souvent affiché plusieurs fois par minute
    now_ts = _time.time()
    cached = _dashboard_cache.get("data")
    if cached and now_ts - _dashboard_cache.get("ts", 0) < _DASHBOARD_TTL:
        return cached

    now   = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week  = today - timedelta(days=7)

    order_stats = db.query(
        func.count(Order.id).label("total_orders"),
        func.count(
            case((Order.status == OrderStatus.processing, 1))
        ).label("pending_orders"),
        func.count(
            case((Order.status == OrderStatus.completed, 1))
        ).label("completed_orders"),
        func.coalesce(
            func.sum(case((Order.status == OrderStatus.completed, Order.total_price), else_=0)),
            0,
        ).label("total_revenue"),
        func.count(
            case((Order.created_at >= today, 1))
        ).label("orders_today"),
        func.coalesce(
            func.sum(case(
                (and_(Order.status == OrderStatus.completed, Order.created_at >= week),
                 Order.total_price),
                else_=0,
            )),
            0,
        ).label("revenue_week"),
    ).first()

    total_users    = db.query(func.count(User.id)).scalar() or 0
    total_products = db.query(func.count(Product.id)).filter(Product.is_active == True).scalar() or 0  # noqa: E712

    daily_orders = (
        db.query(
            func.date(Order.created_at).label("day"),
            func.count(Order.id).label("count"),
            func.sum(case((Order.status == OrderStatus.completed, Order.total_price), else_=0)).label("revenue"),
        )
        .filter(Order.created_at >= week)
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
        .all()
    )

    result = {
        "stats": {
            "total_orders":     order_stats.total_orders,
            "pending_orders":   order_stats.pending_orders,
            "completed_orders": order_stats.completed_orders,
            "total_revenue":    float(order_stats.total_revenue),
            "orders_today":     order_stats.orders_today,
            "revenue_week":     float(order_stats.revenue_week),
            "total_users":      total_users,
            "total_products":   total_products,
        },
        "chart": [
            {"day": str(r.day), "orders": r.count, "revenue": float(r.revenue or 0)}
            for r in daily_orders
        ],
    }
    _dashboard_cache["data"] = result
    _dashboard_cache["ts"]   = _time.time()
    return result


# ─── COMMANDES ────────────────────────────────────────────────────────────────

@router.get("/orders")
def list_orders(
    status:   str | None = Query(None),
    page:     int        = Query(1, ge=1),
    per_page: int        = Query(50, ge=1, le=200),
    db:       Session    = Depends(get_db),
    admin:    User       = Depends(get_admin_user),
):
    q = (
        db.query(Order)
        .options(joinedload(Order.user), joinedload(Order.product))
    )
    if status:
        try:
            q = q.filter(Order.status == OrderStatus[status])
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Statut invalide : {status}")

    total  = q.count()
    orders = q.order_by(Order.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "orders": [
            {
                "id":              o.id,
                "user_id":         o.user_id,
                "user_email":      o.user.email if o.user else None,
                "product_id":      o.product_id,
                "product_name":    o.product.name if o.product else None,
                "quantity":        o.quantity,
                "total_price":     float(o.total_price),
                "discount_amount": float(o.discount_amount or 0),
                "coupon_code":     o.coupon_code,
                "status":          o.status.value,
                "payment_method":  o.payment_method,
                "customer_info":   o.customer_info,
                "screenshot_path": o.screenshot_path,
                "staff_note":      o.staff_note,
                "created_at":      o.created_at.isoformat(),
                "claim":           serialize_claim(o),
            }
            for o in orders
        ],
    }


@router.get("/orders/{order_id}")
def get_order(
    order_id: int,
    db:       Session = Depends(get_db),
    admin:    User    = Depends(get_admin_user),
):
    order = (
        db.query(Order)
        .options(joinedload(Order.user), joinedload(Order.product))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    return {
        "id":              order.id,
        "user_id":         order.user_id,
        "user_email":      order.user.email if order.user else None,
        "product_id":      order.product_id,
        "product_name":    order.product.name if order.product else None,
        "quantity":        order.quantity,
        "total_price":     float(order.total_price),
        "discount_amount": float(order.discount_amount or 0),
        "coupon_code":     order.coupon_code,
        "status":          order.status.value,
        "payment_method":  order.payment_method,
        "customer_info":   order.customer_info,
        "screenshot_path": order.screenshot_path,
        "staff_note":      order.staff_note,
        "created_at":      order.created_at.isoformat(),
        "claim":           serialize_claim(order),
    }


@router.put("/orders/{order_id}/status")
def update_order_status(
    order_id: int,
    data:     OrderStatusUpdate,
    db:       Session = Depends(get_db),
    admin:    User    = Depends(get_admin_user),
):
    order = (
        db.query(Order)
        .options(joinedload(Order.user), joinedload(Order.product))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable.")

    if data.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut invalide : {data.status}")

    ensure_can_edit_order(order, admin, db)

    from app.services.mail_service import send_order_completed
    client  = order.user
    product = order.product

    old_status       = order.status
    order.status     = OrderStatus[data.status]
    order.staff_note = data.staff_note

    from app.routes.order_claim import TERMINAL_STATUSES
    if data.status in TERMINAL_STATUSES:
        release_claim(order)

    db.commit()
    db.refresh(order)

    # Invalider le cache stats + dashboard quand un statut change
    _invalidate_stats()
    _dashboard_cache.clear()

    if client and product and old_status != OrderStatus[data.status]:
        try:
            if data.status == "completed":
                send_order_completed(client.email, order.id, product.name, order.total_price)
        except Exception as e:
            logger.error(f"Échec envoi mail | order_id={order_id} | {e}")

    logger.success(f"Statut commande | order_id={order_id} | {old_status} → {data.status} | admin_id={admin.id}")
    return {
        "message": "Statut mis à jour.",
        "status": order.status.value,
        "claim": serialize_claim(order),
    }


@router.get("/orders/export/csv")
def export_orders_csv(
    status: str | None = Query(None),
    db:     Session    = Depends(get_db),
    admin:  User       = Depends(get_admin_user),
):
    q = (
        db.query(Order)
        .options(joinedload(Order.user), joinedload(Order.product))
    )
    if status:
        try:
            q = q.filter(Order.status == OrderStatus[status])
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Statut invalide : {status}")
    orders = q.order_by(Order.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Date", "Client", "Produit", "Qté", "Total (FCFA)", "Remise", "Coupon", "Statut", "Paiement", "Note admin"])
    for o in orders:
        writer.writerow([
            o.id,
            o.created_at.strftime("%Y-%m-%d %H:%M"),
            o.user.email if o.user else o.user_id,
            o.product.name if o.product else o.product_id,
            o.quantity,
            int(o.total_price),
            int(o.discount_amount or 0),
            o.coupon_code or "",
            o.status.value,
            o.payment_method,
            o.staff_note or "",
        ])

    output.seek(0)
    filename = f"commandes_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    logger.info(f"Export CSV commandes | admin_id={admin.id} | rows={len(orders)}")
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ─── PRODUITS ─────────────────────────────────────────────────────────────────

@router.get("/products")
def list_products(
    page:        int        = Query(1, ge=1),
    per_page:    int        = Query(50, ge=1, le=1000),
    q:           str | None = Query(None, description="Recherche nom/description"),
    category_id: int | None = Query(None),
    is_active:   bool | None = Query(None),
    db:          Session    = Depends(get_db),
    admin:       User       = Depends(get_admin_user),
):
    base = (
        db.query(Product)
        .options(joinedload(Product.category))
    )
    if q:
        like = f"%{q}%"
        base = base.filter(
            (Product.name.ilike(like)) | (Product.description.ilike(like))
        )
    if category_id is not None:
        base = base.filter(Product.category_id == category_id)
    if is_active is not None:
        base = base.filter(Product.is_active == is_active)

    total = base.with_entities(func.count(Product.id)).scalar() or 0
    products = (
        base.order_by(Product.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
    )
    return {
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "products": [
            {
                "id":                p.id,
                "category_id":       p.category_id,
                "category_name":     p.category.name if p.category else None,
                "name":              p.name,
                "description":       p.description,
                "price":             float(p.price),
                "discount_percent":  float(p.discount_percent or 0),
                "final_price":       float(p.final_price),
                "stock":             p.stock,
                "is_active":         p.is_active,
                "image_path":        p.image_path,
                "required_fields":   p.required_fields,
                "whatsapp_redirect": p.whatsapp_redirect,
                "created_at":        p.created_at.isoformat(),
            }
            for p in products
        ],
    }


@router.post("/products", status_code=201)
def create_product(
    data:  ProductCreate,
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    cat = db.query(Category).filter(Category.id == data.category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie introuvable.")

    p = Product(
        category_id=data.category_id,
        name=data.name,
        description=data.description,
        price=data.price,
        discount_percent=data.discount_percent,
        stock=data.stock,
        required_fields=[f if isinstance(f, dict) else f.dict() for f in (data.required_fields or [])],
        whatsapp_redirect=data.whatsapp_redirect,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    logger.success(f"Produit créé | id={p.id} | name={p.name} | admin_id={admin.id}")
    return {"message": "Produit créé.", "id": p.id}


@router.put("/products/{product_id}")
def update_product(
    product_id: int,
    data:       ProductUpdate,
    db:         Session = Depends(get_db),
    admin:      User    = Depends(get_admin_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable.")

    payload = data.model_dump(exclude_unset=True)
    if "category_id" in payload and payload["category_id"] is not None:
        if not db.query(Category).filter(Category.id == payload["category_id"]).first():
            raise HTTPException(status_code=404, detail="Catégorie cible introuvable.")
    for field, value in payload.items():
        setattr(p, field, value)

    db.commit()
    db.refresh(p)
    logger.info(f"Produit mis à jour | id={product_id} | admin_id={admin.id}")
    return {"message": "Produit mis à jour."}


@router.post("/products/{product_id}/image")
async def upload_product_image(
    product_id: int,
    file:       UploadFile = File(...),
    db:         Session    = Depends(get_db),
    admin:      User       = Depends(get_admin_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable.")

    storage_delete(p.image_path)
    file_data    = await file.read()
    p.image_path = save_image(file_data, file.filename or "image.jpg", "products")
    db.commit()
    logger.info(f"Image produit uploadée | id={product_id} | admin_id={admin.id}")
    return {"message": "Image mise à jour.", "image_path": p.image_path}


@router.delete("/products/{product_id}/image")
def delete_product_image(
    product_id: int,
    db:         Session = Depends(get_db),
    admin:      User    = Depends(get_admin_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    storage_delete(p.image_path)
    p.image_path = None
    db.commit()
    return {"message": "Image supprimée."}


@router.delete("/products/{product_id}")
def delete_product(
    product_id: int,
    db:         Session = Depends(get_db),
    admin:      User    = Depends(get_admin_user),
):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable.")
    storage_delete(p.image_path)
    db.delete(p)
    db.commit()
    logger.info(f"Produit supprimé | id={product_id} | admin_id={admin.id}")
    return {"message": "Produit supprimé."}


# ─── CATÉGORIES ───────────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories(
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    rows = (
        db.query(
            Category,
            func.count(Product.id).label("product_count"),
        )
        .outerjoin(Product, Product.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.name)
        .all()
    )
    return [
        {
            "id":            c.id,
            "name":          c.name,
            "slug":          c.slug,
            "description":   c.description,
            "service_type":  c.service_type,
            "parent_id":     c.parent_id,
            "is_active":     c.is_active,
            "image_path":    c.image_path,
            "product_count": int(count),
        }
        for c, count in rows
    ]


@router.post("/categories", status_code=201)
def create_category(
    data:  CategoryCreate,
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    try:
        cat = Category(**data.model_dump())
        db.add(cat)
        db.commit()
        db.refresh(cat)
        logger.success(f"Catégorie créée | id={cat.id} | name={cat.name} | admin_id={admin.id}")
        return {"message": "Catégorie créée.", "id": cat.id}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ce slug existe déjà.")


@router.put("/categories/{category_id}")
def update_category(
    category_id: int,
    data:        CategoryUpdate,
    db:          Session = Depends(get_db),
    admin:       User    = Depends(get_admin_user),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie introuvable.")
    payload = data.model_dump(exclude_unset=True)
    if payload.get("parent_id") == category_id:
        raise HTTPException(status_code=400, detail="Une catégorie ne peut pas être son propre parent.")
    for field, value in payload.items():
        setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    logger.info(f"Catégorie mise à jour | id={category_id} | admin_id={admin.id}")
    return {"message": "Catégorie mise à jour."}


@router.post("/categories/{category_id}/image")
async def upload_category_image(
    category_id: int,
    file:        UploadFile = File(...),
    db:          Session    = Depends(get_db),
    admin:       User       = Depends(get_admin_user),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie introuvable.")

    storage_delete(cat.image_path)
    file_data      = await file.read()
    cat.image_path = save_image(file_data, file.filename or "image.jpg", "categories")
    db.commit()
    return {"message": "Image mise à jour.", "image_path": cat.image_path}


@router.delete("/categories/{category_id}/image")
def delete_category_image(
    category_id: int,
    db:          Session = Depends(get_db),
    admin:       User    = Depends(get_admin_user),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie introuvable.")
    storage_delete(cat.image_path)
    cat.image_path = None
    db.commit()
    return {"message": "Image supprimée."}


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db:          Session = Depends(get_db),
    admin:       User    = Depends(get_admin_user),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie introuvable.")
    storage_delete(cat.image_path)
    db.delete(cat)
    db.commit()
    logger.info(f"Catégorie supprimée | id={category_id} | admin_id={admin.id}")
    return {"message": "Catégorie supprimée."}


# ─── EBOOK CATEGORIES (genres bibliothèque) ──────────────────────────────────
# Écosystème ebooks 100% autonome — table dédiée `ebook_categories`,
# aucune dépendance avec `categories` / `service_type`.

@router.get("/ebook-categories")
def list_ebook_categories(
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    rows = (
        db.query(
            EbookCategory,
            func.count(Product.id).label("ebook_count"),
        )
        .outerjoin(Product, Product.ebook_category_id == EbookCategory.id)
        .group_by(EbookCategory.id)
        .order_by(EbookCategory.name)
        .all()
    )
    return [
        {
            "id":          c.id,
            "name":        c.name,
            "slug":        c.slug,
            "description": c.description,
            "is_active":   c.is_active,
            "created_at":  c.created_at.isoformat() if c.created_at else None,
            "ebook_count": int(count),
        }
        for c, count in rows
    ]


@router.post("/ebook-categories", status_code=201)
def create_ebook_category(
    data:  EbookCategoryCreate,
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    try:
        cat = EbookCategory(**data.model_dump())
        db.add(cat)
        db.commit()
        db.refresh(cat)
        logger.success(f"Ebook genre créé | id={cat.id} | name={cat.name} | admin_id={admin.id}")
        return {"message": "Genre créé.", "id": cat.id}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Nom ou slug déjà utilisé.")


@router.put("/ebook-categories/{cat_id}")
def update_ebook_category(
    cat_id: int,
    data:   EbookCategoryUpdate,
    db:     Session = Depends(get_db),
    admin:  User    = Depends(get_admin_user),
):
    cat = db.query(EbookCategory).filter(EbookCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Genre introuvable.")
    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(cat, field, value)
    try:
        db.commit()
        db.refresh(cat)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Nom ou slug déjà utilisé.")
    logger.info(f"Ebook genre mis à jour | id={cat_id} | admin_id={admin.id}")
    return {"message": "Genre mis à jour."}


@router.delete("/ebook-categories/{cat_id}")
def delete_ebook_category(
    cat_id: int,
    db:     Session = Depends(get_db),
    admin:  User    = Depends(get_admin_user),
):
    cat = db.query(EbookCategory).filter(EbookCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Genre introuvable.")
    linked = (
        db.query(func.count(Product.id))
        .filter(Product.ebook_category_id == cat_id)
        .scalar() or 0
    )
    if linked > 0:
        raise HTTPException(
            status_code=409,
            detail=f"{linked} ebook(s) sont rattachés à ce genre. Réassignez-les d'abord.",
        )
    db.delete(cat)
    db.commit()
    logger.info(f"Ebook genre supprimé | id={cat_id} | admin_id={admin.id}")
    return {"message": "Genre supprimé."}


# ─── EBOOKS ───────────────────────────────────────────────────────────────────
# Les ebooks sont des `Product` avec `is_ebook = True`, optionnellement
# rattachés à un `EbookCategory`. Aucun lien avec `Category.service_type`.

def _ebook_payload(p: Product) -> dict:
    return {
        "id":                  p.id,
        "name":                p.name,
        "description":         p.description,
        "price":               float(p.price),
        "discount_percent":    float(p.discount_percent or 0),
        "final_price":         float(p.final_price),
        "is_active":           p.is_active,
        "image_path":          p.image_path,
        "pdf_path":            p.pdf_path,
        "ebook_category_id":   p.ebook_category_id,
        "ebook_category_name": p.ebook_category.name if p.ebook_category else None,
        "created_at":          p.created_at.isoformat(),
    }


def _ensure_ebook_genre(db: Session, ebook_category_id: int | None) -> None:
    if ebook_category_id is None:
        return
    exists = db.query(EbookCategory.id).filter(EbookCategory.id == ebook_category_id).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Genre introuvable.")


@router.get("/ebooks")
def list_ebooks(
    q:                 str | None  = Query(None, description="Recherche par nom"),
    ebook_category_id: int | None  = Query(None),
    is_active:         bool | None = Query(None),
    db:                Session     = Depends(get_db),
    admin:             User        = Depends(get_admin_user),
):
    base = (
        db.query(Product)
        .options(joinedload(Product.ebook_category))
        .filter(Product.is_ebook == True)  # noqa: E712
    )
    if q:
        base = base.filter(Product.name.ilike(f"%{q}%"))
    if ebook_category_id is not None:
        base = base.filter(Product.ebook_category_id == ebook_category_id)
    if is_active is not None:
        base = base.filter(Product.is_active == is_active)

    items = base.order_by(Product.created_at.desc()).all()
    return [_ebook_payload(p) for p in items]


@router.post("/ebooks", status_code=201)
def create_ebook(
    data:  EbookCreate,
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    _ensure_ebook_genre(db, data.ebook_category_id)

    p = Product(
        category_id=None,                # plus de dépendance Category
        name=data.name,
        description=data.description,
        price=data.price,
        discount_percent=data.discount_percent,
        stock=None,
        required_fields=[],
        whatsapp_redirect=False,
        is_active=data.is_active,
        is_ebook=True,
        ebook_category_id=data.ebook_category_id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    logger.success(f"Ebook créé | id={p.id} | name={p.name} | admin_id={admin.id}")
    return {"message": "Ebook créé.", "id": p.id}


@router.put("/ebooks/{ebook_id}")
def update_ebook(
    ebook_id: int,
    data:     EbookUpdate,
    db:       Session = Depends(get_db),
    admin:    User    = Depends(get_admin_user),
):
    p = (
        db.query(Product)
        .options(joinedload(Product.ebook_category))
        .filter(Product.id == ebook_id, Product.is_ebook == True)  # noqa: E712
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Ebook introuvable.")

    payload = data.model_dump(exclude_unset=True)
    if "ebook_category_id" in payload:
        _ensure_ebook_genre(db, payload["ebook_category_id"])

    for field, value in payload.items():
        setattr(p, field, value)

    db.commit()
    db.refresh(p)
    logger.info(f"Ebook mis à jour | id={ebook_id} | admin_id={admin.id}")
    return {"message": "Ebook mis à jour."}


@router.delete("/ebooks/{ebook_id}")
def delete_ebook(
    ebook_id: int,
    db:       Session = Depends(get_db),
    admin:    User    = Depends(get_admin_user),
):
    p = db.query(Product).filter(
        Product.id == ebook_id, Product.is_ebook == True  # noqa: E712
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Ebook introuvable.")

    linked_orders = db.query(func.count(Order.id)).filter(Order.product_id == ebook_id).scalar() or 0
    storage_delete(p.image_path)
    storage_delete(p.pdf_path)

    if linked_orders > 0:
        p.is_active = False
        p.is_ebook = False
        p.image_path = None
        p.pdf_path = None
        p.name = f"[SUPPRIMÉ] {p.name}" if not p.name.startswith("[SUPPRIMÉ]") else p.name
        db.commit()
        logger.info(
            f"Ebook archivé | id={ebook_id} | commandes_liées={linked_orders} | admin_id={admin.id}"
        )
        return {
            "message": "Ebook supprimé de la boutique. L'historique des commandes a été conservé.",
            "archived": True,
        }

    db.delete(p)
    db.commit()
    logger.info(f"Ebook supprimé | id={ebook_id} | admin_id={admin.id}")
    return {"message": "Ebook supprimé.", "archived": False}


@router.post("/ebooks/{ebook_id}/image")
async def upload_ebook_image(
    ebook_id: int,
    file:     UploadFile = File(...),
    db:       Session    = Depends(get_db),
    admin:    User       = Depends(get_admin_user),
):
    p = db.query(Product).filter(
        Product.id == ebook_id, Product.is_ebook == True  # noqa: E712
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Ebook introuvable.")

    storage_delete(p.image_path)
    file_data    = await file.read()
    p.image_path = save_image(
        file_data,
        file.filename or "cover.jpg",
        "ebooks",
        max_px=2000,
    )
    db.commit()
    logger.info(f"Image ebook uploadée | id={ebook_id} | admin_id={admin.id}")
    return {"message": "Image mise à jour.", "image_path": p.image_path}


@router.delete("/ebooks/{ebook_id}/image")
def delete_ebook_image(
    ebook_id: int,
    db:       Session = Depends(get_db),
    admin:    User    = Depends(get_admin_user),
):
    p = db.query(Product).filter(
        Product.id == ebook_id, Product.is_ebook == True  # noqa: E712
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Ebook introuvable.")
    storage_delete(p.image_path)
    p.image_path = None
    db.commit()
    return {"message": "Image supprimée."}


@router.post("/ebooks/{ebook_id}/pdf")
async def upload_ebook_pdf(
    ebook_id: int,
    file:     UploadFile = File(...),
    db:       Session    = Depends(get_db),
    admin:    User       = Depends(get_admin_user),
):
    p = db.query(Product).filter(
        Product.id == ebook_id, Product.is_ebook == True  # noqa: E712
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Ebook introuvable.")

    file_data = await file.read()
    if len(file_data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF trop lourd (max 50 MB).")

    storage_delete(p.pdf_path)
    p.pdf_path = storage_upload(file_data, "pdf", "ebooks/pdfs")
    db.commit()
    logger.info(f"PDF ebook uploadé | id={ebook_id} | admin_id={admin.id}")
    return {"message": "PDF uploadé.", "pdf_path": p.pdf_path}


@router.delete("/ebooks/{ebook_id}/pdf")
def delete_ebook_pdf(
    ebook_id: int,
    db:       Session = Depends(get_db),
    admin:    User    = Depends(get_admin_user),
):
    p = db.query(Product).filter(
        Product.id == ebook_id, Product.is_ebook == True  # noqa: E712
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Ebook introuvable.")
    storage_delete(p.pdf_path)
    p.pdf_path = None
    db.commit()
    return {"message": "PDF supprimé."}


# ─── UTILISATEURS ─────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    page:     int     = Query(1, ge=1),
    per_page: int     = Query(50, ge=1, le=200),
    q:        str | None = Query(None),
    db:       Session = Depends(get_db),
    admin:    User    = Depends(get_admin_user),
):
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter((User.email.ilike(like)) | (User.username.ilike(like)))
    total = query.count()
    users = query.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return {
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "users": [
            {
                "id":          u.id,
                "email":       u.email,
                "username":    u.username,
                "phone":       u.phone,
                "is_admin":    u.is_admin,
                "is_verified": u.is_verified,
                "created_at":  u.created_at.isoformat(),
            }
            for u in users
        ],
    }


@router.put("/users/{user_id}/verify")
def verify_user(
    user_id: int,
    db:      Session = Depends(get_db),
    admin:   User    = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    user.is_verified = True
    db.commit()
    logger.info(f"Utilisateur vérifié manuellement | user_id={user_id} | admin_id={admin.id}")
    return {"message": "Utilisateur vérifié."}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db:      Session = Depends(get_db),
    admin:   User    = Depends(get_admin_user),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    db.delete(user)
    db.commit()
    logger.info(f"Utilisateur supprimé | user_id={user_id} | admin_id={admin.id}")
    return {"message": "Utilisateur supprimé."}


# ─── IMPORT REQUESTS ──────────────────────────────────────────────────────────

@router.get("/imports")
def list_imports(
    status:   str | None = Query(None),
    page:     int        = Query(1, ge=1),
    per_page: int        = Query(100, ge=1, le=500),
    db:       Session    = Depends(get_db),
    admin:    User       = Depends(get_admin_user),
):
    q = (
        db.query(ImportRequest)
        .options(joinedload(ImportRequest.user))
    )
    if status:
        q = q.filter(ImportRequest.status == status)

    total = q.with_entities(func.count(ImportRequest.id)).scalar() or 0
    imports = (
        q.order_by(ImportRequest.created_at.desc())
         .offset((page - 1) * per_page)
         .limit(per_page)
         .all()
    )
    items = [
        {
            "id":                  r.id,
            "user_id":             r.user_id,
            "user_email":          r.user.email if r.user else None,
            "user_name":           (getattr(r.user, "full_name", None) or getattr(r.user, "name", None)) if r.user else None,
            "category_id":         r.category_id,
            "article_url":         r.article_url,
            "product_link":        r.article_url,
            "article_description": r.article_description,
            "notes":               r.article_description,
            "screenshot_path":     r.screenshot_path,
            "screenshot_url":      f"/uploads/{r.screenshot_path}" if r.screenshot_path else None,
            "status":              r.status.value if hasattr(r.status, "value") else r.status,
            "staff_note":          r.staff_note,
            "created_at":          r.created_at.isoformat() if r.created_at else None,
            "updated_at":          r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in imports
    ]
    return {"total": total, "page": page, "per_page": per_page, "items": items}


@router.put("/imports/{import_id}/status")
def update_import_status(
    import_id: int,
    data:      ImportStatusUpdate,
    db:        Session = Depends(get_db),
    admin:     User    = Depends(get_admin_user),
):
    if data.status not in IMPORT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Statut invalide : {data.status}")
    req = db.query(ImportRequest).filter(ImportRequest.id == import_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    req.status     = data.status
    req.staff_note = data.staff_note
    db.commit()
    logger.info(f"Import request mis à jour | id={import_id} | status={data.status} | admin_id={admin.id}")
    return {"message": "Statut mis à jour."}


# ─── PARAMÈTRES ───────────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings(
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    maintenance     = get_setting(db, "maintenance_mode", False)
    announcement    = get_setting(db, "announcement", DEFAULT_ANNOUNCEMENT)
    payment_methods = get_setting(db, "payment_methods", DEFAULT_PAYMENT_METHODS)
    whatsapp_number = get_setting(db, "whatsapp_number", settings.WHATSAPP_NUMBER or "")
    featured_ids   = get_setting(db, "featured_product_ids", [])
    if not isinstance(featured_ids, list):
        featured_ids = []
    return {
        "maintenance":          bool(maintenance),
        "announcement":         announcement,
        "payment_methods":      payment_methods,
        "whatsapp_number":      whatsapp_number,
        "featured_product_ids": featured_ids,
    }


@router.put("/settings/maintenance")
def update_maintenance(
    data:  SettingMaintenance,
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    set_setting(db, "maintenance_mode", data.enabled)
    invalidate_site_cache()
    label = "activé" if data.enabled else "désactivé"
    logger.info(f"Mode maintenance {label} | admin_id={admin.id}")
    return {"message": f"Mode maintenance {label}."}


@router.put("/settings/announcement")
def update_announcement(
    data:  SettingAnnouncement,
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    enabled = data.enabled and bool(data.text.strip())
    set_setting(db, "announcement", {"enabled": enabled, "text": data.text.strip()})
    invalidate_site_cache()
    logger.info(f"Annonce mise à jour | admin_id={admin.id}")
    return {"message": "Annonce sauvegardée."}


@router.put("/settings/whatsapp")
def update_whatsapp(
    data:  SettingWhatsapp,
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    number = re.sub(r'[^\d]', '', data.number.strip())
    if not number:
        raise HTTPException(status_code=400, detail="Numéro invalide — chiffres uniquement.")
    set_setting(db, "whatsapp_number", number)
    invalidate_site_cache()
    logger.info(f"Numéro WhatsApp mis à jour | number={number} | admin_id={admin.id}")
    return {"message": f"Numéro mis à jour : {number}"}


@router.put("/settings/payment-methods")
def update_payment_methods(
    data:  SettingPaymentMethods,
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    current = get_setting(db, "payment_methods", DEFAULT_PAYMENT_METHODS)
    updates = {m.id: m for m in data.methods}
    updated = [
        {
            **m,
            "enabled":      updates[m["id"]].enabled      if m["id"] in updates else m.get("enabled", True),
            "instructions": updates[m["id"]].instructions if m["id"] in updates else m.get("instructions", ""),
        }
        for m in current
    ]
    set_setting(db, "payment_methods", updated)
    invalidate_site_cache()
    logger.info(f"Modes de paiement mis à jour | admin_id={admin.id}")
    return {"message": "Modes de paiement sauvegardés.", "methods": updated}


# ─── PRODUITS MIS EN AVANT (HOT NOW) ──────────────────────────────────────────

@router.get("/settings/featured-products")
def get_featured_products(
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    raw = get_setting(db, "featured_product_ids", [])
    if not isinstance(raw, list):
        raw = []
    ids = [int(x) for x in raw if isinstance(x, (int, str)) and str(x).lstrip("-").isdigit()]

    products = []
    if ids:
        rows = db.query(Product).filter(Product.id.in_(ids)).all()
        rows_by_id = {p.id: p for p in rows}
        for pid in ids:
            p = rows_by_id.get(pid)
            if p:
                products.append({
                    "id":         p.id,
                    "name":       p.name,
                    "price":      float(p.price),
                    "is_active":  p.is_active,
                    "stock":      p.stock,
                })
    return {"product_ids": ids, "products": products}


@router.put("/settings/featured-products")
def update_featured_products(
    data:  SettingFeaturedProducts,
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    seen = set()
    cleaned: list[int] = []
    for pid in data.product_ids:
        if pid in seen:
            continue
        seen.add(pid)
        cleaned.append(int(pid))

    if len(cleaned) > 12:
        raise HTTPException(status_code=400, detail="Maximum 12 produits Hot Now.")

    if cleaned:
        existing = {
            row.id for row in db.query(Product.id).filter(Product.id.in_(cleaned)).all()
        }
        missing = [pid for pid in cleaned if pid not in existing]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Produit(s) introuvable(s) : {missing}",
            )

    set_setting(db, "featured_product_ids", cleaned)
    invalidate_site_cache()
    logger.info(f"Hot Now mis à jour | ids={cleaned} | admin_id={admin.id}")
    return {
        "message":     f"{len(cleaned)} produit(s) en Hot Now.",
        "product_ids": cleaned,
    }


# ─── COUPONS — admin only ─────────────────────────────────────────────────────

@router.get("/coupons", response_model=list[CouponResponse])
def list_coupons(
    db:     Session       = Depends(get_db),
    admin:  User          = Depends(get_admin_user),
    q:      str | None    = Query(None),
    active: bool | None   = Query(None),
):
    """Liste des coupons (filtre optionnel `q` sur le code, `active` bool)."""
    query = db.query(Coupon)
    if q:
        query = query.filter(Coupon.code.ilike(f"%{q.upper()}%"))
    if active is not None:
        query = query.filter(Coupon.is_active == active)
    items = query.order_by(Coupon.created_at.desc()).all()
    return [CouponResponse.from_orm_full(c) for c in items]


@router.post("/coupons", response_model=CouponResponse)
def create_coupon(
    data:  CouponCreate,
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_admin_user),
):
    if data.code:
        code = normalize_code(data.code)
        if not is_valid_format(code):
            raise HTTPException(status_code=400,
                detail="Le code doit être au format TENORA-XXXXXXXXX (8 à 13 caractères A-Z/0-9 après le préfixe).")
        if db.query(Coupon.id).filter(Coupon.code == code).first():
            raise HTTPException(status_code=409, detail="Ce code existe déjà.")
    else:
        code = generate_code(db)

    coupon = Coupon(
        code             = code,
        discount_percent = data.discount_percent,
        discount_amount  = data.discount_amount,
        user_id          = data.user_id,
        max_uses         = data.max_uses,
        expires_at       = data.expires_at,
        is_active        = data.is_active,
        ebook_only       = data.ebook_only,
    )
    if data.product_ids:
        coupon.products = db.query(Product).filter(Product.id.in_(data.product_ids)).all()
    if data.category_ids:
        coupon.categories = db.query(Category).filter(Category.id.in_(data.category_ids)).all()

    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    logger.success(f"Coupon créé | id={coupon.id} | code={coupon.code} | by admin {admin.id}")
    return CouponResponse.from_orm_full(coupon)


@router.put("/coupons/{coupon_id}", response_model=CouponResponse)
def update_coupon(
    coupon_id: int,
    data:      CouponUpdate,
    db:        Session = Depends(get_db),
    admin:     User    = Depends(get_admin_user),
):
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon introuvable.")

    payload = data.model_dump(exclude_unset=True)
    if "discount_percent" in payload or "discount_amount" in payload:
        new_pct = payload.get("discount_percent", coupon.discount_percent)
        new_amt = payload.get("discount_amount",  coupon.discount_amount)
        if (new_pct is None) == (new_amt is None):
            raise HTTPException(status_code=400,
                detail="Renseignez soit un pourcentage, soit un montant fixe (un seul).")
        coupon.discount_percent = new_pct
        coupon.discount_amount  = new_amt

    for f in ("user_id", "max_uses", "expires_at", "is_active", "ebook_only"):
        if f in payload:
            setattr(coupon, f, payload[f])

    if "product_ids" in payload:
        coupon.products = (
            db.query(Product).filter(Product.id.in_(payload["product_ids"])).all()
            if payload["product_ids"] else []
        )
    if "category_ids" in payload:
        coupon.categories = (
            db.query(Category).filter(Category.id.in_(payload["category_ids"])).all()
            if payload["category_ids"] else []
        )

    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return CouponResponse.from_orm_full(coupon)


@router.delete("/coupons/{coupon_id}")
def delete_coupon(
    coupon_id: int,
    db:        Session = Depends(get_db),
    admin:     User    = Depends(get_admin_user),
):
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon introuvable.")
    db.delete(coupon)
    db.commit()
    return {"status": "ok"}


# ─── SSE — Stream de notifications admin ──────────────────────────────────────

@router.get("/stream")
async def sse_admin_stream(request: Request):
    """
    Endpoint SSE : garde une connexion ouverte par admin connecté.
    Le frontend s'y connecte via EventSource dès que l'admin est authentifié.

    Auth : Bearer token OU cookie session_id OU ?access_token=<token>

    IMPORTANT — Gestion de la DB :
      On vérifie l'auth avec une session DB éphémère qu'on ferme IMMÉDIATEMENT
      avant de démarrer le stream. Sans ça, chaque admin connecté maintient une
      connexion SQL ouverte indéfiniment, ce qui épuise le pool de connexions.

    Headers de réponse :
      - X-Accel-Buffering: no  → désactive le buffering Nginx (CRITIQUE)
      - Cache-Control: no-cache → pas de mise en cache proxy
    """
    from app.dependencies import _session_id_from_request, _resolve_user_from_session

    # ── Auth inline avec session DB éphémère ──────────────────────────────────
    db = SessionLocal()
    try:
        session_id = _session_id_from_request(request)
        if not session_id:
            raise HTTPException(status_code=401, detail="Non connecté")
        user = _resolve_user_from_session(session_id, db)
        if user is None:
            raise HTTPException(status_code=401, detail="Session expirée")
        if not user.is_admin:
            logger.warning(f"[SSE] Accès refusé | user_id={user.id}")
            raise HTTPException(status_code=403, detail="Accès refusé")
    finally:
        # Fermeture garantie que l'auth réussisse ou échoue
        db.close()

    # ── Stream SSE (plus aucune connexion DB active) ───────────────────────────
    from app.services.sse_manager import subscribe, event_stream

    client_id, queue = await subscribe()

    return StreamingResponse(
        event_stream(queue, client_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )
