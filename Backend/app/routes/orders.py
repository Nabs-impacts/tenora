import re

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from loguru import logger
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_admin_user, get_current_user, get_verified_user
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.user import User
from app.schemas.order import OrderCreate, OrderResponse, OrderStatusUpdate
from app.services.coupon_service import validate_for_order
from app.services.file_validator import validate_image_bytes
from app.services.mail_service import send_order_completed, send_order_refunded, send_order_rejected
from app.services.rate_limiter import limiter
from app.services.settings_service import DEFAULT_PAYMENT_METHODS, get_setting
from app.services.storage_service import upload_file as storage_upload

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def sanitize_customer_info(info: dict) -> dict:
    """Nettoie les clés/valeurs du customer_info pour éviter les injections."""
    clean = {}
    for k, v in info.items():
        key   = re.sub(r'[^\w]', '', str(k))[:50]
        value = re.sub(r'[<>"\']', '', str(v))[:500].strip()
        if key:
            clean[key] = value
    return clean


def _try_send_mail(fn, *args) -> None:
    """Wrapper pour éviter qu'un échec d'envoi mail crash la route."""
    try:
        fn(*args)
    except Exception as e:
        logger.error(f"Échec envoi mail | {fn.__name__} | {e}")


# ── Public : modes de paiement actifs ────────────────────────────────────────

@router.get("/payment-methods")
def get_active_payment_methods(db: Session = Depends(get_db)):
    """Retourne les modes de paiement actuellement actifs (endpoint public)."""
    methods = get_setting(db, "payment_methods", DEFAULT_PAYMENT_METHODS)
    return [
        {
            "id":           m["id"],
            "name":         m["name"],
            "icon":         m.get("icon", "💳"),
            "instructions": m.get("instructions", ""),
        }
        for m in methods if m.get("enabled", True)
    ]


# ── Créer une commande ────────────────────────────────────────────────────────

