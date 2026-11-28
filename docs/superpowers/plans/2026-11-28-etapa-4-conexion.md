# Etapa 4 · Conexión y sin señal · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que todos los dispositivos se conecten con un solo enlace (QR o WhatsApp), vean el stock en vivo y sigan vendiendo si se va el internet un rato, con envío automático al volver la señal, sin duplicados y con la hora real.

**Architecture:**
- **Servidor:**
  - módulo `server/offline.py`, adaptado de AcuaGest DEMO 3.0 (`app/offline.py`): encabezados `X-Client-Uid`, `X-Client-Time` y `X-Offline`, tabla `offline_ops` que repite la respuesta guardada y bitácora `audit_log`;
  - endpoint de versión de stock para la consulta cada ~3 s;
  - túnel Cloudflare (`server/tunnel.py`, copiado de AcuaGest);
  - pantalla de conexión con QR.
- **Navegador:**
  - service worker propio (`web/public/sw.js`) con la app guardada;
  - catálogo, clientes y configuración guardados en IndexedDB;
  - cola de acciones (`web/src/offline/queue.ts`), igual que `offline.js` de AcuaGest pero en TypeScript;
  - indicador "Sin señal" y hoja de pendientes.

**Tech Stack:** el actual, más `qrcode==8.2` en Python. IndexedDB se usa directo con un envoltorio mínimo propio, sin librería nueva. Para las pruebas de la cola en Vitest se usa `fake-indexeddb` (solo desarrollo).

**Spec:** `docs/superpowers/specs/2026-11-27-modas-andrea-design.md`, secciones 7.3 (stock en vivo), 8.11 (venta sin conexión y un solo enlace) y 9 (conectar dispositivo y túnel).

## Global Constraints

- **Acciones permitidas sin señal** (spec 8.11):
  - venta (`POST /api/sales`);
  - crear apartado (`POST /api/layaways`);
  - abono (`POST /api/layaways/<id>/payments`);
  - alta de cliente (`POST /api/clients`).

  Todo lo demás requiere conexión y la pantalla lo dice: *"Necesitas conexión para hacer esto."*
- Cada acción en cola lleva un `X-Client-Uid` único y la hora real `X-Client-Time` (ISO local). El servidor usa esa hora como `created_at` si está dentro de los **7 días** anteriores y no más de **10 minutos** en el futuro; si no, usa la hora del servidor (regla de AcuaGest).
- Los ids de las entidades (venta, apartado, cliente, abono) los genera el dispositivo (UUID), así que una venta a un cliente dado de alta sin señal se enlaza bien.
- **Stock con ventas sin señal:**
  - una venta que llega con `X-Offline: 1` **se acepta aunque deje el stock negativo**;
  - se crea una alerta `stock_alerts` para el administrador;
  - con conexión, la regla de la etapa 1 sigue igual (409);
  - la restricción `CHECK (stock >= 0)` se cambia por la validación en `inventory.move(..., allow_negative=False)`.
- **En el dispositivo, sin señal:**
  - el stock mostrado = último stock visto − piezas de las ventas pendientes, con la leyenda "visto hace X min · sin señal";
  - con 2 piezas o menos pide confirmar: *"Sin señal: verifica que tengas la pieza en mano."*
- Nada se borra de la cola hasta que el servidor confirma (2xx). Un 4xx que no sea 401/409 se marca **"con problema"** para revisarlo a mano (reintentar o descartar con motivo). Un 5xx o un error de red se reintenta con espera creciente.
- La cola es **por usuario**: con otro usuario en el mismo dispositivo, sus pendientes no se envían a nombre de otro. Cerrar sesión con pendientes pide confirmar.
- **Enlace:** se toma `PUBLIC_URL` de `.env` (dominio fijo, más adelante); si no, el del túnel temporal si `acceso_remoto.bat` está activo; si no, la IP de la red local.
- **El modo sin señal solo funciona en HTTPS o en `127.0.0.1`.** La pantalla de conexión avisa cuando el enlace es `http://192.168…`: *"Por este enlace no se guardan ventas sin señal."*

## Review Focus

