# Etapa 2 · Interfaz · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La app que usan vendedores y administrador en celular, tablet y PC: inicio de sesión, punto de venta con carrito y cobro, inventario, alta de producto con fotos guiadas por cámara, categorías, configuración y ventas del día. Diseño Revista con animaciones.

**Architecture:** SPA en React + TypeScript (Vite) dentro de `web/`. Consume la API de la etapa 1 (`/api/...`, misma sesión por cookie, CSRF por encabezado `X-CSRFToken`). `npm run build` deja la app compilada en `server/web_dist/`, que **se guarda en git** y que Flask sirve en `/`: la PC de la tienda no necesita Node. La lógica sin DOM (dinero, carrito, pagos, compresión de fotos) vive en módulos puros con pruebas Vitest. Los flujos completos se prueban con Playwright contra el servidor real.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind CSS 4, componentes accesibles propios sobre Radix (estilo shadcn/ui), Motion (animaciones), TanStack Query, React Router 7, cmdk (Ctrl+K), @fontsource (Instrument Serif, Hanken Grotesk), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-27-modas-andrea-design.md` (secciones 7.2, 8.1–8.6, 8.9, 8.10 y 8.13). Referencia visual: `prototipos/tienda/index.html` (diseño "Revista" elegido por el dueño).

## Global Constraints

- Todo el texto en pantalla va en **español de México**, con tono claro y directo. Los botones dicen lo que hacen ("Cobrar", "Guardar producto").
- **Dinero:** en el código siempre en centavos enteros (`number` entero). En pantalla se muestra con `Intl.NumberFormat("es-MX", {style: "currency", currency: "MXN"})` (por ejemplo `$1,234.00`). El usuario escribe pesos y se convierten a centavos sin `parseFloat`.
- **Estilo Revista, igual que el prototipo:**
  - fondo `#FFFFFF`;
  - superficie `#F4F3F1`;
  - tinta `#17140F`;
  - gris `#6B665E`;
  - línea `#E6E2DB`;
  - acento vino `#7B1D33`;
  - noche `#070D1A`;
  - títulos en **Instrument Serif** y texto en **Hanken Grotesk**, con fuentes incluidas y sin CDN;
  - botones en píldora;
  - modo oscuro con los mismos tokens invertidos y el vino aclarado a `#C2566E`.
- **Animación:**
  - transiciones de pantalla de 250–350 ms;
  - menú lateral que se colapsa con animación;
  - barra inferior en celular;
  - entrada y salida animada de los renglones del carrito;
  - rebote al agregar un producto;
  - siempre se respeta `prefers-reduced-motion`.
- **Tamaños de pantalla:**
  - celular de 390 px: una columna y barra inferior;
  - tablet de 768–1180 px: catálogo y carrito lado a lado;
  - PC de más de 1180 px: menú lateral y atajos de teclado.
- **Accesibilidad:**
  - contraste AA;
  - foco visible;
  - todo se puede usar con teclado;
  - botones táctiles de al menos 44 px.
- **Rol vendedor:** no ve costos, utilidad, configuración ni categorías, y no puede cancelar ventas. La API ya lo impide; la interfaz tampoco muestra esas opciones.
- **Lector de códigos USB:** se comporta como teclado y termina con Enter. En el punto de venta, una entrada de 4 o más caracteres seguida de Enter en menos de 60 ms entre teclas se trata como escaneo y llama a `GET /api/variants/lookup?code=`.
- **Ruido de red:** cualquier error de la API se muestra como aviso (toast) con el `message` del servidor. Si el campo viene en `field`, se marca junto al campo.
- **Versiones exactas** en `package.json`, sin `^` ni `~`.
- No se toca la lógica de la API salvo lo que esta etapa necesita servir: la ruta de la SPA y un endpoint de "ventas del día con nombres".

## Review Focus

1. **Doble toque en "Cobrar":** dos toques rápidos o una red lenta no deben crear dos ventas. El botón se desactiva al primer toque y el `id` de la venta (UUID del dispositivo) se genera una vez por carrito, así que la API devuelve la misma venta. → prueba en la Tarea 4.
2. **Escribir pesos con coma o punto** (`350`, `350.5`, `1,250.00`, `$99`): se convierten bien a centavos. Texto inválido (`abc`, `1.234.5`) marca el campo y no envía. → pruebas en la Tarea 2.
3. **Escanear un código inexistente o un producto agotado:** aparece un aviso claro y el carrito no cambia. Si se escanea más piezas de las que hay, se avisa "Quedan N". → pruebas en la Tarea 4.
4. **Sesión vencida o servidor reiniciado:** una respuesta 401 lleva a la pantalla de inicio de sesión y, al entrar, regresa a donde estaba. Si se pierde el token CSRF (400), se pide uno nuevo y se reintenta una vez. → pruebas en la Tarea 2.
5. **Cámara no disponible:** sin permiso, sin cámara o en `http://192.168…`, la alta de producto ofrece "Elegir foto" (input de archivo con `capture="environment"`) y no se queda atorada. → prueba en la Tarea 6.

