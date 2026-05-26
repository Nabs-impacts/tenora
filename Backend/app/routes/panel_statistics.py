# === app/routes/panel_statistics.py ===
# PRÉREQUIS : ajouter "fpdf2" dans requirements.txt
"""
Routes statistiques avancées pour le panel admin Tenora.

Sections : overview, orders, revenue, products, customers, coupons.
Export   : CSV + PDF (fpdf2 requis — ajouter dans requirements.txt).

v3 :
  - Email du MEILLEUR CLIENT non-censuré (admin uniquement, pour envoi de cadeau).
  - PDF redesign complet « esprit Tenora » : fond sombre, accent néon,
    coins en crochets, eyebrows « // », monospace partout.

v4 :
  - FIX statistiques produits & catégories : le modèle Order n'a PAS de
    relation `items` (un Order = 1 product + quantity). On agrège donc
    directement à partir de `order.product`, `order.quantity` et
    `order.total_price`.
  - Top 20 clients : emails affichés EN CLAIR (admin uniquement) — utile
    pour les évènements / cadeaux.
  - PDF : fond de page gris-sombre pour contraster avec le noir des
    cartes / tableaux. Sous-section « Catalogue complet » retirée de
    l'export PDF Produits (déjà disponible dans l'onglet Produits).
"""
import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_admin_user
from app.models.coupon import Coupon
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.user import User

try:
    from fpdf import FPDF  # type: ignore
    _HAS_FPDF = True
except ImportError:
    _HAS_FPDF = False


def _safe(text) -> str:
    """Remplace les caractères non-latin-1 (em-dash, guillemets…) pour fpdf2 core fonts."""
    return (
        str(text)
        .replace("\u2014", "-")   # em dash  —
        .replace("\u2013", "-")   # en dash  –
        .replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2026", "...")
        .encode("latin-1", errors="replace")
        .decode("latin-1")
    )

stats_router = APIRouter(prefix="/panel/statistics", tags=["Admin Panel — Statistics"])

_VALID_SECTIONS = {"overview", "orders", "revenue", "products", "customers", "coupons"}
_REVENUE_STATUSES = {OrderStatus.completed, OrderStatus.processing}


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _parse_period(period: str, date_from: Optional[str], date_to: Optional[str]) -> tuple[datetime, datetime]:
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


def _mask_email(email: Optional[str]) -> str:
    """Masque l'email pour les listes (table top 20). Le MEILLEUR client lui
    n'est PAS masqué (cf. _full_email) afin de pouvoir lui envoyer un cadeau."""
    if not email or "@" not in email:
        return "—"
    user, domain = email.split("@", 1)
    return f"{user[0]}***@{domain}"


def _full_email(email: Optional[str]) -> str:
    """Email complet, non-censuré. Réservé aux KPIs admin (best client)."""
    if not email or "@" not in email:
        return "—"
    return email


def _orders_in_window(db: Session, start: datetime, end: datetime):
    return db.query(Order).filter(and_(Order.created_at >= start, Order.created_at <= end))


def _to_date_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


# ─── /overview ────────────────────────────────────────────────────────────────