1. **La misma venta enviada dos veces** (reintento tras corte a medio envío): se registra una sola vez y la respuesta repetida trae el mismo folio. → Tareas 2 y 5.
2. **Venta sin señal de la última pieza mientras otro dispositivo también la vendió:** se acepta, el stock queda en −1 y aparece una alerta; con conexión sigue el 409. → Tarea 2.
3. **Hora del dispositivo desfasada** (días atrás o en el futuro): se usa la hora del servidor y no aparecen ventas en otro día del corte. → Tarea 2.
4. **Pendientes de otro usuario en el mismo celular:** no se envían con la sesión actual. Cerrar sesión con pendientes avisa. → Tarea 5.
5. **Venta sin señal a un cliente creado sin señal:** al sincronizar, el cliente se crea antes que la venta (orden de la cola) y quedan enlazados. → Tarea 5.

---

### Task 1: Migración 0003: alertas de stock, operaciones sin señal y bitácora

**Files:** `server/models.py`, `server/migrations/versions/0003_conexion.py`, `server/services/inventory.py`; Test `tests/test_db.py`, `tests/test_inventory.py`.

**Interfaces (Produces):**
- `OfflineOp(uid pk, user_id, endpoint, status in {"processing","done"}, response text, http_status, client_time, received_at, offline bool)`.
- `AuditLog(id, at, user_id, action, entity_id, detail, offline bool, client_time)`.
- `StockAlert(id, variant_id, stock_after int, ref_type, ref_id, created_at, reviewed_by null, reviewed_at null)`.
- Se quita `ck_variants_stock` (en modo batch).
- `inventory.move(..., allow_negative: bool = False)`: con `True` aplica el cambio aunque el stock quede < 0 y crea una `StockAlert` si queda negativo.

**Tests:**
- `test_connection_tables`;
- `test_move_negative_only_when_allowed` (sin permiso lanza `InsufficientStock`; con permiso, stock −1 y 1 alerta);
- `test_upgrade_from_0002_keeps_data`.

- [ ] Steps: test → FAIL → implementar → PASS → commit `feat: migración 0003 (alertas de stock, operaciones sin señal y bitácora)`.

---

### Task 2: Acciones sin señal en el servidor (patrón AcuaGest `offline.py`)

**Files:** `server/offline.py` (adaptado de AcuaGest `demo-3.0/app/offline.py`), `server/__init__.py`, `server/services/sales.py`, `layaways.py`, `clients.py`; Test `tests/test_offline.py`.

**Interfaces (Produces):**
- `offline.init_app(app)` registra `before_request`/`after_request` solo para los 4 endpoints permitidos (`sales.create`, `layaways.create`, `layaways.payment`, `clients.create`):
  - un `uid` repetido con `status=done` devuelve la respuesta guardada con `X-Replayed: 1`;
  - un `uid` en `processing` devuelve 409 *"Esta acción se está procesando; se reintentará."*;
  - una respuesta 2xx se guarda;
  - un error de negocio libera el `uid`.
- `offline.event_time() -> datetime`: la hora del cliente validada, o `now()`. Ventas, apartados, abonos y clientes la usan como `created_at`.
- `offline.is_offline() -> bool` (encabezado `X-Offline: 1`). `sales.create_sale` lo pasa a `move(..., allow_negative=True)`.
- `AUDITED`: acciones con nombre en español (venta, cancelación, devolución, apartado, abono, liquidación, cancelación de apartado, gasto, ajuste, entrada, corte, alta de producto y cambio de precio). Se escriben en `audit_log` con `offline` y `client_time`.
- Rutas nuevas:
  - `GET /api/audit?page=` (admin);
  - `GET /api/stock-alerts` y `POST /api/stock-alerts/<id>/review` (admin).

**Tests:**
- `test_same_uid_replays_same_sale` (2 POST con el mismo uid → mismo folio, 1 venta, `X-Replayed`);
- `test_client_time_used_when_recent`;
- `test_client_time_ignored_when_older_than_7_days_or_future`;
- `test_offline_sale_last_piece_goes_negative_and_alerts`;
- `test_online_sale_still_409`;
- `test_audit_records_offline_flag`;
- `test_business_error_releases_uid` (400 y después el mismo uid con datos buenos → 201);
- `test_seller_cannot_read_audit`.

- [ ] Steps: test → FAIL → implementar → PASS → commit `feat: acciones sin señal en el servidor sin duplicados y con hora real`.

---

### Task 3: Stock en vivo

**Files:** `server/services/catalog.py` (versión de stock), `server/blueprints/catalog.py`; `web/src/lib/liveStock.ts`, `web/src/pos/PosPage.tsx`; Tests `tests/test_live_stock.py`, `web/e2e/live-stock.spec.ts`.