---

## Estructura de archivos

```
web/
├── package.json, vite.config.ts, tsconfig.json, index.html, playwright.config.ts
├── src/
│   ├── main.tsx, App.tsx (rutas), styles.css (tokens + Tailwind)
│   ├── lib/
│   │   ├── money.ts        centavos ↔ texto
│   │   ├── api.ts          fetch con CSRF, errores, 401
│   │   ├── cart.ts         carrito puro (reducer) + validación de pagos
│   │   ├── scanner.ts      detecta lectura de lector USB
│   │   └── images.ts       compresión de fotos en el navegador
│   ├── auth/            AuthProvider, LoginPage, RequireAuth
│   ├── shell/           AppShell (menú lateral, barra inferior, transiciones), CommandPalette
│   ├── ui/              Button, Input, Dialog, Sheet, Toast, Badge, Empty, Money, PhotoThumb
│   ├── pos/             PosPage, ProductGrid, CartPanel, PaymentSheet, SaleDone
│   ├── inventory/       InventoryPage, ProductDetail, EntryDialog, AdjustDialog, MovementsList
│   ├── products/        NewProductWizard, CameraCapture
│   └── admin/           CategoriesPage, SettingsPage, SalesTodayPage
└── e2e/                 pruebas Playwright
server/
├── spa.py               sirve server/web_dist y redirige rutas de la app a index.html
└── web_dist/            app compilada (en git)
```

---

### Task 1: Base del frontend y servirlo desde Flask

**Files:**
- Create: `web/` (Vite + React + TS + Tailwind 4), `web/src/styles.css`, `web/src/main.tsx`, `web/src/App.tsx`, `server/spa.py`
- Modify: `server/__init__.py` (registrar `spa.bp` al final), `run.py` (abrir `/` en lugar de `/api/health`), `.gitignore` (`web/node_modules`, `web/test-results`)
- Test: `tests/test_spa.py`, `web/src/App.test.tsx`

**Interfaces:**
- Produces: `server/spa.py` con `bp`:
  - `GET /` y cualquier ruta que no empiece con `/api/` ni `/uploads/` y no sea un archivo existente de `web_dist` devuelve `web_dist/index.html` con `Cache-Control: no-cache`;
  - los archivos de `web_dist/assets/` se sirven con `max_age` de 1 año.
- Produces: `npm run build` (en `web/`) escribe en `../server/web_dist` (`build.outDir`, `emptyOutDir: true`). `npm run dev` hace proxy de `/api` y `/uploads` a `http://127.0.0.1:5000`.
- Produces: tokens CSS en `styles.css` (`--paper`, `--surface`, `--ink`, `--muted`, `--line`, `--wine`, `--night`) y su versión oscura con `@media (prefers-color-scheme: dark)` y `[data-theme="dark"]`. Fuentes con `@fontsource/instrument-serif` y `@fontsource-variable/hanken-grotesk`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_spa.py
def test_root_serves_app(client):
    r = client.get("/")
    assert r.status_code == 200 and b'<div id="root">' in r.data
    assert r.headers["Cache-Control"] == "no-cache"

def test_deep_link_serves_app(client):
    assert b'<div id="root">' in client.get("/inventario/12").data

def test_api_404_stays_json(client):
    assert client.get("/api/nada").get_json()["ok"] is False