@stats_router.get("/overview")
def stats_overview(
    period:    str = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)
    p_start, p_end = _previous_window(start, end)

    curr = _orders_in_window(db, start, end).all()
    prev = _orders_in_window(db, p_start, p_end).all()

    def _sum_metrics(rows):
        revenue = sum(r.total_price or 0 for r in rows if r.status in _REVENUE_STATUSES)
        completed = sum(1 for r in rows if r.status == OrderStatus.completed)
        return {
            "revenue":  round(revenue),
            "orders":   len(rows),
            "completed": completed,
            "avg_basket": round(revenue / max(1, completed)) if completed else 0,
            "completion_rate": round(completed / len(rows) * 100, 1) if rows else 0,
        }

    c = _sum_metrics(curr)
    p = _sum_metrics(prev)

    by_date: dict = defaultdict(lambda: {"revenue": 0, "orders": 0})
    for r in curr:
        k = _to_date_key(r.created_at)
        by_date[k]["orders"] += 1
        if r.status in _REVENUE_STATUSES:
            by_date[k]["revenue"] += r.total_price or 0
    chart = [
        {"date": d, "revenue": round(v["revenue"]), "orders": v["orders"]}
        for d, v in sorted(by_date.items())
    ]

    status_counts: dict = defaultdict(int)
    for r in curr:
        status_counts[r.status.value if hasattr(r.status, "value") else str(r.status)] += 1
    total_curr = max(1, len(curr))
    status_distribution = [
        {"status": s, "count": n, "pct": round(n / total_curr * 100, 1)}
        for s, n in status_counts.items()
    ]

    by_week: dict = defaultdict(lambda: {"orders": 0, "revenue": 0, "completed": 0})
    for r in curr:
        wk = r.created_at.strftime("%Y-W%V")
        by_week[wk]["orders"] += 1
        if r.status == OrderStatus.completed:
            by_week[wk]["completed"] += 1
        if r.status in _REVENUE_STATUSES:
            by_week[wk]["revenue"] += r.total_price or 0
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

    return {
        "kpis": {
            "revenue":                    c["revenue"],
            "revenue_prev":               p["revenue"],
            "revenue_delta_pct":          _delta_pct(c["revenue"], p["revenue"]),
            "orders":                     c["orders"],
            "orders_prev":                p["orders"],
            "orders_delta_pct":           _delta_pct(c["orders"], p["orders"]),
            "avg_basket":                 c["avg_basket"],
            "avg_basket_prev":            p["avg_basket"],
            "avg_basket_delta_pct":       _delta_pct(c["avg_basket"], p["avg_basket"]),
            "completion_rate":            c["completion_rate"],
            "completion_rate_prev":       p["completion_rate"],
            "completion_rate_delta_pct":  _delta_pct(c["completion_rate"], p["completion_rate"]),
        },
        "chart": chart,
        "status_distribution": status_distribution,
        "weekly_summary": weekly_summary,
    }


# ─── /orders ──────────────────────────────────────────────────────────────────

@stats_router.get("/orders")
def stats_orders(
    period:    str = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)
    rows = _orders_in_window(db, start, end).all()

    today = datetime.utcnow().date()
    today_count = sum(1 for r in rows if r.created_at.date() == today)
    total = len(rows)
    rejected = sum(1 for r in rows if r.status == OrderStatus.rejected)
    rejection_rate = round(rejected / total * 100, 1) if total else 0

    processed = [r for r in rows if r.status in (OrderStatus.completed, OrderStatus.refunded)
                 and getattr(r, "processed_at", None)]
    avg_h = None
    if processed:
        diffs = [
            (r.processed_at - r.created_at).total_seconds() / 3600
            for r in processed
        ]
        avg_h = round(sum(diffs) / len(diffs), 1)

    by_day: dict = defaultdict(lambda: defaultdict(int))
    by_hour: dict = defaultdict(int)
    for r in rows:
        k = _to_date_key(r.created_at)
        st = r.status.value if hasattr(r.status, "value") else str(r.status)
        by_day[k][st] += 1
        by_hour[r.created_at.hour] += 1

    daily_breakdown = []
    for d in sorted(by_day.keys()):
        row = {"date": d}
        for s in ("completed", "pending", "rejected", "processing", "refunded"):
            row[s] = by_day[d].get(s, 0)
        daily_breakdown.append(row)

    hourly_distribution = [{"hour": h, "count": by_hour.get(h, 0)} for h in range(24)]

    processing = sum(1 for r in rows if r.status == OrderStatus.processing)
    completed  = sum(1 for r in rows if r.status == OrderStatus.completed)
    funnel = {
        "total":           total,
        "processing":      processing,
        "processing_pct":  round(processing / max(1, total) * 100, 1),
        "completed":       completed,
        "completion_pct":  round(completed / max(1, total) * 100, 1),
    }

    return {
        "kpis": {
            "total":                total,
            "today":                today_count,
            "rejection_rate":       rejection_rate,
            "avg_processing_hours": avg_h,
        },
        "daily_breakdown":     daily_breakdown,
        "hourly_distribution": hourly_distribution,
        "funnel":              funnel,
    }


# ─── /revenue ─────────────────────────────────────────────────────────────────

