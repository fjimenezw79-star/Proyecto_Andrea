# Etapa 1 · Núcleo del servidor · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un servidor Flask instalable con doble clic en Windows que ya maneja usuarios, catálogo con variantes y fotos, inventario con bitácora y ventas con carrito, probado con los 58 productos de `datos_prueba/`.

**Architecture:** API JSON en Flask 3 bajo `/api/…`, servida con Waitress. Persistencia con SQLAlchemy 2 (ORM) sobre SQLite en modo WAL, con esquema versionado por Alembic, que se aplica solo al arrancar. Seguridad, arranque, respaldos y `.bat` se adaptan de AcuaGest 3.0 (repo `fjimenezw79-star/AcuaGest`, rama `demo-3.0`; solo se lee, nunca se modifica). La interfaz React llega en la etapa 2: esta etapa entrega solo API, scripts y pruebas.

**Tech Stack:** Python 3.12, Flask, Flask-Login, Flask-WTF (CSRF), SQLAlchemy 2, Alembic, Pillow, Waitress, python-dotenv, pytest.

**Spec:** `docs/superpowers/specs/2026-11-27-modas-andrea-design.md`

## Hoja de ruta (cada etapa tiene su propio plan)

| Etapa | Entrega |
|---|---|
| **1 · Núcleo del servidor (este plan)** | API de usuarios, catálogo, inventario y ventas; importación de datos; instalador `.bat` |
| 2 · Interfaz React | Estilo Revista, punto de venta con carrito, inventario, alta de producto con cámara, Ctrl+K y animaciones |
| 3 · Operación diaria | Apartados, clientes y puntos, devoluciones, gastos, caja y corte, reportes y panel |
| 4 · Conexión y sin señal | Stock en vivo, cola sin señal (patrón `offline.py` de AcuaGest), PWA, túnel Cloudflare, pantalla "Conectar dispositivo" |
| 5 · Cámara y etiquetas | Lector de códigos, etiquetas imprimibles, tickets, reconocimiento visual y botón de IA |
| 6 · Tienda en línea | Sitio en Cloudflare Pages, Open Graph por producto, pedidos por WhatsApp que entran al sistema |

## Global Constraints

- Toda la interfaz y todos los mensajes al usuario van en **español de México**. El código, los nombres de tablas y los endpoints van en inglés.
- **Dinero en centavos enteros** (`*_cents: int`) en la base, la API y las pruebas. Nunca `float`.
- Zona horaria de negocio: `America/Mexico_City`. Fechas en ISO 8601 sin zona, hora local.
- Roles: `admin` y `seller` (en pantalla: Administrador y Vendedor).
- Código interno: `MA` + 6 dígitos (`MA000001`), Code 128. Un código de fábrica (EAN-13/UPC) se puede asociar a una variante y debe ser único.
- El stock **solo cambia mediante movimientos** (`stock_movements`); ningún endpoint escribe `variants.stock` directamente.
- Con conexión, el servidor **rechaza** una venta sin stock suficiente (HTTP 409). (El modo sin señal de la etapa 4 añadirá la excepción.)
- El descuento del vendedor tiene un tope configurable, **10 % por defecto** (`SELLER_MAX_DISCOUNT_PCT=10`); el administrador no tiene tope.
- Puntos de lealtad: **1 punto por cada $10** (`POINTS_PER_PESOS=10`).
- Fotos: se exige **al menos 1** por producto. Se guardan en WebP, lado mayor 1600 px más una miniatura de 400 px, sin EXIF.
- Usuarios iniciales: `admin` / `admin123` y `vendedor` / `12345`. No se importan los usuarios del sistema viejo.
- Todas las dependencias van con versión exacta (`==`) en `requirements.txt`, la más reciente estable al implementar.
- AcuaGest no se modifica: su código solo se lee y se copia.

## Review Focus

1. **Venta simultánea del último artículo:** dos ventas al mismo tiempo de la última pieza; una pasa y la otra recibe 409, y el stock nunca queda negativo. → prueba en la Tarea 7.
2. **Código escaneado inexistente o duplicado:** buscar un código que no existe da 404 con mensaje claro; asociar un código de fábrica que ya usa otra variante da 409. → pruebas en las Tareas 5 y 7.
3. **Foto inválida:** un archivo que no es imagen, de más de 25 MB o sin foto al crear producto, se rechaza con 400 y no queda ningún producto a medias. → prueba en la Tarea 5.
4. **Pago que no cuadra:** pagos que suman menos que el total se rechazan; en efectivo, el recibido menor que su monto se rechaza y el cambio se calcula. → prueba en la Tarea 7.
5. **Reimportar los datos de prueba:** correr el importador dos veces no duplica productos ni stock. → prueba en la Tarea 8.

---

## Estructura de archivos

