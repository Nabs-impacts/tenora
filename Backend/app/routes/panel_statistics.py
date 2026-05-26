# === app/routes/panel_statistics.py ===
# PRÉREQUIS : ajouter "fpdf2" dans requirements.txt
"""
Routes statistiques avancées pour le panel admin Tenora.

Sections : overview, orders, revenue, products, customers, coupons.
Export   : CSV + PDF (fpdf2 requis — ajouter dans requirements.txt).

Optimisations v2 :
  - stats_overview : 4 requêtes DB → 2 (fetch unique par fenêtre)
  - PDF : rendu tabulaire propre avec en-tête et colonnes
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
        .replace("\u2019", "'")   # '
        .replace("\u2018", "'")   # '
        .replace("\u201c", '"')   # "
        .replace("\u201d", '"')   # "
        .replace("\u2026", "...") # …
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

    # ── Fetch unique par fenêtre (était 4 requêtes pour curr seul) ──
    curr_rows = _orders_in_window(db, start, end).all()
    prev_rows = _orders_in_window(db, prev_start, prev_end).all()

    def _agg(rows: list) -> dict:
        total_orders  = len(rows)
        revenue_rows  = [r for r in rows if r.status in _REVENUE_STATUSES]
        total_revenue = sum(r.total_price or 0 for r in revenue_rows)
        completed     = sum(1 for r in rows if r.status == OrderStatus.completed)
        avg_basket    = (total_revenue / len(revenue_rows)) if revenue_rows else 0
        completion    = (completed / total_orders * 100) if total_orders else 0
        return {
            "orders":          total_orders,
            "revenue":         round(total_revenue),
            "avg_basket":      round(avg_basket),
            "completion_rate": round(completion, 1),
        }

    curr = _agg(curr_rows)
    prev = _agg(prev_rows)

    # Chart quotidien — calculé depuis curr_rows déjà chargés
    daily: dict = defaultdict(lambda: {"revenue": 0, "orders": 0})
    status_counts: dict = defaultdict(int)
    for o in curr_rows:
        key = _to_date_key(o.created_at)
        daily[key]["orders"] += 1
        if o.status in _REVENUE_STATUSES:
            daily[key]["revenue"] += int(o.total_price or 0)
        status_counts[o.status.value] += 1

    chart = [{"date": d, **v} for d, v in sorted(daily.items())]

    total = sum(status_counts.values()) or 1
    status_distribution = [
        {"status": s, "count": c, "pct": round(c / total * 100, 1)}
        for s, c in status_counts.items()
    ]

    weekly: dict = defaultdict(lambda: {"orders": 0, "revenue": 0, "completed": 0})
    for o in curr_rows:
        iso = o.created_at.isocalendar()
        key = f"{iso[0]}-S{iso[1]:02d}"
        weekly[key]["orders"] += 1
        if o.status == OrderStatus.completed:
            weekly[key]["completed"] += 1
        if o.status in _REVENUE_STATUSES:
            weekly[key]["revenue"] += int(o.total_price or 0)
    weekly_summary = [
        {
            "week":            w,
            "orders":          v["orders"],
            "revenue":         v["revenue"],
            "avg_basket":      round(v["revenue"] / v["orders"]) if v["orders"] else 0,
            "completion_rate": round(v["completed"] / v["orders"] * 100, 1) if v["orders"] else 0,
        }
        for w, v in sorted(weekly.items())
    ]

    return {
        "kpis": {
            "revenue":                   curr["revenue"],
            "revenue_prev":              prev["revenue"],
            "revenue_delta_pct":         _delta_pct(curr["revenue"], prev["revenue"]),
            "orders":                    curr["orders"],
            "orders_prev":               prev["orders"],
            "orders_delta_pct":          _delta_pct(curr["orders"], prev["orders"]),
            "avg_basket":                curr["avg_basket"],
            "avg_basket_prev":           prev["avg_basket"],
            "avg_basket_delta_pct":      _delta_pct(curr["avg_basket"], prev["avg_basket"]),
            "completion_rate":           curr["completion_rate"],
            "completion_rate_prev":      prev["completion_rate"],
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
    avg_processing = (
        round(sum((r.updated_at - r.created_at).total_seconds() / 3600 for r in completed_rows) / len(completed_rows), 2)
        if completed_rows else None
    )

    daily: dict = defaultdict(lambda: {"completed": 0, "pending": 0, "rejected": 0, "processing": 0, "refunded": 0})
    hourly = {h: 0 for h in range(24)}
    weekday = {i: 0 for i in range(7)}
    processing = completed = 0

    for o in rows:
        daily[_to_date_key(o.created_at)][o.status.value] += 1
        hourly[o.created_at.hour] += 1
        weekday[o.created_at.weekday()] += 1
        if o.status == OrderStatus.processing: processing += 1
        if o.status == OrderStatus.completed:  completed  += 1

    weekday_labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

    return {
        "kpis": {
            "total":                total,
            "today":                today,
            "rejection_rate":       rejection_rate,
            "avg_processing_hours": avg_processing,
        },
        "daily_breakdown":      [{"date": d, **v} for d, v in sorted(daily.items())],
        "hourly_distribution":  [{"hour": h, "count": c} for h, c in hourly.items()],
        "weekday_distribution": [{"weekday": w, "label": weekday_labels[w], "count": c} for w, c in weekday.items()],
        "funnel": {
            "total":          total,
            "processing":     processing,
            "completed":      completed,
            "processing_pct": round(processing / total * 100, 1) if total else 0,
            "completion_pct": round(completed  / total * 100, 1) if total else 0,
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

    by_day: dict = defaultdict(float)
    by_method: dict = defaultdict(lambda: {"revenue": 0, "orders": 0})
    by_cat: dict = defaultdict(lambda: {"revenue": 0, "orders": 0})
    scatter = []

    for r in rev_rows:
        by_day[_to_date_key(r.created_at)] += r.total_price or 0
        m = r.payment_method or "—"
        by_method[m]["revenue"] += r.total_price or 0
        by_method[m]["orders"]  += 1
        cat = r.product.category.name if r.product and r.product.category else "—"
        by_cat[cat]["revenue"] += r.total_price or 0
        by_cat[cat]["orders"]  += 1
        scatter.append({"hour": r.created_at.hour, "amount": round(r.total_price or 0), "status": r.status.value})

    cumulative = []
    running = 0.0
    best_day = {"date": None, "revenue": 0}
    for d, v in sorted(by_day.items()):
        running += v
        cumulative.append({"date": d, "revenue": round(v), "cumulative": round(running)})
        if v > best_day["revenue"]:
            best_day = {"date": d, "revenue": round(v)}

    by_category = sorted([
        {
            "category":   cat,
            "revenue":    round(v["revenue"]),
            "orders":     v["orders"],
            "avg_basket": round(v["revenue"] / v["orders"]) if v["orders"] else 0,
            "share_pct":  round(v["revenue"] / total_revenue * 100, 1) if total_revenue else 0,
        }
        for cat, v in by_cat.items()
    ], key=lambda x: x["revenue"], reverse=True)

    return {
        "kpis": {
            "total_revenue":   round(total_revenue),
            "daily_avg":       daily_avg,
            "best_day":        best_day,
            "total_discounts": round(total_discounts),
        },
        "cumulative":        cumulative,
        "by_payment_method": [{"method": m, "revenue": round(v["revenue"]), "orders": v["orders"]} for m, v in by_method.items()],
        "by_category":       by_category,
        "scatter":           scatter,
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

    agg: dict = defaultdict(lambda: {"sales": 0, "revenue": 0})
    for r in rev_rows:
        if not r.product:
            continue
        agg[r.product.id]["sales"]   += r.quantity or 1
        agg[r.product.id]["revenue"] += r.total_price or 0

    products = db.query(Product).all()
    by_id = {p.id: p for p in products}
    total_products  = len(products)
    active_products = sum(1 for p in products if p.is_active)

    enriched = sorted([
        {
            "product_id":  pid,
            "name":        p.name,
            "category":    p.category.name if p.category else "—",
            "sales_count": v["sales"],
            "revenue":     round(v["revenue"]),
            "avg_basket":  round(v["revenue"] / v["sales"]) if v["sales"] else 0,
            "stock":       p.stock,
            "is_active":   bool(p.is_active),
        }
        for pid, v in agg.items()
        if (p := by_id.get(pid))
    ], key=lambda x: x["revenue"], reverse=True)

    top_seller  = max(enriched, key=lambda x: x["sales_count"], default=None)
    top_revenue = enriched[0] if enriched else None

    # Agrégation par catégorie (treemap plat : une entrée par catégorie)
    cat_agg: dict = defaultdict(lambda: {"revenue": 0, "sales": 0})
    for e in enriched:
        cat_agg[e["category"]]["revenue"] += e["revenue"]
        cat_agg[e["category"]]["sales"]   += e["sales_count"]

    table = [{
        "product_id": e["product_id"], "name": e["name"], "category": e["category"],
        "sales": e["sales_count"], "revenue": e["revenue"], "avg_basket": e["avg_basket"],
        "stock": e["stock"], "is_active": e["is_active"],
    } for e in enriched]

    return {
        "kpis": {
            "top_seller_name":    top_seller["name"]        if top_seller  else "—",
            "top_seller_qty":     top_seller["sales_count"] if top_seller  else 0,
            "top_revenue_name":   top_revenue["name"]       if top_revenue else "—",
            "top_revenue_amount": top_revenue["revenue"]    if top_revenue else 0,
            "active_rate_pct":    round(active_products / total_products * 100, 1) if total_products else 0,
            "zero_sales_count":   total_products - len(enriched),
        },
        "top_products": enriched[:10],
        # Treemap plat — une entrée par catégorie, value = CA total de la catégorie
        "treemap": [
            {"name": cat, "value": round(v["revenue"]), "sales": v["sales"]}
            for cat, v in sorted(cat_agg.items(), key=lambda x: x[1]["revenue"], reverse=True)
        ],
        "table":  table,
        "total":  len(table),
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

    top_customers = []
    for uid, v in sorted(by_user.items(), key=lambda x: x[1]["revenue"], reverse=True)[:20]:
        u = users_map.get(uid)
        status = "vip" if v["orders"] >= 5 else ("récurrent" if v["orders"] >= 2 else "nouveau")
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

    rev_rows = _orders_in_window(db, start, end).filter(Order.coupon_id.isnot(None)).all()
    by_coupon_agg: dict = defaultdict(lambda: {"uses": 0, "remise_total": 0})
    daily: dict = defaultdict(float)

    for r in rev_rows:
        if not r.coupon_id:
            continue
        by_coupon_agg[r.coupon_id]["uses"]          += 1
        by_coupon_agg[r.coupon_id]["remise_total"]  += r.discount_amount or 0
        daily[_to_date_key(r.created_at)] += r.discount_amount or 0

    total_uses      = sum(a["uses"]         for a in by_coupon_agg.values())
    total_discounts = sum(a["remise_total"] for a in by_coupon_agg.values())

    by_coupon = []
    for c in coupons:
        agg = by_coupon_agg.get(c.id, {"uses": 0, "remise_total": 0})
        t, v = ("percent", c.discount_percent) if c.discount_percent else ("amount", c.discount_amount or 0)
        by_coupon.append({
            "code":         c.code,
            "type":         t,
            "value":        v,
            "uses":         agg["uses"],
            "max_uses":     c.max_uses,
            "remise_total": round(agg["remise_total"]),
            "expires_at":   c.expires_at.isoformat() if c.expires_at else None,
            "is_active":    bool(c.is_active),
        })

    top = max(by_coupon, key=lambda x: x["uses"], default=None)
    return {
        "kpis": {
            "active_count":            sum(1 for c in coupons if c.is_active),
            "total_uses":              total_uses,
            "total_discounts_granted": round(total_discounts),
            "top_coupon_code":         top["code"] if top else "—",
            "top_coupon_uses":         top["uses"] if top else 0,
        },
        "daily_discounts": [{"date": d, "discount_amount": round(v)} for d, v in sorted(daily.items())],
        "by_coupon":       by_coupon,
    }


# ─── EXPORT CSV ───────────────────────────────────────────────────────────────

def _csv_stream(rows: list, headers: list[str]) -> StreamingResponse:
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
    section:   str,
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
        rows = [[r["email_masked"], r["orders_count"], r["total_revenue"], r["last_order_at"], r["status"]] for r in data["top_customers"]]
    elif section == "coupons":
        headers = ["Code", "Type", "Valeur", "Utilisations", "Remise accordée (F)", "Actif"]
        rows = [[r["code"], r["type"], r["value"], r["uses"], r["remise_total"], r["is_active"]] for r in data["by_coupon"]]
    else:
        raise HTTPException(status_code=400, detail="Section non gérée.")

    resp = _csv_stream(rows, headers)
    resp.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return resp


# ─── EXPORT PDF ───────────────────────────────────────────────────────────────

def _make_pdf(section: str, start: datetime, end: datetime, data: dict) -> bytes:
    """Génère un PDF propre avec en-tête, KPIs et tableau de données."""

    class TenoraReport(FPDF):
        def header(self):
            self.set_font("Courier", "B", 14)
            self.set_text_color(0, 0, 0)
            self.cell(0, 8, "TENORA - Panel Administrateur", ln=1)
            self.set_font("Courier", "B", 10)
            self.set_text_color(60, 60, 60)
            self.cell(0, 6, f"Rapport : {section.upper()}", ln=1)
            self.set_font("Courier", "", 8)
            self.set_text_color(100, 100, 100)
            self.cell(0, 5, f"Periode : {start.strftime('%d/%m/%Y')} -> {end.strftime('%d/%m/%Y')}", ln=1)
            self.cell(0, 5, f"Genere le {datetime.utcnow().strftime('%d/%m/%Y a %H:%M')} UTC", ln=1)
            self.ln(3)
            self.set_draw_color(0, 0, 0)
            self.set_line_width(0.5)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(4)

        def footer(self):
            self.set_y(-12)
            self.set_font("Courier", "", 7)
            self.set_text_color(150, 150, 150)
            self.cell(0, 5, f"Tenora Panel - Page {self.page_no()}", align="C")

    pdf = TenoraReport()
    pdf.set_margins(10, 15, 10)
    pdf.add_page()

    # ── KPIs ──────────────────────────────────────────────────────────────────
    kpis = data.get("kpis", {})
    _kpi_labels = {
        # overview
        "revenue":                   "Chiffre d'affaires (F)",
        "orders":                    "Commandes",
        "avg_basket":                "Panier moyen (F)",
        "completion_rate":           "Taux de complétion (%)",
        # orders
        "total":                     "Total commandes",
        "today":                     "Commandes aujourd'hui",
        "rejection_rate":            "Taux de rejet (%)",
        "avg_processing_hours":      "Traitement moyen (h)",
        # revenue
        "total_revenue":             "Chiffre d'affaires total (F)",
        "daily_avg":                 "CA journalier moyen (F)",
        "total_discounts":           "Total remises coupons (F)",
        # products
        "top_seller_name":           "Meilleure vente (nom)",
        "top_seller_qty":            "Meilleure vente (qté)",
        "top_revenue_name":          "Meilleur revenu (nom)",
        "top_revenue_amount":        "Meilleur revenu (F)",
        "active_rate_pct":           "Taux produits actifs (%)",
        "zero_sales_count":          "Produits sans vente",
        # customers
        "new_customers":             "Nouveaux clients",
        "returning_customers":       "Clients récurrents",
        "retention_rate_pct":        "Taux de rétention (%)",
        "top_customer_email_masked": "Meilleur client (email)",
        "top_customer_revenue":      "Meilleur client (CA, F)",
        # coupons
        "active_count":              "Coupons actifs",
        "total_uses":                "Utilisations totales",
        "total_discounts_granted":   "Total remises accordées (F)",
        "top_coupon_code":           "Coupon le plus utilisé",
        "top_coupon_uses":           "Utilisations du top coupon",
    }

    if kpis:
        pdf.set_font("Courier", "B", 10)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 6, "// INDICATEURS CLES", ln=1)
        pdf.ln(1)

        col_w = 95
        pairs = [(k, v) for k, v in kpis.items() if not k.endswith("_prev") and not k.endswith("_delta_pct") and "best_day" not in k]
        for i in range(0, len(pairs), 2):
            left  = pairs[i]
            right = pairs[i + 1] if i + 1 < len(pairs) else None
            pdf.set_font("Courier", "", 8)
            pdf.set_fill_color(240, 240, 240)
            lbl_l = _kpi_labels.get(left[0], left[0])
            val_l = _safe(left[1]) if left[1] is not None else "-"
            pdf.cell(col_w, 6, f"  {lbl_l[:38]}", border=1, fill=True)
            pdf.set_font("Courier", "B", 8)
            pdf.cell(col_w, 6, f"  {val_l[:35]}", border=1, ln=1)
            if right:
                pdf.set_font("Courier", "", 8)
                lbl_r = _kpi_labels.get(right[0], right[0])
                val_r = str(right[1]) if right[1] is not None else "—"
                pdf.set_x(10)
                # We already advanced a line; back to previous row for 2-col layout
                # Actually, fpdf doesn't easily do 2-col — just go 1-col for now
                pass
        # Simpler: single column
        pdf.set_y(pdf.get_y() - len(pairs) * 6)  # reset
        pdf.ln(1)
        for k, v in pairs:
            lbl = _safe(_kpi_labels.get(k, k))
            val = _safe(v) if v is not None else "-"
            pdf.set_font("Courier", "", 8)
            pdf.set_fill_color(248, 248, 248)
            pdf.cell(120, 6, f"  {lbl[:55]}", border="LTB", fill=True)  # already _safe
            pdf.set_font("Courier", "B", 8)
            pdf.set_fill_color(255, 255, 255)
            pdf.cell(70, 6, f"  {val[:30]}", border="RTB", fill=False, ln=1)
        pdf.ln(5)

    # ── Tableau de données ─────────────────────────────────────────────────────
    _table_cfg = {
        "overview":  ("chart",          ["Date", "Commandes", "CA (F)"],                    ["date", "orders", "revenue"]),
        "orders":    ("daily_breakdown", ["Date", "Complétées", "Attente", "Rejet", "Traitmt", "Remb."], ["date", "completed", "pending", "rejected", "processing", "refunded"]),
        "revenue":   ("cumulative",      ["Date", "CA (F)", "CA cumulé (F)"],                ["date", "revenue", "cumulative"]),
        "products":  ("table",           ["Produit", "Catégorie", "Ventes", "CA (F)", "Pan. moy.", "Stock"], ["name", "category", "sales", "revenue", "avg_basket", "stock"]),
        "customers": ("top_customers",   ["Email", "Commandes", "CA total (F)", "Dernière cmd", "Statut"], ["email_masked", "orders_count", "total_revenue", "last_order_at", "status"]),
        "coupons":   ("by_coupon",       ["Code", "Type", "Valeur", "Utilisations", "Remise (F)", "Max", "Actif"], ["code", "type", "value", "uses", "remise_total", "max_uses", "is_active"]),
    }
    data_key, col_labels, col_keys = _table_cfg[section]
    rows = data.get(data_key, [])

    if rows:
        pdf.set_font("Courier", "B", 10)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 6, f"// DONNEES ({len(rows)} lignes)", ln=1)
        pdf.ln(1)

        n_cols = len(col_labels)
        usable = 190
        col_w  = usable / n_cols

        # En-tête tableau
        pdf.set_font("Courier", "B", 7)
        pdf.set_fill_color(30, 30, 30)
        pdf.set_text_color(255, 255, 255)
        for lbl in col_labels:
            pdf.cell(col_w, 6, f" {_safe(lbl)[:int(col_w // 2)]}", border=1, fill=True)
        pdf.ln()

        # Lignes
        pdf.set_font("Courier", "", 7)
        for i, row in enumerate(rows[:80]):
            pdf.set_fill_color(252, 252, 252) if i % 2 == 0 else pdf.set_fill_color(245, 245, 245)
            pdf.set_text_color(30, 30, 30)
            for key in col_keys:
                val = row.get(key, "")
                if val is None:         val = "-"
                elif val is True:       val = "Oui"
                elif val is False:      val = "Non"
                elif isinstance(val, float): val = f"{val:.1f}"
                else:                   val = str(val)
                if key == "last_order_at" and val not in ("-", ""):
                    val = val[:10]
                val = _safe(val)
                pdf.cell(col_w, 5, f" {val[:int(col_w // 2)]}", border="LR", fill=True)
            pdf.ln()

        if len(rows) > 80:
            pdf.set_font("Courier", "I", 7)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(0, 5, f"  ... {len(rows) - 80} lignes supplementaires non affichees (voir export CSV)", ln=1)

        # Ligne de fermeture
        pdf.set_draw_color(0, 0, 0)
        pdf.cell(usable, 0, "", border="T")
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
