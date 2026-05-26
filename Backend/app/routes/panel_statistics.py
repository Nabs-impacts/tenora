# === app/routes/panel_statistics.py — NOUVEAU MODULE ===
# À placer dans app/routes/panel_statistics.py
# Et à inclure dans app/main.py :   app.include_router(stats_router)
#
# Toutes les routes sont protégées par get_admin_user et exposées sous
# le préfixe /panel/statistics/* — cohérent avec l'API client.
"""
Routes statistiques avancées pour le panel admin Tenora.

Sections : overview, orders, revenue, products, customers, coupons.
Export   : CSV (toujours) + PDF (si fpdf2 installé).
"""
import csv
import io
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_admin_user
from app.models.coupon import Coupon
from app.models.order import Order, OrderStatus
from app.models.product import Category, Product
from app.models.user import User

# fpdf2 (optionnel) pour les exports PDF
try:
    from fpdf import FPDF  # type: ignore
    _HAS_FPDF = True
except ImportError:
    _HAS_FPDF = False


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
    if not email or "@" not in email:
        return "—"
    user, domain = email.split("@", 1)
    return f"{user[0]}***@{domain}"


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
    prev_start, prev_end = _previous_window(start, end)

    def aggregate(s: datetime, e: datetime) -> dict:
        rows = _orders_in_window(db, s, e).all()
        total_orders   = len(rows)
        revenue_rows   = [r for r in rows if r.status in _REVENUE_STATUSES]
        total_revenue  = sum(r.total_price or 0 for r in revenue_rows)
        completed      = sum(1 for r in rows if r.status == OrderStatus.completed)
        avg_basket     = (total_revenue / len(revenue_rows)) if revenue_rows else 0
        completion     = (completed / total_orders * 100) if total_orders else 0
        return {
            "orders":          total_orders,
            "revenue":         round(total_revenue),
            "avg_basket":      round(avg_basket),
            "completion_rate": round(completion, 1),
        }

    curr = aggregate(start, end)
    prev = aggregate(prev_start, prev_end)

    # chart quotidien
    daily = defaultdict(lambda: {"revenue": 0, "orders": 0})
    for o in _orders_in_window(db, start, end).all():
        key = _to_date_key(o.created_at)
        daily[key]["orders"] += 1
        if o.status in _REVENUE_STATUSES:
            daily[key]["revenue"] += int(o.total_price or 0)
    chart = [{"date": d, **v} for d, v in sorted(daily.items())]

    # status distribution
    status_counts = defaultdict(int)
    for o in _orders_in_window(db, start, end).all():
        status_counts[o.status.value] += 1
    total = sum(status_counts.values()) or 1
    status_distribution = [
        {"status": s, "count": c, "pct": round(c / total * 100, 1)}
        for s, c in status_counts.items()
    ]

    # weekly summary
    weekly = defaultdict(lambda: {"orders": 0, "revenue": 0, "completed": 0})
    for o in _orders_in_window(db, start, end).all():
        iso = o.created_at.isocalendar()
        key = f"{iso[0]}-W{iso[1]:02d}"
        weekly[key]["orders"] += 1
        if o.status == OrderStatus.completed:
            weekly[key]["completed"] += 1
        if o.status in _REVENUE_STATUSES:
            weekly[key]["revenue"] += int(o.total_price or 0)
    weekly_summary = []
    for w, v in sorted(weekly.items()):
        weekly_summary.append({
            "week":            w,
            "orders":          v["orders"],
            "revenue":         v["revenue"],
            "avg_basket":      round(v["revenue"] / v["orders"]) if v["orders"] else 0,
            "completion_rate": round(v["completed"] / v["orders"] * 100, 1) if v["orders"] else 0,
        })

    return {
        "kpis": {
            "revenue":                  curr["revenue"],
            "revenue_prev":             prev["revenue"],
            "revenue_delta_pct":        _delta_pct(curr["revenue"], prev["revenue"]),
            "orders":                   curr["orders"],
            "orders_prev":              prev["orders"],
            "orders_delta_pct":         _delta_pct(curr["orders"], prev["orders"]),
            "avg_basket":               curr["avg_basket"],
            "avg_basket_prev":          prev["avg_basket"],
            "avg_basket_delta_pct":     _delta_pct(curr["avg_basket"], prev["avg_basket"]),
            "completion_rate":          curr["completion_rate"],
            "completion_rate_prev":     prev["completion_rate"],
            "completion_rate_delta_pct": round(curr["completion_rate"] - prev["completion_rate"], 1),
        },
        "chart":               chart,
        "status_distribution": status_distribution,
        "weekly_summary":      weekly_summary,
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
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    rows = _orders_in_window(db, start, end).all()
    total = len(rows)
    today = db.query(Order).filter(Order.created_at >= today_start).count()
    rejected = sum(1 for r in rows if r.status == OrderStatus.rejected)
    rejection_rate = round(rejected / total * 100, 1) if total else 0

    completed_rows = [r for r in rows if r.status == OrderStatus.completed and r.updated_at and r.created_at]
    if completed_rows:
        diffs = [(r.updated_at - r.created_at).total_seconds() / 3600 for r in completed_rows]
        avg_processing = round(sum(diffs) / len(diffs), 2)
    else:
        avg_processing = None

    daily = defaultdict(lambda: {"completed": 0, "pending": 0, "rejected": 0, "processing": 0, "refunded": 0})
    for o in rows:
        daily[_to_date_key(o.created_at)][o.status.value] += 1
    daily_breakdown = [{"date": d, **v} for d, v in sorted(daily.items())]

    hourly = {h: 0 for h in range(24)}
    weekday = {i: 0 for i in range(7)}
    weekday_labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
    for o in rows:
        hourly[o.created_at.hour] += 1
        weekday[o.created_at.weekday()] += 1

    processing = sum(1 for r in rows if r.status == OrderStatus.processing)
    completed  = sum(1 for r in rows if r.status == OrderStatus.completed)

    return {
        "kpis": {
            "total":               total,
            "today":               today,
            "rejection_rate":      rejection_rate,
            "avg_processing_hours": avg_processing,
        },
        "daily_breakdown":     daily_breakdown,
        "hourly_distribution": [{"hour": h, "count": c} for h, c in hourly.items()],
        "weekday_distribution":[{"weekday": w, "label": weekday_labels[w], "count": c} for w, c in weekday.items()],
        "funnel": {
            "total":           total,
            "processing":      processing,
            "completed":       completed,
            "processing_pct":  round(processing / total * 100, 1) if total else 0,
            "completion_pct":  round(completed  / total * 100, 1) if total else 0,
        },
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
    rev_rows = [r for r in rows if r.status in _REVENUE_STATUSES]

    total_revenue   = sum(r.total_price or 0 for r in rev_rows)
    total_discounts = sum(r.discount_amount or 0 for r in rev_rows)

    days = max(1, (end - start).days)
    daily_avg = round(total_revenue / days)

    by_day = defaultdict(float)
    for r in rev_rows:
        by_day[_to_date_key(r.created_at)] += r.total_price or 0
    cumulative = []
    running = 0
    best_day = {"date": None, "revenue": 0}
    for d, v in sorted(by_day.items()):
        running += v
        cumulative.append({"date": d, "revenue": round(v), "cumulative": round(running)})
        if v > best_day["revenue"]:
            best_day = {"date": d, "revenue": round(v)}

    by_method = defaultdict(lambda: {"revenue": 0, "orders": 0})
    for r in rev_rows:
        m = r.payment_method or "—"
        by_method[m]["revenue"] += r.total_price or 0
        by_method[m]["orders"]  += 1
    by_payment_method = [{"method": m, "revenue": round(v["revenue"]), "orders": v["orders"]} for m, v in by_method.items()]

    by_cat = defaultdict(lambda: {"revenue": 0, "orders": 0})
    for r in rev_rows:
        cat = r.product.category.name if r.product and r.product.category else "—"
        by_cat[cat]["revenue"] += r.total_price or 0
        by_cat[cat]["orders"]  += 1
    by_category = []
    for cat, v in by_cat.items():
        by_category.append({
            "category":   cat,
            "revenue":    round(v["revenue"]),
            "orders":     v["orders"],
            "avg_basket": round(v["revenue"] / v["orders"]) if v["orders"] else 0,
            "share_pct":  round(v["revenue"] / total_revenue * 100, 1) if total_revenue else 0,
        })
    by_category.sort(key=lambda x: x["revenue"], reverse=True)

    scatter = [{"hour": r.created_at.hour, "amount": round(r.total_price or 0), "status": r.status.value} for r in rev_rows]

    return {
        "kpis": {
            "total_revenue":   round(total_revenue),
            "daily_avg":       daily_avg,
            "best_day":        best_day,
            "total_discounts": round(total_discounts),
        },
        "cumulative":         cumulative,
        "by_payment_method":  by_payment_method,
        "by_category":        by_category,
        "scatter":            scatter,
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
    rev_rows = [r for r in rows if r.status in _REVENUE_STATUSES]

    agg = defaultdict(lambda: {"sales": 0, "revenue": 0})
    for r in rev_rows:
        if not r.product:
            continue
        agg[r.product.id]["sales"]   += r.quantity or 1
        agg[r.product.id]["revenue"] += r.total_price or 0

    products = db.query(Product).all()
    by_id = {p.id: p for p in products}
    total_products = len(products)
    active_products = sum(1 for p in products if p.is_active)

    enriched = []
    for pid, v in agg.items():
        p = by_id.get(pid)
        if not p: continue
        enriched.append({
            "product_id": pid,
            "name":       p.name,
            "category":   p.category.name if p.category else "—",
            "sales_count": v["sales"],
            "revenue":     round(v["revenue"]),
            "avg_basket":  round(v["revenue"] / v["sales"]) if v["sales"] else 0,
            "stock":       p.stock,
            "is_active":   bool(p.is_active),
        })
    enriched.sort(key=lambda x: x["revenue"], reverse=True)

    top_seller   = max(enriched, key=lambda x: x["sales_count"], default=None)
    top_revenue  = enriched[0] if enriched else None
    zero_sales   = total_products - len(enriched)

    # Treemap par catégorie
    cat_tree = defaultdict(list)
    for e in enriched:
        cat_tree[e["category"]].append({"name": e["name"], "value": e["revenue"]})
    treemap = [{"name": cat, "children": items} for cat, items in cat_tree.items()]

    table = [{
        "product_id": e["product_id"], "name": e["name"], "category": e["category"],
        "sales": e["sales_count"], "revenue": e["revenue"], "avg_basket": e["avg_basket"],
        "stock": e["stock"], "is_active": e["is_active"],
    } for e in enriched]

    return {
        "kpis": {
            "top_seller_name":     top_seller["name"]       if top_seller  else "—",
            "top_seller_qty":      top_seller["sales_count"] if top_seller  else 0,
            "top_revenue_name":    top_revenue["name"]      if top_revenue else "—",
            "top_revenue_amount":  top_revenue["revenue"]   if top_revenue else 0,
            "active_rate_pct":     round(active_products / total_products * 100, 1) if total_products else 0,
            "zero_sales_count":    zero_sales,
        },
        "top_products": enriched[:10],
        "treemap":      treemap,
        "table":        table,
        "total":        len(table),
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
    new_customers = len(new_users_q)

    by_day = defaultdict(int)
    for u in new_users_q:
        by_day[_to_date_key(u.created_at)] += 1
    new_per_day = [{"date": d, "new_users": c} for d, c in sorted(by_day.items())]

    rows = _orders_in_window(db, start, end).all()
    by_user = defaultdict(lambda: {"orders": 0, "revenue": 0, "last": None})
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

    top_customers = []
    for uid, v in sorted(by_user.items(), key=lambda x: x[1]["revenue"], reverse=True)[:20]:
        u = users_map.get(uid)
        if v["orders"] >= 5:   status = "vip"
        elif v["orders"] >= 2: status = "récurrent"
        else:                  status = "nouveau"
        top_customers.append({
            "email_masked":  _mask_email(u.email if u else None),
            "orders_count":  v["orders"],
            "total_revenue": round(v["revenue"]),
            "last_order_at": v["last"].isoformat() if v["last"] else None,
            "status":        status,
        })

    buckets = {"1": 0, "2-3": 0, "4-5": 0, "6+": 0}
    for v in by_user.values():
        n = v["orders"]
        if n == 1:        buckets["1"]   += 1
        elif n <= 3:      buckets["2-3"] += 1
        elif n <= 5:      buckets["4-5"] += 1
        else:             buckets["6+"]  += 1
    orders_distribution = [
        {"bucket": "1",   "label": "1 commande",    "customer_count": buckets["1"]},
        {"bucket": "2-3", "label": "2-3 commandes", "customer_count": buckets["2-3"]},
        {"bucket": "4-5", "label": "4-5 commandes", "customer_count": buckets["4-5"]},
        {"bucket": "6+",  "label": "6+ commandes",  "customer_count": buckets["6+"]},
    ]

    top = top_customers[0] if top_customers else None

    return {
        "kpis": {
            "new_customers":              new_customers,
            "returning_customers":        returning,
            "retention_rate_pct":         retention,
            "top_customer_email_masked":  top["email_masked"]  if top else "—",
            "top_customer_revenue":       top["total_revenue"] if top else 0,
        },
        "new_per_day":         new_per_day,
        "orders_distribution": orders_distribution,
        "top_customers":       top_customers,
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
    active_count = sum(1 for c in coupons if c.is_active)

    rev_rows = _orders_in_window(db, start, end).filter(Order.coupon_id.isnot(None)).all()

    by_coupon_agg = defaultdict(lambda: {"uses": 0, "ca_remised": 0})
    for r in rev_rows:
        if not r.coupon_id: continue
        a = by_coupon_agg[r.coupon_id]
        a["uses"]       += 1
        a["ca_remised"] += r.discount_amount or 0

    total_uses = sum(a["uses"] for a in by_coupon_agg.values())
    total_discounts = sum(a["ca_remised"] for a in by_coupon_agg.values())

    by_coupon = []
    for c in coupons:
        agg = by_coupon_agg.get(c.id, {"uses": 0, "ca_remised": 0})
        if c.discount_percent:
            t, v = "percent", c.discount_percent
        else:
            t, v = "amount", c.discount_amount or 0
        by_coupon.append({
            "code":        c.code,
            "type":        t,
            "value":       v,
            "uses":        agg["uses"],
            "max_uses":    c.max_uses,
            "ca_remised":  round(agg["ca_remised"]),
            "expires_at":  c.expires_at.isoformat() if c.expires_at else None,
            "is_active":   bool(c.is_active),
        })

    top = max(by_coupon, key=lambda x: x["uses"], default=None)

    daily = defaultdict(float)
    for r in rev_rows:
        daily[_to_date_key(r.created_at)] += r.discount_amount or 0
    daily_discounts = [{"date": d, "discount_amount": round(v)} for d, v in sorted(daily.items())]

    return {
        "kpis": {
            "active_count":              active_count,
            "total_uses":                total_uses,
            "total_discounts_granted":   round(total_discounts),
            "top_coupon_code":           top["code"] if top else "—",
            "top_coupon_uses":           top["uses"] if top else 0,
        },
        "daily_discounts": daily_discounts,
        "by_coupon":       by_coupon,
    }


# ─── EXPORT CSV ───────────────────────────────────────────────────────────────
def _csv_stream(rows: list[list], headers: list[str]) -> StreamingResponse:
    buf = io.StringIO()
    buf.write("\ufeff")  # BOM Excel
    writer = csv.writer(buf)
    writer.writerow(headers)
    for r in rows:
        writer.writerow(r)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv")


@stats_router.get("/export/{section}")
def export_csv(
    section: str,
    period:    str = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    if section not in _VALID_SECTIONS:
        raise HTTPException(status_code=400, detail="Section invalide.")

    start, end = _parse_period(period, date_from, date_to)
    stamp = datetime.utcnow().strftime("%Y%m%d")
    filename = f"tenora_{section}_{stamp}.csv"

    if section == "overview":
        data = stats_overview(period, date_from, date_to, db, admin)
        headers = ["date", "commandes", "ca"]
        rows = [[r["date"], r["orders"], r["revenue"]] for r in data["chart"]]
    elif section == "orders":
        data = stats_orders(period, date_from, date_to, db, admin)
        headers = ["date", "completed", "pending", "rejected", "processing", "refunded"]
        rows = [[r["date"], r["completed"], r["pending"], r["rejected"], r["processing"], r["refunded"]] for r in data["daily_breakdown"]]
    elif section == "revenue":
        data = stats_revenue(period, date_from, date_to, db, admin)
        headers = ["date", "ca", "ca_cumule"]
        rows = [[r["date"], r["revenue"], r["cumulative"]] for r in data["cumulative"]]
    elif section == "products":
        data = stats_products(period, date_from, date_to, db, admin)
        headers = ["produit", "categorie", "ventes", "ca", "stock"]
        rows = [[r["name"], r["category"], r["sales"], r["revenue"], r["stock"]] for r in data["table"]]
    elif section == "customers":
        data = stats_customers(period, date_from, date_to, db, admin)
        headers = ["email", "commandes", "ca_total", "derniere_commande"]
        rows = [[r["email_masked"], r["orders_count"], r["total_revenue"], r["last_order_at"]] for r in data["top_customers"]]
    elif section == "coupons":
        data = stats_coupons(period, date_from, date_to, db, admin)
        headers = ["code", "type", "valeur", "utilisations", "ca_remise", "actif"]
        rows = [[r["code"], r["type"], r["value"], r["uses"], r["ca_remised"], r["is_active"]] for r in data["by_coupon"]]
    else:
        raise HTTPException(status_code=400, detail="Section non gérée.")

    resp = _csv_stream(rows, headers)
    resp.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return resp


# ─── EXPORT PDF ───────────────────────────────────────────────────────────────
@stats_router.get("/export/{section}/pdf")
def export_pdf(
    section: str,
    period:    str = Query("30j"),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    if not _HAS_FPDF:
        raise HTTPException(status_code=501, detail="PDF export non disponible — installer fpdf2")
    if section not in _VALID_SECTIONS:
        raise HTTPException(status_code=400, detail="Section invalide.")

    start, end = _parse_period(period, date_from, date_to)
    stamp = datetime.utcnow().strftime("%Y%m%d")
    filename = f"tenora_{section}_{stamp}.pdf"

    # Récupère les données
    fetcher = {
        "overview":  stats_overview,
        "orders":    stats_orders,
        "revenue":   stats_revenue,
        "products":  stats_products,
        "customers": stats_customers,
        "coupons":   stats_coupons,
    }[section]
    data = fetcher(period, date_from, date_to, db, admin)

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Courier", "B", 16)
    pdf.cell(0, 10, f"TENORA — Statistiques {section.upper()}", ln=1)
    pdf.set_font("Courier", "", 9)
    pdf.cell(0, 5, f"Periode : {start.strftime('%Y-%m-%d')} -> {end.strftime('%Y-%m-%d')}", ln=1)
    pdf.cell(0, 5, f"Genere le {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", ln=1)
    pdf.ln(4)

    # KPIs
    kpis = data.get("kpis", {})
    if kpis:
        pdf.set_font("Courier", "B", 10)
        pdf.cell(0, 6, "KPI", ln=1)
        pdf.set_font("Courier", "", 9)
        for k, v in kpis.items():
            line = f"  {k:30s} : {v}"
            pdf.cell(0, 5, line[:90], ln=1)
        pdf.ln(2)

    # Tableau principal
    table_keys_by_section = {
        "overview":  ("chart",          ["date", "orders", "revenue"]),
        "orders":    ("daily_breakdown",["date", "completed", "pending", "rejected", "processing", "refunded"]),
        "revenue":   ("cumulative",     ["date", "revenue", "cumulative"]),
        "products":  ("table",          ["name", "category", "sales", "revenue", "stock"]),
        "customers": ("top_customers",  ["email_masked", "orders_count", "total_revenue", "last_order_at"]),
        "coupons":   ("by_coupon",      ["code", "type", "value", "uses", "ca_remised", "is_active"]),
    }
    key, cols = table_keys_by_section[section]
    rows = data.get(key, [])
    if rows:
        pdf.set_font("Courier", "B", 9)
        pdf.cell(0, 6, key.upper(), ln=1)
        pdf.set_font("Courier", "", 8)
        header = " | ".join(c[:14] for c in cols)
        pdf.cell(0, 5, header[:110], ln=1)
        for r in rows[:60]:
            line = " | ".join(str(r.get(c, ""))[:14] for c in cols)
            pdf.cell(0, 5, line[:110], ln=1)

    raw = pdf.output(dest="S")
    out = raw.encode("latin-1") if isinstance(raw, str) else bytes(raw)
    return StreamingResponse(
        iter([out]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