```
proyecto_andrea/
├── run.py                       arranque (Waitress, IP local, respaldo diario)
├── requirements.txt / requirements-dev.txt / .env.example / .gitignore
├── instalar.bat / aplicacion.bat / restablecer_contrasena.bat
├── alembic.ini
├── server/
│   ├── __init__.py              create_app(), cabeceras de seguridad, manejo de errores
│   ├── config.py                Config / TestConfig (lee .env)
│   ├── db.py                    engine, sesión por petición, upgrade al arrancar, respaldos
│   ├── models.py                modelos SQLAlchemy
│   ├── api_util.py              ok(), fail(), ValidationError, parsers de entrada
│   ├── security.py              Flask-Login, roles, bloqueo por intentos
│   ├── photos.py                validación y conversión de fotos
│   ├── codes.py                 generación de SKU MA######
│   ├── services/
│   │   ├── catalog.py           categorías, productos, variantes
│   │   ├── inventory.py         movimientos de stock
│   │   └── sales.py             ventas, pagos, cancelación
│   ├── blueprints/
│   │   ├── auth.py              /api/auth/*
│   │   ├── catalog.py           /api/categories, /api/products, /api/variants
│   │   ├── inventory.py         /api/inventory/*
│   │   ├── sales.py             /api/sales
│   │   └── settings.py          /api/settings
│   └── migrations/              Alembic (env.py + versions/)
├── scripts/
│   ├── importar_datos_prueba.py
│   ├── migrar_sistema_anterior.py
│   └── restablecer_contrasena.py
└── tests/
    ├── conftest.py
    └── test_*.py                uno por tarea
```

---

### Task 1: Esqueleto, configuración y arranque de la app

**Files:**
- Create: `requirements.txt`, `requirements-dev.txt`, `.env.example`, `.gitignore`, `server/__init__.py`, `server/config.py`, `server/api_util.py`
- Test: `tests/conftest.py`, `tests/test_app.py`

**Interfaces:**
- Produces: `create_app(config_class=Config) -> Flask`; `Config` con `DATABASE`, `UPLOAD_DIR`, `BACKUP_DIR`, `BACKUPS_TO_KEEP=15`, `HOST="0.0.0.0"`, `PORT=5000`, `SELLER_MAX_DISCOUNT_PCT=10`, `POINTS_PER_PESOS=10`, `LOW_STOCK_THRESHOLD=2`, `MAX_CONTENT_LENGTH=25*1024*1024`, `SECRET_KEY` (de `.env` o archivo persistente `data/.secret_key`, como `_secret_key()` de AcuaGest); `TestConfig(Config)` con `TESTING=True`, `WTF_CSRF_ENABLED=False`.
- Produces: `ok(message: str = "", status: int = 200, **data)` → `{"ok": true, "message": …, **data}`; `fail(message: str, status: int = 400, field: str | None = None)` → `{"ok": false, "message": …, "field": …}`; `class ValidationError(ValueError)` con `.field`, que la app convierte en `fail(..., 400, field)`.
- Produces (fixtures en `tests/conftest.py`): `app` (con `DATABASE`, `UPLOAD_DIR` y `BACKUP_DIR` en `tmp_path`), `client`.

- [ ] **Step 1: Write the failing tests**

```python
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.get_json() == {"ok": True, "message": "", "app": "Modas Andrea"}

def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"

def test_unknown_api_route_is_json_404(client):
    r = client.get("/api/no-existe")
    assert r.status_code == 404
    assert r.get_json()["ok"] is False

def test_validation_error_becomes_400(app, client):
    from server.api_util import ValidationError
    @app.get("/api/_boom")
    def boom():
        raise ValidationError("El precio es obligatorio.", field="price")
    r = client.get("/api/_boom")
    assert r.status_code == 400
    assert r.get_json() == {"ok": False, "message": "El precio es obligatorio.", "field": "price"}
```

- [ ] **Step 2: Run** `pytest tests/test_app.py -v`. Expected: FAIL (`ModuleNotFoundError: server`).
- [ ] **Step 3: Implement** `create_app`, `Config`, `TestConfig` and the `api_util` helpers. Add the security headers of AcuaGest's `security_headers()` (`server/__init__.py`, copied from `app/__init__.py` in `demo-3.0`). The 404, 413 and 500 handlers answer JSON when the route starts with `/api/`. `GET /api/health` returns `ok(app=APP_NAME)` with `APP_NAME="Modas Andrea"`.
- [ ] **Step 4: Run** `pytest tests/test_app.py -v`. Expected: 4 passed.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: esqueleto de la app y configuración"`

---

### Task 2: Base de datos, modelos y migración inicial

**Files:**
- Create: `server/db.py`, `server/models.py`, `alembic.ini`, `server/migrations/env.py`, `server/migrations/versions/0001_inicial.py`
- Test: `tests/test_db.py`

