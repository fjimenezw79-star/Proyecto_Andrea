# Etapa 3 · Operación diaria · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lo que la tienda hace todos los días además de vender: clientes con puntos y saldo a favor, apartados con abonos, devoluciones, gastos, caja con corte por turno, panel y reportes. También se pasan las ventas y apartados del sistema anterior.

**Architecture:** Igual que las etapas 1 y 2: servicios en `server/services/`, rutas JSON en `server/blueprints/`, una migración Alembic nueva (`0002_operacion`) y pantallas React en `web/src/`. Todo movimiento de dinero en efectivo queda ligado a una **sesión de caja**. Si alguien cobra en efectivo sin caja abierta, el servidor abre una sola con fondo $0 y la nota "Abierta automáticamente", para no frenar una venta. El stock sigue cambiando solo por `stock_movements`.

**Tech Stack:** el de las etapas 1 y 2 (Flask, SQLAlchemy, Alembic, React, TanStack Query, Motion, Tailwind). Las gráficas se dibujan con SVG propio siguiendo el skill `dataviz`, sin librería nueva.

**Spec:** `docs/superpowers/specs/2026-11-27-modas-andrea-design.md`, secciones 8.6 (caja), 8.7 (apartados), 8.8 (clientes), 8.9 (predicción), 8.10 (devoluciones, gastos y reportes) y 8.14 (ventas y apartados viejos).

## Global Constraints

- Las reglas de las etapas 1 y 2 siguen vigentes:
  - dinero en centavos enteros;
  - español de México;
  - el vendedor no ve costos ni utilidad;
  - versiones exactas;
  - estilo Revista y `prefers-reduced-motion`.
- **Puntos:** 1 por cada `POINTS_PER_PESOS` pesos (10) del total pagado. Al devolver se restan en proporción y nunca quedan negativos.
- **Saldo a favor** (`clients.credit_cents`):
  - crece al cancelar un apartado con "dejar como saldo" o al devolver con "saldo a favor";
  - se usa como forma de pago `credit`, que solo vale con cliente y hasta su saldo.
- **Apartados:**
  - el stock se aparta al crearlos (movimiento `layaway`) y regresa al cancelarlos (`layaway_cancel`);
  - liquidar **no** vuelve a mover stock;
  - el anticipo es obligatorio y mayor que $0;
  - fecha límite por defecto: **+30 días** (`LAYAWAY_DAYS=30`);
  - no se permite abonar más que el saldo.
- **Formas de pago:** `cash`, `card`, `transfer`, `credit`. Aplican igual a ventas, abonos y reembolsos.
- **Caja:**
  - una sola sesión abierta a la vez (una sola tienda);
  - el efectivo esperado = fondo + cobros en efectivo (lo cobrado, no lo recibido) − reembolsos en efectivo − gastos pagados de la caja;
  - diferencia = contado − esperado.
- **Permisos:**
  - **Vendedor:** clientes (crear, editar, ver); apartados (crear, abonar, liquidar); abrir y cerrar caja.
  - **Solo administrador:** cancelar apartados, devoluciones, gastos, reportes, panel con utilidad e historial de cortes.
- **Reportes:**
  - ventas netas = ventas pagadas − devoluciones del periodo;
  - utilidad bruta con el costo guardado en cada renglón;
  - utilidad neta = bruta − gastos;
  - un apartado cuenta como venta el día que se liquida.

## Review Focus

1. **Abono mayor que el saldo, o liquidar sin pagar todo:** 400 con mensaje claro y nada cambia. → Tarea 3.
2. **Devolver más piezas de las vendidas, o devolver dos veces la misma pieza** (incluso a la vez): 400/409; el stock y los puntos cuadran. → Tarea 4.
3. **Corte de caja con cambio y reembolsos:** cobrar $730 recibiendo $1,000 suma $730, no $1,000; un reembolso en efectivo y un gasto de caja restan. → Tarea 6.
4. **Cancelar un apartado con abonos:** el stock regresa una sola vez, los abonos no se borran y el dinero queda como reembolso (sale de la caja) o como saldo a favor del cliente. → Tarea 3.
5. **Pagar con saldo a favor sin cliente o con más del saldo:** 400; dos ventas simultáneas no gastan el mismo saldo dos veces. → Tarea 2.

