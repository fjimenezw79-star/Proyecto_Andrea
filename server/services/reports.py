"""Reportes: ventas netas, utilidad, gastos y lo más vendido; panel con alertas."""
from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import func

from ..db import session
from ..models import (Category, Client, Expense, Layaway, LayawayPayment, Product, Return, ReturnItem, Sale, SaleItem,
                      SalePayment, User, Variant)
from .returns import line_values


def _range(start: date, end: date):
    return datetime.combine(start, datetime.min.time()), datetime.combine(end, datetime.max.time())


def _names() -> dict[int, str]:
    return {u.id: (u.full_name or u.username) for u in session.query(User).all()}


def summary(start: date, end: date) -> dict:
    a, b = _range(start, end)
    sales = session.query(Sale).filter(Sale.status == "paid", Sale.created_at.between(a, b)).all()
    returns = session.query(Return).filter(Return.created_at.between(a, b)).all()
    sales_cents = sum(s.total_cents for s in sales)
    returns_cents = sum(r.refund_cents for r in returns)
    cost = sum(it.unit_cost_cents * it.qty for s in sales for it in s.items)
    cats = {c.id: c.name for c in session.query(Category).all()}
    by_cat: dict[str, int] = defaultdict(int)
    top: dict[int, dict] = {}
    daily: dict[str, int] = defaultdict(int)
    by_seller: dict[int, int] = defaultdict(int)
    for s in sales:
        daily[s.created_at.date().isoformat()] += s.total_cents
        by_seller[s.user_id] += s.total_cents
        vals = line_values(s)
        for it in s.items:
            p = it.variant.product
            by_cat[cats.get(p.category_id, "Sin categoría")] += vals[it.id]
            t = top.setdefault(it.variant_id, {"variant_id": it.variant_id, "sku": it.variant.sku, "name": p.name,
                                               "qty": 0, "amount_cents": 0})
            t["qty"] += it.qty
            t["amount_cents"] += vals[it.id]
    for r in returns:
        daily[r.created_at.date().isoformat()] -= r.refund_cents
        for ri in r.items:
            si = session.get(SaleItem, ri.sale_item_id)
            cost -= si.unit_cost_cents * ri.qty
            p = si.variant.product
            by_cat[cats.get(p.category_id, "Sin categoría")] -= ri.refund_cents
            if si.variant_id in top:
                top[si.variant_id]["qty"] -= ri.qty
                top[si.variant_id]["amount_cents"] -= ri.refund_cents
    expenses_cents = int(session.query(func.coalesce(func.sum(Expense.amount_cents), 0))
                         .filter(Expense.day.between(start, end)).scalar())
    net = sales_cents - returns_cents
    gross = net - cost
    by_method = {"cash": 0, "card": 0, "transfer": 0, "credit": 0}
    for p in (session.query(SalePayment).join(Sale, Sale.id == SalePayment.sale_id)
              .filter(Sale.status == "paid", Sale.created_at.between(a, b))):
        by_method[p.method] += p.amount_cents
    for p in session.query(LayawayPayment).filter(LayawayPayment.created_at.between(a, b)):
        by_method[p.method] += p.amount_cents
    names = _names()
    days, d = [], start
    while d <= end and len(days) < 400:
        days.append({"date": d.isoformat(), "net_cents": daily.get(d.isoformat(), 0)})
        d += timedelta(days=1)
    tickets = len(sales)
    return {
        "summary": {"sales_cents": sales_cents, "returns_cents": returns_cents, "net_cents": net, "cost_cents": cost,
                    "gross_profit_cents": gross, "expenses_cents": expenses_cents, "net_profit_cents": gross - expenses_cents,
                    "tickets": tickets, "avg_ticket_cents": sales_cents // tickets if tickets else 0},
        "by_method": by_method,
        "by_category": sorted(({"category": k, "net_cents": v} for k, v in by_cat.items() if v), key=lambda x: -x["net_cents"]),
        "by_seller": sorted(({"name": names.get(k, "?"), "sales_cents": v} for k, v in by_seller.items()), key=lambda x: -x["sales_cents"]),
        "top_products": sorted((t for t in top.values() if t["qty"] > 0), key=lambda x: (-x["qty"], -x["amount_cents"]))[:10],
        "daily": days,
    }


def sales_csv(start: date, end: date) -> str:
    a, b = _range(start, end)
    names = _names()
    clients = {c.id: c.name for c in session.query(Client).all()}
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Fecha", "Folio", "Vendedor", "Cliente", "Código", "Producto", "Piezas", "Precio", "Descuento", "Total"])
    for s in (session.query(Sale).filter(Sale.status == "paid", Sale.created_at.between(a, b)).order_by(Sale.created_at)):
        vals = line_values(s)
        for it in s.items:
            w.writerow([s.created_at.strftime("%Y-%m-%d %H:%M"), s.folio, names.get(s.user_id, ""), clients.get(s.client_id, ""),
                        it.variant.sku, it.variant.product.name, it.qty, f"{it.unit_price_cents / 100:.2f}",
                        f"{(it.unit_price_cents * it.qty - vals[it.id]) / 100:.2f}", f"{vals[it.id] / 100:.2f}"])
    return "﻿" + out.getvalue()


def dashboard(is_admin: bool, low_stock_threshold: int) -> dict:
    today = date.today()
    t = summary(today, today)["summary"]
    m = summary(today.replace(day=1), today)["summary"]
    due = (session.query(Layaway).filter(Layaway.status == "pending", Layaway.deadline <= today + timedelta(days=7))
           .order_by(Layaway.deadline).limit(20).all())
    since = datetime.now() - timedelta(days=30)
    sold = dict(session.query(SaleItem.variant_id, func.sum(SaleItem.qty)).join(Sale, Sale.id == SaleItem.sale_id)
                .filter(Sale.status == "paid", Sale.created_at >= since).group_by(SaleItem.variant_id).all())
    returned = dict(session.query(SaleItem.variant_id, func.sum(ReturnItem.qty)).join(ReturnItem, ReturnItem.sale_item_id == SaleItem.id)
                    .join(Return, Return.id == ReturnItem.return_id).filter(Return.created_at >= since)
                    .group_by(SaleItem.variant_id).all())
    depletion = []
    for vid, qty in sold.items():
        qty = int(qty) - int(returned.get(vid, 0))
        v = session.get(Variant, vid)
        if qty <= 0 or not v or not v.active or v.stock <= 0:
            continue
        days_left = int(v.stock * 30 // qty)
        if days_left < 15:
            depletion.append({"variant_id": v.id, "sku": v.sku, "name": v.product.name, "stock": v.stock,
                              "sold_30d": qty, "days_left": days_left})
    low = (session.query(Variant).join(Product).filter(Variant.active.is_(True), Product.active.is_(True),
                                                        Variant.stock <= low_stock_threshold)
           .order_by(Variant.stock).limit(20).all())
    out = {
        "today_cents": t["net_cents"], "today_tickets": t["tickets"], "month_cents": m["net_cents"],
        "layaways_due": [{"id": l.id, "folio": l.folio, "client_name": l.client.name, "deadline": l.deadline.isoformat(),
                          "days_left": (l.deadline - today).days, "balance_cents": l.total_cents - l.paid_cents} for l in due],
        "low_stock": [{"variant_id": v.id, "product_id": v.product_id, "sku": v.sku, "name": v.product.name, "stock": v.stock} for v in low],
        "depletion": sorted(depletion, key=lambda x: x["days_left"]),
    }
    if is_admin:
        out["month_profit_cents"] = m["gross_profit_cents"]
        out["month_net_profit_cents"] = m["net_profit_cents"]
    return out
