"""Conexión a la base de datos, sesión por petición, migraciones al arrancar y respaldos."""
from __future__ import annotations

import sqlite3
from datetime import date
from pathlib import Path

from flask import Flask
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import scoped_session, sessionmaker

MIGRATIONS = Path(__file__).resolve().parent / "migrations"

session = scoped_session(sessionmaker(expire_on_commit=False))


def _make_engine(path: str) -> Engine:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    eng = create_engine(f"sqlite:///{path}", connect_args={"timeout": 30, "check_same_thread": False})

    @event.listens_for(eng, "connect")
    def _pragmas(dbapi_conn, _rec):
        dbapi_conn.isolation_level = None  # SQLAlchemy controla BEGIN (ver _begin)
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA busy_timeout=30000")
        cur.close()

    @event.listens_for(eng, "begin")
    def _begin(conn):
        # BEGIN IMMEDIATE: las escrituras concurrentes (dos ventas de la última pieza) se hacen en fila.
        conn.exec_driver_sql("BEGIN IMMEDIATE")

    return eng


def engine_for(app: Flask) -> Engine:
    return app.extensions["db_engine"]


def upgrade(app: Flask) -> None:
    """Aplica las migraciones pendientes (``alembic upgrade head``)."""
    from alembic import command
    from alembic.config import Config as AlembicConfig

    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(MIGRATIONS))
    with engine_for(app).connect() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")
        conn.commit()


def init_app(app: Flask) -> None:
    eng = _make_engine(app.config["DATABASE"])
    app.extensions["db_engine"] = eng
    session.remove()
    session.configure(bind=eng)
    Path(app.config["UPLOAD_DIR"]).mkdir(parents=True, exist_ok=True)

    @app.teardown_appcontext
    def _remove(_exc=None):
        session.remove()


def backup_database(app: Flask) -> Path | None:
    """Una copia por día en BACKUP_DIR; conserva las BACKUPS_TO_KEEP más recientes."""
    bdir = Path(app.config["BACKUP_DIR"])
    bdir.mkdir(parents=True, exist_ok=True)
    target = bdir / f"modas-andrea-{date.today().isoformat()}.db"
    try:
        if not target.exists():
            src = sqlite3.connect(app.config["DATABASE"])
            dst = sqlite3.connect(target)
            try:
                src.backup(dst)
            finally:
                dst.close()
                src.close()
    except sqlite3.Error:
        app.logger.exception("No se pudo crear el respaldo")
        return None
    files = sorted(bdir.glob("modas-andrea-*.db"))
    for old in files[: max(0, len(files) - app.config["BACKUPS_TO_KEEP"])]:
        old.unlink(missing_ok=True)
    return target
