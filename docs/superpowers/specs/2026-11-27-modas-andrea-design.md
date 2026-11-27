# Modas Andrea (Yuda) · Documento de diseño

Fecha: 2026-11-27 · Estado: **borrador para aprobación**

Notación: lo que decidió el dueño aparece sin marca. Lo que propuso el diseñador va marcado **[decisión del diseñador]** y se puede cambiar.

---

## 1. Para qué es

El negocio empezó vendiendo mochilas y útiles escolares con una app en Flask (`PROYECTO ANDREA_4`: un `app.py` de 487 líneas, Bootstrap y jQuery). Ahora va a vender **termos, cobijas y cualquier artículo que se agregue**. La app actual está atada a mochilas: categorías escritas en el HTML, una venta por producto, sin variantes ni código ordenado. Además tiene fallas de seguridad y de datos.

Se quiere un sistema **nuevo y profesional**, con una interfaz moderna y animada, que:

1. Venda en la **tienda física** desde tablets, celulares, laptops y computadoras de escritorio.
2. **Funcione como AcuaGest**: una PC del negocio es el servidor, los dispositivos se conectan por WiFi o por internet, y se instala con archivos `.bat`.
3. **Siga vendiendo cuando se va el internet un rato** y envíe todo al volver.
4. **Publique sola una tienda en línea** con cada producto dado de alta, para compartir links en Marketplace y grupos de WhatsApp.
5. Identifique productos **con la cámara**: por código de barras o, si la etiqueta se cayó, por su apariencia.

Más adelante, ya probado al 100 %, se mudará a un **servidor en la nube con dominio fijo**.

## 2. Objetivos

- Vender cualquier tipo de artículo: **categorías administrables** y **variantes** (color, talla o tamaño, capacidad, modelo o personaje), cada variante con su propio código, precio y stock.
- **Carrito con varios artículos por venta**, varias formas de pago y ticket impreso.
- **Stock confiable**: en vivo en todos los dispositivos y nunca vender de más con conexión.
- **Venta sin conexión** de corta duración, sin perder ni duplicar nada.
- **Alta de producto con fotos obligatorias** (guía para 2 o 3 tomas).
- **Códigos de barras**: lectura con la cámara o con lector USB, y generación e impresión de etiquetas.
- **Reconocimiento visual** del producto sin etiqueta: en el dispositivo y, solo si el vendedor lo pide con un botón, con IA en internet.
- **Tienda en línea automática** con link y vista previa por producto, carrito y pedido por WhatsApp. El pago con tarjeta queda preparado para activarse después.
- Interfaz **moderna y animada**: transiciones entre pantallas, menús con movimiento, modo claro y oscuro, adaptada a celular, tablet y PC.
- Conservar lo que ya existe: apartados con abonos, clientes con puntos, gastos, devoluciones, corte de caja, reportes y predicción de agotamiento.

## 3. Fuera de alcance (por ahora)

- Facturación electrónica (CFDI).
- Varias sucursales o almacenes. **La mercancía está en un solo lugar.**
- Cobro con tarjeta dentro de la tienda en línea. Se deja el espacio y la interfaz para conectarlo, pero no se activa.
- Mudanza a la nube. El diseño la facilita, pero no se hace en este proyecto.
- Apps nativas de tienda (Play Store o App Store). Se usa una PWA instalable desde el navegador.

## 4. Lo que haría fracasar el proyecto aunque "funcione"

- Que se **pierda o se duplique** una venta hecha sin señal.
- Que el inventario no cuadre sin que nadie se entere.
- Que la instalación en la PC del negocio requiera conocimientos técnicos. Debe ser doble clic, como AcuaGest.
- Que la tienda en línea muestre productos sin foto o con precios viejos por mucho tiempo.
- Que la IA genere gastos sin que el dueño lo decida.
- Que la interfaz se vea "de plantilla" o sea lenta en una tablet económica.
- **Modificar el proyecto AcuaGest.** Solo se toma como referencia. Su repositorio no se toca.

## 5. Restricciones

