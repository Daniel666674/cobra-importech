# Importech · Demo de control de inventario

Demo interactivo y **completamente funcional** (HTML, CSS y JavaScript, sin backend) de un sistema de inventario, ventas, apartados, garantías y automatizaciones para una tienda de tecnología Apple.

## Cómo verlo

- **En línea:** se publica en GitHub Pages (`https://<usuario>.github.io/cobra-importech/`).
- **En tu computador:** abre `index.html` con doble clic.

## Qué incluye

- **Inicio de sesión con usuarios y roles**, PIN opcional y matriz de permisos editable (16 permisos). Equipo del demo: **Daniel** (Desarrollador, acceso total y herramientas de datos), **Angelica** (Propietario/a, todo el negocio) y **Anderson** (Empleado/a de tienda: vende, maneja apartados, trade-in, clientes y taller; sin costos ni reportes).
- **Inventario** de 70+ productos: iPhone, iPad, Mac, Apple Watch, AirPods y accesorios, en 5 condiciones (nuevo, exhibición, reacondicionado, pre-owned y usado), con costo, precio, garantía y línea de tiempo por producto.
- **Ingreso de productos** con verificación de IMEI (simulada), edición, ajuste de stock, exportar CSV.
- **Escáner con cámara** (📷): lee el IMEI y el serial de los códigos de barras de la caja, y con “Leer texto” (OCR) el modelo, capacidad, color, batería y serial de la pantalla *Ajustes → General → Información*. Llena el formulario solo. También sirve en Venta (agrega el equipo al carrito), Trade-in y Recibir lote (varios códigos seguidos). También acepta foto. Todo se procesa en el dispositivo.
- **Nueva venta** con catálogo en tarjetas y búsqueda, escáner, accesorios sugeridos, buscador de clientes, descuentos con motivo y límite por rol, garantía editable por producto, pago en varios métodos, cambio en efectivo, confirmación previa y comprobante al instante.
- **Apartados con abonos:** abono mínimo configurable, abonos parciales con recibo, aviso de saldo antes del vencimiento, liberación automática, y completar la venta descontando lo abonado.
- **Comprobantes de diseño profesional** para cada venta, apartado y abono: logo, IMEI/serial, garantía, valor en letras, plan de pagos y firmas. Se imprimen o se guardan como PDF.
- **Devoluciones, garantías con reclamos, clientes.**
- **Trade-in, taller y compras con costo real de importación y recepción por lote.** El negocio se maneja como una sola tienda.
- **Alertas y automatizaciones** calculadas con los datos reales, y **reportes** con exportación.
- **Configuración:** nombre y datos del negocio, **logo subido desde un archivo**, color de marca, reglas de garantía, descuentos y apartados, copia de seguridad y restablecer.

## App instalable (PWA)

Se puede **instalar** en el celular o el computador y **abre sin internet**. Botón *Instalar app* en la barra superior; en iPhone: Compartir → *Agregar a pantalla de inicio*. Detalles y guía para la app real en [`docs/PWA.md`](docs/PWA.md).

## Datos y límites del demo

- Todo se guarda en el navegador (`localStorage`). Si borras los datos del sitio, vuelve a los datos de ejemplo. En *Configuración → Datos* puedes descargar y restaurar una copia.
- Los usuarios y permisos son un control de acceso de **demostración**: no reemplazan la seguridad de un servidor.
- La verificación de IMEI (hurto, extravío, iCloud, operador) está **simulada**. En *Ingresar producto* hay botones de prueba.
- Los comprobantes no son facturas electrónicas válidas ante la DIAN.
- El backend real se construye después de la firma del contrato.

## Estructura

```
index.html          Página principal
manifest.webmanifest Datos de la app instalable
sw.js               Service worker (modo sin conexión)
404.html            Página de error que devuelve al demo
assets/app.css      Estilos (incluye diseño del comprobante e impresión)
assets/icons/       Íconos de la app
assets/vendor/      Librerías del escáner (ZXing y Tesseract.js, ver LICENSES.md)
js/data.js          Catálogo, datos de ejemplo y persistencia
js/core.js          Permisos, ayudantes, alertas, logo y verificación de IMEI
js/views-ops.js     Dashboard, inventario, ingreso, trade-in, taller
js/views-sales.js   Nueva venta, ventas, apartados, garantías, clientes
js/receipts.js      Factura, recibo de apartado y recibo de pago
js/views-admin.js   Compras, automatizaciones, reportes, usuarios, configuración
js/scanner.js       Escáner con cámara: códigos de barras y lectura de texto
js/app.js           Navegación, sesión y arranque
docs/               Propuesta comercial
```

## Publicar en GitHub Pages

En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Luego cada push a `main` publica el sitio (o ejecuta el workflow manualmente en la pestaña *Actions*).
