"""Modelos de datos. Dinero en centavos enteros; fechas en hora local de negocio."""
from __future__ import annotations

from datetime import datetime

from datetime import date

from sqlalchemy import JSON, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def now() -> datetime:
    return datetime.now().replace(microsecond=0)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(40), unique=True)
    full_name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (CheckConstraint("role IN ('admin','seller')", name="ck_users_role"),)


class LoginFailure(Base):
    __tablename__ = "login_failures"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(40), index=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[object] = mapped_column(JSON)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(90), unique=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    parent: Mapped[Category | None] = relationship(remote_side=[id])


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    online: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
    category: Mapped[Category] = relationship()
    photos: Mapped[list[ProductPhoto]] = relationship(back_populates="product", order_by="ProductPhoto.position",
                                                      cascade="all, delete-orphan")
    variants: Mapped[list[Variant]] = relationship(back_populates="product", order_by="Variant.id")


class ProductPhoto(Base):
    __tablename__ = "product_photos"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(80))
    thumb_filename: Mapped[str] = mapped_column(String(80))
    position: Mapped[int] = mapped_column(Integer, default=0)
    product: Mapped[Product] = relationship(back_populates="photos")


class Variant(Base):
    __tablename__ = "variants"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    sku: Mapped[str] = mapped_column(String(20), unique=True)
    barcode: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    attrs: Mapped[dict] = mapped_column(JSON, default=dict)
    price_cents: Mapped[int] = mapped_column(Integer)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    product: Mapped[Product] = relationship(back_populates="variants")
    # El stock puede quedar negativo solo por ventas hechas sin señal (ver inventory.move y StockAlert).
    __table_args__ = (CheckConstraint("price_cents >= 0 AND cost_cents >= 0", name="ck_variants_money"),)


class StockMovement(Base):
    __tablename__ = "stock_movements"
    id: Mapped[int] = mapped_column(primary_key=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("variants.id"), index=True)
    qty_delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(20))
    ref_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ref_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (CheckConstraint(
        "reason IN ('sale','sale_cancel','purchase','adjustment','import','layaway','layaway_cancel','return')",
        name="ck_movements_reason"),)


class Client(Base):
    __tablename__ = "clients"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20), default="", index=True)
    email: Mapped[str] = mapped_column(String(120), default="")
    points: Mapped[int] = mapped_column(Integer, default=0)
    credit_cents: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (CheckConstraint("credit_cents >= 0 AND points >= 0", name="ck_clients_balance"),)


class Sale(Base):
    __tablename__ = "sales"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    folio: Mapped[int] = mapped_column(Integer, unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    subtotal_cents: Mapped[int] = mapped_column(Integer)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10), default="paid")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    cancel_reason: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(10), default="pos")
    layaway_id: Mapped[str | None] = mapped_column(String(40), ForeignKey("layaways.id"), nullable=True)
    cancel_cash_session_id: Mapped[int | None] = mapped_column(ForeignKey("cash_sessions.id"), nullable=True)
    items: Mapped[list[SaleItem]] = relationship(back_populates="sale", order_by="SaleItem.id")
    payments: Mapped[list[SalePayment]] = relationship(back_populates="sale", order_by="SalePayment.id")
    __table_args__ = (CheckConstraint("status IN ('paid','cancelled')", name="ck_sales_status"),
                      CheckConstraint("source IN ('pos','layaway','legacy')", name="ck_sales_source"))


class SaleItem(Base):
    __tablename__ = "sale_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[str] = mapped_column(ForeignKey("sales.id"), index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("variants.id"))
    qty: Mapped[int] = mapped_column(Integer)
    unit_price_cents: Mapped[int] = mapped_column(Integer)
    unit_cost_cents: Mapped[int] = mapped_column(Integer)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    sale: Mapped[Sale] = relationship(back_populates="items")
    variant: Mapped[Variant] = relationship()


class SalePayment(Base):
    __tablename__ = "sale_payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[str] = mapped_column(ForeignKey("sales.id"), index=True)
    method: Mapped[str] = mapped_column(String(10))
    amount_cents: Mapped[int] = mapped_column(Integer)
    received_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cash_session_id: Mapped[int | None] = mapped_column(ForeignKey("cash_sessions.id"), nullable=True, index=True)
    sale: Mapped[Sale] = relationship(back_populates="payments")
    __table_args__ = (CheckConstraint("method IN ('cash','card','transfer','credit')", name="ck_payments_method"),)


class CashSession(Base):
    __tablename__ = "cash_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    opened_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    opening_cents: Mapped[int] = mapped_column(Integer, default=0)
    auto: Mapped[bool] = mapped_column(Boolean, default=False)
    closed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    counted_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difference_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    __table_args__ = (CheckConstraint("opening_cents >= 0", name="ck_cash_opening"),)