---

## Estructura de archivos

```
server/
├── models.py                     + Layaway, LayawayItem, LayawayPayment, Return, ReturnItem, Expense, CashSession;
│                                   Client.credit_cents/active; Sale.source/layaway_id; cash_session_id en pagos
├── migrations/versions/0002_operacion.py
├── services/clients.py · layaways.py · returns.py · expenses.py · cash.py · reports.py · payments.py
└── blueprints/clients.py · layaways.py · returns.py · expenses.py · cash.py · reports.py
web/src/
├── clients/      ClientsPage, ClientDetail, ClientPicker (en el carrito)
├── layaways/     LayawaysPage, LayawayDetail, NewLayawaySheet (desde el carrito)
├── cash/         CashPage (abrir, movimientos, corte, historial)
├── admin/        ExpensesPage, ReportsPage, DashboardPage, ReturnDialog (en Ventas del día)
└── ui/charts/    BarChart, LineChart (SVG)
scripts/migrar_sistema_anterior.py   + ventas y apartados viejos
```

---

### Task 1: Modelos y migración 0002

**Files:** Modify `server/models.py`; Create `server/migrations/versions/0002_operacion.py`; Test `tests/test_db.py` (new case).

**Interfaces (Produces):**
- `Client`: + `credit_cents int=0` (CHECK ≥ 0), `active bool=True`, índice en `phone`.
- `Sale`: + `source in {"pos","layaway","legacy"}` (default `"pos"`), `layaway_id` null.
- `SalePayment.method` acepta `credit`; + `cash_session_id` null.
- `StockMovement.reason` acepta además `layaway`, `layaway_cancel` y `return`.
- `Layaway(id uuid, folio int uq, client_id NOT NULL, user_id, total_cents, paid_cents=0, deadline date, status in {"pending","settled","cancelled"}, created_at, settled_sale_id null, cancelled_at, cancelled_by, cancel_reason, refund_mode in {null,"refund","credit"})`.
- `LayawayItem(id, layaway_id, variant_id, qty, unit_price_cents, unit_cost_cents, discount_cents)`.
- `LayawayPayment(id uuid, layaway_id, method, amount_cents, received_cents, user_id, created_at, cash_session_id)`.
- `Return(id uuid, sale_id, user_id, reason, refund_method, refund_cents, created_at, cash_session_id)` y `ReturnItem(id, return_id, sale_item_id, qty)`.
- `Expense(id, description, category, amount_cents >0, from_register bool, day date, user_id, created_at, cash_session_id)`.
- `CashSession(id, opened_by, opened_at, opening_cents, auto bool, closed_by null, closed_at null, counted_cents null, expected_cents null, difference_cents null, notes)`.

- [ ] **Step 1: Test**

```python
def test_operation_tables(app):
    from sqlalchemy import inspect
    from server.db import engine_for
    names = set(inspect(engine_for(app)).get_table_names())
    assert {"layaways", "layaway_items", "layaway_payments", "returns", "return_items", "expenses", "cash_sessions"} <= names
    cols = {c["name"] for c in inspect(engine_for(app)).get_columns("clients")}
    assert {"credit_cents", "active"} <= cols
```

- [ ] **Steps 2–4:** run (FAIL) → write the models and autogenerate `0002` with `--rev-id 0002`, then review its CHECK constraints by hand → run the whole suite (PASS; the 87 previous tests still pass).
- [ ] **Step 5: Commit** `feat: modelos de operación diaria (migración 0002)`

---

### Task 2: Clientes, saldo a favor y pagos compartidos

**Files:** Create `server/services/payments.py`, `server/services/clients.py`, `server/blueprints/clients.py`; Modify `server/services/sales.py` (use `payments.py`); Test `tests/test_clients.py`.

**Interfaces (Produces):**
- `payments.parse(raw: list, total: int, client_id: str | None) -> list[ParsedPayment]` (misma validación que ventas, más `credit`).
  - `credit` sin cliente → `ValidationError("Elige al cliente para usar su saldo a favor.", "payments")`.
  - Más que el saldo → `ValidationError("El saldo a favor del cliente es de $X.", "payments")`.