**Interfaces:**
- Produces: `db.session` (sesión por petición, `scoped_session`), `db.init_app(app)`, `db.upgrade(app)` (corre `alembic upgrade head` en código al crear la app), `db.backup_database(app) -> Path | None` (una copia por día con la API de respaldo de SQLite en `BACKUP_DIR/modas-andrea-AAAA-MM-DD.db`; borra las más viejas hasta dejar `BACKUPS_TO_KEEP`).
- Produces (modelos en `server/models.py`, nombres exactos):
  - `User(id, username uq, full_name, password_hash, role in {"admin","seller"}, active bool, created_at)`
  - `LoginFailure(id, username, at)`
  - `Setting(key pk str, value JSON)`
  - `Category(id, name, slug uq, parent_id → Category null, sort int, active bool)`
  - `Product(id, name, description, category_id → Category, online bool=True, active bool=True, created_at, updated_at)`
  - `ProductPhoto(id, product_id → Product, filename, thumb_filename, position int)`
  - `Variant(id, product_id → Product, sku uq, barcode uq null, attrs JSON dict, price_cents int, cost_cents int, stock int=0, hidden bool, active bool)`
  - `StockMovement(id, variant_id → Variant, qty_delta int, reason in {"sale","sale_cancel","purchase","adjustment","import"}, ref_type str null, ref_id str null, user_id → User null, note str, created_at)`
  - `Client(id str uuid pk, name, phone, email, points int=0, notes, created_at)`
  - `Sale(id str uuid pk, folio int uq autoincremental por secuencia propia, user_id, client_id null, subtotal_cents, discount_cents, total_cents, status in {"paid","cancelled"}, note, created_at, cancelled_at null, cancelled_by null)`
  - `SaleItem(id, sale_id, variant_id, qty, unit_price_cents, unit_cost_cents, discount_cents)`
  - `SalePayment(id, sale_id, method in {"cash","card","transfer"}, amount_cents, received_cents null)`
- SQLite: `PRAGMA journal_mode=WAL` y `foreign_keys=ON` en cada conexión. Restricción `CHECK (stock >= 0)` en `variants`.

- [ ] **Step 1: Write the failing tests**

```python
def test_upgrade_creates_tables(app):
    from sqlalchemy import inspect
    from server.db import engine_for
    names = set(inspect(engine_for(app)).get_table_names())
    assert {"users","categories","products","product_photos","variants","stock_movements",
            "clients","sales","sale_items","sale_payments","settings","login_failures"} <= names

def test_wal_mode(app):
    from server.db import engine_for
    with engine_for(app).connect() as c:
        assert c.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"

def test_stock_cannot_go_negative(app):
    import pytest, sqlalchemy
    from server.db import session
    from server.models import Category, Product, Variant
    with app.app_context():
        c = Category(name="Termos", slug="termos"); p = Product(name="Termo", category=c)
        v = Variant(product=p, sku="MA000001", attrs={}, price_cents=100, cost_cents=50, stock=0, hidden=True)
        session.add_all([c, p, v]); session.commit()
        v.stock = -1
        with pytest.raises(sqlalchemy.exc.IntegrityError):
            session.commit()

def test_backup_keeps_limit(app, tmp_path):
    from server.db import backup_database
    import pathlib
    bdir = pathlib.Path(app.config["BACKUP_DIR"]); bdir.mkdir(parents=True, exist_ok=True)
    for d in range(20):
        (bdir / f"modas-andrea-2026-01-{d+1:02d}.db").write_bytes(b"x")
    backup_database(app)
    assert len(list(bdir.glob("modas-andrea-*.db"))) == 15
```

- [ ] **Step 2: Run** `pytest tests/test_db.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `server/db.py`: `engine_for(app)`, `session`, `init_app`, `upgrade` and `backup_database`. In `server/models.py`: the models. Then generate `0001_inicial.py` with `alembic revision --autogenerate`, review it and add the `CHECK`. `create_app` calls `db.init_app(app)` and `db.upgrade(app)`.
- [ ] **Step 4: Run** `pytest tests/test_db.py tests/test_app.py -v`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -am "feat: modelos, migración inicial y respaldos"`

---

### Task 3: Usuarios, sesión y roles

**Files:**
- Create: `server/security.py`, `server/blueprints/auth.py`, `scripts/restablecer_contrasena.py`
- Test: `tests/test_auth.py`

**Interfaces:**
- Consumes: `User`, `LoginFailure`, `session`.
- Produces: `login_required` de Flask-Login (responde 401 JSON en `/api/`); `admin_required(view)` (403 JSON `"Solo el administrador puede hacer esto."`); `ensure_default_users()` (crea `admin`/`admin123` rol `admin` y `vendedor`/`12345` rol `seller` si no hay usuarios; se llama en `create_app`); `seconds_locked(username) -> int` (5 intentos en 15 min → 5 min de bloqueo, guardado en `login_failures`, como DEMO 3.0).
- Produces (rutas): `POST /api/auth/login {username, password, remember?}` → `ok(user={id, username, full_name, role})`; `POST /api/auth/logout`; `GET /api/auth/me`; `GET /api/auth/csrf` → `{token}` para que la app React envíe `X-CSRFToken`.
- Produces (fixtures nuevas en `conftest.py`): `admin` y `seller` (clientes ya autenticados).

- [ ] **Step 1: Write the failing tests**