class Layaway(Base):
    __tablename__ = "layaways"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    folio: Mapped[int] = mapped_column(Integer, unique=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    subtotal_cents: Mapped[int] = mapped_column(Integer)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer)
    paid_cents: Mapped[int] = mapped_column(Integer, default=0)
    deadline: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    settled_sale_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    cancel_reason: Mapped[str] = mapped_column(Text, default="")
    refund_mode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    refund_method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    refund_cash_session_id: Mapped[int | None] = mapped_column(ForeignKey("cash_sessions.id"), nullable=True)
    items: Mapped[list[LayawayItem]] = relationship(order_by="LayawayItem.id")
    payments: Mapped[list[LayawayPayment]] = relationship(order_by="LayawayPayment.created_at")
    client: Mapped[Client] = relationship()
    __table_args__ = (CheckConstraint("status IN ('pending','settled','cancelled')", name="ck_layaways_status"),
                      CheckConstraint("paid_cents >= 0 AND paid_cents <= total_cents", name="ck_layaways_paid"),
                      CheckConstraint("refund_mode IS NULL OR refund_mode IN ('refund','credit')", name="ck_layaways_refund"))


class LayawayItem(Base):
    __tablename__ = "layaway_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    layaway_id: Mapped[str] = mapped_column(ForeignKey("layaways.id"), index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("variants.id"))
    qty: Mapped[int] = mapped_column(Integer)
    unit_price_cents: Mapped[int] = mapped_column(Integer)
    unit_cost_cents: Mapped[int] = mapped_column(Integer)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    variant: Mapped[Variant] = relationship()


class LayawayPayment(Base):
    __tablename__ = "layaway_payments"
    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    layaway_id: Mapped[str] = mapped_column(ForeignKey("layaways.id"), index=True)
    method: Mapped[str] = mapped_column(String(10))
    amount_cents: Mapped[int] = mapped_column(Integer)
    received_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    cash_session_id: Mapped[int | None] = mapped_column(ForeignKey("cash_sessions.id"), nullable=True, index=True)
    __table_args__ = (CheckConstraint("method IN ('cash','card','transfer','credit')", name="ck_lpayments_method"),
                      CheckConstraint("amount_cents > 0", name="ck_lpayments_amount"))


class Return(Base):
    __tablename__ = "returns"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sale_id: Mapped[str] = mapped_column(ForeignKey("sales.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(Text, default="")
    refund_method: Mapped[str] = mapped_column(String(10))
    refund_cents: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    cash_session_id: Mapped[int | None] = mapped_column(ForeignKey("cash_sessions.id"), nullable=True, index=True)
    items: Mapped[list[ReturnItem]] = relationship(order_by="ReturnItem.id")
    __table_args__ = (CheckConstraint("refund_method IN ('cash','card','transfer','credit')", name="ck_returns_method"),)


class ReturnItem(Base):
    __tablename__ = "return_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    return_id: Mapped[str] = mapped_column(ForeignKey("returns.id"), index=True)
    sale_item_id: Mapped[int] = mapped_column(ForeignKey("sale_items.id"), index=True)
    qty: Mapped[int] = mapped_column(Integer)
    refund_cents: Mapped[int] = mapped_column(Integer)


class Expense(Base):
    __tablename__ = "expenses"
    id: Mapped[int] = mapped_column(primary_key=True)
    description: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(40))
    amount_cents: Mapped[int] = mapped_column(Integer)
    from_register: Mapped[bool] = mapped_column(Boolean, default=False)
    day: Mapped[date] = mapped_column(Date, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    cash_session_id: Mapped[int | None] = mapped_column(ForeignKey("cash_sessions.id"), nullable=True, index=True)
    __table_args__ = (CheckConstraint("amount_cents > 0", name="ck_expenses_amount"),)


class OfflineOp(Base):
    """Acción enviada por un dispositivo con X-Client-Uid: se procesa una sola vez y su respuesta se repite."""
    __tablename__ = "offline_ops"
    uid: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    endpoint: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(12))
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    client_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    offline: Mapped[bool] = mapped_column(Boolean, default=False)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    offline: Mapped[bool] = mapped_column(Boolean, default=False)
    client_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class StockAlert(Base):
    """Una venta sin señal dejó el stock en negativo: el administrador lo revisa."""
    __tablename__ = "stock_alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("variants.id"), index=True)
    stock_after: Mapped[int] = mapped_column(Integer)
    ref_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ref_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    variant: Mapped[Variant] = relationship()