- `payments.apply(parsed, *, client_id, user_id) -> int | None`. Descuenta el crédito con `UPDATE clients SET credit_cents = credit_cents - :x WHERE id=:id AND credit_cents >= :x` (si no afecta filas, el mismo error de saldo). Si hay efectivo, devuelve el `cash_session_id` de `cash.current_or_auto(user_id)` (Tarea 6). **No hace commit.**
- `clients.create(data) -> Client`:
  - nombre obligatorio;
  - teléfono de 10 dígitos opcional y único entre clientes activos (si se repite: 409 `"Ya existe un cliente con ese teléfono: <nombre>."`);
  - acepta `id` UUID enviado por el dispositivo (para la etapa 4).
- Rutas:
  - `GET /api/clients?q=` (nombre o teléfono, máx. 20);
  - `POST /api/clients`;
  - `PATCH /api/clients/<id>`;
  - `GET /api/clients/<id>` → cliente + `sales` (últimas 50) + `layaways` + totales comprados.

- [ ] **Step 1: Tests**

```python
def test_create_and_search(seller):
    c = seller.post("/api/clients", json={"name": "Laura Pérez", "phone": "4731234567"}).get_json()["client"]
    assert c["points"] == 0 and c["credit_cents"] == 0
    assert seller.get("/api/clients?q=4731").get_json()["clients"][0]["id"] == c["id"]

def test_duplicate_phone(seller):
    seller.post("/api/clients", json={"name": "A", "phone": "4731234567"})
    r = seller.post("/api/clients", json={"name": "B", "phone": "4731234567"})
    assert r.status_code == 409 and "Ya existe un cliente con ese teléfono: A." == r.get_json()["message"]

def test_bad_phone(seller):
    assert seller.post("/api/clients", json={"name": "A", "phone": "123"}).status_code == 400

def test_pay_with_credit(app, seller, v1, client_with_credit):   # crédito $100
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "client_id": client_with_credit,
        "payments": [{"method": "credit", "amount_cents": 10000}, {"method": "card", "amount_cents": 25000}]})
    assert r.status_code == 201
    assert seller.get(f"/api/clients/{client_with_credit}").get_json()["client"]["credit_cents"] == 0

def test_credit_needs_client_and_balance(seller, v1, client_with_credit):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}],
        "payments": [{"method": "credit", "amount_cents": 35000}]})
    assert r.status_code == 400 and r.get_json()["message"] == "Elige al cliente para usar su saldo a favor."
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "client_id": client_with_credit,
        "payments": [{"method": "credit", "amount_cents": 35000}]})
    assert r.status_code == 400 and r.get_json()["message"] == "El saldo a favor del cliente es de $100.00."

def test_credit_not_spent_twice_concurrently(app, client_with_credit, v_two, seller_user): ...
    # dos hilos pagan $100 cada uno con crédito $100 → ["ValidationError", "ok"]
```

- [ ] **Steps 2–4:** run → implement (and change `sales.create_sale` to use `payments.parse/apply`) → run everything.
- [ ] **Step 5: Commit** `feat: clientes con saldo a favor y pago con saldo`

---

### Task 3: Apartados

**Files:** Create `server/services/layaways.py`, `server/blueprints/layaways.py`; Test `tests/test_layaways.py`.

**Interfaces (Produces):**
- `POST /api/layaways`: `{id?, client_id, items:[{variant_id, qty, discount_cents?}], discount_cents?, deadline?, payments:[…anticipo…]}`.
  - Aparta el stock (movimiento `layaway` y 409 si no alcanza).
  - Anticipo > 0 y ≤ total.
  - `folio` propio.
  - El vendedor tiene el mismo tope de descuento que en ventas.
- `POST /api/layaways/<id>/payments` `{id?, payments:[…]}`.
  - Suma a `paid_cents`.
  - Si excede el saldo: 400 `"El abono es mayor que el saldo. Faltan $X."`.
  - Idempotente por `id`.