- El servidor corre en una **PC con Windows** del negocio. Solo se instala **Python**: la interfaz se entrega ya compilada, así que la PC no necesita Node.
- Todo en **español de México**, moneda **MXN** y zona horaria `America/Mexico_City`.
- No todos los dispositivos estarán en la misma red: unos en la WiFi del negocio y otros por internet con Cloudflare Tunnel.
- Los navegadores solo permiten el modo sin conexión (service worker) en **HTTPS**. AcuaGest 3.0 lo resuelve igual: el dispositivo entra al menos una vez por el **enlace seguro de Cloudflare**.
- Los cortes de internet esperados son **breves**. Lo normal es estar en línea.
- Hay que migrar los datos actuales de `bazarges_data.db`: 3 productos con 6 fotos, 1 venta, 1 apartado con 5 abonos y 2 usuarios.

## 6. Formas de construirlo que se consideraron

| | Opción | Ventajas | Desventajas |
|---|---|---|---|
| **1 (elegida)** | **Servidor en Python (Flask, patrón AcuaGest) + interfaz en React** | Reutiliza lo ya probado en AcuaGest 3.0: instalador, túnel, respaldos, cola sin señal, bitácora y seguridad. La PC solo necesita Python. Interfaz moderna. Paso fácil de SQLite a PostgreSQL. | Dos lenguajes en el proyecto. |
| 2 | Todo en JavaScript (Node + PostgreSQL + React) | Un solo lenguaje. | Se tira lo ya probado. La PC necesitaría Node y PostgreSQL. Instalador más complejo. |
| 3 | Base de datos replicada en cada dispositivo (PouchDB/CouchDB o similar) | Lo más fuerte sin conexión. | Pesado para celulares y difícil de instalar y mantener. Demasiado para cortes breves. |

El dueño eligió la **opción 1**.

## 7. Arquitectura

```
                      ┌──────────── PC del negocio (Windows) ────────────┐
 Tablet / celular /   │  Waitress → Flask (API JSON + sirve la app React) │
 laptop en la WiFi ───┼─▶ http://192.168.x.x:5000                          │
                      │  SQLite (WAL) · fotos · respaldos diarios          │
 Dispositivo fuera ───┼─▶ https://… (Cloudflare Tunnel) ──────────────────┘
 del local                          │
                                    │ publica catálogo / recoge pedidos
                                    ▼
                 Tienda en línea siempre encendida (Cloudflare Pages + Functions)
                 ◀── clientes desde Marketplace / WhatsApp
```

### 7.1 Servidor

- **Flask 3 + SQLAlchemy 2 + Alembic** para las migraciones, servido con **Waitress**. Se toma la estructura de AcuaGest: `app/` con `config`, `db`, `security`, `services/` y `blueprints/`.
- **SQLite en modo WAL**, con transacciones atómicas. Venta, movimiento de stock y puntos van en una sola transacción. Escrito de forma que cambiar a PostgreSQL sea solo cambiar la conexión.
- **Dinero en centavos (enteros)** para evitar errores de redondeo. **[decisión del diseñador]**
- API JSON bajo `/api/…`. La app React se sirve como archivos estáticos ya compilados.
- Se copian y adaptan de AcuaGest 3.0 (rama `demo-3.0`):
  - `run.py`, `tunnel.py` y los `.bat` (`instalar`, `aplicacion`, `acceso_remoto`, `actualizar`, `restablecer_contrasena`);
  - los respaldos diarios y la descarga de respaldo `.zip` con fotos;
  - `offline.py`: identificador único por acción, hora del cliente, tabla `offline_ops` y bitácora;
  - la seguridad: CSRF, CSP con nonce, bloqueo tras 5 intentos guardado en la base, clave secreta persistente, HSTS por internet, contraseñas iniciales bloqueadas por internet y escape contra XSS.

### 7.2 Interfaz

- **React + TypeScript + Vite**, con **Tailwind CSS + shadcn/ui** (Radix) para los componentes, **Motion** para las animaciones, **TanStack Query** para los datos y **React Router**.
- Movimiento:
  - transiciones entre pantallas con View Transitions o Motion;
  - menú lateral animado que se colapsa;
  - en celular, barra inferior animada;
  - en el carrito, artículos que entran y salen con animación;
  - contadores animados en el panel;
  - "rebote" al escanear.