```

```tsx
// web/src/App.test.tsx
it("muestra el inicio de sesión sin sesión", async () => {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ ok: false }, { status: 401 })));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Modas Andrea" })).toBeInTheDocument();
});
```

(El `server` de MSW vive en `web/src/test/setup.ts`.)

- [ ] **Step 2: Run** `pytest tests/test_spa.py -q` and `cd web && npx vitest run`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  1. Scaffold Vite with `react-ts`.
  2. Install exact versions.
  3. Add Tailwind 4 through `@tailwindcss/vite`.
  4. `App` shows a minimal `LoginPage` (title "Modas Andrea", subtitle "Yuda"; the real form arrives in Task 2).
  5. Run `npm run build` and commit `server/web_dist`.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Commit** `feat: base de la app web servida por Flask`

---

### Task 2: Dinero, cliente de la API e inicio de sesión

**Files:**
- Create: `web/src/lib/money.ts`, `web/src/lib/api.ts`, `web/src/auth/AuthProvider.tsx`, `web/src/auth/LoginPage.tsx`, `web/src/auth/RequireAuth.tsx`, `web/src/ui/Toast.tsx`, `web/src/ui/Button.tsx`, `web/src/ui/Input.tsx`
- Test: `web/src/lib/money.test.ts`, `web/src/lib/api.test.ts`, `web/e2e/login.spec.ts`

**Interfaces:**
- Produces: `parsePesos(text: string): number | null` → centavos. Acepta `"350"`, `"350.5"`, `"350.50"`, `"1,250.00"`, `"$99"` y espacios. Rechaza (`null`) más de 2 decimales, comas mal puestas, negativos y texto.
- Produces: `formatMoney(cents: number): string` → `"$1,250.00"`.
- Produces: `api<T>(path: string, opts?: {method?, json?, form?: FormData}) => Promise<T>`:
  - pide `/api/auth/csrf` la primera vez y manda `X-CSRFToken` en todo lo que no es GET;
  - con un 400 de CSRF ("La sesión de seguridad expiró…"), renueva el token y reintenta **una** vez;
  - con un 401, lanza `AuthError` y `AuthProvider` manda a `/entrar?volver=<ruta>`;
  - cualquier otro `ok:false` lanza `ApiError {status, message, field}`.
- Produces: `useAuth(): {user: {id, username, full_name, role} | null, login(u, p), logout(), isAdmin}`.
- Produces: rutas `/entrar` (pública) y el resto envuelto en `RequireAuth`.

- [ ] **Step 1: Write the failing tests**

```ts
// money.test.ts
it.each([["350", 35000], ["350.5", 35050], ["350.50", 35050], ["1,250.00", 125000], ["$99", 9900], [" 12 ", 1200]])(
  "parsePesos(%s) = %i", (t, c) => expect(parsePesos(t)).toBe(c));
it.each(["abc", "1.234.5", "12.345", "-5", "", "1,2,3"])("rechaza %s", (t) => expect(parsePesos(t)).toBeNull());
it("formatMoney", () => { expect(formatMoney(125000)).toBe("$1,250.00"); expect(formatMoney(0)).toBe("$0.00"); });

// api.test.ts (MSW)
it("manda el token CSRF en POST y reintenta una vez si expiró", async () => { /* 1.ª respuesta 400 CSRF, 2.ª 200 → resuelve; csrf pedido 2 veces */ });
it("401 lanza AuthError", async () => { await expect(api("/api/auth/me")).rejects.toBeInstanceOf(AuthError); });
it("ok:false lanza ApiError con field", async () => { /* 400 {message, field:"price_cents"} */ });
```

```ts
// e2e/login.spec.ts (servidor real con datos de prueba; ver playwright.config.ts)
test("entra, ve su nombre y sale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/entrar/);
  await page.getByLabel("Usuario").fill("vendedor"); await page.getByLabel("Contraseña").fill("12345");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Vendedor")).toBeVisible();
});
test("contraseña incorrecta muestra el mensaje del servidor", async ({ page }) => { /* "Usuario o contraseña incorrectos." */ });
```

- [ ] **Step 2: Run** `npx vitest run src/lib` and `npx playwright test e2e/login.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `playwright.config.ts` starts the server with `webServer`, running `python -m scripts.e2e_server`.
  - Create `scripts/e2e_server.py`: it creates a temporary database, imports the test data and serves on port 5055.
  - The login screen uses the Revista style: large serif title, the Mochilas Andrés logo inside a circle, and a form centered on mobile.
- [ ] **Step 4: Run** both. Expected: PASS.
- [ ] **Step 5: Commit** `feat: inicio de sesión y cliente de la API`

---

### Task 3: Marco de la app, navegación animada y Ctrl+K

**Files:**
- Create: `web/src/shell/AppShell.tsx`, `web/src/shell/CommandPalette.tsx`, `web/src/shell/nav.ts`
- Test: `web/src/shell/nav.test.ts`, `web/e2e/shell.spec.ts`

