# Modas Andrea (Yuda)

Sistema de ventas para la tienda: catálogo con variantes y fotos, inventario con bitácora y punto de venta con carrito y pagos mixtos. La PC del negocio funciona como servidor y los demás dispositivos se conectan a ella.

> **Etapa 1 de 6.** Esta versión tiene el servidor y su API. Las pantallas llegan en la etapa 2 (ver `docs/superpowers/plans/`).

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

## 2. Archivos `.bat`

| Archivo | Para qué sirve |
|---|---|
| `instalar.bat` | Instala o actualiza todo. Puedes volver a ejecutarlo: no borra tus datos. |
| `aplicacion.bat` | Inicia el servidor. Mientras la ventana esté abierta, el sistema funciona. |
| `restablecer_contrasena.bat` | Cambia la contraseña de cualquier usuario. |

## 3. Tus datos

- Todo vive en la carpeta `data`: la base de datos, las fotos de los productos y los respaldos.
- Cada vez que se inicia el sistema se crea un **respaldo diario** en `data\respaldos` y se conservan los 15 más recientes.

### Pasar los productos del sistema anterior

```bat
.venv\Scripts\python -m scripts.migrar_sistema_anterior "C:\ruta\PROYECTO ANDREA_4\bazarges_data.db"
```

Copia los productos con sus fotos, precio y existencias. El código anterior (por ejemplo `MOD001`) queda como código de barras del producto, así que se puede seguir escaneando. No se copian los usuarios ni las contraseñas. Las ventas y apartados viejos se pasarán en la etapa 3.

### Catálogo de prueba

```bat
.venv\Scripts\python -m scripts.importar_datos_prueba
```

Carga los 58 productos de `datos_prueba\`. Puedes correrlo varias veces: no duplica nada.

## 4. Configuración (`.env`)

| Variable | Descripción |
|---|---|
| `PORT` | Puerto del servidor (5000 por defecto). |
| `SELLER_MAX_DISCOUNT_PCT` | Descuento máximo que puede dar un vendedor (10 % por defecto). |
| `POINTS_PER_PESOS` | Un punto de lealtad por cada N pesos (10 por defecto). |
| `BACKUPS_TO_KEEP` | Respaldos diarios que se conservan (15). |

Reinicia `aplicacion.bat` después de cambiar un valor.

## 5. Para desarrolladores

```bash
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest -q
.venv/bin/python run.py --dev --no-browser
```

Estructura: `server/` (app Flask: `config`, `db`, `models`, `security`, `photos`, `codes`, `services/`, `blueprints/`, `migrations/`), `scripts/` (importadores y utilidades), `tests/`, `datos_prueba/` y `docs/`.
