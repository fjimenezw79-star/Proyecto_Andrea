"""/api/reports y /api/dashboard."""
from __future__ import annotations

from datetime import date

from flask import Blueprint, Response, request
from flask_login import current_user, login_required

from ..api_util import fail, ok
from ..blueprints.settings import get_settings
from ..security import admin_required
from ..services import reports

bp = Blueprint("reports", __name__, url_prefix="/api")


def _period():
    today = date.today()
    try:
        start = date.fromisoformat(request.args.get("from") or today.replace(day=1).isoformat())
        end = date.fromisoformat(request.args.get("to") or today.isoformat())
    except ValueError:
        return None
    return (start, end) if start <= end and (end - start).days <= 366 else None


@bp.get("/reports/summary")
@admin_required
def summary():
    p = _period()
    if not p:
        return fail("Periodo no válido: usa fechas AAAA-MM-DD, de máximo un año.", 400, "from")
    return ok(**reports.summary(*p))


@bp.get("/reports/sales.csv")
@admin_required
def sales_csv():
    p = _period()
    if not p:
        return fail("Periodo no válido.", 400, "from")
    name = f"ventas_{p[0].isoformat()}_{p[1].isoformat()}.csv"
    return Response(reports.sales_csv(*p), mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@bp.get("/dashboard")
@login_required
def dashboard():
    return ok(**reports.dashboard(current_user.is_admin, int(get_settings()["low_stock_threshold"])))