**Interfaces:**
- Produces: `navItems(role: "admin" | "seller")`. Devuelve, en orden: `Vender (/vender)`, `Inventario (/inventario)` y `Ventas de hoy (/ventas)`. Para el administrador agrega `Nuevo producto (/productos/nuevo)`, `Categorías (/categorias)` y `Configuración (/configuracion)`. `/` redirige a `/vender`.
- Produces:
  - En PC, `AppShell` muestra un menú lateral con el logo y el nombre del negocio, que se colapsa a íconos y recuerda el estado en `localStorage`.
  - En celular muestra una barra inferior con los 3 primeros elementos y un botón "Más".
  - Las rutas cambian con `AnimatePresence` (fundido y 8 px de desplazamiento, 280 ms).
- Produces: Ctrl+K (o ⌘K) abre la paleta. Busca productos por nombre o código (`GET /api/products?q=`) y secciones. Al elegir un producto, en el punto de venta lo agrega al carrito; en otras pantallas abre su ficha.

- [ ] **Step 1: Write the failing tests**

```ts
it("vendedor no ve configuración ni categorías", () => {
  expect(navItems("seller").map((i) => i.to)).toEqual(["/vender", "/inventario", "/ventas"]);
});
it("admin ve todo", () => { expect(navItems("admin").map((i) => i.to)).toContain("/configuracion"); });
```
```ts
// e2e/shell.spec.ts
test("Ctrl+K encuentra un producto por nombre", async ({ page }) => {
  /* entrar como admin → Control+K → escribir "mario" → aparece "Mario Bros" → Enter → el carrito tiene 1 pieza */
});
test("en celular hay barra inferior", async ({ page }) => { /* viewport 390×844 → role=navigation name="Principal" visible abajo */ });
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: marco de la app con menú animado y búsqueda Ctrl+K`

---

### Task 4: Punto de venta (carrito y cobro)

**Files:**
- Create: `web/src/lib/cart.ts`, `web/src/lib/scanner.ts`, `web/src/pos/*`
- Test: `web/src/lib/cart.test.ts`, `web/src/lib/scanner.test.ts`, `web/e2e/pos.spec.ts`

**Interfaces:**
- Consumes: `GET /api/products`, `GET /api/categories`, `GET /api/variants/lookup`, `POST /api/sales`.
- Produces: `cart.ts` (puro).
  - Tipo `CartLine = {variantId, name, attrs, priceCents, qty, stock, discountCents, photo}`.
  - Tipo `Cart = {id: string (UUID), lines, discountCents, clientId?}`.
  - `cartReducer(cart, action)` con las acciones `add` (sube la cantidad si ya está; nunca pasa de `stock` y en ese caso devuelve `{error:"Quedan N."}`), `setQty`, `remove`, `setLineDiscount`, `setDiscount` y `clear` (que genera un `id` nuevo).
  - `totals(cart) → {subtotal, discount, total}`.
  - `maxDiscountCents(subtotal, role, pct=10)`.
  - `validatePayments(total, payments) → {ok: true, changeCents} | {ok: false, message}`. Usa las mismas reglas y mensajes que la API: "Los pagos no cuadran con el total." y "El efectivo recibido es menor que lo que se cobra.".
- Produces: `createScanDetector(onScan: (code) => void, {minLength: 4, maxGapMs: 60})` → `handleKey(e: KeyboardEvent)`.
- Produces (pantalla `/vender`):
  - **Izquierda:** buscador, chips de categoría y cuadrícula de productos con foto, precio y "Quedan N".
  - **Derecha:** carrito con renglones animados, descuento y total grande.
  - **Cobrar** abre una hoja de pago con Efectivo (recibido y cambio en vivo), Tarjeta, Transferencia y "Pago mixto".
  - **Confirmar** desactiva el botón, envía con `cart.id` y muestra la pantalla "Venta #folio" con el cambio grande y "Nueva venta".
  - Al terminar se refrescan los productos para ver el stock nuevo.
  - En celular el carrito es una hoja que sube desde abajo, con el total siempre visible.

- [ ] **Step 1: Write the failing tests**