- **Respetar "reducir movimiento"** del sistema operativo.
- Búsqueda universal con **Ctrl+K**, modo claro y oscuro, accesibilidad AA y atajos de teclado en la PC.
- Diseño adaptable:
  - **Celular:** escanear → producto → cobrar, con una mano.
  - **Tablet:** catálogo con fotos a la izquierda; carrito y total a la derecha.
  - **PC:** todo visible y atajos de teclado.
- Toda la tipografía, los íconos y las librerías van incluidos. Nada se carga de CDN.

### 7.3 Stock en vivo

- Cada cambio de stock sube un **número de versión**. Los dispositivos consultan `/api/stock/cambios?desde=N` cada ~3 s y además justo después de cada acción propia.
- Se eligió consulta periódica en lugar de WebSocket o SSE porque Waitress tiene pocos hilos y Cloudflare Tunnel corta conexiones largas. **[decisión del diseñador]**
- Con conexión, el servidor **rechaza** una venta sin stock suficiente.

## 8. Funciones

### 8.1 Usuarios y roles
- Roles **Administrador** y **Vendedor**. Cada persona tiene su propio usuario, que se puede desactivar.
- El vendedor puede vender, apartar, abonar, dar de alta clientes, escanear, imprimir etiquetas y ver el stock.
- El administrador además puede:
  - productos, precios y costos;
  - gastos, devoluciones y cancelaciones;
  - reportes y utilidad;
  - usuarios y configuración;
  - pedidos en línea;
  - IA y su consumo.
- Descuentos: el vendedor hasta un **% configurable** (10 % por defecto); el administrador, cualquiera. **[decisión del diseñador]**

### 8.2 Catálogo
- **Categorías administrables en árbol**, por ejemplo Escolar › Mochilas › Primaria, Hogar › Termos, Hogar › Cobijas. Al crear una categoría aparece sola en el punto de venta y en la tienda en línea.
- **Producto** = modelo base: nombre, descripción, categoría, fotos y el interruptor **"Mostrar en tienda en línea"** (encendido por defecto).
- **Variante** = lo que se vende y se cuenta: atributos libres (color, talla o tamaño, capacidad, personaje), **SKU y código de barras propios**, precio, costo y stock. Un producto sin variantes tiene una sola variante oculta.
- El **costo se guarda en cada venta** para calcular bien la utilidad aunque el costo cambie después.

### 8.3 Alta de producto con fotos obligatorias
- Al guardar un producto se abre la cámara con una guía de **2 o 3 tomas** ("Frente", "Lado", "Detalle o etiqueta"). También se pueden subir desde la galería o desde archivos en la PC.
- **Se exige al menos 1 foto.**
- El dispositivo **reduce y comprime** la foto (~1600 px, WebP). El servidor revisa que sea una imagen real y le quita los datos de ubicación (EXIF), como en AcuaGest.
- Al guardar se generan **automáticamente**:
  - código de barras;
  - huella visual para el reconocimiento;
  - página en la tienda en línea.
- Dar de alta o editar productos **requiere conexión**.

### 8.4 Códigos de barras y etiquetas
- **Lectura:**
  - con la cámara de cualquier dispositivo, usando `BarcodeDetector` nativo con respaldo en ZXing para iOS y navegadores sin soporte;
  - también con **lector USB** (funciona como teclado) en la PC.
- Lee los códigos propios y los de fábrica (EAN-13 y UPC). A una variante se le puede asociar el código de fábrica que ya trae.
- **Generación:** si el producto no trae código, se crea uno interno en **Code 128** con un prefijo propio (por ejemplo `MA000123`). **[decisión del diseñador]**
- **Etiquetas imprimibles**, con nombre, variante, precio y código:
  - hoja carta de etiquetas adhesivas, con varios tamaños comunes;
  - impresora térmica de etiquetas, de 50×25 mm.