```python
def test_login_ok(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200 and r.get_json()["user"]["role"] == "admin"

def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "x"})
    assert r.status_code == 401
    assert r.get_json()["message"] == "Usuario o contraseña incorrectos."

def test_lockout_after_5_failures(client):
    for _ in range(5):
        client.post("/api/auth/login", json={"username": "admin", "password": "x"})
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 429
    assert "Intenta de nuevo en" in r.get_json()["message"]

def test_api_requires_login(client):
    assert client.get("/api/auth/me").status_code == 401

def test_inactive_user_cannot_login(app, client):
    from server.db import session; from server.models import User
    with app.app_context():
        u = session.query(User).filter_by(username="vendedor").one(); u.active = False; session.commit()
    r = client.post("/api/auth/login", json={"username": "vendedor", "password": "12345"})
    assert r.status_code == 401
```

- [ ] **Step 2: Run** `pytest tests/test_auth.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the module, adapting `app/security.py` from AcuaGest `demo-3.0` (class `User`, `admin_required`, the lockout persisted in the database). Passwords use `werkzeug.security`. `scripts/restablecer_contrasena.py <usuario> <nueva>` changes a password from the console.
- [ ] **Step 4: Run** `pytest tests/test_auth.py -v`. Expected: 5 passed.
- [ ] **Step 5: Commit** `git commit -am "feat: inicio de sesión, roles y bloqueo por intentos"`

---

### Task 4: Configuración del negocio y categorías

**Files:**
- Create: `server/blueprints/settings.py`, `server/services/catalog.py` (categorías), `server/blueprints/catalog.py` (rutas de categorías)
- Test: `tests/test_settings_categories.py`

**Interfaces:**
- Produces: `GET /api/settings` (cualquiera con sesión) y `PUT /api/settings` (admin) sobre las claves `business_name="Modas Andrea"`, `business_subtitle="Yuda"`, `whatsapp=""`, `address=""`, `ticket_width_mm=58`, `label_size="50x25"`, `low_stock_threshold=2`. Una clave desconocida da 400.
- Produces: `catalog.create_category(name: str, parent_id: int | None) -> Category` (slug único derivado del nombre, sin acentos: `"Útiles"` → `"utiles"`; si se repite, `-2`, `-3`…); `catalog.category_tree() -> list[dict]` con `{id, name, slug, children: [...]}`.
- Produces (rutas): `GET /api/categories` (árbol), `POST /api/categories` (admin), `PATCH /api/categories/<id>` (admin: nombre, padre, orden, activa). No se permite que una categoría sea su propia ancestra (400).

- [ ] **Step 1: Write the failing tests**

```python
def test_default_settings(seller):
    s = seller.get("/api/settings").get_json()["settings"]
    assert s["business_name"] == "Modas Andrea" and s["business_subtitle"] == "Yuda"

def test_seller_cannot_change_settings(seller):
    assert seller.put("/api/settings", json={"whatsapp": "4731234567"}).status_code == 403

def test_category_tree_and_slug(admin):
    hogar = admin.post("/api/categories", json={"name": "Hogar"}).get_json()["category"]
    admin.post("/api/categories", json={"name": "Termos", "parent_id": hogar["id"]})
    u = admin.post("/api/categories", json={"name": "Útiles"}).get_json()["category"]
    assert u["slug"] == "utiles"
    tree = admin.get("/api/categories").get_json()["categories"]
    assert [c["name"] for c in tree] == ["Hogar", "Útiles"]
    assert tree[0]["children"][0]["name"] == "Termos"

def test_category_cycle_rejected(admin):
    a = admin.post("/api/categories", json={"name": "A"}).get_json()["category"]
    b = admin.post("/api/categories", json={"name": "B", "parent_id": a["id"]}).get_json()["category"]
    r = admin.patch(f"/api/categories/{a['id']}", json={"parent_id": b["id"]})
    assert r.status_code == 400
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The default values live in a `DEFAULT_SETTINGS` dict in `server/blueprints/settings.py`. Stored values override them.
- [ ] **Step 4: Run.** Expected: 4 passed.
- [ ] **Step 5: Commit** `git commit -am "feat: configuración del negocio y categorías en árbol"`

---

### Task 5: Productos, variantes, fotos y códigos

**Files:**
- Create: `server/photos.py`, `server/codes.py`; extend `server/services/catalog.py` and `server/blueprints/catalog.py`
- Test: `tests/test_products.py`, `tests/fixtures/` (a 20×20 JPEG with GPS EXIF and a `.txt` renamed to `.jpg`)

