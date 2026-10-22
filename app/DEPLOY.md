# Despliegue en Vercel y traspaso al cliente

El proyecto ya trae `vercel.json` (instala con `npm ci` y construye con `npm run vercel-build`, que aplica las migraciones). Solo faltan los pasos que requieren las cuentas.

## 1. Poner la rama en Vercel (≈10 minutos)
1. vercel.com → **Add New → Project** → importar `Daniel666674/cobra-importech`.
   Si no aparece: *Adjust GitHub App Permissions* y dar acceso a ese repositorio.
2. **Root Directory:** `app`. Lo demás se detecta solo (Next.js).
3. Antes de pulsar Deploy, abrir *Environment Variables* y agregar `AUTH_SECRET` (texto aleatorio largo).
   Generarlo: `openssl rand -base64 48` (o un generador de contraseñas de 40+ caracteres).
4. Deploy. El primer intento falla o avisa si aún no hay base de datos: es normal, sigue el paso 2.

## 2. Base de datos
1. En el proyecto: **Storage → Create Database → Neon (Postgres)** → crear y conectar al proyecto (Production y Preview).
   Vercel agrega `DATABASE_URL` automáticamente.
2. **Deployments → ⋯ → Redeploy** (sin usar la caché). Ahí se crean las tablas.

## 3. Primer uso
1. Abrir la URL (`*.vercel.app`). Aparece «Bienvenido».
2. **Hazlo tú antes de compartir el enlace**: quien lo abra primero crea la tienda.
3. Crear el negocio, la propietaria (con PIN) y tu cuenta de desarrollador.
4. *Configuración*, pestaña por pestaña:
   - **Negocio**: logo, razón social, NIT con dígito de verificación, responsabilidad tributaria, dirección, ciudad, WhatsApp, redes.
   - **Comprobante**: prefijo y siguiente número (si venían de otro sistema, continuar su numeración), título, texto legal. Revisar la vista previa.
   - **Garantías**: meses por condición y condiciones impresas.
   - **Ventas y caja**: formas de pago que usan, descuento máximo, apartados, celular del dueño para alertas.
   - **Importar ventas**: subir el historial (CSV). Revisar el resumen antes de importar; se puede deshacer.
5. *Usuarios*: crear al personal y revisar los permisos del rol «Empleado/a».

## 4. Plan de Vercel
El plan Hobby es solo para uso no comercial. Para una prueba con la cliente sirve; antes de usarlo en producción, pasar el equipo a **Pro**.

## 5. Dominio (opcional)
*Settings → Domains* → agregar, por ejemplo, `inventario.tutienda.co`, y copiar los registros DNS que indique Vercel.

## 6. Traspaso al cliente
- [ ] Vercel: *Settings → Transfer* del proyecto al equipo del cliente (o invitarla como Owner).
- [ ] Neon: pasar la propiedad de la base al cliente (o `pg_dump` / importar en su cuenta).
- [ ] GitHub: transferir el repositorio.
- [ ] Entregar URL, credenciales de administración y este documento.
- [ ] Dejar escrito qué servicios paga el cliente (Vercel, Neon, dominio).

## Copias de seguridad
*Configuración → descargar inventario / ventas (CSV)* sirve de respaldo básico. Neon guarda historial de cambios según el plan.