@stats_router.get("/revenue")
def stats_revenue(
    period:    str = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)
    rows = _orders_in_window(db, start, end).all()

    paying = [r for r in rows if r.status in _REVENUE_STATUSES]
    total_revenue = round(sum(r.total_price or 0 for r in paying))
    n_days = max(1, (end - start).days)
    daily_avg = round(total_revenue / n_days)

    by_day: dict = defaultdict(float)
    for r in paying:
        by_day[_to_date_key(r.created_at)] += r.total_price or 0

    best_day = {"date": None, "revenue": 0}
    cumulative = []
    cum_total = 0.0
    for d in sorted(by_day.keys()):
        v = by_day[d]
        cum_total += v
        cumulative.append({"date": d, "revenue": round(v), "cumulative": round(cum_total)})
        if v > best_day["revenue"]:
            best_day = {"date": d, "revenue": round(v)}

    by_method: dict = defaultdict(lambda: {"revenue": 0, "orders": 0})
    for r in paying:
        m = getattr(r, "payment_method", None) or "—"
        by_method[m]["revenue"] += r.total_price or 0
        by_method[m]["orders"]  += 1
    by_payment_method = [
        {"method": m, "revenue": round(v["revenue"]), "orders": v["orders"]}
        for m, v in by_method.items()
    ]

    by_cat: dict = defaultdict(lambda: {"revenue": 0, "orders": 0})
    for r in paying:
        # Le modèle Order est mono-produit (product_id direct), pas de table items.
        prod = getattr(r, "product", None)
        cat  = getattr(prod, "category", None) if prod else None
        cat_name = getattr(cat, "name", None) or "—"
        by_cat[cat_name]["revenue"] += r.total_price or 0
        by_cat[cat_name]["orders"]  += 1
    total_cat = sum(v["revenue"] for v in by_cat.values()) or 1
    by_category = [
        {
            "category":   c,
            "revenue":    round(v["revenue"]),
            "orders":     v["orders"],
            "avg_basket": round(v["revenue"] / max(1, v["orders"])),
            "share_pct":  round(v["revenue"] / total_cat * 100, 1),
        }
        for c, v in sorted(by_cat.items(), key=lambda x: x[1]["revenue"], reverse=True)
    ]

    total_discounts = round(sum(getattr(r, "discount_amount", 0) or 0 for r in paying))

    scatter = [
        {"hour": r.created_at.hour, "amount": round(r.total_price or 0),
         "status": r.status.value if hasattr(r.status, "value") else str(r.status)}
        for r in paying
    ]

    return {
        "kpis": {
            "total_revenue":     total_revenue,
            "daily_avg":         daily_avg,
            "best_day":          best_day,
            "total_discounts":   total_discounts,
        },
        "cumulative":          cumulative,
        "by_payment_method":   by_payment_method,
        "by_category":         by_category,
        "scatter":             scatter,
    }


# ─── /products ────────────────────────────────────────────────────────────────

@stats_router.get("/products")
def stats_products(
    period:    str = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)
    rows = _orders_in_window(db, start, end).all()
    paying = [r for r in rows if r.status in _REVENUE_STATUSES]

    by_prod: dict = defaultdict(lambda: {"sales": 0, "revenue": 0, "name": "", "category": "—"})
    for r in paying:
        # Order = mono-produit ; on agrège par product_id directement.
        p = getattr(r, "product", None)
        pid = getattr(p, "id", None) if p is not None else r.product_id
        if pid is None:
            continue
        qty   = r.quantity or 0
        gross = r.total_price or 0
        d = by_prod[pid]
        d["sales"]   += qty
        d["revenue"] += gross
        if p is not None:
            d["name"]     = getattr(p, "name", "—") or "—"
            cat = getattr(p, "category", None)
            d["category"] = getattr(cat, "name", "—") if cat else "—"

    all_products = db.query(Product).all()
    active = sum(1 for p in all_products if getattr(p, "is_active", True))
    active_rate_pct = round(active / max(1, len(all_products)) * 100, 1)

    zero_sales = [p for p in all_products if p.id not in by_prod]

    top_seller   = max(by_prod.values(), key=lambda v: v["sales"], default=None)
    top_revenue  = max(by_prod.values(), key=lambda v: v["revenue"], default=None)

    top_products = [
        {
            "name":        v["name"],
            "category":    v["category"],
            "sales_count": v["sales"],
            "revenue":     round(v["revenue"]),
        }
        for v in sorted(by_prod.values(), key=lambda x: x["revenue"], reverse=True)[:10]
    ]

    cat_map: dict = defaultdict(float)
    for v in by_prod.values():
        cat_map[v["category"]] += v["revenue"]
    treemap = [
        {"name": c, "value": round(rev), "children": [{"name": c, "value": round(rev)}]}
        for c, rev in cat_map.items()
    ]

    table = []
    for p in all_products:
        d = by_prod.get(p.id, {"sales": 0, "revenue": 0})
        table.append({
            "id":         p.id,
            "name":       p.name,
            "category":   getattr(getattr(p, "category", None), "name", "—"),
            "sales":      d["sales"],
            "revenue":    round(d["revenue"]),
            "avg_basket": round(d["revenue"] / max(1, d["sales"])) if d["sales"] else 0,
            "stock":      getattr(p, "stock", None),
            "is_active":  getattr(p, "is_active", True),
        })

    return {
        "kpis": {
            "top_seller_name":     top_seller["name"]   if top_seller   else None,
            "top_seller_qty":      top_seller["sales"]  if top_seller   else 0,
            "top_revenue_name":    top_revenue["name"]  if top_revenue  else None,
            "top_revenue_amount":  round(top_revenue["revenue"]) if top_revenue else 0,
            "active_rate_pct":     active_rate_pct,
            "zero_sales_count":    len(zero_sales),
        },
        "top_products": top_products,
        "treemap":      treemap,
        "table":        table,
    }