- `POST /api/layaways/<id>/settle` `{payments?}`.
  - Aplica el pago final si viene.
  - Exige `paid == total` (si no, 400 `"Faltan $X para liquidar."`).
  - Crea `Sale(source="layaway")` con los renglones y el costo guardado, **sin** mover stock y sin `SalePayment`: el dinero ya está en los abonos.
  - Da puntos y marca `settled`.
- `POST /api/layaways/<id>/cancel` `{reason, refund_mode: "refund"|"credit", refund_method?}` (solo admin).
  - Regresa el stock (`layaway_cancel`).
  - Con `refund_mode=refund` registra un reembolso (salida de caja si es en efectivo).
  - Con `refund_mode=credit` suma `paid_cents` al saldo del cliente.
  - No borra abonos. Cancelar dos veces da 409.
- `GET /api/layaways?status=pending|settled|cancelled|overdue` y `GET /api/layaways/<id>`, con `balance_cents`, `days_left` y `payments[]`.

- [ ] **Step 1: Tests (nombres y aserciones)**

```python
def test_create_reserves_stock(seller, v1, client_id):          # v1 stock 3, $350
    l = create(seller, v1, client_id, deposit=10000)
    assert l["balance_cents"] == 25000 and stock(seller, v1) == 2
def test_deposit_required(seller, v1, client_id):               # sin anticipo → 400
def test_payment_over_balance_rejected(seller, layaway):         # abonar 30000 con saldo 25000 → 400 "Faltan $250.00."
def test_payment_idempotent(seller, layaway):                    # mismo id dos veces → paid sube una vez
def test_settle_requires_full_payment(seller, layaway):          # 400 "Faltan $250.00 para liquidar."
def test_settle_creates_sale_without_moving_stock(admin, seller, layaway):
    pay(seller, layaway, 25000); s = settle(seller, layaway)
    assert s["sale"]["total_cents"] == 35000 and stock(seller, v1) == 2   # sigue apartado/vendido, no baja otra vez
def test_cancel_refund_returns_stock_once_and_keeps_payments(admin, layaway):
    cancel(admin, layaway, "refund", "cash"); assert stock == 3
    assert len(detail["payments"]) == 1 and admin.post(cancel again).status_code == 409
def test_cancel_as_credit(admin, layaway, client_id):            # saldo del cliente += 10000
def test_seller_cannot_cancel(seller, layaway):                  # 403
def test_overdue_filter(admin, seller, v1, client_id):           # deadline ayer → aparece en ?status=overdue
```

- [ ] **Steps 2–4:** run → implement → run.
- [ ] **Step 5: Commit** `feat: apartados con anticipo, abonos, liquidación y cancelación`

---

### Task 4: Devoluciones

**Files:** Create `server/services/returns.py`, `server/blueprints/returns.py`; Modify `sales.sale_dict` (adds `returned_qty` per line and `returns[]`); Test `tests/test_returns.py`.

**Interfaces (Produces):**
- `POST /api/sales/<sale_id>/returns` (solo admin): `{id?, items:[{sale_item_id, qty}], reason, refund_method: cash|card|transfer|credit}`.
  - `qty` ≤ vendidas − ya devueltas (si no, 400 `"Solo quedan N piezas por devolver de <nombre>."`).
  - Reembolso = lo pagado por esas piezas, con el descuento del renglón y el general repartido en proporción y redondeo hacia abajo en centavos.
  - Mueve el stock (`return`, +qty).
  - Resta puntos en proporción (nunca debajo de 0).
  - `credit` exige que la venta tenga cliente.
  - Bajo `begin_write`.
  - Una venta cancelada no admite devoluciones (409).
- La venta no cambia de estado; si se devuelve todo, `sale_dict.fully_returned = true`.

- [ ] **Step 1: Tests**