- Se puede imprimir **una etiqueta por cada pieza en stock** o la cantidad que se elija. Se imprime desde el navegador (vista de impresión o PDF).

### 8.5 Reconocimiento visual (producto sin etiqueta)
- **En el dispositivo (gratis y sin internet):**
  - un modelo de visión en el navegador (ONNX o TensorFlow.js) calcula una **huella** de cada foto de producto al darla de alta;
  - las huellas se guardan en el servidor y cada dispositivo descarga el índice, que es pequeño, para comparar sin conexión;
  - al apuntar la cámara se muestran **los 3 más parecidos** (foto, variante y precio) y el vendedor **toca el correcto**. Nunca se agrega al carrito sin esa confirmación.
- **Botón "✨ Buscar con IA" (solo si el vendedor lo pulsa y hay internet):**
  - el servidor envía la foto y una lista de candidatos (los más parecidos según la huella, con su nombre y foto) a la **API de IA de Anthropic (Claude, con visión)** y devuelve su mejor coincidencia para confirmar;
  - la clave de la API va en `.env`; sin clave, el botón no aparece;
  - un **contador mensual de consultas** y un **límite mensual configurable** se pueden ver en Configuración. Antes de activarla se confirma con el dueño el costo por consulta.

### 8.6 Punto de venta
- **Carrito** con varios artículos: por escáner, reconocimiento, búsqueda o catálogo con fotos.
- Cliente opcional (búsqueda o alta rápida), descuentos según el rol y nota.
- **Formas de pago:** efectivo (calcula el cambio), tarjeta (terminal externa; solo se registra), transferencia y **pago mixto**. **[decisión del diseñador]**
- **Ticket** para impresora térmica de 58 mm o 80 mm, configurable. También se puede **compartir por WhatsApp** como imagen o texto.
- **Caja:** apertura con fondo inicial y **corte de caja** por turno, con desglose por forma de pago, abonos de apartados, gastos pagados de caja y diferencia contra lo contado.

### 8.7 Apartados
- Apartados de **varios artículos**, con anticipo, fecha límite y abonos. El stock queda reservado.
- Ticket de apartado con su historial de abonos.
- **Liquidar** convierte el apartado en venta. **Cancelar** cambia su estado y regresa el stock, pero **no borra** los abonos. Qué pasa con el dinero se registra: devuelto o queda como saldo a favor.
- No se permite abonar más que el saldo.

### 8.8 Clientes
- Nombre, teléfono, correo y notas. **Puntos de lealtad**: se conserva la regla actual de 1 punto por cada $10, configurable.
- Historial de compras, apartados y pedidos en línea de cada cliente.

### 8.9 Inventario
- **Bitácora de movimientos** de stock: venta, devolución, apartado, cancelación, entrada de mercancía, ajuste y pedido en línea, cada uno con usuario, motivo y hora.
- **Entradas de mercancía** con proveedor y costo opcionales, para registrar las compras.
- **Alerta de stock negativo** cuando llega una venta hecha sin señal que dejó el stock por debajo de cero.
- **Predicción de agotamiento** (se conserva la idea del sistema actual) y alerta de stock bajo.

### 8.10 Devoluciones, gastos y reportes
- Las **devoluciones** se registran como movimiento propio y **nunca borran la venta**. Regresan el stock y descuentan los puntos.
- **Gastos** por categoría.
- **Reportes** por día, semana, mes o rango: ventas, utilidad real (con el costo guardado en cada venta), los más vendidos, ventas por categoría y por vendedor, y apartados vencidos. Exportación a Excel (CSV).
- **Panel** con indicadores animados y gráficas.

### 8.11 Venta sin conexión (patrón AcuaGest 3.0)
- **Acciones permitidas sin señal:**
  - venta;
  - crear apartado;
  - abono a apartado;
  - alta de cliente.