# ─── /customers ───────────────────────────────────────────────────────────────

@stats_router.get("/customers")
def stats_customers(
    period:    str = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)

    new_users_q = db.query(User).filter(and_(User.created_at >= start, User.created_at <= end)).all()
    by_day: dict = defaultdict(int)
    for u in new_users_q:
        by_day[_to_date_key(u.created_at)] += 1

    rows = _orders_in_window(db, start, end).all()
    by_user: dict = defaultdict(lambda: {"orders": 0, "revenue": 0, "last": None})
    for r in rows:
        bu = by_user[r.user_id]
        bu["orders"]  += 1
        bu["revenue"] += r.total_price or 0
        if not bu["last"] or r.created_at > bu["last"]:
            bu["last"] = r.created_at

    returning = sum(1 for v in by_user.values() if v["orders"] >= 2)
    retention = round(returning / len(by_user) * 100, 1) if by_user else 0

    user_ids = list(by_user.keys())
    users_map = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    # Liste triée par CA décroissant
    sorted_users = sorted(by_user.items(), key=lambda x: x[1]["revenue"], reverse=True)

    top_customers = []
    for idx, (uid, v) in enumerate(sorted_users[:20]):
        u = users_map.get(uid)
        status = "vip" if v["orders"] >= 5 else ("récurrent" if v["orders"] >= 2 else "nouveau")
        email_raw = u.email if u else None
        # ─── Liste réservée à l'admin : on affiche TOUS les emails EN CLAIR
        # (utile pour évènements / envoi de cadeaux). On garde `is_top` pour
        # mettre en évidence le client n°1.
        is_top = (idx == 0)
        full   = _full_email(email_raw)
        top_customers.append({
            "email":         full,
            "email_masked":  full,  # rétro-compat front : même valeur (non masquée)
            "is_top":        is_top,
            "orders_count":  v["orders"],
            "total_revenue": round(v["revenue"]),
            "last_order_at": v["last"].isoformat() if v["last"] else None,
            "status":        status,
        })

    buckets = {"1": 0, "2-3": 0, "4-5": 0, "6+": 0}
    for v in by_user.values():
        n = v["orders"]
        if n == 1:   buckets["1"]   += 1
        elif n <= 3: buckets["2-3"] += 1
        elif n <= 5: buckets["4-5"] += 1
        else:        buckets["6+"]  += 1

    top = top_customers[0] if top_customers else None
    return {
        "kpis": {
            "new_customers":             len(new_users_q),
            "returning_customers":       returning,
            "retention_rate_pct":        retention,
            # Nouveau : email complet (NON CENSURÉ) pour le meilleur client
            "top_customer_email":        top["email"]  if top else "—",
            # Rétro-compatibilité : on garde la clé masquée si jamais utilisée ailleurs
            "top_customer_email_masked": top["email_masked"]  if top else "—",
            "top_customer_revenue":      top["total_revenue"] if top else 0,
        },
        "new_per_day": [{"date": d, "new_users": c} for d, c in sorted(by_day.items())],
        "orders_distribution": [
            {"bucket": "1",   "label": "1 commande",    "customer_count": buckets["1"]},
            {"bucket": "2-3", "label": "2-3 commandes", "customer_count": buckets["2-3"]},
            {"bucket": "4-5", "label": "4-5 commandes", "customer_count": buckets["4-5"]},
            {"bucket": "6+",  "label": "6+ commandes",  "customer_count": buckets["6+"]},
        ],
        "top_customers": top_customers,
    }