```python
def test_partial_return_refund_and_stock(admin, sale_2x_350):      # 2 piezas, desc. general $70
    r = ret(admin, sale, qty=1, method="cash")
    assert r["refund_cents"] == 31500 and stock == before + 1
def test_cannot_return_more_than_sold(admin, sale_2x_350):         # 1 y luego 2 → 400 "Solo quedan 1 piezas por devolver de Princesas Disney."
def test_concurrent_returns_do_not_exceed(app, sale_1x, admin_user):  # dos hilos devuelven 1 → ["ValidationError", "ok"]
def test_points_reduced_never_negative(admin, sale_with_client):
def test_credit_refund_needs_client(admin, sale_without_client):   # 400
def test_seller_cannot_return(seller, sale): # 403
def test_cancelled_sale_rejects_return(admin, cancelled_sale): # 409
```

- [ ] **Steps 2–4:** run → implement → run.
- [ ] **Step 5: Commit** `feat: devoluciones parciales con reembolso, stock y puntos`

---

### Task 5: Gastos

**Files:** Create `server/services/expenses.py`, `server/blueprints/expenses.py`; Test `tests/test_expenses.py`.

**Interfaces (Produces):**
- `POST /api/expenses` (admin): `{description, category, amount_cents>0, from_register: bool, day?}`.
  - Categorías: `Renta`, `Luz e internet`, `Sueldos`, `Mercancía`, `Insumos`, `Otros`.
  - Con `from_register` queda ligado a la caja abierta (o la abre automáticamente).
- `GET /api/expenses?from=&to=`, `PATCH /api/expenses/<id>`, `DELETE /api/expenses/<id>`. No se permite borrar un gasto de caja de una sesión ya cerrada (409).

- [ ] **Step 1: Tests:**
  - `test_create_list_expense`;
  - `test_amount_must_be_positive`;
  - `test_bad_category`;
  - `test_seller_forbidden`;
  - `test_cannot_delete_from_closed_session`.
- [ ] **Steps 2–5:** run → implement → run → commit `feat: gastos del negocio`.

---

### Task 6: Caja y corte

**Files:** Create `server/services/cash.py`, `server/blueprints/cash.py`; Test `tests/test_cash.py`.

**Interfaces (Produces):**
- `cash.current_or_auto(user_id) -> int`: id de la sesión abierta o una nueva con `auto=True`, fondo 0 y nota "Abierta automáticamente".
- `cash.summary(session_id) -> dict` con:
  - `opening_cents`;
  - `cash_sales_cents` (pagos `cash` de ventas: `amount_cents`);
  - `layaway_cash_cents`;
  - `refunds_cash_cents` (devoluciones y cancelaciones de apartado en efectivo);
  - `expenses_cash_cents`;
  - `expected_cents`;
  - también `card_cents`, `transfer_cents` y `credit_cents` del turno, solo como información;
  - `movements[]` (hora, tipo, folio, monto con signo).
- Rutas:
  - `GET /api/cash/current` → `{session|null, summary}`;
  - `POST /api/cash/open {opening_cents}` → 409 si ya hay una abierta;
  - `POST /api/cash/close {counted_cents, notes}` → guarda `expected`, `difference` y `closed_*`, y devuelve el resumen final;
  - `GET /api/cash/sessions` (admin; últimas 60).

- [ ] **Step 1: Tests**

```python
def test_cash_sale_counts_amount_not_received(seller, v1):    # cobro 35000 recibido 50000
    open_(seller, 50000); sell_cash(seller, v1, 35000, received=50000)
    assert summary(seller)["expected_cents"] == 85000
def test_refund_and_register_expense_subtract(admin, seller, ...):   # +35000 venta, −35000 devolución efectivo, −5000 gasto → 45000 con fondo 50000
def test_card_does_not_change_expected(seller, v1):
def test_layaway_cash_payments_count(seller, layaway): # anticipo en efectivo suma
def test_auto_open_when_cash_without_session(seller, v1): # sin abrir → sesión auto con fondo 0
def test_close_records_difference(seller): # contado 84000 → difference −1000; después current es null
def test_only_one_open(seller): # abrir dos veces → 409
```

- [ ] **Steps 2–5:** run → implement (and connect it to `payments.apply`, devoluciones, cancelaciones y gastos) → run → commit `feat: caja con apertura, movimientos y corte`.

