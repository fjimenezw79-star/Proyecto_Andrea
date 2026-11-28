# Etapa 5 · Cámara, etiquetas y tickets · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cualquier dispositivo lea códigos con la cámara, que se impriman etiquetas con código de barras y tickets de venta y de apartado, y que un producto sin etiqueta se encuentre por su apariencia (en el dispositivo y, si el vendedor lo pide, con IA).

**Architecture:**
- **Servidor:**
  - migración 0004: `photo_embeddings` (huella de cada foto) y `ai_queries` (consultas de IA del mes);
  - `/api/vision/index`, `/api/vision/missing` y `PUT /api/vision/embeddings`: el servidor solo guarda y reparte las huellas; las calcula el navegador;
  - `server/ai.py` + `/api/vision/ai`: envía la foto y los candidatos a la API de Claude con el SDK oficial `anthropic`, con un límite mensual;
  - configuración nueva: `ticket_footer`, `label_size` con tamaños fijos y `ai_monthly_limit`.
- **Navegador:**
  - `lib/code128.ts`: código de barras Code 128 propio, dibujado en SVG (sin librería);
  - `print/`: impresión de etiquetas y tickets con la vista de impresión del navegador;
  - `scan/`: hoja de escaneo con la cámara: código de barras (`BarcodeDetector` nativo o ZXing) y "por foto";
  - `vision/`: MediaPipe Image Embedder con MobileNet V3 small, servido desde la PC, y el índice de huellas en IndexedDB para comparar sin señal.

**Tech Stack:** el actual, más `anthropic==2.14.0` (Python), `@mediapipe/tasks-vision@1.2.3` y `@zxing/library@0.23.0` (navegador). El modelo `mobilenet_v3_small.tflite` (4 MB) y los `.wasm` de MediaPipe se sirven desde la PC: nada se carga de CDN.

**Spec:** `docs/superpowers/specs/2026-11-27-modas-andrea-design.md`, secciones 8.4 (códigos y etiquetas), 8.5 (reconocimiento visual), 8.6 (ticket) y 8.7 (ticket de apartado).

## Global Constraints

- **Lectura de códigos:**
  - con la cámara: `BarcodeDetector` si el navegador lo tiene; si no (iOS, Firefox), ZXing, que se descarga solo cuando hace falta;
  - formatos: Code 128, EAN-13, EAN-8, UPC-A y UPC-E;
  - la búsqueda por código funciona sin señal con la copia del catálogo.
- **Etiquetas:** siempre llevan el código interno `MA######` en Code 128 (el lector también encuentra el de fábrica). Tamaños:
  - `50x25`: térmica de 50×25 mm, una etiqueta por página;
  - `carta-30`: hoja carta 3×10 (66.7×25.4 mm, tipo 5160);
  - `carta-20`: hoja carta 2×10 (101.6×25.4 mm, tipo 5161);
  - `carta-10`: hoja carta 2×5 (101.6×50.8 mm, tipo 5163).
  Por defecto se imprime una etiqueta por pieza en stock (mínimo 1), editable.
- **Tickets:**
  - de 58 u 80 mm (`ticket_width_mm`) con nombre, subtítulo, dirección, WhatsApp y pie configurable (`ticket_footer`);
  - venta: folio, fecha, vendedor, cliente, artículos, descuento, total, pagos y cambio. Sin señal sale con el folio provisional `P-####`;
  - apartado: artículos, total, abonos con fecha, saldo y fecha límite;
  - *Enviar por WhatsApp* manda el mismo ticket en texto (al teléfono del cliente si lo hay).
- **Reconocimiento visual:**
  - la huella es el vector de MobileNet V3 small (1024 valores), normalizado y guardado en int8 (1 KB por foto) junto con el nombre del modelo;
  - se calcula en el navegador del administrador al dar de alta o agregar fotos; las fotos que no la tengan se preparan desde Configuración;
  - el dispositivo compara contra el índice guardado, también sin señal, y muestra **los 3 productos más parecidos**. **Nunca se agrega al carrito sin que el vendedor toque uno.**
- **Botón "✨ Buscar con IA":**
  - solo aparece con señal, con `ANTHROPIC_API_KEY` en `.env` y si no se llegó al límite del mes (`ai_monthly_limit`, 100 por defecto; 0 lo apaga);
  - envía la foto (máx. 1024 px) y hasta 8 candidatos (los más parecidos según la huella) con su miniatura;
  - el modelo se elige con `ANTHROPIC_MODEL` (por defecto `claude-opus-5-5`); la respuesta usa salida estructurada (`output_config.format`) y solo puede elegir uno de los candidatos o ninguno;
  - cada consulta se cuenta **antes** de llamar a la API, así que dos dispositivos a la vez no pasan el límite;
  - el resultado también se confirma tocándolo.

## Review Focus