# ─── /coupons ─────────────────────────────────────────────────────────────────

@stats_router.get("/coupons")
def stats_coupons(
    period:    str = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    start, end = _parse_period(period, date_from, date_to)
    coupons = db.query(Coupon).all()
    rows = _orders_in_window(db, start, end).all()

    active_count = sum(1 for c in coupons if getattr(c, "is_active", True))

    by_code: dict = defaultdict(lambda: {"uses": 0, "remise_total": 0})
    by_day:  dict = defaultdict(float)
    total_discounts_granted = 0
    total_uses = 0

    for r in rows:
        code = getattr(r, "coupon_code", None)
        disc = getattr(r, "discount_amount", 0) or 0
        if not code:
            continue
        by_code[code]["uses"]         += 1
        by_code[code]["remise_total"] += disc
        by_day[_to_date_key(r.created_at)] += disc
        total_discounts_granted += disc
        total_uses += 1

    top_code = max(by_code.items(), key=lambda x: x[1]["uses"], default=(None, {"uses": 0}))

    by_coupon_list = []
    for c in coupons:
        st = by_code.get(c.code, {"uses": 0, "remise_total": 0})
        by_coupon_list.append({
            "code":          c.code,
            "type":          getattr(c, "type", "amount"),
            "value":         getattr(c, "value", 0),
            "uses":          st["uses"],
            "max_uses":      getattr(c, "max_uses", None),
            "remise_total":  round(st["remise_total"]),
            "is_active":     getattr(c, "is_active", True),
            "expires_at":    c.expires_at.isoformat() if getattr(c, "expires_at", None) else None,
        })

    daily_discounts = [
        {"date": d, "discount_amount": round(v)}
        for d, v in sorted(by_day.items())
    ]

    return {
        "kpis": {
            "active_count":             active_count,
            "total_uses":               total_uses,
            "total_discounts_granted":  round(total_discounts_granted),
            "top_coupon_code":          top_code[0] or "—",
            "top_coupon_uses":          top_code[1]["uses"],
        },
        "by_coupon":       by_coupon_list,
        "daily_discounts": daily_discounts,
    }


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
    period:    str = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    if section not in _VALID_SECTIONS:
        raise HTTPException(status_code=400, detail="Section invalide.")

    stamp = datetime.utcnow().strftime("%Y%m%d")
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
        # CSV admin : on exporte l'email tel que servi (1er = complet, autres masqués)
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

# Palette Tenora (RGB)
_T_PAGE      = (38, 38, 38)       # fond de page : gris-sombre (contraste)
_T_BG        = (10, 10, 10)       # noir profond : bandeaux header/footer
_T_INK       = (245, 245, 245)    # texte sur sombre
_T_INK_DIM   = (170, 170, 170)
_T_NEON      = (212, 255, 61)     # accent lime
_T_NEON_INK  = (10, 10, 10)       # texte sur néon
_T_LINE      = (65, 65, 65)
_T_CARD      = (12, 12, 12)       # carte / ligne paire (noir)
_T_CARD_ALT  = (22, 22, 22)       # ligne impaire (noir un peu plus clair)
_T_SUCCESS   = (74, 222, 128)


def _brackets(pdf, x, y, w, h, color=_T_NEON, size=3.0, thick=0.6):
    """Dessine 4 coins en crochets façon Tenora autour d'une zone."""
    pdf.set_draw_color(*color)
    pdf.set_line_width(thick)
    # haut-gauche
    pdf.line(x, y, x + size, y)
    pdf.line(x, y, x, y + size)
    # haut-droit
    pdf.line(x + w, y, x + w - size, y)
    pdf.line(x + w, y, x + w, y + size)
    # bas-gauche
    pdf.line(x, y + h, x + size, y + h)
    pdf.line(x, y + h, x, y + h - size)
    # bas-droit
    pdf.line(x + w, y + h, x + w - size, y + h)
    pdf.line(x + w, y + h, x + w, y + h - size)


def _make_pdf(section: str, start: datetime, end: datetime, data: dict) -> bytes:
    """Génère un PDF dans l'esprit Tenora : sombre, accent néon, monospace."""

    SECTION_LABELS = {
        "overview": "Vue Globale", "orders": "Commandes", "revenue": "Revenus",
        "products": "Produits", "customers": "Clients", "coupons": "Coupons",
    }
    section_label = SECTION_LABELS.get(section, section.upper())

    class TenoraReport(FPDF):
        def header(self):
            # Fond de page : gris-sombre (contraste avec les cartes/bandeaux noirs)
            self.set_fill_color(*_T_PAGE)
            self.rect(0, 0, 210, 297, "F")

            # Bandeau noir Tenora
            self.set_fill_color(*_T_BG)
            self.rect(0, 0, 210, 22, "F")

            # Bande néon sous le bandeau
            self.set_fill_color(*_T_NEON)
            self.rect(0, 22, 210, 1.2, "F")

            # Logo carré néon « ⚡ » → on simule par un carré + T
            self.set_fill_color(*_T_NEON)
            self.rect(10, 5, 12, 12, "F")
            self.set_font("Courier", "B", 11)
            self.set_text_color(*_T_NEON_INK)
            self.set_xy(10, 5)
            self.cell(12, 12, "T", align="C")

            # Titre TENORA
            self.set_font("Courier", "B", 14)
            self.set_text_color(*_T_INK)
            self.set_xy(26, 6.5)
            self.cell(0, 5, "TENORA", ln=1)
            self.set_font("Courier", "", 7)
            self.set_text_color(*_T_INK_DIM)
            self.set_xy(26, 12)
            self.cell(0, 4, "// ADMIN.PANEL  //  STATISTICS REPORT", ln=1)

            # Coin droit : statut système
            self.set_font("Courier", "", 7)
            self.set_text_color(*_T_SUCCESS)
            self.set_xy(160, 7)
            self.cell(40, 4, "* SYS // NOMINAL", align="R", ln=1)
            self.set_text_color(*_T_INK_DIM)
            self.set_xy(160, 12)
            self.cell(40, 4, datetime.utcnow().strftime("%d/%m/%Y %H:%M UTC"), align="R", ln=1)

            # Sous-bandeau section
            self.set_fill_color(*_T_CARD)
            self.rect(0, 23.2, 210, 14, "F")
            # eyebrow
            self.set_font("Courier", "", 7)
            self.set_text_color(*_T_INK_DIM)
            self.set_xy(10, 25)
            self.cell(0, 4, "// SECTION", ln=1)
            # titre section
            self.set_font("Courier", "B", 13)
            self.set_text_color(*_T_INK)
            self.set_xy(10, 29)
            self.cell(0, 6, _safe(section_label).upper(), ln=1)

            # période (droite)
            self.set_font("Courier", "", 7)
            self.set_text_color(*_T_INK_DIM)
            self.set_xy(120, 25)
            self.cell(80, 4, "// PERIODE", align="R", ln=1)
            self.set_font("Courier", "B", 9)
            self.set_text_color(*_T_NEON)
            self.set_xy(120, 30)
            self.cell(80, 5, f"{start.strftime('%d/%m/%Y')}  ->  {end.strftime('%d/%m/%Y')}", align="R", ln=1)

            self.set_y(43)
            # Reset couleurs pour la suite
            self.set_text_color(20, 20, 20)
            self.set_draw_color(*_T_LINE)

        def footer(self):
            # Barre fine néon
            self.set_fill_color(*_T_NEON)
            self.rect(0, 285, 210, 0.6, "F")
            # Bandeau noir
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

    # ── KPIs en grille de tuiles sombres avec coins en crochets ───────────────
    kpis = data.get("kpis", {})
    _kpi_labels = {
        # overview
        "revenue":                   "CHIFFRE D'AFFAIRES (F)",
        "orders":                    "COMMANDES",
        "avg_basket":                "PANIER MOYEN (F)",
        "completion_rate":           "TAUX DE COMPLETION (%)",
        # orders
        "total":                     "TOTAL COMMANDES",
        "today":                     "COMMANDES AUJOURD'HUI",
        "rejection_rate":            "TAUX DE REJET (%)",
        "avg_processing_hours":      "TRAITEMENT MOYEN (H)",
        # revenue
        "total_revenue":             "CHIFFRE D'AFFAIRES TOTAL (F)",
        "daily_avg":                 "CA JOURNALIER MOYEN (F)",
        "total_discounts":           "TOTAL REMISES COUPONS (F)",
        # products
        "top_seller_name":           "MEILLEURE VENTE (NOM)",
        "top_seller_qty":            "MEILLEURE VENTE (QTE)",
        "top_revenue_name":          "MEILLEUR REVENU (NOM)",
        "top_revenue_amount":        "MEILLEUR REVENU (F)",
        "active_rate_pct":           "TAUX PRODUITS ACTIFS (%)",
        "zero_sales_count":          "PRODUITS SANS VENTE",
        # customers
        "new_customers":             "NOUVEAUX CLIENTS",
        "returning_customers":       "CLIENTS RECURRENTS",
        "retention_rate_pct":        "TAUX DE RETENTION (%)",
        "top_customer_email":        "MEILLEUR CLIENT (EMAIL)",
        "top_customer_revenue":      "MEILLEUR CLIENT (CA, F)",
        # coupons
        "active_count":              "COUPONS ACTIFS",
        "total_uses":                "UTILISATIONS TOTALES",
        "total_discounts_granted":   "TOTAL REMISES ACCORDEES (F)",
        "top_coupon_code":           "COUPON LE PLUS UTILISE",
        "top_coupon_uses":           "UTILISATIONS DU TOP COUPON",
    }

    # Filtrer : on garde les KPIs « utiles » (pas les _prev/_delta/_masked/best_day)
    SKIP_SUFFIX = ("_prev", "_delta_pct", "_masked")
    pairs = [
        (k, v) for k, v in kpis.items()
        if not any(k.endswith(s) for s in SKIP_SUFFIX) and "best_day" not in k
    ]

    if pairs:
        # eyebrow
        pdf.set_font("Courier", "", 7)
        pdf.set_text_color(*_T_INK_DIM)
        pdf.cell(0, 4, "// INDICATEURS CLES", ln=1)
        pdf.ln(1)

        # Grille 2 colonnes
        col_w   = 92
        gap     = 6
        tile_h  = 22
        y0      = pdf.get_y()

        for i in range(0, len(pairs), 2):
            row_pair = pairs[i:i+2]
            y = pdf.get_y()
            for col, (k, v) in enumerate(row_pair):
                x = 10 + col * (col_w + gap)
                # fond carte sombre
                pdf.set_fill_color(*_T_CARD)
                pdf.rect(x, y, col_w, tile_h, "F")
                # coins néon
                _brackets(pdf, x, y, col_w, tile_h, color=_T_NEON, size=3.0, thick=0.5)
                # eyebrow label
                pdf.set_font("Courier", "", 6)
                pdf.set_text_color(*_T_INK_DIM)
                pdf.set_xy(x + 4, y + 3)
                lbl = _safe(_kpi_labels.get(k, k))
                pdf.cell(col_w - 8, 3, f"// {lbl[:42]}", ln=1)
                # valeur
                val = _safe(v) if v is not None else "-"
                pdf.set_font("Courier", "B", 13)
                pdf.set_text_color(*_T_INK)
                pdf.set_xy(x + 4, y + 9)
                pdf.cell(col_w - 8, 10, val[:34], ln=1)
            pdf.set_y(y + tile_h + 3)

        pdf.ln(2)

    # ── Tableau de données ─────────────────────────────────────────────────────
    _table_cfg = {
        "overview":  (
            "chart",
            ["DATE",       "COMMANDES", "CA (F)"],
            ["date",       "orders",    "revenue"],
            [40, 50, 60],
        ),
        "orders": (
            "daily_breakdown",
            ["DATE",  "COMPLET.", "ATTENTE", "REJET", "TRAITEM.", "REMB."],
            ["date",  "completed","pending", "rejected","processing","refunded"],
            [32, 28, 28, 28, 30, 24],
        ),
        "revenue": (
            "cumulative",
            ["DATE",  "CA (F)",  "CA CUMULE (F)"],
            ["date",  "revenue", "cumulative"],
            [40, 55, 55],
        ),
        "products": (
            # Catalogue complet retiré du PDF (déjà dispo dans l'onglet Produits).
            # On expose uniquement le TOP 10 par CA.
            "top_products",
            ["PRODUIT",  "CATEGORIE", "VENTES",      "CA (F)"],
            ["name",     "category",  "sales_count", "revenue"],
            [80, 50, 25, 35],
        ),
        "customers": (
            "top_customers",
            ["EMAIL",   "CMDES",       "CA (F)",        "DERNIERE",      "STATUT"],
            ["__email", "orders_count","total_revenue", "last_order_at", "status"],
            [70, 18, 36, 30, 26],
        ),
        "coupons": (
            "by_coupon",
            ["CODE",  "TYPE",  "VALEUR", "UTIL.", "REMISE (F)", "MAX",  "ACTIF"],
            ["code",  "type",  "value",  "uses",  "remise_total","max_uses","is_active"],
            [35, 22, 22, 20, 35, 20, 16],
        ),
    }
    data_key, col_labels, col_keys, col_widths = _table_cfg[section]
    rows = data.get(data_key, [])

    if rows:
        pdf.set_font("Courier", "", 7)
        pdf.set_text_color(*_T_INK_DIM)
        pdf.cell(0, 4, f"// DONNEES  ({len(rows)} LIGNE{'S' if len(rows) > 1 else ''})", ln=1)
        pdf.ln(1)

        # Cadre + crochets autour du tableau
        x0 = 10
        y0 = pdf.get_y()
        total_w = sum(col_widths)
        # placeholder pour calculer la hauteur — on dessine d'abord les rangées,
        # puis on revient encadrer.
        rows_to_render = rows[:80]
        row_h = 5.2
        header_h = 6.5
        table_h = header_h + len(rows_to_render) * row_h

        # En-tête : fond néon, texte noir
        pdf.set_fill_color(*_T_NEON)
        pdf.set_text_color(*_T_NEON_INK)
        pdf.set_font("Courier", "B", 7)
        pdf.set_xy(x0, y0)
        for lbl, w in zip(col_labels, col_widths):
            max_chars = max(3, int(w / 2.2))
            pdf.cell(w, header_h, f" {_safe(lbl)[:max_chars]}", border=0, fill=True)
        pdf.ln()

        # Lignes
        pdf.set_font("Courier", "", 7)
        for i, row in enumerate(rows_to_render):
            if i % 2 == 0:
                pdf.set_fill_color(*_T_CARD)
            else:
                pdf.set_fill_color(*_T_CARD_ALT)
            pdf.set_text_color(*_T_INK)

            pdf.set_x(x0)
            for key, w in zip(col_keys, col_widths):
                # Spécial customers : afficher email complet pour le top, sinon masqué
                if key == "__email":
                    val = row.get("email") or row.get("email_masked") or "-"
                else:
                    val = row.get(key, "")
                if val is None:               val = "-"
                elif val is True:             val = "Oui"
                elif val is False:            val = "Non"
                elif isinstance(val, float):  val = f"{val:.1f}"
                else:                         val = str(val)
                if key == "last_order_at" and val not in ("-", ""):
                    val = val[:10]
                val = _safe(val)
                max_chars = max(3, int(w / 2.0))

                # Mettre le meilleur client en évidence (néon sur fond sombre)
                if key == "__email" and row.get("is_top"):
                    pdf.set_text_color(*_T_NEON)
                    pdf.set_font("Courier", "B", 7)
                pdf.cell(w, row_h, f" {val[:max_chars]}", border=0, fill=True)
                if key == "__email" and row.get("is_top"):
                    pdf.set_text_color(*_T_INK)
                    pdf.set_font("Courier", "", 7)
            pdf.ln()

        # Crochets autour du tableau
        _brackets(pdf, x0, y0, total_w, table_h, color=_T_NEON, size=3.0, thick=0.5)

        if len(rows) > 80:
            pdf.ln(1)
            pdf.set_font("Courier", "I", 7)
            pdf.set_text_color(*_T_INK_DIM)
            pdf.cell(0, 5, f"  ... {len(rows) - 80} lignes supplementaires - voir export CSV", ln=1)

        pdf.ln(3)

    raw = pdf.output(dest="S")
    return raw.encode("latin-1") if isinstance(raw, str) else bytes(raw)


@stats_router.get("/export/{section}/pdf")
def export_pdf(
    section:   str,
    period:    str = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    if not _HAS_FPDF:
        raise HTTPException(
            status_code=501,
            detail="Export PDF indisponible - ajouter fpdf2 dans requirements.txt et redeployer.",
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
