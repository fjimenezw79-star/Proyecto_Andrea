# Modas Andrea (Yuda)

Sistema de ventas para la tienda: catálogo con variantes y fotos, inventario con bitácora y punto de venta con carrito y pagos mixtos. La PC del negocio funciona como servidor y los demás dispositivos se conectan a ella.

> **Etapa 4 de 6.** Ya incluye la app para vender desde PC, tablet o celular, la operación diaria (clientes, apartados, devoluciones, gastos, caja, reportes y panel) y la **conexión**: stock en vivo en todos los dispositivos, ventas sin señal que se envían solas, app instalable, acceso seguro por internet con código QR, alertas de stock y bitácora. Las etiquetas, la cámara para leer códigos y la tienda en línea llegan en las siguientes etapas (ver `docs/superpowers/plans/`).

## 1. Instalación (Windows)

1. Copia la carpeta del sistema donde quieras, por ejemplo en `C:\ModasAndrea`.
2. Haz doble clic en **`instalar.bat`**. El instalador:
   - busca Python 3.12 o superior y, si no lo encuentra, lo instala con `winget`;
   - crea un entorno aislado (`.venv`) e instala las librerías de `requirements.txt`;
   - crea el archivo `.env` con una clave secreta aleatoria;
   - prepara la base de datos en `data\modas-andrea.db`;
   - te pregunta si quieres cargar el **catálogo de prueba** (58 productos con foto);
   - crea el acceso directo **Modas Andrea** en el escritorio.
3. Abre el sistema con **`aplicacion.bat`** o con el acceso directo.

### Usuarios iniciales

| Usuario    | Contraseña | Rol           |
|------------|------------|---------------|
| `admin`    | `admin123` | Administrador |
| `vendedor` | `12345`    | Vendedor      |

Cámbialas antes de usar el sistema en la tienda. Si se olvida una contraseña, usa **`restablecer_contrasena.bat`**.

## 2. Usar el sistema

Al abrir `aplicacion.bat` se abre el navegador en `http://127.0.0.1:5000`. Desde otra computadora, tablet o celular conectado a la misma red, abre la dirección que aparece como **En la red local** (por ejemplo `http://192.168.1.20:5000`).

![Inicio de sesión](docs/img/01-entrar.webp)

### Vender

Toca un producto, escanéalo con el lector de códigos USB o búscalo con **Ctrl + K**. El carrito muestra el total. **Cobrar** abre el pago: efectivo (calcula el cambio), tarjeta, transferencia o mixto. El vendedor puede dar hasta 10 % de descuento; más que eso lo autoriza el administrador.

![Vender](docs/img/02-vender.webp)
![Cobrar](docs/img/03-cobrar.webp)

En el celular el carrito queda abajo y se abre con **Ver carrito**:

![Celular](docs/img/07-celular.webp)

### Inventario

Cada producto tiene su ficha con fotos, variantes, precio, costo (solo administrador) y bitácora. **Entrada** suma piezas cuando llega mercancía; **Ajustar existencias** corrige el conteo y pide el motivo.

![Ficha de producto](docs/img/04-ficha.webp)

### Nuevo producto

Cuatro pasos: datos, precio (o variantes como colores y tallas), fotos y revisar. La cámara guía las tomas *Frente*, *Lado* y *Detalle*; si no hay cámara, usa **Elegir foto**. Al guardar recibe su código `MA######` y aparece en Vender.

![Nuevo producto](docs/img/05-nuevo-producto.webp)

> La cámara del navegador solo funciona en la misma computadora (`127.0.0.1`) o con el enlace seguro `https://` de `acceso_remoto.bat`. Desde otros dispositivos en la red local usa **Elegir foto**, que abre la cámara del celular.

### Ventas del día

Lista de ventas con totales por forma de pago. El administrador puede **cancelar** una venta: las piezas regresan al inventario y la venta queda registrada como cancelada.

![Ventas del día](docs/img/06-ventas.webp)

### Clientes

Toca **Cliente** en el carrito para buscarlo o registrarlo (nombre y teléfono). Cada compra suma 1 punto por cada $10. Si tiene **saldo a favor** (por una devolución o un apartado cancelado), aparece la pestaña **Saldo** al cobrar.

### Apartados

En Vender, agrega los productos, elige al cliente y toca **Apartar**: escribe el anticipo y la fecha límite (30 días por defecto). Las piezas salen del inventario para que nadie más las venda. En **Apartados** registras abonos, **liquidas** (se convierte en venta) o, como administrador, **cancelas**: las piezas regresan y el dinero se devuelve o queda como saldo a favor.

![Apartado](docs/img/08-apartado.webp)

### Devoluciones