1. **Límite de IA con dos consultas a la vez:** la segunda se rechaza (429) si la primera llenó el cupo. → Tarea 3.
2. **La IA responde un id que no estaba en los candidatos** (o texto inválido): se trata como "sin coincidencia". → Tarea 3.
3. **Huella de otro modelo o de tamaño inválido:** el servidor la rechaza; al cambiar de modelo, las huellas viejas cuentan como faltantes. → Tarea 2.
4. **Código de barras correcto:** el dígito de control de Code 128 coincide con ejemplos conocidos y el SVG se lee con ZXing. → Tarea 4.
5. **Escaneo sin señal:** el código se busca en la copia del catálogo. → Tarea 7.

---

### Task 1: Migración 0004 y configuración nueva

**Files:** `server/models.py`, `server/migrations/versions/0004_camara.py`, `server/blueprints/settings.py`; Test `tests/test_vision.py`, `tests/test_settings_categories.py`.

- `PhotoEmbedding(photo_id pk → product_photos ON DELETE CASCADE, model str, dim int, vector text base64, created_at)`.
- `AiQuery(id, at, user_id, status in {"pending","ok","error"}, matched_product_id null, input_tokens, output_tokens)`.
- Configuración: `ticket_footer` (texto, máx. 200), `label_size` en {`50x25`,`carta-30`,`carta-20`,`carta-10`}, `ai_monthly_limit` (0 a 10 000).

- [x] test → FAIL → implementar → PASS → commit `feat: migración 0004 (huellas de fotos y consultas de IA)`.

### Task 2: API de huellas

**Files:** `server/blueprints/vision.py`, `server/services/catalog.py` (borrar la huella con la foto); Test `tests/test_vision.py`.

- `GET /api/vision/index` (sesión): `{model, items:[{photo_id, product_id, v}]}` solo de productos activos y del modelo actual.
- `GET /api/vision/missing?product=` (admin): fotos sin huella del modelo actual, con su URL.
- `PUT /api/vision/embeddings` (admin): `{model, items:[{photo_id, v}]}`; valida modelo, base64 y tamaño (1024 bytes).

- [x] test → FAIL → implementar → PASS → commit `feat: huellas de fotos para el reconocimiento visual`.

### Task 3: Botón de IA en el servidor

**Files:** `server/ai.py`, `server/blueprints/vision.py`, `server/config.py`, `.env.example`, `requirements.txt`; Test `tests/test_ai.py` (con un cliente falso, sin red).

- `GET /api/vision/ai`: `{enabled, used, limit, model}`.
- `POST /api/vision/ai`: `{image: data:image/jpeg;base64,…, candidates:[product_id…≤8]}` → `{match: product_id|null, reason}`; 503 sin clave, 429 en el límite, 502 si la API falla (y la consulta queda como `error`, sin contar).

- [x] test → FAIL → implementar → PASS → commit `feat: búsqueda con IA (Claude) con límite mensual`.

### Task 4: Code 128 y etiquetas

**Files:** `web/src/lib/code128.ts`, `web/src/print/PrintRoot.tsx`, `web/src/print/Labels.tsx`, `web/src/labels/LabelsPage.tsx`, rutas y menú; Test `code128.test.ts`, e2e `labels.spec.ts`.

- [x] test → FAIL → implementar → PASS → commit `feat: etiquetas con código de barras`.

### Task 5: Tickets de venta y de apartado

**Files:** `web/src/print/Ticket.tsx`, `web/src/lib/ticket.ts` (datos y texto para WhatsApp), `PaymentSheet.tsx`, `SalesTodayPage.tsx`, `LayawayDetail.tsx`, `SettingsPage.tsx`; Test `ticket.test.ts`, e2e `tickets.spec.ts`.

- [x] test → FAIL → implementar → PASS → commit `feat: tickets de venta y de apartado, impresos o por WhatsApp`.

### Task 6: Lector de códigos con la cámara

**Files:** `web/src/scan/barcode.ts`, `web/src/scan/ScanSheet.tsx`, `PosPage.tsx`, `ProductDetail.tsx` (asociar código de fábrica), `offline/cache.ts` (búsqueda por código sin señal); Test `cache.test.ts`.

- [x] test → FAIL → implementar → PASS → commit `feat: lector de códigos con la cámara`.

### Task 7: Reconocimiento visual en el dispositivo

**Files:** `web/src/vision/embedder.ts`, `web/src/vision/index.ts`, `web/src/vision/prepare.ts`, `ScanSheet.tsx` (modo "Por foto"), `NewProductWizard.tsx`, `ProductDetail.tsx`, `SettingsPage.tsx`, `vite.config.ts` (copia de los `.wasm`), `web/sw/sw.js` (caché del modelo); Test `vision/index.test.ts`.

- [x] test → FAIL → implementar → PASS → commit `feat: reconocimiento visual de productos en el dispositivo`.

### Task 8: Botón "✨ Buscar con IA" en la pantalla

**Files:** `ScanSheet.tsx`, `SettingsPage.tsx` (consumo del mes); e2e `vision.spec.ts` (con la API de IA simulada).

- [x] implementar → e2e → commit `feat: botón Buscar con IA en el escáner`.

### Task 9: Manual y guías

**Files:** `docs/manual/manual.html`, `Manual_Modas_Andrea.pdf`, capturas en `docs/img/`, `LEEME.md`.

- [x] commit `docs: manual de usuario con la etapa 5`.