- **Requieren conexión:** productos, precios, devoluciones, cancelaciones, reportes, usuarios y configuración.
- Cada acción se guarda en **IndexedDB** con un **identificador único** (`X-Client-Uid`) y la **hora real** (`X-Client-Time`). Al volver la señal se envía sola en orden. El servidor no la repite aunque llegue dos veces (tabla `offline_ops`). Nada se borra del dispositivo hasta que el servidor confirma.
- Los registros creados sin señal usan **identificadores generados en el dispositivo (UUID)**. Así, una venta a un cliente dado de alta sin señal se enlaza bien al sincronizar. **[decisión del diseñador]**
- **Stock sin señal:** el dispositivo usa el último stock que vio y le resta sus propias ventas pendientes. Muestra "visto hace X min · sin señal" y pide confirmación si quedan **2 piezas o menos**. Si al sincronizar el stock queda negativo, **la venta se acepta** y se genera una alerta para el administrador.
- **Aviso visible** "Sin señal", un botón de **pendientes** (forzar envío, reintentar o descartar con motivo), un aviso antes de cerrar sesión con pendientes y un respaldo de emergencia de la cola.
- Los pendientes son por usuario: si otra persona entra en el mismo dispositivo, no se envían a su nombre.
- **Service worker** con la app completa guardada en el dispositivo, el índice de huellas y el modelo de visión, además de catálogo, precios y clientes en IndexedDB para vender sin señal.
- **Un solo enlace para todos (decisión del dueño).** Todos los dispositivos, dentro y fuera del local, se conectan con el mismo enlace **HTTPS**, así que todos pueden trabajar sin señal. Dentro del local, si se cae el internet, el dispositivo pasa al modo sin señal y envía todo al volver. La dirección `http://192.168…` queda como respaldo de emergencia, sin modo sin señal porque el navegador lo impide sin HTTPS.
- **Pantalla "Conectar dispositivo"** (sección 8.13): QR, *Enviar por WhatsApp* y *Copiar enlace*. Elige sola el mejor enlace disponible: 1) `PUBLIC_URL` (dominio fijo), 2) el enlace temporal del túnel si `acceso_remoto.bat` está activo, 3) la IP de la red local. Al abrirlo se ofrece **instalar la app** (PWA) en la pantalla de inicio.
- **Etapas del enlace:**
  - **Desarrollo y pruebas:** red local y enlace temporal de Cloudflare. El enlace temporal cambia en cada arranque: hay que volver a escanear el QR, y lo guardado en el dispositivo para ese enlace se pierde. Antes de volver a escanear, la app debe avisar si quedan pendientes.
  - **Cuando el sistema esté estable (decisión del dueño):** se compra un dominio, se configura el túnel fijo (`CLOUDFLARE_TUNNEL_TOKEN` + `PUBLIC_URL`) y todos los dispositivos escanean el QR una última vez. Al mudarse a la nube solo cambia a dónde apunta el dominio.

### 8.12 Tienda en línea
- Se publica en **Cloudflare Pages** (gratis y siempre encendida), así que **funciona aunque la PC esté apagada**. Requiere una cuenta gratuita de Cloudflare, la misma que después servirá para el dominio fijo.
- **Se actualiza sola:** cuando cambian productos, precios, fotos o stock, la PC genera el sitio y lo publica. Hay pequeños retrasos si está sin internet, y un botón "Publicar ahora".
- **Página por producto** con link propio y **vista previa** (Open Graph) con foto, nombre y precio para WhatsApp, Facebook y Marketplace. Se marca **"Agotado"** cuando no hay stock; se puede ocultar los agotados desde Configuración.
- Pensada primero para celular: categorías, búsqueda, galería de fotos, selector de variante y **carrito** guardado en el navegador del cliente.
- **Pedido:**
  1. El cliente deja nombre, teléfono y si recoge o quiere envío.
  2. Se crea un **folio** y se abre WhatsApp con el mensaje del pedido listo para el número del negocio.
  3. El pedido también se guarda en una función de Cloudflare (Pages Functions + almacenamiento KV o D1).
  4. La PC **recoge los pedidos** cuando está en línea y aparecen en el sistema como **"Pedidos en línea · pendientes"**.
  5. El personal los **confirma** (aparta stock), los **cobra** (convierte en venta) o los **rechaza**.
  6. El costo de envío lo pone el personal al confirmar.
