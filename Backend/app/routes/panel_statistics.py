# === app/routes/panel_statistics.py ===
"""
Routes statistiques avancées — panel admin Tenora.

v5 (optimisation VPS) :
  - Toutes les agrégations sont déléguées à SQL (GROUP BY / SUM / COUNT).
    Fini le chargement de milliers d'objets ORM en mémoire Python.
  - Cache TTL 60 s en mémoire (dict module-level) : deux admins qui ouvrent
    le panel dans la même minute ne re-exécutent pas les requêtes lourdes.
  - invalidate_stats_cache() est appelé depuis panel.py dès qu'une commande
    change de statut.
  - JOIN session+user dans dependencies.py réduit à 1 la requête auth par
    request (était 2).
  - Projection de colonnes : les requêtes ne sélectionnent que ce dont elles
    ont besoin (pas de lazy="joined" parasite).

Export CSV + PDF : inchangé fonctionnellement.
"""
import csv
import io
import time as _time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_admin_user
from app.models.coupon import Coupon
from app.models.order import Order, OrderStatus
from app.models.product import Category, Product
from app.models.user import User

try:
    from fpdf import FPDF  # type: ignore
    _HAS_FPDF = True
except ImportError:
    _HAS_FPDF = False


# ─── Cache TTL 60 s ───────────────────────────────────────────────────────────

_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 60  # secondes


def _cache_get(key: str) -> dict | None:
    entry = _cache.get(key)
    if entry and _time.time() - entry[0] < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, value: dict) -> None:
    _cache[key] = (_time.time(), value)
    # Nettoyage léger : on garde max 200 entrées
    if len(_cache) > 200:
        cutoff = _time.time() - _CACHE_TTL * 2
        for k in [k for k, (ts, _) in list(_cache.items()) if ts < cutoff]:
            _cache.pop(k, None)


def invalidate_stats_cache() -> None:
    """Vider le cache stats (appeler dès qu'une commande change de statut)."""
    _cache.clear()


# ─── Constantes ───────────────────────────────────────────────────────────────

stats_router = APIRouter(prefix="/panel/statistics", tags=["Admin Panel — Statistics"])

_VALID_SECTIONS = {"overview", "orders", "revenue", "products", "customers", "coupons"}

# Statuts qui génèrent du CA
_REV_STATUSES = [OrderStatus.completed, OrderStatus.processing]
_REV_SET = {OrderStatus.completed, OrderStatus.processing}


# ─── Helpers communs ──────────────────────────────────────────────────────────

def _parse_period(
    period: str,
    date_from: Optional[str],
    date_to: Optional[str],
) -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    if date_from and date_to:
        try:
            start = datetime.fromisoformat(date_from)
            end   = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59)
        except ValueError:
            raise HTTPException(status_code=400, detail="Dates invalides (format YYYY-MM-DD attendu).")
        return start, end
    mapping = {"7j": 7, "30j": 30, "90j": 90, "12m": 365}
    days = mapping.get(period, 30)
    return now - timedelta(days=days), now