> **Order note:** Tasks 2–5 call `cash.current_or_auto`. Implement Task 6's **interface** at the start of Task 2: a `cash.py` with only `current_or_auto` and its test `test_auto_open_when_cash_without_session`. The rest of Task 6 is completed in its own turn.

---

### Task 7: Reportes y panel

**Files:** Create `server/services/reports.py`, `server/blueprints/reports.py`; Test `tests/test_reports.py`.

**Interfaces (Produces):**
- `GET /api/reports/summary?from=AAAA-MM-DD&to=AAAA-MM-DD` (admin) devuelve:
  - `{sales_cents, returns_cents, net_cents, cost_cents, gross_profit_cents, expenses_cents, net_profit_cents, tickets, avg_ticket_cents}`;
  - `by_method`, `by_category`, `by_seller`;
  - `top_products[10]` (piezas y monto);
  - `daily[]` (`date`, `net_cents`).

  Excluye las ventas canceladas. Los apartados cuentan el día en que se liquidan.
- `GET /api/reports/sales.csv?from=&to=` (admin): una fila por renglón vendido (fecha, folio, vendedor, cliente, código, producto, piezas, precio, descuento, total). UTF-8 con BOM para que Excel respete los acentos.
- `GET /api/dashboard` (cualquiera con sesión; la utilidad solo para admin) devuelve:
  - `today_cents`, `month_cents`;
  - `layaways_due[]` (vencen en 7 días o ya vencidos);
  - `low_stock[]`;
  - `depletion[]`: productos con ventas en los últimos 30 días y menos de 15 días de existencia al ritmo actual, con `days_left`.

- [ ] **Step 1: Tests:**
  - `test_summary_math` (2 ventas, 1 devolución, 1 gasto: `net`, `gross_profit` y `net_profit` exactos);
  - `test_cancelled_excluded`;
  - `test_layaway_counts_on_settle_day`;
  - `test_csv_has_bom_and_rows`;
  - `test_dashboard_depletion` (5 vendidas en 30 días con stock 2 → `days_left` 12);
  - `test_seller_sees_dashboard_without_profit`.
- [ ] **Steps 2–5:** run → implement → run → commit `feat: reportes, exportación CSV y panel`.

---

### Task 8: Pantallas de clientes, apartados y devoluciones

**Files:** `web/src/clients/*`, `web/src/layaways/*`, `web/src/admin/ReturnDialog.tsx`; Modify `web/src/pos/CartPanel.tsx` (selector de cliente y botón "Apartar"), `PaymentSheet.tsx` (pestaña "Saldo a favor" si el cliente tiene saldo), `shell/nav.ts`; Test `web/e2e/operacion.spec.ts`.

**Interfaces (Produces):**
- Nav (orden final):
  - para todos: `Vender`, `Apartados`, `Clientes`, `Inventario`, `Ventas de hoy`, `Caja`;
  - solo admin: `Panel`, `Reportes`, `Gastos`, `Nuevo producto`, `Categorías`, `Configuración`;
  - en celular, la barra inferior muestra Vender, Apartados, Caja y Más.
- **Carrito:**
  - "Cliente" abre un buscador con alta rápida (nombre y teléfono) y muestra puntos y saldo;
  - "Apartar" (con cliente) abre una hoja con anticipo, forma de pago y fecha límite, que se guarda con `cart.id` como id del apartado;
  - al terminar muestra "Apartado #folio · saldo $X" y vacía el carrito.
- **`/apartados`:** pestañas Pendientes, Vencidos, Liquidados y Cancelados, con barra de avance animada (pagado/total) en cada uno.
- **Ficha de apartado:**
  - abonos con su hora;
  - "Registrar abono";
  - "Liquidar" (si el saldo es 0 o con pago final);
  - "Cancelar" (admin), que pregunta si se reembolsa o queda como saldo.
- **`/clientes`:** lista con búsqueda y ficha con historial, puntos y saldo.
- **Ventas del día → detalle:** "Devolver piezas" (admin) con cantidad por renglón, monto a reembolsar calculado y forma de reembolso.

- [ ] **Step 1: e2e**