```ts
it("no deja pasar del stock", () => {
  let c = cartReducer(empty(), { type: "add", line: L({ stock: 1 }) });
  const r = cartReducer(c, { type: "add", line: L({ stock: 1 }) });
  expect(r.lines[0].qty).toBe(1); expect(r.error).toBe("Quedan 1.");
});
it("totales con descuentos", () => { /* 2×$190 + 1×$350, desc. renglón $20, general $10 → total 70000 */ });
it("tope de descuento de vendedor 10 %", () => { expect(maxDiscountCents(35000, "seller")).toBe(3500); expect(maxDiscountCents(35000, "admin")).toBe(35000); });
it("pago mixto debe cuadrar", () => { expect(validatePayments(73000, [{method:"card", amountCents:20000}, {method:"cash", amountCents:10000, receivedCents:10000}])).toEqual({ok:false, message:"Los pagos no cuadran con el total."}); });
it("cambio en efectivo", () => { expect(validatePayments(73000, [{method:"cash", amountCents:73000, receivedCents:100000}])).toEqual({ok:true, changeCents:27000}); });
it("clear genera id nuevo", () => { const a = empty(); expect(cartReducer(a, {type:"clear"}).id).not.toBe(a.id); });
it("el lector USB se detecta por rapidez y Enter", () => { /* teclas "M","A","0","0","0","0","0","2" a 10 ms y Enter → onScan("MA000002"); tecleo a 150 ms no dispara */ });
```
```ts
// e2e/pos.spec.ts
test("venta en efectivo con cambio", async ({ page }) => {
  /* vendedor → /vender → clic "Mario Bros" → Cobrar → Efectivo, recibido 500 → "Cambio $180.00" → Confirmar →
     "Venta #1" visible → Nueva venta → la tarjeta de Mario Bros dice "Quedan 1" */
});
test("doble clic en Confirmar crea una sola venta", async ({ page, request }) => { /* dblclick → GET /api/sales devuelve 1 venta */ });
test("escanear código inexistente avisa y no cambia el carrito", async ({ page }) => { /* keyboard.type("ZZ99", {delay: 5}) + Enter → toast "No encontramos ningún producto con ese código." */ });
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `crypto.randomUUID()` generates the cart id. Use Motion's `layout` and `AnimatePresence` on cart lines, and a 1.0 → 1.08 → 1.0 bounce on the counter when a product is added.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: punto de venta con carrito, cobro mixto y lector de códigos`

---

### Task 5: Inventario

**Files:**
- Create: `web/src/inventory/*`
- Test: `web/e2e/inventory.spec.ts`

**Interfaces:**
- Consumes: `GET /api/products`, `GET /api/products/<id>`, `PATCH /api/products/<id>`, `PATCH /api/variants/<id>`, `POST|DELETE /api/products/<id>/photos`, `POST /api/inventory/entries`, `POST /api/inventory/adjustments`, `GET /api/inventory/movements`, `GET /api/inventory/low-stock`.
- Produces: `/inventario`:
  - lista con foto, nombre, categoría, piezas y precio;
  - filtros por categoría, "Stock bajo" y búsqueda;
  - botón "Entrada de mercancía" (solo admin).
- Produces: `/inventario/:id`, la ficha:
  - galería de fotos, con agregar y quitar (no deja quitar la última);
  - tabla de variantes (SKU, código de fábrica, atributos, precio; costo solo admin) con edición en línea;
  - interruptor "Mostrar en tienda en línea";
  - botones "Entrada" y "Ajustar existencias", este último con motivo obligatorio;
  - bitácora de movimientos con razones en español: Venta, Venta cancelada, Entrada, Ajuste, Carga inicial.

- [ ] **Step 1: Write the failing tests**

```ts
test("entrada de 5 piezas sube el stock y aparece en la bitácora", async ({ page }) => { /* admin → ficha Termo clásico rojo → Entrada 5 → "9 piezas" → bitácora "Entrada +5" */ });
test("ajuste sin motivo no se envía", async ({ page }) => { /* el campo Motivo queda marcado: "Escribe el motivo del ajuste." */ });
test("vendedor no ve costos ni botón Entrada", async ({ page }) => { /* vendedor → ficha → sin columna "Costo" ni botón "Entrada" */ });
```
- [ ] **Step 2–4:** run, implement, run. Expected FAIL, then PASS.
- [ ] **Step 5: Commit** `feat: inventario con fichas, entradas, ajustes y bitácora`

---

### Task 6: Alta de producto con fotos guiadas

**Files:**
- Create: `web/src/lib/images.ts`, `web/src/products/NewProductWizard.tsx`, `web/src/products/CameraCapture.tsx`
- Test: `web/src/lib/images.test.ts`, `web/e2e/new-product.spec.ts`