**Interfaces:**
- Produces: `photos.save_photo(file_storage, upload_dir: Path) -> tuple[str, str]` (verifica con `Image.verify()`, rechaza lo que no sea JPEG/PNG/WebP/HEIC-convertido, quita EXIF, guarda `<uuid>.webp` a 1600 px y `<uuid>_t.webp` a 400 px; lanza `ValidationError("El archivo no es una foto válida.", field="photos")`).
- Produces: `codes.next_sku() -> str` (`MA` + 6 dígitos, siguiente al mayor existente).
- Produces: `catalog.create_product(data: dict, photos: list[FileStorage], user) -> Product` (todo en una transacción; sin foto → `ValidationError("Agrega al menos una foto del producto.", "photos")`; `data["variants"]` es una lista de `{attrs, price_cents, cost_cents, barcode?}`; si viene vacía se crea una variante oculta con `price_cents`/`cost_cents` del producto). **El stock inicial no se recibe aquí**: va por entradas de inventario (Tarea 6).
- Produces (rutas, admin salvo las GET):
  - `POST /api/products` (multipart: campo `data` JSON + `photos[]`)
  - `GET /api/products?q=&category=&online=&page=` (cada producto lleva `variants[]`, `photos[]` con URLs `/uploads/<archivo>`, `stock_total`)
  - `GET /api/products/<id>`
  - `PATCH /api/products/<id>` (nombre, descripción, categoría, `online`, `active`)
  - `POST /api/products/<id>/photos`, `DELETE /api/products/<id>/photos/<photo_id>` (no deja borrar la última: 400)
  - `PATCH /api/variants/<id>` (precio, costo, atributos, `barcode`; un código repetido da 409 `"Ese código ya pertenece a otro producto."`)
  - `GET /api/variants/lookup?code=` busca por `sku` o `barcode` → `{variant, product}`; sin resultado → 404 `"No encontramos ningún producto con ese código."`
  - `GET /uploads/<archivo>` sirve las fotos (requiere sesión; la tienda pública de la etapa 6 publica sus propias copias)

- [ ] **Step 1: Write the failing tests**

```python
import io, json
def _post(admin, data, photos):
    return admin.post("/api/products", data={"data": json.dumps(data), "photos": photos},
                      content_type="multipart/form-data")

def test_create_product_with_variants(admin, cat_id, jpeg):
    r = _post(admin, {"name": "Termo acero", "category_id": cat_id, "variants": [
        {"attrs": {"Color": "Azul", "Capacidad": "1 L"}, "price_cents": 39000, "cost_cents": 21000},
        {"attrs": {"Color": "Rosa", "Capacidad": "1 L"}, "price_cents": 39000, "cost_cents": 21000}]},
        [(jpeg(), "a.jpg")])
    assert r.status_code == 201
    p = r.get_json()["product"]
    assert [v["sku"] for v in p["variants"]] == ["MA000001", "MA000002"]
    assert all(v["stock"] == 0 for v in p["variants"]) and p["online"] is True

def test_product_requires_photo(admin, cat_id):
    r = _post(admin, {"name": "Sin foto", "category_id": cat_id, "price_cents": 100, "cost_cents": 50}, [])
    assert r.status_code == 400 and r.get_json()["field"] == "photos"
    assert admin.get("/api/products").get_json()["products"] == []

def test_fake_image_rejected_and_nothing_saved(admin, cat_id, app):
    r = _post(admin, {"name": "X", "category_id": cat_id, "price_cents": 1, "cost_cents": 1},
              [(io.BytesIO(b"no soy foto"), "x.jpg")])
    assert r.status_code == 400
    import os; assert os.listdir(app.config["UPLOAD_DIR"]) == []

def test_exif_removed(admin, cat_id, jpeg_with_gps, app):
    _post(admin, {"name": "Y", "category_id": cat_id, "price_cents": 1, "cost_cents": 1}, [(jpeg_with_gps(), "g.jpg")])
    from PIL import Image; import pathlib
    f = next(pathlib.Path(app.config["UPLOAD_DIR"]).glob("*[!t].webp"))
    assert not Image.open(f).getexif()

def test_lookup_by_sku_and_barcode(admin, product):
    v = product["variants"][0]
    admin.patch(f"/api/variants/{v['id']}", json={"barcode": "7501234567890"})
    assert admin.get("/api/variants/lookup?code=7501234567890").get_json()["variant"]["sku"] == v["sku"]
    assert admin.get(f"/api/variants/lookup?code={v['sku']}").status_code == 200
    r = admin.get("/api/variants/lookup?code=000")
    assert r.status_code == 404 and r.get_json()["message"] == "No encontramos ningún producto con ese código."

def test_duplicate_barcode(admin, product, product2):
    admin.patch(f"/api/variants/{product['variants'][0]['id']}", json={"barcode": "123"})
    r = admin.patch(f"/api/variants/{product2['variants'][0]['id']}", json={"barcode": "123"})
    assert r.status_code == 409

def test_cannot_delete_last_photo(admin, product):
    ph = product["photos"][0]["id"]
    assert admin.delete(f"/api/products/{product['id']}/photos/{ph}").status_code == 400

def test_seller_cannot_create(seller, cat_id, jpeg):
    assert _post(seller, {"name": "Z", "category_id": cat_id, "price_cents": 1, "cost_cents": 1}, [(jpeg(), "a.jpg")]).status_code == 403
```

(Fixtures `cat_id`, `jpeg`, `jpeg_with_gps`, `product`, `product2` go in `conftest.py`, built with the API itself.)

