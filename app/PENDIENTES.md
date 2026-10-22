# Pendientes para salir a producción con la clienta

Estado al 22 de octubre de 2026. Orden sugerido: primero lo que bloquea el arranque, luego lo legal, después las mejoras.

## Bloquea el arranque (antes de que la tienda opere con el sistema)

| # | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| 1 | **Importar el inventario actual (CSV)** | Hoy cada producto se ingresa uno a uno. Con 80–200 equipos en vitrina es medio día de digitación y errores. Debe pasar por la misma verificación de IMEI: los iPhone importados entran «En revisión» hasta registrar CRC/Apple. | 1 día |
| 2 | **Recibir el archivo real de ventas de la clienta** y hacer una importación de prueba | El importador ya está listo, pero hay que confirmar con su archivo real (formato de fechas, columnas, si trae costo e IMEI). Si no trae costo, los márgenes históricos no salen. | 1–2 h con el archivo |
| 3 | **Datos del negocio** en Configuración: NIT, razón social, responsabilidad tributaria, numeración que continúa la del sistema anterior | El comprobante ya se puede personalizar completo; falta cargar los datos reales y revisar la vista previa con ella. | 30 min con la clienta |
| 4 | **Usuarios del personal** y permisos del rol «Empleado/a» | Cada persona con su PIN (6 dígitos para la dueña). | 30 min |
| 5 | **Plan Pro de Vercel** | El plan Hobby es solo para uso no comercial. | Trámite |

## Legal y facturación (Colombia)

| # | Qué | Nota |
|---|---|---|
| 6 | **Factura electrónica DIAN** | Hoy el sistema emite un *comprobante interno* (así lo dice el pie). Si la tienda es responsable de facturar electrónicamente, hay dos caminos: (a) seguir facturando en su proveedor actual (Siigo, Alegra…) y usar este sistema para inventario y control, o (b) integrar el API de un proveedor tecnológico para que cada venta emita la factura electrónica. Definir con la clienta y su contador **antes** de salir en vivo. |
| 7 | **Nota crédito en devoluciones** | La devolución actualiza la venta y el inventario, pero no genera un documento propio. Si factura electrónicamente, la devolución necesita nota crédito. |
| 8 | **Tratamiento de datos personales (Ley 1581)** | Se guardan nombre, cédula, teléfono y correo de clientes. Falta un aviso de privacidad en el comprobante o en el mostrador y la política de tratamiento de datos. |

## Operación diaria (alto valor)

| # | Qué | Por qué |
|---|---|---|
| 9 | **Cierre de caja / arqueo diario** | Total por forma de pago del día, efectivo esperado contra contado y diferencias. Es lo primero que pide un dueño. |
| 10 | **Impresión en tirilla (80 mm)** | Si usan impresora térmica, el comprobante carta no sirve. Agregar formato tirilla en Configuración → Comprobante. |
| 11 | **Enviar comprobante en PDF** por WhatsApp o correo | Hoy el botón de WhatsApp manda solo el texto con el número. |
| 12 | **Aviso de bloqueo de cuenta por WhatsApp a la dueña** | El aviso ya queda en Inicio; enviarlo también a su celular. |

## Seguridad y datos

| # | Qué | Nota |
|---|---|---|
| 14 | Copias automáticas | Hoy son manuales (CSV en Configuración → Respaldo). Neon guarda historial según el plan; agregar una exportación semanal automática. |
| 15 | Dominio propio (`inventario.importech.co`) | Más confiable que `*.vercel.app` para la clienta. |

## Ya resuelto en esta entrega

- Login con bloqueos crecientes, cierre de sesiones al cambiar PIN, cabeceras de seguridad.
- Configuración por pestañas: negocio, comprobante con vista previa en vivo, numeración, garantías, formas de pago, reglas, importación y respaldo.
- Importador de historial de ventas con mapeo de columnas, vista previa, sin duplicados y con opción de deshacer.
- Garantías: búsqueda por IMEI que incluye las ventas importadas.
- Error corregido: las ventas con descuento en pesos fallaban al guardar en Postgres.
- Retoma como parte de pago en caja: el equipo entra solo al inventario dentro de la misma venta.
- Tiendas aliadas (consignación o compra): cuánto se les paga, cuánto gana la tienda, cuenta y pagos.
- Usuario y contraseña (reglas fuertes, temporales al crear/restablecer, cambio obligatorio, login sin lista de usuarios).
- Importar ventas directamente desde Excel (.xlsx), además de CSV.
- Compras e importación desactivadas por ahora (la página redirige a Tiendas aliadas; los datos se conservan).
