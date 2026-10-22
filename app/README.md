# Importech · aplicación real

Inventario, ventas, apartados, garantías, taller, compras y verificación de IMEI para una tienda Apple en Colombia.
Next.js (App Router) + TypeScript · PostgreSQL (Neon) con Drizzle · login con usuario y contraseña, roles y permisos.

La tienda **arranca vacía**: la primera vez que se abre aparece «Bienvenido» para crear el negocio y al propietario/a.
No hay datos de ejemplo (existe `npm run db:seed-demo` solo para desarrollo).

## Probar en tu computador

```bash
npm install
npm run dev          # http://localhost:3000  (usa una base embebida en .data/, no necesita instalar nada)
npm test             # pruebas de reglas de negocio (base en memoria)
npm run typecheck && npm run lint
```

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `DATABASE_URL` | producción | Conexión Postgres (Neon). Sin ella, en Vercel la app se detiene con un mensaje claro. |
| `AUTH_SECRET` | producción | Texto largo y secreto (32+ caracteres) para firmar las sesiones. |

En desarrollo ninguna es obligatoria. Todo lo demás (nombre, logo, reglas) se cambia desde **Configuración**.

## Cómo está organizado

- `src/lib/` reglas puras sin base de datos (IMEI, totales de venta, abonos, costos de importación, lector de etiquetas).
- `src/server/` servicios que aplican las reglas con la base de datos (cada operación valida el permiso y es atómica).
- `src/app/` pantallas y acciones. **Cada acción del servidor vuelve a verificar la sesión y el permiso**, no solo la pantalla.
- `src/db/schema.ts` tablas; `drizzle/` migraciones (`npm run db:generate` tras cambiar el esquema).
- `tests/` pruebas automáticas.

## Usuarios y contraseñas

- Se entra con **usuario y contraseña**. La pantalla de entrada no muestra la lista de usuarios y el error no dice si el usuario existe.
- Reglas: mínimo 10 caracteres combinando 3 de mayúsculas/minúsculas/números/símbolos, o una frase de 16+. Se rechazan las comunes
  y las que contienen el nombre, el usuario o el nombre del negocio. Se guardan con bcrypt (costo 12).
- Al crear un usuario o restablecerle la contraseña (*Usuarios y permisos*), el sistema genera una **temporal** que se muestra una sola vez.
  Con ella solo se puede entrar a crear la propia: el resto del sistema queda bloqueado hasta cambiarla.
- Cambiar la contraseña (🔑 junto a «Salir») cierra las sesiones abiertas en otros dispositivos. 5 intentos fallidos bloquean la cuenta 5 min, luego 15, 45… hasta 24 h.
- Los usuarios que tenían PIN entran con su usuario (el primer nombre en minúsculas, p. ej. `angelica`) y su PIN una última vez, y deben crear su contraseña.

## Retomas (equipo como parte de pago)

- **En caja**: «+ Recibir un equipo». Se cotiza y se verifica igual que una retoma suelta (IMEI, CRC y Apple). El valor de la retoma
  se descuenta del saldo y queda como forma de pago «Retoma» en el comprobante, que muestra el equipo recibido.
- El equipo **entra solo al inventario** al emitir el comprobante, en la misma operación de la venta: si algo falla, no queda ni la venta ni el equipo.
  Su costo es el valor de la retoma y el cliente de la venta (con cédula obligatoria) queda como quien lo entregó.
- Si la retoma vale más que la compra, se registra sola en *Retomas* y se le paga la diferencia al cliente.
- Un equipo que la tienda vendió antes puede volver a entrar (no se toma como IMEI duplicado).

## Tiendas aliadas

Productos de otras tiendas que se venden aquí. En *Tiendas aliadas* se crea cada una y se elige cuándo se le paga:
**consignación** (se le debe cuando se vende) o **compra** (se le debe desde que se recibe).
Al ingresar el producto se elige la aliada; el costo es lo que se le paga y el formulario muestra lo que gana la tienda.
Cada aliada tiene su cuenta: lo vendido, lo que le corresponde, la ganancia de la tienda, lo que hay en vitrina y los pagos.
Las devoluciones descuentan lo que se le debía. *Compras e importación están desactivadas por ahora.*

## Importar el inventario inicial

*Inventario → 📥 Importar desde Excel*. Acepta .xlsx o CSV, una fila por producto (los equipos con IMEI/serie, uno por fila;
los accesorios pueden llevar cantidad). Propone el mapeo de columnas, deduce la categoría del nombre, muestra la vista previa y las
filas con error. **Los iPhone entran «En revisión»** hasta registrar la consulta oficial en su ficha. Salta IMEI repetidos o
bloqueados, no duplica al reimportar y se puede deshacer (solo lo que no se ha vendido ni apartado). Hay plantilla descargable.

## Importar el historial de ventas

*Configuración → Importar ventas*. Acepta el archivo de Excel (.xlsx) directamente, o el CSV de Excel, Siigo, Alegra, Loggro, etc. (separador `,` `;` o tabulador, UTF-8 o Windows-1252).

1. Propone qué columna es cada dato según los encabezados; se puede corregir. Solo «Fecha» y «Producto» son obligatorios.
2. Muestra un resumen, las filas que no se pueden leer (con el motivo) y las primeras ventas antes de importar.
3. Filas con el mismo número de factura = una venta. Si el total de la factura es menor que la suma, la diferencia queda como descuento.
4. No toca el inventario actual. Crea o reutiliza clientes (por cédula, teléfono o nombre) y las ventas quedan marcadas como «Histórica».
5. Subir el mismo archivo otra vez no duplica. Cada importación se puede deshacer desde la misma pantalla.

Hay una plantilla descargable para quien tenga los datos en cuadernos o en un Excel suelto.

## Verificación de IMEI

1. Automática: formato (Luhn), modelo por TAC, duplicado y lista interna de bloqueados.
2. **Oficial y obligatoria para guardar un iPhone**: el botón copia el IMEI y abre la CRC y Apple; la persona escribe el captcha en esas páginas y registra aquí el resultado.
   Quedan guardados quién y cuándo. «Reportado» o «Bloqueado» impide ingresar el equipo, bloquea ese IMEI y alerta al dueño; «Activation Lock» exige aprobación del propietario/a.
3. Los iPhone recibidos por lote entran «En revisión» y no se pueden vender hasta completar el paso 2.

No se automatizan captchas ni se consultan esas páginas desde el servidor.

## Retomas, modelos por TAC y WhatsApp

- **Retomas** (`/retomas`): cotiza con «valor de referencia × % por condición − defectos» (guía editable en `src/lib/tradein.ts`), exige verificación oficial del IMEI y los datos de quien entrega el equipo, y lo ingresa como «Trade-in».
- **Modelo por TAC**: el catálogo ya no trae TAC (los de la demo eran ficticios). El sistema aprende el modelo de cada TAC al ingresar equipos, y en *Configuración* se puede importar un CSV (por ejemplo el de tacdb.osmocom.org, licencia CC-BY-SA; solo se guardan los de Apple). Mientras un TAC no se conoce, el ingreso pide aprobación del propietario/a.
- **WhatsApp**: abre WhatsApp con el mensaje ya escrito (recordatorio de apartado al cliente; resumen de alertas al dueño si se configura su celular). La persona confirma el envío; no hay envío automático (eso requiere la API de WhatsApp Business y credenciales).

## Despliegue

Ver [DEPLOY.md](./DEPLOY.md).
