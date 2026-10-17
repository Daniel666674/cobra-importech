# Importech · aplicación real

Inventario, ventas, apartados, garantías, taller, compras y verificación de IMEI para una tienda Apple en Colombia.
Next.js (App Router) + TypeScript · PostgreSQL (Neon) con Drizzle · login por PIN con roles y permisos.

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

## Verificación de IMEI

1. Automática: formato (Luhn), modelo por TAC, duplicado y lista interna de bloqueados.
2. **Oficial y obligatoria para guardar un iPhone**: el botón copia el IMEI y abre la CRC y Apple; la persona escribe el captcha en esas páginas y registra aquí el resultado.
   Quedan guardados quién y cuándo. «Reportado» o «Bloqueado» impide ingresar el equipo, bloquea ese IMEI y alerta al dueño; «Activation Lock» exige aprobación del propietario/a.
3. Los iPhone recibidos por lote entran «En revisión» y no se pueden vender hasta completar el paso 2.

No se automatizan captchas ni se consultan esas páginas desde el servidor.

## Despliegue

Ver [DEPLOY.md](./DEPLOY.md).