En **Ventas de hoy**, abre la venta y toca **Devolver piezas** (administrador): eliges cuántas piezas regresan y cómo se reembolsa. El monto se calcula con lo que se pagó por esas piezas.

### Caja

Al empezar el turno, **Abrir caja** con el fondo inicial. La pantalla muestra en vivo el efectivo que debe haber: fondo + ventas y abonos en efectivo − reembolsos − gastos pagados de la caja. Al terminar, **Hacer corte**: escribes lo que contaste y ves si cuadra, falta o sobra. Si alguien cobra en efectivo sin abrir caja, el sistema la abre solo con fondo $0.

![Caja](docs/img/09-caja.webp)

### Gastos, reportes y panel (administrador)

- **Gastos:** renta, luz, sueldos… Marca *Se pagó con dinero de la caja* cuando sale del cajón.
- **Reportes:** hoy, semana, mes o rango. Ventas netas, utilidad (con el costo de cada pieza al venderla), gastos, gráficas por día, categoría, forma de pago y vendedor, lo más vendido y **Descargar Excel (CSV)**.
- **Panel:** ventas de hoy y del mes, apartados por vencer, stock bajo y **Se agota pronto** (días que quedan al ritmo de venta de los últimos 30 días).

![Reportes](docs/img/10-reportes.webp)
![Panel](docs/img/11-panel.webp)

### Conectar dispositivos (administrador)

En **Conectar dispositivo** aparece un código QR y el enlace del sistema, con **Copiar** y **Enviar por WhatsApp**. El vendedor lo escanea con la cámara del celular, inicia sesión y, si el enlace es `https://`, instala la app desde el menú del navegador (Android: *Instalar app*; iPhone: *Compartir → Agregar a inicio*).

![Conectar dispositivo](docs/img/12-conectar.webp)

- **Enlace de red local** (`http://192.168…`): solo funciona en el mismo Wi-Fi del negocio y la app no trabaja sin señal.
- **Enlace por internet** (`https://…`): funciona desde cualquier lugar, la app se instala y trabaja sin señal. Se obtiene con `acceso_remoto.bat` (ver abajo).

### Stock en vivo

Cada 3 segundos la app revisa si otro dispositivo vendió o apartó algo y actualiza las existencias en pantalla y en el carrito. Así dos vendedores no venden la misma última pieza.

### Si se va el internet

La app sigue funcionando con la copia del catálogo guardada en el dispositivo:

1. Arriba aparece **Sin señal** en color vino.
2. Las **ventas, apartados, abonos y clientes nuevos** se guardan en el dispositivo con un folio provisional (`P-1234`) y la nube muestra cuántos hay **pendientes**.
3. Si quedan 2 piezas o menos, la app pide confirmar porque no puede revisar si otro dispositivo ya las vendió.
4. Al volver la señal todo se envía solo y en orden, con la hora real en que se hizo. Aparece **Todo enviado.**

![Venta sin señal](docs/img/13-sin-senal.webp)
![Pendientes](docs/img/14-pendientes.webp)

Lo mismo pasa si la computadora del negocio se apaga o se queda sin internet mientras los celulares usan el enlace por internet. Mientras no hay señal, Vender avisa **Sin señal · existencias vistas hace N min**, y el saldo a favor de los clientes solo se usa con señal. Un cliente registrado sin señal con un teléfono que ya existe se guarda sin teléfono y con una nota para que el administrador revise si es la misma persona.

Si una acción no se puede registrar (por ejemplo, un abono a un apartado que ya se liquidó), queda marcada en **Pendientes** con el motivo para **Reintentar** o **Descartar**. Lo descartado queda en la **Bitácora** con el motivo y sus datos, y **Guardar respaldo de pendientes** descarga un archivo con todo lo que falta por enviar. Nada se envía dos veces aunque la señal se corte a la mitad. Al **Salir** con pendientes, la app avisa: se quedan guardados en el dispositivo y se envían cuando ese usuario vuelve a entrar. Al salir se borran del dispositivo los clientes y el catálogo guardados; también se puede salir sin señal.

### Alertas de stock y bitácora (administrador)

Si una venta hecha sin señal deja el stock en negativo (otro dispositivo vendió la misma pieza), el **Panel** lo muestra en **Stock negativo por ventas sin señal**: cuenta las piezas, corrige con **Ajustar existencias** y toca **Marcar como revisada**.

![Alerta de stock](docs/img/15-alerta.webp)

La **Bitácora** muestra quién hizo cada venta, apartado, abono, gasto, ajuste o cambio, y cuándo. Lo hecho sin señal lleva la etiqueta **Sin señal** y la hora real.

![Bitácora](docs/img/16-bitacora.webp)

### Mi cuenta