@router.post("/", response_model=OrderResponse)
@limiter.limit("20/minute")
def create_order(
    request: Request,
    data: OrderCreate,
    db: Session = Depends(get_db),
    user: User  = Depends(get_verified_user),
):
    methods     = get_setting(db, "payment_methods", DEFAULT_PAYMENT_METHODS)
    enabled_ids = [m["id"] for m in methods if m.get("enabled", True)]
    if data.payment_method not in enabled_ids:
        raise HTTPException(status_code=400,
            detail="Mode de paiement non disponible. Veuillez en choisir un autre.")

    product = db.query(Product).filter(
        Product.id        == data.product_id,
        Product.is_active == True,  # noqa: E712
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable.")

    if product.stock is not None and product.stock > 0:
        if product.stock < data.quantity:
            raise HTTPException(status_code=400,
                detail=f"Stock insuffisant — seulement {product.stock} unité(s) disponible(s).")

    # Validation des champs requis produit
    if product.required_fields:
        for field in product.required_fields:
            key      = field.get("key", "")
            label    = field.get("label", key)
            required = field.get("required", True)
            regex    = field.get("regex") or None
            value    = (data.customer_info or {}).get(key, "").strip()

            if required and not value:
                raise HTTPException(status_code=400,
                    detail=f"Le champ « {label} » est obligatoire.")
            if value and regex:
                try:
                    if not re.match(regex, value):
                        raise HTTPException(status_code=400,
                            detail=f"Le champ « {label} » est invalide — format attendu : "
                                   f"{field.get('placeholder', 'format incorrect')}.")
                except re.error:
                    logger.warning(f"Regex invalide sur le champ {key} du produit {product.id}")

    # Prix de base (hors coupon)
    base_price  = product.final_price if hasattr(product, "final_price") else product.price
    base_total  = base_price * data.quantity

    # ── Coupon (optionnel) ───────────────────────────────────────────────────
    coupon_obj      = None
    discount_amount = 0.0
    if data.coupon_code:
        coupon_obj, discount_amount, err = validate_for_order(
            db, data.coupon_code, product, user.id, data.quantity,
        )
        if err:
            raise HTTPException(status_code=400, detail=err)

    final_total = max(0.0, base_total - discount_amount)
    safe_info   = sanitize_customer_info(data.customer_info or {})

    order = Order(
        user_id         = user.id,
        product_id      = data.product_id,
        quantity        = data.quantity,
        total_price     = final_total,
        status          = OrderStatus.pending,
        customer_info   = safe_info,
        payment_method  = data.payment_method,
        coupon_id       = coupon_obj.id if coupon_obj else None,
        coupon_code     = coupon_obj.code if coupon_obj else None,
        discount_amount = discount_amount,
    )
    db.add(order)

    # Incrémenter l'usage AVANT commit pour rester atomique
    if coupon_obj:
        coupon_obj.times_used = (coupon_obj.times_used or 0) + 1
        db.add(coupon_obj)

    db.commit()
    db.refresh(order)

    logger.success(
        f"Commande créée | order_id={order.id} | user_id={user.id} "
        f"| product_id={product.id} | total={final_total} | discount={discount_amount} "
        f"| coupon={coupon_obj.code if coupon_obj else '-'}"
    )
    return order


# ── Upload screenshot ─────────────────────────────────────────────────────────

@router.post("/{order_id}/screenshot", response_model=OrderResponse)
@limiter.limit("10/minute")
def upload_screenshot(
    order_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session      = Depends(get_db),
    user: User       = Depends(get_current_user),
):
    order = db.query(Order).filter(
        Order.id      == order_id,
        Order.user_id == user.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    if order.status != OrderStatus.pending:
        raise HTTPException(status_code=400, detail="Cette commande ne peut plus être modifiée.")

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop lourd — maximum 5 MB.")

    file_data     = file.file.read()
    allowed_types = {"image/jpeg", "image/png", "image/webp"}

    if file.content_type not in allowed_types:
        logger.warning(f"Upload refusé | content-type invalide | user_id={user.id}")
        raise HTTPException(status_code=400, detail="Seules les images JPG, PNG et WEBP sont acceptées.")

    if not validate_image_bytes(file_data):
        logger.warning(f"Upload refusé | magic bytes invalides | user_id={user.id} | order_id={order_id}")
        raise HTTPException(status_code=400, detail="Le fichier ne correspond pas à une image valide.")

    extension = (file.filename or "").rsplit(".", 1)[-1].lower()
    if extension not in ("jpg", "jpeg", "png", "webp"):
        extension = "jpg"

    stored_path = storage_upload(file_data, extension, "orders")

    order.screenshot_path = stored_path
    order.status          = OrderStatus.processing
    db.commit()
    db.refresh(order)

    logger.success(f"Screenshot uploadé | order_id={order_id} | user_id={user.id} | stored={stored_path}")
    return order


# ── Mes commandes ─────────────────────────────────────────────────────────────

@router.get("/my", response_model=list[OrderResponse])
def get_my_orders(
    db: Session = Depends(get_db),
    user: User  = Depends(get_current_user),
):
    return (
        db.query(Order)
        .filter(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
        .all()
    )


# ── Admin : toutes les commandes ──────────────────────────────────────────────

@router.get("/admin/all", response_model=list[OrderResponse])
def get_all_orders(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    orders = db.query(Order).order_by(Order.created_at.desc()).all()
    logger.info(f"Admin consulte toutes les commandes | admin_id={admin.id}")
    return orders


@router.get("/admin/pending", response_model=list[OrderResponse])
def get_pending_orders(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    orders = (
        db.query(Order)
        .filter(Order.status == OrderStatus.processing)
        .order_by(Order.created_at.asc())
        .all()
    )
    logger.info(f"Admin consulte les commandes en attente | admin_id={admin.id} | count={len(orders)}")
    return orders


# ── Admin : mettre à jour le statut ──────────────────────────────────────────

@router.put("/admin/{order_id}", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    data: OrderStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable.")

    client  = db.query(User).filter(User.id == order.user_id).first()
    product = db.query(Product).filter(Product.id == order.product_id).first()

    old_status       = order.status
    order.status     = data.status
    order.staff_note = data.staff_note
    db.commit()
    db.refresh(order)

    if client and product:
        if data.status == OrderStatus.completed:
            _try_send_mail(send_order_completed, client.email, order.id, product.name, order.total_price)
        elif data.status == OrderStatus.rejected:
            _try_send_mail(send_order_rejected, client.email, order.id, product.name, data.staff_note)
        elif data.status == OrderStatus.refunded:
            _try_send_mail(send_order_refunded, client.email, order.id, product.name, order.total_price)
    else:
        logger.warning(
            f"Mail non envoyé | client ou produit introuvable "
            f"| order_id={order_id} | user_id={order.user_id} | product_id={order.product_id}"
        )

    logger.success(
        f"Statut commande mis à jour | order_id={order_id} "
        f"| {old_status} → {data.status} | admin_id={admin.id}"
    )
    return order


# ── Annuler (client) ──────────────────────────────────────────────────────────

@router.post("/{order_id}/cancel", response_model=OrderResponse)
@limiter.limit("5/minute")
def cancel_order(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User  = Depends(get_current_user),
):
    order = db.query(Order).filter(
        Order.id      == order_id,
        Order.user_id == user.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    if order.status not in (OrderStatus.pending, OrderStatus.processing):
        raise HTTPException(status_code=400,
            detail=f"Cette commande ne peut plus être annulée (statut actuel : {order.status}).")

    order.status     = OrderStatus.rejected
    order.staff_note = "Annulée par le client"
    db.commit()
    db.refresh(order)

    logger.info(f"Commande annulée par client | order_id={order_id} | user_id={user.id}")
    return order