**Interfaces:**
- Produces: `compressImage(file: Blob, max = 1600, quality = 0.82): Promise<Blob>` (canvas → WebP; si el navegador no puede, JPEG). Nunca agranda la imagen.
- Produces: `/productos/nuevo` (solo admin), en 4 pasos con barra de avance animada:
  1. **Datos:** nombre, categoría y descripción.
  2. **Precio y variantes:** un precio, o "Tiene variantes" para agregar renglones de atributos, precio, costo y código de fábrica opcional.
  3. **Fotos:** guía "Frente", "Lado", "Detalle". `CameraCapture` usa `getUserMedia({video: {facingMode: "environment"}})`. Si falla o no existe, muestra el botón "Elegir foto" (`<input type="file" accept="image/*" capture="environment">`). No deja avanzar sin al menos 1 foto.
  4. **Revisar y guardar:** envía `POST /api/products` (multipart) y abre la ficha nueva con el aviso "Producto creado. Ya aparece en el punto de venta."

  Las fotos se comprimen antes de subir.

- [ ] **Step 1: Write the failing tests**

```ts
it("compressImage no agranda y reduce a 1600", async () => { /* imagen 3200×1600 → 1600×800; imagen 800×600 → 800×600 */ });
```
```ts
test("sin cámara ofrece Elegir foto y crea el producto", async ({ page }) => {
  /* contexto sin permisos de cámara → paso Fotos muestra "Elegir foto" → setInputFiles(fixture jpg) → Guardar →
     ficha con SKU "MA000059" visible */
});
test("no deja avanzar sin foto", async ({ page }) => { /* botón Siguiente deshabilitado y texto "Agrega al menos una foto." */ });
```
- [ ] **Step 2–4:** run, implement, run.
- [ ] **Step 5: Commit** `feat: alta de producto con fotos guiadas por cámara`

---

### Task 7: Ventas del día, categorías y configuración

**Files:**
- Create: `web/src/admin/SalesTodayPage.tsx`, `web/src/admin/CategoriesPage.tsx`, `web/src/admin/SettingsPage.tsx`
- Modify: `server/services/sales.py` and `server/blueprints/sales.py` (add `user_name` and `client_name` to `sale_dict`)
- Test: `tests/test_sales.py` (new case), `web/e2e/admin.spec.ts`

**Interfaces:**
- Produces (API): `sale_dict` incluye `user_name` (nombre completo o usuario) y `client_name` (o `null`).
- Produces: `/ventas`:
  - lista del día con folio, hora, vendedor, piezas, total y forma de pago;
  - selector de fecha;
  - totales del día por forma de pago, sin contar canceladas;
  - el admin ve "Cancelar venta", con motivo, en el detalle.
- Produces: `/categorias` (árbol con crear, renombrar, mover y desactivar) y `/configuracion` (los campos de `GET /api/settings`).

- [ ] **Step 1: Write the failing tests**

```python
def test_sale_has_user_name(seller, v1):
    s = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}],
        "payments": [{"method": "card", "amount_cents": 35000}]}).get_json()["sale"]
    assert s["user_name"] == "Vendedor" and s["client_name"] is None
```
```ts
test("admin cancela una venta y el stock regresa", async ({ page }) => { /* vender 1 → /ventas → Cancelar (motivo) → "Cancelada" → total del día $0.00 */ });
test("crear categoría Termos dentro de Hogar", async ({ page }) => { /* aparece anidada */ });
test("guardar WhatsApp del negocio", async ({ page }) => { /* recargar → valor persiste */ });
```
- [ ] **Step 2–4:** run, implement, run.
- [ ] **Step 5: Commit** `feat: ventas del día, categorías y configuración`

---

### Task 8: Compilado final, accesibilidad y documentación

**Files:**
- Modify: `server/web_dist/` (final build), `LEEME.md` (section "Usar el sistema"), `instalar.bat` (no Node needed; only check that `server/web_dist/index.html` exists)
- Test: `web/e2e/a11y.spec.ts` (with `@axe-core/playwright`)

- [ ] **Step 1: Write the failing test.** No *serious* or *critical* axe violations on `/entrar`, `/vender`, `/inventario` and `/ventas`, each at 390 px and at 1280 px.
- [ ] **Step 2: Run.** Expected: FAIL until the issues found are fixed.
- [ ] **Step 3: Fix the reported issues.** Rebuild with `npm run build` and update `LEEME.md` with screenshots taken by Playwright (`docs/img/`).
- [ ] **Step 4: Run** `pytest -q`, `npx vitest run` and `npx playwright test`. Expected: everything PASSES.
- [ ] **Step 5: Commit** `chore: compilado final de la interfaz, accesibilidad y guía`
