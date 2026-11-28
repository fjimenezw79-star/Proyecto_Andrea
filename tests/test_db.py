import pathlib

import pytest
import sqlalchemy


def test_upgrade_creates_tables(app):
    from sqlalchemy import inspect

    from server.db import engine_for

    names = set(inspect(engine_for(app)).get_table_names())
    assert {"users", "categories", "products", "product_photos", "variants", "stock_movements",
            "clients", "sales", "sale_items", "sale_payments", "settings", "login_failures"} <= names


def test_wal_mode(app):
    from server.db import engine_for

    with engine_for(app).connect() as c:
        assert c.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"


def test_stock_cannot_go_negative(app):
    from server.db import session
    from server.models import Category, Product, Variant

    with app.app_context():
        c = Category(name="Termos", slug="termos")
        p = Product(name="Termo", category=c)
        v = Variant(product=p, sku="MA000001", attrs={}, price_cents=100, cost_cents=50, stock=0, hidden=True)
        session.add_all([c, p, v])
        session.commit()
        v.stock = -1
        with pytest.raises(sqlalchemy.exc.IntegrityError):
            session.commit()


def test_backup_keeps_limit(app):
    from server.db import backup_database

    bdir = pathlib.Path(app.config["BACKUP_DIR"])
    bdir.mkdir(parents=True, exist_ok=True)
    for d in range(20):
        (bdir / f"modas-andrea-2026-01-{d + 1:02d}.db").write_bytes(b"x")
    backup_database(app)
    assert len(list(bdir.glob("modas-andrea-*.db"))) == 15


def test_operation_tables(app):
    from sqlalchemy import inspect

    from server.db import engine_for

    insp = inspect(engine_for(app))
    names = set(insp.get_table_names())
    assert {"layaways", "layaway_items", "layaway_payments", "returns", "return_items", "expenses", "cash_sessions"} <= names
    assert {"credit_cents", "active"} <= {c["name"] for c in insp.get_columns("clients")}
    assert {"source", "layaway_id"} <= {c["name"] for c in insp.get_columns("sales")}
    assert "cash_session_id" in {c["name"] for c in insp.get_columns("sale_payments")}