- [ ] **Step 2: Run** `pytest tests/test_products.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** If saving fails halfway, delete the files already written (`try/except` around the transaction).
- [ ] **Step 4: Run.** Expected: 8 passed.
- [ ] **Step 5: Commit** `git commit -am "feat: productos con variantes, fotos y códigos"`

---

### Task 6: Inventario con bitácora

**Files:**
- Create: `server/services/inventory.py`, `server/blueprints/inventory.py`
- Test: `tests/test_inventory.py`

**Interfaces:**
- Produces: `inventory.move(variant_id: int, qty_delta: int, reason: str, user_id: int | None, note: str = "", ref_type: str | None = None, ref_id: str | None = None) -> StockMovement`. Aplica el cambio con `UPDATE variants SET stock = stock + :d WHERE id = :id AND stock + :d >= 0`. Si no se afectó ninguna fila, lanza `InsufficientStock(variant_id, available)`. **No hace commit**: lo hace quien llama, para que una venta sea una sola transacción.
- Produces (rutas):
  - `POST /api/inventory/entries` (admin): `{items: [{variant_id, qty>0, cost_cents?}], note}`, razón `purchase`. Si trae `cost_cents`, actualiza el costo de la variante.
  - `POST /api/inventory/adjustments` (admin): `{variant_id, new_stock>=0, note obligatoria}` → movimiento `adjustment` con la diferencia.
  - `GET /api/inventory/movements?variant_id=&page=`
  - `GET /api/inventory/low-stock` → variantes activas con `stock <= low_stock_threshold`.

- [ ] **Step 1: Write the failing tests**

```python
def test_entry_increases_stock_and_logs(admin, product):
    v = product["variants"][0]["id"]
    admin.post("/api/inventory/entries", json={"items": [{"variant_id": v, "qty": 5}], "note": "Compra"})
    mv = admin.get(f"/api/inventory/movements?variant_id={v}").get_json()["movements"]
    assert mv[0]["qty_delta"] == 5 and mv[0]["reason"] == "purchase"
    assert admin.get(f"/api/products/{product['id']}").get_json()["product"]["variants"][0]["stock"] == 5

def test_adjustment_requires_note_and_sets_exact_stock(admin, stocked_variant):
    assert admin.post("/api/inventory/adjustments", json={"variant_id": stocked_variant, "new_stock": 2}).status_code == 400
    admin.post("/api/inventory/adjustments", json={"variant_id": stocked_variant, "new_stock": 2, "note": "Conteo"})
    mv = admin.get(f"/api/inventory/movements?variant_id={stocked_variant}").get_json()["movements"][0]
    assert mv["qty_delta"] == -3 and mv["reason"] == "adjustment"

def test_low_stock(admin, stocked_variant):
    admin.post("/api/inventory/adjustments", json={"variant_id": stocked_variant, "new_stock": 2, "note": "x"})
    ids = [v["id"] for v in admin.get("/api/inventory/low-stock").get_json()["variants"]]
    assert stocked_variant in ids

def test_move_never_negative(app, stocked_variant):
    import pytest
    from server.services.inventory import move, InsufficientStock
    with app.app_context(), pytest.raises(InsufficientStock):
        move(stocked_variant, -6, "adjustment", None)
```

(`stocked_variant` = the id of a variant with 5 pieces.)

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: 4 passed.
- [ ] **Step 5: Commit** `git commit -am "feat: entradas, ajustes y bitácora de inventario"`

---

### Task 7: Ventas con carrito y pagos

**Files:**
- Create: `server/services/sales.py`, `server/blueprints/sales.py`
- Test: `tests/test_sales.py`

**Interfaces:**
- Consumes: `inventory.move`, `InsufficientStock`, `Client`.
- Produces: `sales.create_sale(payload: dict, user) -> Sale`. El `payload` trae:
  - `id?` (UUID del dispositivo; si ya existe, se devuelve la misma venta sin repetirla);
  - `items: [{variant_id, qty>0, discount_cents?}]`;
  - `discount_cents?` (descuento general);
  - `client_id?`, `note?`;
  - `payments: [{method, amount_cents, received_cents?}]`.

  Reglas:
  - precio y costo se toman de la variante en ese momento;
  - descuento total ≤ `SELLER_MAX_DISCOUNT_PCT` % del subtotal si el rol es `seller`; si no, 403 `"Ese descuento necesita autorización del administrador."`;
  - suma de pagos == total; si no, 400 `"Los pagos no cuadran con el total."`;
  - en efectivo, `received_cents >= amount_cents`, y el cambio = `received - amount`;
  - todo en una transacción: movimientos `sale`, folio y puntos (`total_cents // (POINTS_PER_PESOS*100)`).

  Sin stock → 409 con `{"message": "No hay suficientes piezas de <nombre> (<atributos>). Quedan <n>.", "variant_id"}`.
