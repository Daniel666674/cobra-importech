# Importech · Demo de control de inventario

Demo interactivo y **completamente funcional** (HTML, CSS y JavaScript, sin backend) de un sistema de inventario, ventas, cuotas, garantías y automatizaciones para una tienda de tecnología Apple.

## Cómo verlo

- **En línea:** se publica en GitHub Pages (`https://<usuario>.github.io/cobra-importech/`).
- **En tu computador:** abre `index.html` con doble clic.

## Qué incluye

- **Inicio de sesión con usuarios y roles**, PIN opcional y matriz de permisos editable (16 permisos).
- **Inventario** de 70+ productos: iPhone, iPad, Mac, Apple Watch, AirPods y accesorios, en 5 condiciones (nuevo, exhibición, reacondicionado, pre-owned y usado), con costo, precio, garantía y línea de tiempo por producto.
- **Ingreso de productos** con verificación de IMEI (simulada), edición, ajuste de stock, exportar CSV.
- **Ventas (POS)** con carrito, descuentos con límite por rol, contado, cuotas y apartados.
- **Comprobantes de diseño profesional** para cada venta, apartado y pago de cuota: logo, IMEI/serial, garantía, valor en letras, plan de pagos y firmas. Se imprimen o se guardan como PDF.
- **Devoluciones, cuotas con recordatorios, garantías con reclamos, clientes.**
- **Trade-in, taller, compras con costo real de importación y recepción por lote, sedes y transferencias.**
- **Alertas y automatizaciones** calculadas con los datos reales, y **reportes** con exportación.
- **Configuración:** nombre y datos del negocio, **logo subido desde un archivo**, color de marca, sedes, reglas de garantía y descuentos, copia de seguridad y restablecer.

## Datos y límites del demo

- Todo se guarda en el navegador (`localStorage`). Si borras los datos del sitio, vuelve a los datos de ejemplo. En *Configuración → Datos* puedes descargar y restaurar una copia.
- Los usuarios y permisos son un control de acceso de **demostración**: no reemplazan la seguridad de un servidor.
- La verificación de IMEI (hurto, extravío, iCloud, operador) está **simulada**. En *Ingresar producto* hay botones de prueba.
- Los comprobantes no son facturas electrónicas válidas ante la DIAN.
- El backend real se construye después de la firma del contrato.

## Estructura

```
index.html          Página principal
assets/app.css      Estilos (incluye diseño del comprobante e impresión)
js/data.js          Catálogo, datos de ejemplo y persistencia
js/core.js          Permisos, ayudantes, alertas, logo y verificación de IMEI
js/views-ops.js     Dashboard, inventario, ingreso, trade-in, taller
js/views-sales.js   POS, ventas, cuotas, garantías, clientes
js/receipts.js      Factura, recibo de apartado y recibo de pago
js/views-admin.js   Compras, sedes, automatizaciones, reportes, usuarios, configuración
js/app.js           Navegación, sesión y arranque
docs/               Propuesta comercial
```

## Publicar en GitHub Pages

En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Luego cada push a `main` publica el sitio (o ejecuta el workflow manualmente en la pestaña *Actions*).