```ts
test("apartado: crear con anticipo, abonar y liquidar", …)        // stock de la tarjeta baja al apartar y no vuelve a bajar al liquidar
test("abono mayor que el saldo muestra el mensaje y no guarda", …)
test("cancelar apartado como saldo a favor y usarlo en una venta", …)
test("devolver 1 de 2 piezas reembolsa y regresa stock", …)
test("alta rápida de cliente desde el carrito suma puntos", …)
```

- [ ] **Steps 2–5:** run → implement → run (all e2e) → commit `feat: pantallas de clientes, apartados y devoluciones`.

---

### Task 9: Pantallas de caja, gastos, reportes y panel

**Files:** `web/src/cash/CashPage.tsx`, `web/src/admin/ExpensesPage.tsx`, `ReportsPage.tsx`, `DashboardPage.tsx`, `web/src/ui/charts/*`; Test `web/e2e/caja-reportes.spec.ts`; load the `dataviz` skill before writing the charts.

**Interfaces (Produces):**
- **`/caja`:**
  - sin sesión: "Abrir caja" con fondo inicial;
  - con sesión: tarjetas de efectivo esperado, ventas en efectivo, abonos, reembolsos y gastos, con contadores animados, más la lista de movimientos;
  - "Hacer corte": se escribe el efectivo contado y se ven el esperado y la diferencia en vivo (en verde si cuadra, en vino si falta);
  - el admin ve también el historial de cortes.
- **`/gastos`:** lista del mes, alta con categoría y la casilla "Se pagó con dinero de la caja".
- **`/reportes`:**
  - periodos rápidos: Hoy, Semana, Mes y Rango;
  - indicadores principales;
  - línea de ventas netas por día;
  - barras por categoría y por forma de pago;
  - tabla de los más vendidos;
  - botón "Descargar Excel (CSV)" como enlace a `/api/reports/sales.csv`.
- **`/panel`** (inicio del admin; el vendedor sigue entrando a Vender): ventas de hoy y del mes, apartados por vencer, stock bajo y "Se agota pronto" con días restantes.

- [ ] **Step 1: e2e**

```ts
test("abrir caja, cobrar en efectivo con cambio y hacer corte", …) // esperado = fondo + cobrado; diferencia 0 → "Cuadra"
test("gasto pagado con caja baja el esperado", …)
test("reportes del mes muestran ventas netas y bajan el CSV", …)   // page.waitForEvent("download")
test("panel muestra 'Se agota pronto'", …)
test("accesibilidad: nuevas pantallas sin fallas graves", …)       // amplía zz_a11y con /apartados /clientes /caja /gastos /reportes /panel
```

- [ ] **Steps 2–5:** run → implement → run → commit `feat: pantallas de caja, gastos, reportes y panel`.

---

### Task 10: Ventas y apartados del sistema anterior, compilado y guía

**Files:** Modify `scripts/migrar_sistema_anterior.py`, `LEEME.md`, `server/web_dist/`; Test `tests/test_import.py` (new cases).

**Interfaces (Produces):**
- La migración también pasa:
  - **ventas:** `Sale(source="legacy")`, con su fecha original, pago en efectivo, el usuario `admin` y el costo de entonces;
  - **apartados pendientes:** con sus abonos y su fecha;
  - **clientes:** los de la tabla `clients` vieja, si existe.

  No mueve stock: el stock viejo ya los descuenta. Es idempotente: guarda el id viejo en `note` como `legacy:<tabla>:<id>`. Al resultado le agrega `ventas` y `apartados`.

  Un apartado viejo sin cliente se liga a un cliente "Cliente de mostrador (<nombre escrito>)", creado una sola vez por nombre.

- [ ] **Step 1: Tests:**
  - `test_migrate_legacy_sales_and_layaways` (fixture: 1 venta y 1 apartado con 5 abonos → `ventas == 1`, `apartados == 1`, saldo correcto);
  - `test_migrate_twice_no_duplicates`.
- [ ] **Step 2–4:** run → implement → `npm run build` → update `LEEME.md` with captures for Caja, Apartados and Reportes → run all three suites.
- [ ] **Step 5: Commit** `feat: migración de ventas y apartados anteriores; guía de operación`