- Produces: `sales.cancel_sale(sale_id, user, reason: str) -> Sale` (solo admin). Pone `status="cancelled"`, regresa el stock con movimientos `sale_cancel`, resta los puntos y **no borra** la venta. Cancelar dos veces da 409.
- Produces (rutas): `POST /api/sales` → 201 `{sale: {id, folio, items, payments, total_cents, change_cents}}`; `GET /api/sales?date=AAAA-MM-DD`; `GET /api/sales/<id>`; `POST /api/sales/<id>/cancel {reason}`.

- [ ] **Step 1: Write the failing tests**

```python
def test_sale_two_items_cash_change(seller, v1, v2):   # v1: $350, stock 3 ; v2: $190, stock 4
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}, {"variant_id": v2, "qty": 2}],
        "payments": [{"method": "cash", "amount_cents": 73000, "received_cents": 100000}]})
    assert r.status_code == 201
    s = r.get_json()["sale"]
    assert s["total_cents"] == 73000 and s["change_cents"] == 27000 and s["folio"] == 1

def test_mixed_payment_must_match(seller, v1):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}],
        "payments": [{"method": "card", "amount_cents": 20000}, {"method": "cash", "amount_cents": 10000, "received_cents": 10000}]})
    assert r.status_code == 400 and r.get_json()["message"] == "Los pagos no cuadran con el total."

def test_insufficient_stock_409_and_nothing_changes(seller, admin, v1):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 4}],
        "payments": [{"method": "cash", "amount_cents": 140000, "received_cents": 140000}]})
    assert r.status_code == 409 and "Quedan 3" in r.get_json()["message"]
    assert admin.get("/api/sales").get_json()["sales"] == []

def test_seller_discount_cap(seller, v1):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "discount_cents": 3600,
        "payments": [{"method": "card", "amount_cents": 31400}]})
    assert r.status_code == 403
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "discount_cents": 3500,
        "payments": [{"method": "card", "amount_cents": 31500}]})
    assert r.status_code == 201

def test_cost_snapshot(admin, seller, v1):
    sid = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}],
        "payments": [{"method": "transfer", "amount_cents": 35000}]}).get_json()["sale"]["id"]
    admin.patch(f"/api/variants/{v1}", json={"cost_cents": 99900})
    assert admin.get(f"/api/sales/{sid}").get_json()["sale"]["items"][0]["unit_cost_cents"] == 20000

def test_same_id_not_duplicated(seller, v1):
    body = {"id": "3f1c2a1e-0000-4000-8000-000000000001", "items": [{"variant_id": v1, "qty": 1}],
            "payments": [{"method": "card", "amount_cents": 35000}]}
    a = seller.post("/api/sales", json=body).get_json()["sale"]; b = seller.post("/api/sales", json=body).get_json()["sale"]
    assert a["folio"] == b["folio"]

def test_cancel_returns_stock_once(admin, seller, v1):
    sid = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 2}],
        "payments": [{"method": "card", "amount_cents": 70000}]}).get_json()["sale"]["id"]
    assert seller.post(f"/api/sales/{sid}/cancel", json={"reason": "x"}).status_code == 403
    assert admin.post(f"/api/sales/{sid}/cancel", json={"reason": "Cliente devolvió"}).status_code == 200
    assert admin.post(f"/api/sales/{sid}/cancel", json={"reason": "otra vez"}).status_code == 409
    assert admin.get(f"/api/variants/lookup?code=MA000001").get_json()["variant"]["stock"] == 3

def test_last_piece_concurrent(app, v_one_left, seller_user):
    """Dos ventas simultáneas de la última pieza: solo una pasa."""
    import threading
    from server.services.sales import create_sale
    results = []
    def go():
        with app.app_context():
            try:
                create_sale({"items": [{"variant_id": v_one_left, "qty": 1}],
                             "payments": [{"method": "card", "amount_cents": 35000}]}, seller_user); results.append("ok")
            except Exception as e:
                results.append(type(e).__name__)
    ts = [threading.Thread(target=go) for _ in range(2)]; [t.start() for t in ts]; [t.join() for t in ts]
    assert sorted(results) == ["InsufficientStock", "ok"]
```

(`v1`: variant at $350, cost $200, stock 3, sku `MA000001`. `v2`: $190, stock 4. `v_one_left`: stock 1.)