- **Pago con tarjeta:** queda la interfaz de "proveedor de pago" (pensada para Mercado Pago) desactivada, para activarla después.
- **Mientras no exista la cuenta de Cloudflare:** la tienda se sirve desde la misma PC por el túnel, y solo funciona con la PC prendida.

### 8.13 Configuración del negocio
- Nombre **"Modas Andrea"** con subtítulo **"Yuda"**, logo, colores, WhatsApp del negocio, dirección y horario (se muestran en la tienda), datos del ticket, tamaños de etiqueta, impresora, reglas de puntos, % de descuento del vendedor, umbral de "pocas piezas", clave y límite de IA, y datos de Cloudflare.
- Nada del negocio queda escrito en el código.

### 8.14 Migración
- Un script importa `bazarges_data.db` (productos, fotos, venta, apartado con abonos y clientes). Las categorías actuales se convierten en el nuevo árbol de categorías, y a los productos que no tengan código se les genera uno.
- **No se importan** los usuarios ni las contraseñas por defecto (`admin/admin`, `vendedor/123`). Se crean nuevos al instalar.

## 9. Instalación y operación (como AcuaGest)
- `instalar.bat`: busca o instala Python, crea `.venv`, instala dependencias, crea `.env` con clave secreta aleatoria, prepara la base y crea los accesos directos.
- `aplicacion.bat`: inicia el servidor y muestra la dirección en la red local.
- `acceso_remoto.bat`: además abre el túnel de Cloudflare (modo prueba o modo fijo con token).
- También `actualizar.bat` y `restablecer_contrasena.bat`.
- **Respaldos diarios** automáticos (se conservan 15) y descarga de respaldo `.zip` con fotos.
- **Conectar dispositivo**: QR, envío por WhatsApp y copia del enlace, con la elección de enlace descrita en 8.11.
- El **dominio fijo se compra más adelante**, cuando el sistema esté estable y las pruebas avanzadas (decisión del dueño).

## 10. Calidad
- Pruebas automáticas del servidor con `pytest`, sobre todo:
  - ventas;
  - stock;
  - apartados;
  - que una acción repetida no se duplique;
  - sincronización sin señal;
  - pedidos en línea.
- Pruebas de la interfaz y del flujo sin conexión en un navegador real con Playwright, incluyendo cortar la red a la mitad de una venta.
- Revisión de seguridad antes de exponer por internet.

## 11. Lo que se deja al constructor
- Estructura exacta de carpetas, nombres de tablas y endpoints.
- Qué modelo de visión usar en el navegador. Debe pesar poco, funcionar sin conexión y servir en una tablet económica.
- Qué modelo de Claude usar y cómo se arma la consulta, con el modelo configurable en `.env`.
- Diseño visual concreto (colores, tipografía, estilo), con los skills de diseño. Se mostrarán propuestas al dueño antes de construir todas las pantallas.
- El generador del sitio estático y el mecanismo de publicación a Cloudflare.
- Orden de las etapas, propuesto en el plan.

## 12. Decisiones del diseñador para revisar
1. Dinero en centavos y costo guardado en cada venta.
2. Stock en vivo por consulta cada ~3 s, no por WebSocket.
3. Descuento del vendedor hasta un 10 % configurable.
4. Código interno Code 128 con prefijo `MA`.
5. Formas de pago: efectivo, tarjeta (terminal externa), transferencia y mixto.
6. Ticket de 58 mm u 80 mm y etiquetas en hoja carta o térmicas de 50×25 mm.
7. Acciones sin señal: venta, apartado, abono y alta de cliente. Todo lo demás requiere conexión.
8. Confirmación al vender sin señal cuando quedan 2 piezas o menos.
9. La tienda en línea vive en Cloudflare Pages para funcionar con la PC apagada, y los pedidos se confirman en el sistema.
10. No se importan los usuarios ni las contraseñas del sistema viejo.

Decidido por el dueño: un solo enlace HTTPS para todos los dispositivos, compartido por QR o WhatsApp. El dominio fijo se compra cuando el sistema esté estable.