def _previous_window(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    delta = end - start
    return start - delta, start


def _delta_pct(curr: float, prev: float) -> float:
    if prev == 0:
        return 0.0 if curr == 0 else 100.0
    return round((curr - prev) / prev * 100, 1)


def _day_str(val) -> str:
    """Convertit une valeur date SQLAlchemy (date ou str) en 'YYYY-MM-DD'."""
    return str(val) if val else ""


def _mask_email(email: Optional[str]) -> str:
    if not email or "@" not in email:
        return "—"
    user, domain = email.split("@", 1)
    return f"{user[0]}***@{domain}"


def _full_email(email: Optional[str]) -> str:
    return email if email and "@" in email else "—"


def _safe(text) -> str:
    """Remplace les caractères non-latin-1 pour fpdf2 core fonts."""
    return (
        str(text)
        .replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2026", "...")
        .encode("latin-1", errors="replace")
        .decode("latin-1")
    )


# ─── /overview ────────────────────────────────────────────────────────────────

@stats_router.get("/overview")
def stats_overview(
    period:    str           = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db:        Session       = Depends(get_db),
    admin:     User          = Depends(get_admin_user),
):
    start, end   = _parse_period(period, date_from, date_to)
    p_start, p_end = _previous_window(start, end)

    key = f"overview|{start}|{end}"
    if (hit := _cache_get(key)) is not None:
        return hit

    def _sql_kpis(s: datetime, e: datetime):
        return db.query(
            func.count(Order.id).label("orders"),
            func.coalesce(func.sum(
                case((Order.status.in_(_REV_STATUSES), Order.total_price), else_=0)
            ), 0).label("revenue"),
            func.count(
                case((Order.status == OrderStatus.completed, 1))
            ).label("completed"),
        ).filter(Order.created_at.between(s, e)).first()

    c = _sql_kpis(start, end)
    p = _sql_kpis(p_start, p_end)

    c_rev  = float(c.revenue or 0)
    p_rev  = float(p.revenue or 0)
    c_comp = int(c.completed or 0)
    p_comp = int(p.completed or 0)
    c_ord  = int(c.orders or 0)
    p_ord  = int(p.orders or 0)

    c_avg  = round(c_rev / max(1, c_comp)) if c_comp else 0
    p_avg  = round(p_rev / max(1, p_comp)) if p_comp else 0
    c_rate = round(c_comp / max(1, c_ord) * 100, 1) if c_ord else 0.0
    p_rate = round(p_comp / max(1, p_ord) * 100, 1) if p_ord else 0.0

    # Graphique journalier — une ligne par jour (max ~365 lignes même pour 12m)
    chart_rows = db.query(
        func.date(Order.created_at).label("day"),
        func.count(Order.id).label("orders"),
        func.coalesce(func.sum(
            case((Order.status.in_(_REV_STATUSES), Order.total_price), else_=0)
        ), 0).label("revenue"),
        func.count(
            case((Order.status == OrderStatus.completed, 1))
        ).label("completed"),
    ).filter(
        Order.created_at.between(start, end)
    ).group_by(func.date(Order.created_at)).order_by(func.date(Order.created_at)).all()

    chart = [
        {"date": _day_str(r.day), "revenue": round(float(r.revenue)), "orders": int(r.orders)}
        for r in chart_rows
    ]

    # Distribution des statuts
    total_curr = max(1, c_ord)
    status_rows = db.query(
        Order.status,
        func.count(Order.id).label("cnt"),
    ).filter(
        Order.created_at.between(start, end)
    ).group_by(Order.status).all()

    status_distribution = [
        {
            "status": r.status.value if hasattr(r.status, "value") else str(r.status),
            "count":  int(r.cnt),
            "pct":    round(int(r.cnt) / total_curr * 100, 1),
        }
        for r in status_rows
    ]

    # Résumé hebdomadaire — calculé depuis les données journalières déjà en mémoire
    by_week: dict = defaultdict(lambda: {"orders": 0, "revenue": 0.0, "completed": 0})
    for r in chart_rows:
        try:
            d = datetime.fromisoformat(_day_str(r.day))
        except ValueError:
            continue
        wk = d.strftime("%Y-W%V")
        by_week[wk]["orders"]    += int(r.orders)
        by_week[wk]["revenue"]   += float(r.revenue)
        by_week[wk]["completed"] += int(r.completed)

    weekly_summary = [
        {
            "week":            w,
            "orders":          v["orders"],
            "revenue":         round(v["revenue"]),
            "avg_basket":      round(v["revenue"] / max(1, v["completed"])) if v["completed"] else 0,
            "completion_rate": round(v["completed"] / max(1, v["orders"]) * 100, 1),
        }
        for w, v in sorted(by_week.items())
    ]

    result = {
        "kpis": {
            "revenue":                   round(c_rev),
            "revenue_prev":              round(p_rev),
            "revenue_delta_pct":         _delta_pct(c_rev, p_rev),
            "orders":                    c_ord,
            "orders_prev":               p_ord,
            "orders_delta_pct":          _delta_pct(c_ord, p_ord),
            "avg_basket":                c_avg,
            "avg_basket_prev":           p_avg,
            "avg_basket_delta_pct":      _delta_pct(c_avg, p_avg),
            "completion_rate":           c_rate,
            "completion_rate_prev":      p_rate,
            "completion_rate_delta_pct": _delta_pct(c_rate, p_rate),
        },
        "chart":               chart,
        "status_distribution": status_distribution,
        "weekly_summary":      weekly_summary,
    }
    _cache_set(key, result)
    return result


# ─── /orders ──────────────────────────────────────────────────────────────────

@stats_router.get("/orders")
def stats_orders(
    period:    str           = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db:        Session       = Depends(get_db),
    admin:     User          = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)

    key = f"orders|{start}|{end}"
    if (hit := _cache_get(key)) is not None:
        return hit

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # KPIs globaux en une requête
    kpi = db.query(
        func.count(Order.id).label("total"),
        func.count(case((Order.created_at >= today_start, 1))).label("today"),
        func.count(case((Order.status == OrderStatus.rejected, 1))).label("rejected"),
        func.count(case((Order.status == OrderStatus.completed, 1))).label("completed"),
        func.count(case((Order.status == OrderStatus.processing, 1))).label("processing"),
    ).filter(Order.created_at.between(start, end)).first()

    total    = int(kpi.total or 0)
    rejected = int(kpi.rejected or 0)
    rejection_rate = round(rejected / max(1, total) * 100, 1)

    # Répartition journalière par statut
    daily_rows = db.query(
        func.date(Order.created_at).label("day"),
        Order.status,
        func.count(Order.id).label("cnt"),
    ).filter(
        Order.created_at.between(start, end)
    ).group_by(func.date(Order.created_at), Order.status).order_by(func.date(Order.created_at)).all()

    # Pivot en mémoire (max ~365 jours × 5 statuts = ~1800 lignes)
    day_map: dict = defaultdict(lambda: {s: 0 for s in ("completed", "pending", "rejected", "processing", "refunded")})
    for r in daily_rows:
        st = r.status.value if hasattr(r.status, "value") else str(r.status)
        day_map[_day_str(r.day)][st] += int(r.cnt)

    daily_breakdown = [
        {"date": d, **counts}
        for d, counts in sorted(day_map.items())
    ]

    # Distribution horaire
    hourly_rows = db.query(
        func.extract("hour", Order.created_at).label("hr"),
        func.count(Order.id).label("cnt"),
    ).filter(
        Order.created_at.between(start, end)
    ).group_by(func.extract("hour", Order.created_at)).all()

    hour_map = {int(r.hr): int(r.cnt) for r in hourly_rows}
    hourly_distribution = [{"hour": h, "count": hour_map.get(h, 0)} for h in range(24)]

    funnel = {
        "total":          total,
        "processing":     int(kpi.processing or 0),
        "processing_pct": round(int(kpi.processing or 0) / max(1, total) * 100, 1),
        "completed":      int(kpi.completed or 0),
        "completion_pct": round(int(kpi.completed or 0) / max(1, total) * 100, 1),
    }

    result = {
        "kpis": {
            "total":                total,
            "today":                int(kpi.today or 0),
            "rejection_rate":       rejection_rate,
            "avg_processing_hours": None,  # colonne processed_at absente du modèle
        },
        "daily_breakdown":     daily_breakdown,
        "hourly_distribution": hourly_distribution,
        "funnel":              funnel,
    }
    _cache_set(key, result)
    return result


# ─── /revenue ─────────────────────────────────────────────────────────────────

@stats_router.get("/revenue")
def stats_revenue(
    period:    str           = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db:        Session       = Depends(get_db),
    admin:     User          = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)

    key = f"revenue|{start}|{end}"
    if (hit := _cache_get(key)) is not None:
        return hit

    n_days = max(1, (end - start).days)

    # KPIs globaux
    kpi = db.query(
        func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
        func.coalesce(func.sum(Order.discount_amount), 0).label("discounts"),
    ).filter(
        Order.created_at.between(start, end),
        Order.status.in_(_REV_STATUSES),
    ).first()

    total_revenue = round(float(kpi.revenue or 0))
    daily_avg     = round(total_revenue / n_days)
    total_discounts = round(float(kpi.discounts or 0))

    # CA journalier (pour courbe cumulative) — max ~365 lignes
    daily_rows = db.query(
        func.date(Order.created_at).label("day"),
        func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
    ).filter(
        Order.created_at.between(start, end),
        Order.status.in_(_REV_STATUSES),
    ).group_by(func.date(Order.created_at)).order_by(func.date(Order.created_at)).all()

    best_day  = {"date": None, "revenue": 0}
    cumulative = []
    cum_total  = 0.0
    for r in daily_rows:
        v = round(float(r.revenue))
        cum_total += v
        cumulative.append({"date": _day_str(r.day), "revenue": v, "cumulative": round(cum_total)})
        if v > best_day["revenue"]:
            best_day = {"date": _day_str(r.day), "revenue": v}

    # Par mode de paiement
    pm_rows = db.query(
        func.coalesce(Order.payment_method, "—").label("method"),
        func.count(Order.id).label("orders"),
        func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
    ).filter(
        Order.created_at.between(start, end),
        Order.status.in_(_REV_STATUSES),
    ).group_by(Order.payment_method).all()

    by_payment_method = [
        {"method": r.method, "revenue": round(float(r.revenue)), "orders": int(r.orders)}
        for r in pm_rows
    ]

    # Par catégorie — JOIN Product + Category
    cat_rows = db.query(
        func.coalesce(Category.name, "—").label("cat_name"),
        func.count(Order.id).label("orders"),
        func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
    ).join(
        Product, Product.id == Order.product_id
    ).outerjoin(
        Category, Category.id == Product.category_id
    ).filter(
        Order.created_at.between(start, end),
        Order.status.in_(_REV_STATUSES),
    ).group_by(Category.name).order_by(func.sum(Order.total_price).desc()).all()

    total_cat_rev = sum(float(r.revenue) for r in cat_rows) or 1
    by_category = [
        {
            "category":   r.cat_name,
            "revenue":    round(float(r.revenue)),
            "orders":     int(r.orders),
            "avg_basket": round(float(r.revenue) / max(1, int(r.orders))),
            "share_pct":  round(float(r.revenue) / total_cat_rev * 100, 1),
        }
        for r in cat_rows
    ]

    # Scatter par heure — projection colonne uniquement (pas d'ORM complet)
    scatter_rows = db.query(
        Order.created_at,
        Order.total_price,
        Order.status,
    ).filter(
        Order.created_at.between(start, end),
        Order.status.in_(_REV_STATUSES),
    ).all()

    scatter = [
        {
            "hour":   r.created_at.hour,
            "amount": round(float(r.total_price or 0)),
            "status": r.status.value if hasattr(r.status, "value") else str(r.status),
        }
        for r in scatter_rows
    ]

    result = {
        "kpis": {
            "total_revenue":   total_revenue,
            "daily_avg":       daily_avg,
            "best_day":        best_day,
            "total_discounts": total_discounts,
        },
        "cumulative":        cumulative,
        "by_payment_method": by_payment_method,
        "by_category":       by_category,
        "scatter":           scatter,
    }
    _cache_set(key, result)
    return result


# ─── /products ────────────────────────────────────────────────────────────────

@stats_router.get("/products")
def stats_products(
    period:    str           = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db:        Session       = Depends(get_db),
    admin:     User          = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)

    key = f"products|{start}|{end}"
    if (hit := _cache_get(key)) is not None:
        return hit

    # Agrégation des ventes par produit via sous-requête
    order_stats_sq = db.query(
        Order.product_id,
        func.coalesce(func.sum(Order.quantity), 0).label("sales"),
        func.coalesce(func.sum(Order.total_price), 0).label("revenue"),
    ).filter(
        Order.created_at.between(start, end),
        Order.status.in_(_REV_STATUSES),
    ).group_by(Order.product_id).subquery()

    # JOIN Product + sous-requête + Category
    rows = db.query(
        Product.id,
        Product.name,
        Product.stock,
        Product.is_active,
        func.coalesce(Category.name, "—").label("cat_name"),
        func.coalesce(order_stats_sq.c.sales, 0).label("sales"),
        func.coalesce(order_stats_sq.c.revenue, 0).label("revenue"),
    ).outerjoin(
        order_stats_sq, order_stats_sq.c.product_id == Product.id
    ).outerjoin(
        Category, Category.id == Product.category_id
    ).all()

    # KPIs produits
    total_products = len(rows)
    active = sum(1 for r in rows if r.is_active)
    active_rate_pct = round(active / max(1, total_products) * 100, 1)

    prod_with_sales = [r for r in rows if float(r.sales) > 0]
    zero_sales_count = total_products - len(prod_with_sales)

    top_seller  = max(prod_with_sales, key=lambda r: float(r.sales),   default=None)
    top_revenue = max(prod_with_sales, key=lambda r: float(r.revenue), default=None)

    # Top 10 par CA
    top_products = [
        {
            "name":        r.name,
            "category":    r.cat_name,
            "sales_count": int(r.sales),
            "revenue":     round(float(r.revenue)),
        }
        for r in sorted(prod_with_sales, key=lambda r: float(r.revenue), reverse=True)[:10]
    ]

    # Treemap catégorie
    cat_map: dict = defaultdict(float)
    for r in rows:
        cat_map[r.cat_name] += float(r.revenue)
    treemap = [
        {"name": c, "value": round(rev), "children": [{"name": c, "value": round(rev)}]}
        for c, rev in cat_map.items()
    ]

    # Table complète
    table = [
        {
            "id":         r.id,
            "name":       r.name,
            "category":   r.cat_name,
            "sales":      int(r.sales),
            "revenue":    round(float(r.revenue)),
            "avg_basket": round(float(r.revenue) / max(1, int(r.sales))) if int(r.sales) else 0,
            "stock":      r.stock,
            "is_active":  r.is_active,
        }
        for r in rows
    ]

    result = {
        "kpis": {
            "top_seller_name":    top_seller.name  if top_seller  else None,
            "top_seller_qty":     int(top_seller.sales)  if top_seller  else 0,
            "top_revenue_name":   top_revenue.name if top_revenue else None,
            "top_revenue_amount": round(float(top_revenue.revenue)) if top_revenue else 0,
            "active_rate_pct":    active_rate_pct,
            "zero_sales_count":   zero_sales_count,
        },
        "top_products": top_products,
        "treemap":      treemap,
        "table":        table,
    }
    _cache_set(key, result)
    return result


# ─── /customers ───────────────────────────────────────────────────────────────

@stats_router.get("/customers")
def stats_customers(
    period:    str           = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db:        Session       = Depends(get_db),
    admin:     User          = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)

    key = f"customers|{start}|{end}"
    if (hit := _cache_get(key)) is not None:
        return hit

    # Nouveaux utilisateurs par jour
    new_per_day_rows = db.query(
        func.date(User.created_at).label("day"),
        func.count(User.id).label("new_users"),
    ).filter(
        User.created_at.between(start, end)
    ).group_by(func.date(User.created_at)).order_by(func.date(User.created_at)).all()

    new_customers   = sum(int(r.new_users) for r in new_per_day_rows)
    new_per_day     = [{"date": _day_str(r.day), "new_users": int(r.new_users)} for r in new_per_day_rows]

    # Commandes groupées par user (pour retention + top customers)
    # Seules les commandes COMPLÉTÉES sont prises en compte — les pending/rejected
    # fausseraient le classement et le CA réel de chaque client.
    top_rows = db.query(
        User.email,
        func.count(Order.id).label("orders_count"),
        func.coalesce(func.sum(Order.total_price), 0).label("total_revenue"),
        func.max(Order.created_at).label("last_order_at"),
    ).join(
        User, User.id == Order.user_id
    ).filter(
        Order.created_at.between(start, end),
        Order.status == OrderStatus.completed,
    ).group_by(Order.user_id, User.email).order_by(
        func.sum(Order.total_price).desc()
    ).all()

    total_active_users = len(top_rows)
    returning = sum(1 for r in top_rows if int(r.orders_count) >= 2)
    retention = round(returning / max(1, total_active_users) * 100, 1)

    top_customers = []
    for idx, r in enumerate(top_rows[:20]):
        n  = int(r.orders_count)
        rv = round(float(r.total_revenue))
        status = "vip" if n >= 5 else ("récurrent" if n >= 2 else "nouveau")
        email  = _full_email(r.email)
        top_customers.append({
            "email":         email,
            "email_masked":  email,
            "is_top":        idx == 0,
            "orders_count":  n,
            "total_revenue": rv,
            "last_order_at": r.last_order_at.isoformat() if r.last_order_at else None,
            "status":        status,
        })

    # Distribution des buckets — utilise top_rows (déjà en mémoire)
    buckets = {"1": 0, "2-3": 0, "4-5": 0, "6+": 0}
    for r in top_rows:
        n = int(r.orders_count)
        if n == 1:        buckets["1"]   += 1
        elif n <= 3:      buckets["2-3"] += 1
        elif n <= 5:      buckets["4-5"] += 1
        else:             buckets["6+"]  += 1

    top = top_customers[0] if top_customers else None

    result = {
        "kpis": {
            "new_customers":             new_customers,
            "returning_customers":       returning,
            "retention_rate_pct":        retention,
            "top_customer_email":        top["email"]        if top else "—",
            "top_customer_email_masked": top["email_masked"] if top else "—",
            "top_customer_revenue":      top["total_revenue"] if top else 0,
        },
        "new_per_day": new_per_day,
        "orders_distribution": [
            {"bucket": "1",   "label": "1 commande",    "customer_count": buckets["1"]},
            {"bucket": "2-3", "label": "2-3 commandes", "customer_count": buckets["2-3"]},
            {"bucket": "4-5", "label": "4-5 commandes", "customer_count": buckets["4-5"]},
            {"bucket": "6+",  "label": "6+ commandes",  "customer_count": buckets["6+"]},
        ],
        "top_customers": top_customers,
    }
    _cache_set(key, result)
    return result


# ─── /coupons ─────────────────────────────────────────────────────────────────

@stats_router.get("/coupons")
def stats_coupons(
    period:    str           = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db:        Session       = Depends(get_db),
    admin:     User          = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)

    key = f"coupons|{start}|{end}"
    if (hit := _cache_get(key)) is not None:
        return hit

    # Tous les coupons (petite table)
    coupons = db.query(Coupon).all()
    active_count = sum(1 for c in coupons if getattr(c, "is_active", True))

    # Agrégation des usages par code dans la période — SQL GROUP BY
    usage_rows = db.query(
        Order.coupon_code,
        func.count(Order.id).label("uses"),
        func.coalesce(func.sum(Order.discount_amount), 0).label("remise_total"),
    ).filter(
        Order.created_at.between(start, end),
        Order.coupon_code.isnot(None),
    ).group_by(Order.coupon_code).all()

    by_code = {
        r.coupon_code: {"uses": int(r.uses), "remise_total": float(r.remise_total)}
        for r in usage_rows
    }

    total_uses              = sum(v["uses"]         for v in by_code.values())
    total_discounts_granted = sum(v["remise_total"] for v in by_code.values())
    top_code = max(by_code.items(), key=lambda x: x[1]["uses"], default=(None, {"uses": 0}))

    by_coupon_list = [
        {
            "code":         c.code,
            "type":         getattr(c, "type", "amount"),
            "value":        getattr(c, "value", 0),
            "uses":         by_code.get(c.code, {}).get("uses", 0),
            "max_uses":     getattr(c, "max_uses", None),
            "remise_total": round(by_code.get(c.code, {}).get("remise_total", 0)),
            "is_active":    getattr(c, "is_active", True),
            "expires_at":   c.expires_at.isoformat() if getattr(c, "expires_at", None) else None,
        }
        for c in coupons
    ]

    # Remises journalières — SQL GROUP BY
    daily_rows = db.query(
        func.date(Order.created_at).label("day"),
        func.coalesce(func.sum(Order.discount_amount), 0).label("discount_amount"),
    ).filter(
        Order.created_at.between(start, end),
        Order.coupon_code.isnot(None),
    ).group_by(func.date(Order.created_at)).order_by(func.date(Order.created_at)).all()

    daily_discounts = [
        {"date": _day_str(r.day), "discount_amount": round(float(r.discount_amount))}
        for r in daily_rows
    ]

    result = {
        "kpis": {
            "active_count":            active_count,
            "total_uses":              total_uses,
            "total_discounts_granted": round(total_discounts_granted),
            "top_coupon_code":         top_code[0] or "—",
            "top_coupon_uses":         top_code[1]["uses"],
        },
        "by_coupon":       by_coupon_list,
        "daily_discounts": daily_discounts,
    }
    _cache_set(key, result)
    return result


# ─── EXPORT CSV ───────────────────────────────────────────────────────────────

def _csv_stream(rows, headers):
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(headers)
    for r in rows:
        w.writerow(r)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv")


@stats_router.get("/export/{section}/csv")
def export_csv(
    section:   str,
    period:    str           = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db:        Session       = Depends(get_db),
    admin:     User          = Depends(get_admin_user),
):
    if section not in _VALID_SECTIONS:
        raise HTTPException(status_code=400, detail="Section invalide.")

    stamp    = datetime.utcnow().strftime("%Y%m%d")
    filename = f"tenora_{section}_{stamp}.csv"

    fetcher = {
        "overview":  stats_overview,
        "orders":    stats_orders,
        "revenue":   stats_revenue,
        "products":  stats_products,
        "customers": stats_customers,
        "coupons":   stats_coupons,
    }[section]
    data = fetcher(period, date_from, date_to, db, admin)

    if section == "overview":
        headers = ["Date", "Commandes", "Chiffre d'affaires (F)"]
        rows = [[r["date"], r["orders"], r["revenue"]] for r in data["chart"]]
    elif section == "orders":
        headers = ["Date", "Complétées", "En attente", "Rejetées", "En traitement", "Remboursées"]
        rows = [[r["date"], r["completed"], r["pending"], r["rejected"], r["processing"], r["refunded"]] for r in data["daily_breakdown"]]
    elif section == "revenue":
        headers = ["Date", "Chiffre d'affaires (F)", "CA cumulé (F)"]
        rows = [[r["date"], r["revenue"], r["cumulative"]] for r in data["cumulative"]]
    elif section == "products":
        headers = ["Produit", "Catégorie", "Ventes", "Chiffre d'affaires (F)", "Panier moyen (F)", "Stock"]
        rows = [[r["name"], r["category"], r["sales"], r["revenue"], r["avg_basket"], r["stock"]] for r in data["table"]]
    elif section == "customers":
        headers = ["Email", "Commandes", "Chiffre d'affaires total (F)", "Dernière commande", "Statut"]
        rows = [[r.get("email") or r.get("email_masked"), r["orders_count"], r["total_revenue"], r["last_order_at"], r["status"]] for r in data["top_customers"]]
    elif section == "coupons":
        headers = ["Code", "Type", "Valeur", "Utilisations", "Remise accordée (F)", "Actif"]
        rows = [[r["code"], r["type"], r["value"], r["uses"], r["remise_total"], r["is_active"]] for r in data["by_coupon"]]
    else:
        raise HTTPException(status_code=400, detail="Section non gérée.")

    resp = _csv_stream(rows, headers)
    resp.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return resp


# ─── EXPORT PDF — esprit TENORA ───────────────────────────────────────────────

_T_PAGE     = (38, 38, 38)
_T_BG       = (10, 10, 10)
_T_INK      = (245, 245, 245)
_T_INK_DIM  = (170, 170, 170)
_T_NEON     = (212, 255, 61)
_T_NEON_INK = (10, 10, 10)
_T_LINE     = (65, 65, 65)
_T_CARD     = (12, 12, 12)
_T_CARD_ALT = (22, 22, 22)
_T_SUCCESS  = (74, 222, 128)


def _brackets(pdf, x, y, w, h, color=_T_NEON, size=3.0, thick=0.6):
    pdf.set_draw_color(*color)
    pdf.set_line_width(thick)
    pdf.line(x, y, x + size, y); pdf.line(x, y, x, y + size)
    pdf.line(x + w, y, x + w - size, y); pdf.line(x + w, y, x + w, y + size)
    pdf.line(x, y + h, x + size, y + h); pdf.line(x, y + h, x, y + h - size)
    pdf.line(x + w, y + h, x + w - size, y + h); pdf.line(x + w, y + h, x + w, y + h - size)


def _make_pdf(section: str, start: datetime, end: datetime, data: dict) -> bytes:
    SECTION_LABELS = {
        "overview": "Vue Globale", "orders": "Commandes", "revenue": "Revenus",
        "products": "Produits", "customers": "Clients", "coupons": "Coupons",
    }
    section_label = SECTION_LABELS.get(section, section.upper())

    class TenoraReport(FPDF):
        def header(self):
            self.set_fill_color(*_T_PAGE)
            self.rect(0, 0, 210, 297, "F")
            self.set_fill_color(*_T_BG)
            self.rect(0, 0, 210, 22, "F")
            self.set_fill_color(*_T_NEON)
            self.rect(0, 22, 210, 1.2, "F")
            self.set_fill_color(*_T_NEON)
            self.rect(10, 5, 12, 12, "F")
            self.set_font("Courier", "B", 11)
            self.set_text_color(*_T_NEON_INK)
            self.set_xy(10, 5)
            self.cell(12, 12, "T", align="C")
            self.set_font("Courier", "B", 14)
            self.set_text_color(*_T_INK)
            self.set_xy(26, 6.5)
            self.cell(0, 5, "TENORA", ln=1)
            self.set_font("Courier", "", 7)
            self.set_text_color(*_T_INK_DIM)
            self.set_xy(26, 12)
            self.cell(0, 4, "// ADMIN.PANEL  //  STATISTICS REPORT", ln=1)
            self.set_font("Courier", "", 7)
            self.set_text_color(*_T_SUCCESS)
            self.set_xy(160, 7)
            self.cell(40, 4, "* SYS // NOMINAL", align="R", ln=1)
            self.set_text_color(*_T_INK_DIM)
            self.set_xy(160, 12)
            self.cell(40, 4, datetime.utcnow().strftime("%d/%m/%Y %H:%M UTC"), align="R", ln=1)
            self.set_fill_color(*_T_CARD)
            self.rect(0, 23.2, 210, 14, "F")
            self.set_font("Courier", "", 7)
            self.set_text_color(*_T_INK_DIM)
            self.set_xy(10, 25)
            self.cell(0, 4, "// SECTION", ln=1)
            self.set_font("Courier", "B", 13)
            self.set_text_color(*_T_INK)
            self.set_xy(10, 29)
            self.cell(0, 6, _safe(section_label).upper(), ln=1)
            self.set_font("Courier", "", 7)
            self.set_text_color(*_T_INK_DIM)
            self.set_xy(120, 25)
            self.cell(80, 4, "// PERIODE", align="R", ln=1)
            self.set_font("Courier", "B", 9)
            self.set_text_color(*_T_NEON)
            self.set_xy(120, 30)
            self.cell(80, 5, f"{start.strftime('%d/%m/%Y')}  ->  {end.strftime('%d/%m/%Y')}", align="R", ln=1)
            self.set_y(43)
            self.set_text_color(20, 20, 20)
            self.set_draw_color(*_T_LINE)

        def footer(self):
            self.set_fill_color(*_T_NEON)
            self.rect(0, 285, 210, 0.6, "F")
            self.set_fill_color(*_T_BG)
            self.rect(0, 285.6, 210, 11.4, "F")
            self.set_y(-9)
            self.set_font("Courier", "", 7)
            self.set_text_color(*_T_INK_DIM)
            self.cell(0, 4, "// TENORA  //  ADMIN PANEL", align="L")
            self.cell(0, 4, f"PAGE {self.page_no():02d}", align="R")

    pdf = TenoraReport()
    pdf.set_margins(10, 45, 10)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    kpis = data.get("kpis", {})
    _kpi_labels = {
        "revenue": "CHIFFRE D'AFFAIRES (F)", "orders": "COMMANDES",
        "avg_basket": "PANIER MOYEN (F)", "completion_rate": "TAUX DE COMPLETION (%)",
        "total": "TOTAL COMMANDES", "today": "COMMANDES AUJOURD'HUI",
        "rejection_rate": "TAUX DE REJET (%)", "avg_processing_hours": "TRAITEMENT MOYEN (H)",
        "total_revenue": "CHIFFRE D'AFFAIRES TOTAL (F)", "daily_avg": "CA JOURNALIER MOYEN (F)",
        "total_discounts": "TOTAL REMISES COUPONS (F)",
        "top_seller_name": "MEILLEURE VENTE (NOM)", "top_seller_qty": "MEILLEURE VENTE (QTE)",
        "top_revenue_name": "MEILLEUR REVENU (NOM)", "top_revenue_amount": "MEILLEUR REVENU (F)",
        "active_rate_pct": "TAUX PRODUITS ACTIFS (%)", "zero_sales_count": "PRODUITS SANS VENTE",
        "new_customers": "NOUVEAUX CLIENTS", "returning_customers": "CLIENTS RECURRENTS",
        "retention_rate_pct": "TAUX DE RETENTION (%)",
        "top_customer_email": "MEILLEUR CLIENT (EMAIL)", "top_customer_revenue": "MEILLEUR CLIENT (CA, F)",
        "active_count": "COUPONS ACTIFS", "total_uses": "UTILISATIONS TOTALES",
        "total_discounts_granted": "TOTAL REMISES ACCORDEES (F)",
        "top_coupon_code": "COUPON LE PLUS UTILISE", "top_coupon_uses": "UTILISATIONS DU TOP COUPON",
    }

    SKIP_SUFFIX = ("_prev", "_delta_pct", "_masked")
    pairs = [
        (k, v) for k, v in kpis.items()
        if not any(k.endswith(s) for s in SKIP_SUFFIX) and "best_day" not in k
    ]

    if pairs:
        pdf.set_font("Courier", "", 7)
        pdf.set_text_color(*_T_INK_DIM)
        pdf.cell(0, 4, "// INDICATEURS CLES", ln=1)
        pdf.ln(1)
        col_w = 92; gap = 6; tile_h = 22
        for i in range(0, len(pairs), 2):
            row_pair = pairs[i:i+2]
            y = pdf.get_y()
            for col, (k, v) in enumerate(row_pair):
                x = 10 + col * (col_w + gap)
                pdf.set_fill_color(*_T_CARD)
                pdf.rect(x, y, col_w, tile_h, "F")
                _brackets(pdf, x, y, col_w, tile_h, color=_T_NEON, size=3.0, thick=0.5)
                pdf.set_font("Courier", "", 6)
                pdf.set_text_color(*_T_INK_DIM)
                pdf.set_xy(x + 4, y + 3)
                lbl = _safe(_kpi_labels.get(k, k))
                pdf.cell(col_w - 8, 3, f"// {lbl[:42]}", ln=1)
                val = _safe(v) if v is not None else "-"
                pdf.set_font("Courier", "B", 13)
                pdf.set_text_color(*_T_INK)
                pdf.set_xy(x + 4, y + 9)
                pdf.cell(col_w - 8, 10, val[:34], ln=1)
            pdf.set_y(y + tile_h + 3)
        pdf.ln(2)

    _table_cfg = {
        "overview":  ("chart", ["DATE", "COMMANDES", "CA (F)"], ["date", "orders", "revenue"], [40, 50, 60]),
        "orders":    ("daily_breakdown", ["DATE", "COMPLET.", "ATTENTE", "REJET", "TRAITEM.", "REMB."],
                      ["date", "completed", "pending", "rejected", "processing", "refunded"], [32, 28, 28, 28, 30, 24]),
        "revenue":   ("cumulative", ["DATE", "CA (F)", "CA CUMULE (F)"], ["date", "revenue", "cumulative"], [40, 55, 55]),
        "products":  ("top_products", ["PRODUIT", "CATEGORIE", "VENTES", "CA (F)"],
                      ["name", "category", "sales_count", "revenue"], [80, 50, 25, 35]),
        "customers": ("top_customers", ["EMAIL", "CMDES", "CA (F)", "DERNIERE", "STATUT"],
                      ["__email", "orders_count", "total_revenue", "last_order_at", "status"], [70, 18, 36, 30, 26]),
        "coupons":   ("by_coupon", ["CODE", "TYPE", "VALEUR", "UTIL.", "REMISE (F)", "MAX", "ACTIF"],
                      ["code", "type", "value", "uses", "remise_total", "max_uses", "is_active"], [35, 22, 22, 20, 35, 20, 16]),
    }
    data_key, col_labels, col_keys, col_widths = _table_cfg[section]
    rows = data.get(data_key, [])

    if rows:
        pdf.set_font("Courier", "", 7)
        pdf.set_text_color(*_T_INK_DIM)
        pdf.cell(0, 4, f"// DONNEES  ({len(rows)} LIGNE{'S' if len(rows) > 1 else ''})", ln=1)
        pdf.ln(1)
        x0 = 10; y0 = pdf.get_y(); total_w = sum(col_widths)
        rows_to_render = rows[:80]
        row_h = 5.2; header_h = 6.5
        table_h = header_h + len(rows_to_render) * row_h
        pdf.set_fill_color(*_T_NEON)
        pdf.set_text_color(*_T_NEON_INK)
        pdf.set_font("Courier", "B", 7)
        pdf.set_xy(x0, y0)
        for lbl, w in zip(col_labels, col_widths):
            pdf.cell(w, header_h, f" {_safe(lbl)[:max(3,int(w/2.2))]}", border=0, fill=True)
        pdf.ln()
        pdf.set_font("Courier", "", 7)
        for i, row in enumerate(rows_to_render):
            pdf.set_fill_color(*(_T_CARD if i % 2 == 0 else _T_CARD_ALT))
            pdf.set_text_color(*_T_INK)
            pdf.set_x(x0)
            for key, w in zip(col_keys, col_widths):
                if key == "__email":
                    val = row.get("email") or row.get("email_masked") or "-"
                else:
                    val = row.get(key, "")
                if val is None:              val = "-"
                elif val is True:            val = "Oui"
                elif val is False:           val = "Non"
                elif isinstance(val, float): val = f"{val:.1f}"
                else:                        val = str(val)
                if key == "last_order_at" and val not in ("-", ""):
                    val = val[:10]
                val = _safe(val); max_chars = max(3, int(w / 2.0))
                if key == "__email" and row.get("is_top"):
                    pdf.set_text_color(*_T_NEON); pdf.set_font("Courier", "B", 7)
                pdf.cell(w, row_h, f" {val[:max_chars]}", border=0, fill=True)
                if key == "__email" and row.get("is_top"):
                    pdf.set_text_color(*_T_INK); pdf.set_font("Courier", "", 7)
            pdf.ln()
        _brackets(pdf, x0, y0, total_w, table_h, color=_T_NEON, size=3.0, thick=0.5)
        if len(rows) > 80:
            pdf.ln(1); pdf.set_font("Courier", "I", 7); pdf.set_text_color(*_T_INK_DIM)
            pdf.cell(0, 5, f"  ... {len(rows) - 80} lignes supplementaires - voir export CSV", ln=1)
        pdf.ln(3)

    raw = pdf.output(dest="S")
    return raw.encode("latin-1") if isinstance(raw, str) else bytes(raw)


@stats_router.get("/export/{section}/pdf")
def export_pdf(
    section:   str,
    period:    str           = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db:        Session       = Depends(get_db),
    admin:     User          = Depends(get_admin_user),
):
    if not _HAS_FPDF:
        raise HTTPException(
            status_code=501,
            detail="Export PDF indisponible — ajouter fpdf2 dans requirements.txt et redéployer.",
        )
    if section not in _VALID_SECTIONS:
        raise HTTPException(status_code=400, detail="Section invalide.")

    start, end = _parse_period(period, date_from, date_to)
    stamp = datetime.utcnow().strftime("%Y%m%d")

    fetcher = {
        "overview":  stats_overview,
        "orders":    stats_orders,
        "revenue":   stats_revenue,
        "products":  stats_products,
        "customers": stats_customers,
        "coupons":   stats_coupons,
    }[section]
    data = fetcher(period, date_from, date_to, db, admin)

    pdf_bytes = _make_pdf(section, start, end, data)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=tenora_{section}_{stamp}.pdf"},
    )