- [ ] **Step 2: Run** `pytest tests/test_sales.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** The folio comes from `MAX(folio)+1` inside the same transaction. Under SQLite, open the transaction with `BEGIN IMMEDIATE` (a SQLAlchemy `begin` event) so concurrent sales are serialized.
- [ ] **Step 4: Run.** Expected: 8 passed.
- [ ] **Step 5: Commit** `git commit -am "feat: ventas con carrito, pagos mixtos y cancelación"`

---

### Task 8: Importar datos de prueba y migrar el sistema anterior

**Files:**
- Create: `scripts/importar_datos_prueba.py`, `scripts/migrar_sistema_anterior.py`
- Test: `tests/test_import.py`

**Interfaces:**
- Consumes: `catalog.create_category`, `catalog.create_product`, `inventory.move`.
- Produces: `importar_datos_prueba.run(app, carpeta: Path = Path("datos_prueba")) -> dict`. Lee `productos.json`, crea las categorías por departamento (Mochilas, Termos, Cobijas, Relojes, Útiles), un producto por registro con su foto, precio en centavos (`price * 100`), costo = 55 % del precio redondeado a peso, y una entrada de inventario `import` con el stock. Usa el `code` del JSON como SKU. Es **idempotente**: si el SKU ya existe, lo salta. Devuelve `{"creados": n, "omitidos": m}`.
- Produces: `migrar_sistema_anterior.run(app, ruta_db: Path) -> dict`. Lee la tabla `products` y `product_images` de `bazarges_data.db`, que vive junto a `static/uploads/`. Mapea `category` texto a categorías bajo "Escolar › Mochilas" y "Escolar › Útiles", toma el stock como entrada `import`, y si `custom_id` (por ejemplo `MOD001`) no tiene formato `MA`, lo guarda como `barcode`. No importa `users`. Las ventas y apartados viejos se reportan en el resultado (`{"ventas_omitidas": n, "apartados_omitidos": m}`) para pasarlos en la etapa 3.

- [ ] **Step 1: Write the failing tests**

```python
def test_import_test_data_twice(app, repo_root):
    from scripts.importar_datos_prueba import run
    a = run(app, repo_root / "datos_prueba"); b = run(app, repo_root / "datos_prueba")
    assert a == {"creados": 58, "omitidos": 0} and b == {"creados": 0, "omitidos": 58}

def test_imported_stock_and_price(app, admin, repo_root):
    from scripts.importar_datos_prueba import run
    run(app, repo_root / "datos_prueba")
    d = admin.get("/api/variants/lookup?code=MA000002").get_json()
    assert d["product"]["name"] == "Mario Bros" and d["variant"]["price_cents"] == 32000 and d["variant"]["stock"] == 2

def test_migrate_legacy(app, admin, legacy_db):   # copia mínima de bazarges_data.db en tests/fixtures/
    from scripts.migrar_sistema_anterior import run
    r = run(app, legacy_db)
    assert r["productos"] == 3
    assert admin.get("/api/variants/lookup?code=MOD001").get_json()["product"]["name"] == "PRINCESAS DISNEY"
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Both scripts also run from the console: `python -m scripts.importar_datos_prueba` and `python -m scripts.migrar_sistema_anterior <ruta>`. Add `tests/fixtures/legacy.db`: a copy of `bazarges_data.db` with the 3 products and their 6 photos, without users.
- [ ] **Step 4: Run.** Expected: 3 passed.
- [ ] **Step 5: Commit** `git commit -am "feat: importar datos de prueba y migrar el sistema anterior"`

---

### Task 9: Arranque e instalador para Windows

**Files:**
- Create: `run.py`, `instalar.bat`, `aplicacion.bat`, `restablecer_contrasena.bat`, `LEEME.md`
- Test: `tests/test_run.py`

**Interfaces:**
- Consumes: `create_app`, `backup_database`.
- Produces: `run.py` with `local_ip() -> str` and `port_in_use(port) -> bool`, copied from AcuaGest `demo-3.0` (`run.py`). Flags: `--dev` and `--no-browser`. On start it makes the daily backup, prints "En esta computadora" and "En la red local" and opens the browser. The `--internet` flag (Cloudflare tunnel) arrives in stage 4.
- Produces: `instalar.bat` adapted from AcuaGest `demo-3.0`:
  - finds or installs Python 3.12 with `winget`;
  - creates `.venv` and installs `requirements.txt`;
  - writes `.env` with a random `SECRET_KEY`;
  - creates the shortcut **"Modas Andrea"** on the desktop;
  - offers to load the test data.
- `aplicacion.bat` runs `.venv\Scripts\python.exe run.py`. `restablecer_contrasena.bat` calls the script from Task 3.

- [ ] **Step 1: Write the failing tests**

```python
def test_local_ip_format():
    import run, ipaddress
    ipaddress.ip_address(run.local_ip())

def test_port_in_use_detects_open_socket():
    import run, socket
    s = socket.socket(); s.bind(("127.0.0.1", 0)); s.listen(); port = s.getsockname()[1]
    try: assert run.port_in_use(port) is True
    finally: s.close()
```

- [ ] **Step 2: Run** `pytest tests/test_run.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** `LEEME.md` explains installing, opening, the initial users, loading the test data and backups. Follow the style of AcuaGest's `LEEME.md`.
- [ ] **Step 4: Run** `pytest -q`. Expected: whole suite passes.
- [ ] **Step 5: Manual smoke test (Linux)**:
  1. `python run.py --no-browser &`
  2. `curl -s localhost:5000/api/health`: answers `{"ok": true, …}`.
  3. A login with `curl -c` plus `GET /api/products` lists the 58 products after running the importer.
- [ ] **Step 6: Commit** `git commit -am "feat: arranque con Waitress e instalador para Windows"`