Toca tu nombre (abajo en el menú, o **Más → Mi cuenta** en el celular) para cambiar tu contraseña.

## 3. Acceso desde internet

1. Desde la computadora del negocio, entra con cada usuario y cambia su contraseña en **Mi cuenta**. Por internet **no** se puede entrar con las contraseñas iniciales (`admin123`, `12345`).
2. Abre el sistema con **`acceso_remoto.bat`** en lugar de `aplicacion.bat`. La primera vez descarga la herramienta de Cloudflare (unos 50 MB).
3. La ventana muestra la dirección **DESDE INTERNET** (`https://….trycloudflare.com`). En **Conectar dispositivo** aparece ya con su QR.

No hace falta abrir puertos del módem: Cloudflare solo reenvía las visitas cifradas hasta la computadora. La dirección de prueba **cambia cada vez** que se inicia `acceso_remoto.bat`. Para una dirección fija, crea un túnel en tu cuenta de Cloudflare y escribe en `.env` su `CLOUDFLARE_TUNNEL_TOKEN` y tu dominio en `PUBLIC_URL`.

## 4. Archivos `.bat`

| Archivo | Para qué sirve |
|---|---|
| `instalar.bat` | Instala o actualiza todo. Puedes volver a ejecutarlo: no borra tus datos. |
| `aplicacion.bat` | Inicia el servidor. Mientras la ventana esté abierta, el sistema funciona. |
| `acceso_remoto.bat` | Inicia el servidor con acceso seguro desde internet (Cloudflare). |
| `restablecer_contrasena.bat` | Cambia la contraseña de cualquier usuario. |
| `cargar_datos_prueba.bat` | Carga los 58 productos de prueba (no duplica). |
| `migrar_sistema_anterior.bat` | Pasa productos, fotos, ventas y apartados del sistema anterior (`bazarges_data.db`). |
| `ejecutar_pruebas.bat` | Corre las pruebas automáticas con bases temporales; tus datos no se tocan. |

## 5. Tus datos

- Todo vive en la carpeta `data`: la base de datos, las fotos de los productos y los respaldos.
- Cada vez que se inicia el sistema se crea un **respaldo diario** en `data\respaldos` y se conservan los 15 más recientes.

### Pasar los productos del sistema anterior

```bat
.venv\Scripts\python -m scripts.migrar_sistema_anterior "C:\ruta\PROYECTO ANDREA_4\bazarges_data.db"
```

Copia los productos con sus fotos, precio y existencias, las ventas y los apartados pendientes con sus abonos. El código anterior (por ejemplo `MOD001`) queda como código de barras del producto, así que se puede seguir escaneando. No se copian los usuarios ni las contraseñas. Se puede correr varias veces sin duplicar nada.

### Catálogo de prueba

```bat
.venv\Scripts\python -m scripts.importar_datos_prueba
```

Carga los 58 productos de `datos_prueba\`. Puedes correrlo varias veces: no duplica nada.

## 6. Configuración (`.env`)

| Variable | Descripción |
|---|---|
| `PORT` | Puerto del servidor (5000 por defecto). |
| `SELLER_MAX_DISCOUNT_PCT` | Descuento máximo que puede dar un vendedor (10 % por defecto). |
| `POINTS_PER_PESOS` | Un punto de lealtad por cada N pesos (10 por defecto). |
| `LAYAWAY_DAYS` | Días de plazo de un apartado si no se elige fecha (30). |
| `BACKUPS_TO_KEEP` | Respaldos diarios que se conservan (15). |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token del túnel de Cloudflare para una dirección fija (opcional). |
| `PUBLIC_URL` | La dirección fija del negocio, por ejemplo `https://ventas.modasandrea.com` (opcional). |
| `BLOCK_DEFAULT_PASSWORDS_REMOTE` | Rechaza las contraseñas iniciales por internet (`true`). |

Reinicia `aplicacion.bat` después de cambiar un valor.

## 7. Para desarrolladores

```bash
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest -q
.venv/bin/python run.py --dev --no-browser
```

App web (`web/`, React + TypeScript + Vite). La PC de la tienda **no** necesita Node: la app compilada vive en `server/web_dist/` y se guarda en git.

```bash
cd web
npm ci
npm run dev        # http://localhost:5173 con proxy a la API en :5000
npm test           # pruebas de lógica (Vitest)
npm run e2e        # compila y prueba en navegador real (Playwright) contra un servidor temporal
npm run build      # vuelve a generar server/web_dist
```

Estructura: `server/` (app Flask: `config`, `db`, `models`, `security`, `photos`, `codes`, `services/`, `blueprints/`, `migrations/`), `scripts/` (importadores y utilidades), `tests/`, `datos_prueba/` y `docs/`.
