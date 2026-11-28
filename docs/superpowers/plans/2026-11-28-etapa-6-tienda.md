# Etapa 6 · Tienda en línea · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Que cada producto dado de alta aparezca solo en una tienda en línea (estilo Revista del prototipo aprobado), con link y vista previa por producto para WhatsApp, Facebook y Marketplace, y que los pedidos por WhatsApp entren al sistema para confirmarlos, cobrarlos o rechazarlos.

**Architecture:**
- **Servidor** (`server/store/`): una sola plantilla Jinja (`tienda.html`) + `tienda.js` sin dependencias.
  - Modo PC: `/tienda/` siempre al día; fotos públicas solo de productos en tienda; `og/<id>.jpg` 1200×630; `POST /tienda/api/pedido` con límite por IP.
  - Modo Cloudflare Pages (`cloud.py`, opcional con `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN`): genera el sitio fijo y lo publica con el protocolo Direct Upload de Pages (el de wrangler: BLAKE3, check-missing, upload, upsert-hashes, deployment con `_worker.bundle`); `_worker.js` guarda pedidos en KV y la PC los recoge cada minuto.
- **Pedidos** (`services/online_orders.py`, migración 0005): pendiente → confirmado (aparta piezas, fija envío, enlaza o crea el cliente) → cobrado (venta `source="online"` sin volver a descontar) o rechazado (regresan piezas). Idempotente por id generado en la tienda.
- **Interfaz:** pantalla Pedidos en línea con contador en el menú, sección Tienda en línea en Configuración, Compartir de la tienda en la ficha, envío en el ticket.

**Spec:** `docs/superpowers/specs/2026-11-27-modas-andrea-design.md`, sección 8.12.

## Review Focus
1. Nada privado sale a la tienda: costos, fotos de productos ocultos. → `test_store.py`.
2. Confirmar sin piezas suficientes no aparta nada (409). Cobrar no descuenta dos veces. → `test_store.py`.
3. El mismo pedido enviado dos veces se registra una vez. → `test_store.py`, `test_cloud.py`.
4. Publicación en Cloudflare: verificada contra un Cloudflare simulado (la red de desarrollo bloquea api.cloudflare.com). → `test_cloud.py`.

- [x] Servidor: tienda pública y pedidos
- [x] Publicación en Cloudflare Pages y recogida de pedidos
- [x] Interfaz: Pedidos en línea, Configuración y compartir
- [x] Manual completo (versión 1.0)