**Interfaces (Produces):**
- `GET /api/stock/changes?since=<n>` → `{version, changes:[{variant_id, stock}]}`:
  - `version` = último id de `stock_movements`;
  - `changes` = stock actual de las variantes con movimientos mayores que `since` (máximo 500);
  - con `since` viejo o vacío → `{version, full: true}`, y el cliente recarga los productos.
- `useLiveStock()`: consulta cada **3 s** con la pestaña visible (y una vez justo después de cada acción propia) y actualiza en caché `products` y el stock de los renglones del carrito (`refreshStock`). Sin señal deja de consultar.

**Tests:**
- pytest `test_changes_since_returns_only_moved_variants`;
- e2e `test("venta en otra pestaña se ve en la primera en menos de 5 s")`: dos páginas; la página B vende y la tarjeta en A pasa a "Quedan N−1".

- [ ] Steps: test → FAIL → implementar → PASS → commit `feat: stock en vivo en todos los dispositivos`.

---

### Task 4: App instalable y guardada en el dispositivo (PWA)

**Files:** `web/public/manifest.webmanifest`, `web/public/sw.js`, íconos `web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (a partir del logo); `web/src/main.tsx` (registro); `web/src/offline/cache.ts` (IndexedDB: `products`, `categories`, `clients` recientes, `settings`, `me`); Test `web/e2e/pwa.spec.ts`.

**Interfaces (Produces):**
- `sw.js` (como el de AcuaGest):
  - precarga el `index.html` y los `assets/*` del build (lista inyectada al compilar con un pequeño plugin de Vite);
  - las navegaciones se sirven de red y, sin red, de la copia;
  - `/uploads/*_t.webp` (miniaturas) con *stale-while-revalidate*;
  - `/api/*` nunca pasa por el service worker.
- `cache.ts`:
  - `saveCatalog(products)`, `loadCatalog()`, `saveClients(list)`, `searchClientsOffline(q)`, `saveMe(user)` y `loadMe()`;
  - `AuthProvider` usa `loadMe()` cuando `/api/auth/me` falla por red, para no sacar al usuario al quedarse sin señal.

**Tests (e2e con `context.setOffline(true)`):**
- `test("sin señal la app abre y muestra el catálogo guardado")`;
- `test("sin señal la sesión no se pierde")`.

- [ ] Steps: test → FAIL → implementar → PASS → commit `feat: app instalable que abre sin señal`.

---

### Task 5: Cola de acciones sin señal

**Files:** `web/src/offline/queue.ts`, `web/src/offline/OfflineProvider.tsx`, `web/src/offline/PendingSheet.tsx`; Modify `web/src/lib/api.ts` (headers `X-Client-Uid`/`X-Client-Time` en las 4 acciones), `PosPage`, `NewLayawaySheet`, `LayawayDetail` (abono), `ClientPicker`, `AppShell` (indicador), `AuthProvider` (aviso al salir); Tests `web/src/offline/queue.test.ts`, `web/e2e/offline.spec.ts`.

**Interfaces (Produces):**
- `queue.enqueue({user, label, method, path, json, uid, clientTime})` guarda en IndexedDB (`ma-offline`, store `queue`, orden por `seq`).
- `queue.flush(user)`:
  - envía en orden, solo los del usuario actual, con `X-Offline: 1`;
  - 2xx → borra;
  - 401 → detiene sin borrar;
  - 409 "procesando" → reintenta después;
  - otro 4xx → `status:"problem"` con el mensaje;
  - red o 5xx → espera creciente (5 s, 15 s, 60 s).
- `queue.pending(user)`, `queue.discard(uid, reason)` y `queue.retry(uid)`.
- `useOffline() → {online, pendingCount, problems, flush}`. `online` combina `navigator.onLine` con la respuesta de `/api/health` cada 10 s.
- **Ventas sin señal en el punto de venta:**
  - `confirm()` intenta en línea; con un error de red encola y muestra *"Venta guardada en este dispositivo. Se enviará al volver la señal."*, con folio provisional `P-<4 dígitos>`;
  - el stock mostrado descuenta las piezas pendientes;
  - con 2 piezas o menos pide confirmar.
- Lo mismo para apartados, abonos y clientes, con su mensaje.
- **Indicador:**
  - píldora "Sin señal" en vino;
  - nube con número de pendientes, que abre `PendingSheet` (lista, "Enviar ahora", reintentar o descartar con motivo);
  - toast *"Volvió la señal. Enviando N pendientes…"* y *"Todo enviado."*.

**Tests:**
- Vitest con `fake-indexeddb`:
  - `queue keeps order and per-user isolation`;
  - `flush deletes only on 2xx`;
  - `4xx marks problem`;
  - `network error backs off`.
- e2e:
  - `test("sin señal: vender, ver pendiente y enviarse solo al volver")`: `setOffline(true)` → venta → "1 pendiente" → `setOffline(false)` → "Todo enviado." → `/api/sales` tiene la venta con su hora;
  - `test("cliente y venta creados sin señal quedan enlazados")`;
  - `test("cortar la red a la mitad del envío no duplica")`: `page.route` aborta la primera respuesta después de que el servidor la procesó y el reintento recibe `X-Replayed`;
  - `test("salir con pendientes pide confirmar")`.

- [ ] Steps: test → FAIL → implementar → PASS → commit `feat: cola de ventas, apartados, abonos y clientes sin señal`.

---

### Task 6: Túnel Cloudflare y pantalla "Conectar dispositivo"

**Files:**
- `server/tunnel.py` (copiado de AcuaGest `demo-3.0/app/tunnel.py`);
- `run.py` (`--internet`, igual que AcuaGest);
- `acceso_remoto.bat`;
- `server/blueprints/connect.py`;
- `web/src/admin/ConnectPage.tsx` (y el elemento de menú "Conectar dispositivo", admin);
- `requirements.txt` (+ `qrcode==8.2`);
- `server/config.py` (`PUBLIC_URL`, `CLOUDFLARE_TUNNEL_TOKEN`, `BLOCK_DEFAULT_PASSWORDS_REMOTE=true`);
- `.env.example`.

Tests: `tests/test_connect.py`, `tests/test_tunnel.py` (`handle_line` sin red, igual que en AcuaGest) y `web/e2e/connect.spec.ts`.

**Interfaces (Produces):**
- `GET /api/connect` (admin) → `{url, kind:"fixed"|"tunnel"|"lan", offline_capable: bool, lan_url}`.
- `GET /api/connect/qr.svg` (admin) devuelve el QR del `url` en SVG.
- Middleware del túnel (como `CloudflareTunnelMiddleware` de AcuaGest): usa la IP real del visitante para el bloqueo por intentos y marca la cookie como `Secure` por HTTPS.
- Por internet, las contraseñas iniciales (`admin123`, `12345`) se rechazan con *"Cambia la contraseña inicial desde la computadora del negocio antes de entrar por internet."*. Por eso esta tarea agrega `POST /api/auth/password` (cambiar la contraseña propia) y su formulario en "Mi cuenta" (menú de usuario).
- **Pantalla "Conectar dispositivo":**
  - el QR grande;
  - el enlace con "Copiar" y "Enviar por WhatsApp" (`https://wa.me/?text=…`);
  - el aviso cuando el enlace es de red local (sin modo sin señal) o temporal (cambia en cada arranque);
  - los pasos para instalar la app en Android y iPhone.

**Tests:**
- `test_connect_prefers_public_url_then_tunnel_then_lan`;
- `test_qr_svg`;
- `test_default_password_blocked_over_tunnel`;
- `test_change_own_password`;
- `test_tunnel_handle_line_extracts_quick_url`;
- e2e `test("conectar dispositivo muestra QR y enlace de WhatsApp")`.

- [ ] Steps: test → FAIL → implementar → PASS → commit `feat: túnel Cloudflare, cambio de contraseña y pantalla Conectar dispositivo`.

---

### Task 7: Alertas, bitácora en pantalla, compilado y guía

**Files:**
- `web/src/admin/AlertsPanel.tsx`: en el Panel, "Stock negativo por ventas sin señal" con "Marcar como revisada";
- `web/src/admin/AuditPage.tsx`: `/bitacora` (admin);
- `server/web_dist/`;
- `LEEME.md`: secciones "Conectar dispositivos", "Si se va el internet" y "Acceso desde internet", con capturas.

**Tests:**
- e2e `test("alerta de stock negativo aparece en el Panel y se marca revisada")`;
- e2e `test("bitácora muestra la venta hecha sin señal")`;
- axe con `/bitacora` y `/conectar` agregados.

- [ ] Steps: test → FAIL → implementar → PASS (las 3 suites) → commit `feat: alertas de stock, bitácora y guía de conexión`.
