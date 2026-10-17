# Despliegue en Vercel y traspaso al cliente

Pasos que **solo puede hacer una persona con las cuentas** (el código ya está listo para ellos).

## 1. Cuentas (idealmente a nombre del cliente o de un equipo que luego se transfiere)
- [ ] Equipo (Team) de Vercel «Importech» en plan **Pro** (el plan gratuito es solo para uso no comercial).
- [ ] Repositorio en GitHub (en la organización del cliente o transferible).
- [ ] Dominio (opcional pero recomendado), registrado por el cliente.

## 2. Proyecto
- [ ] En Vercel: *Add New → Project* → elegir el repositorio. **Root Directory: `app`** (si el código sigue dentro de `cobra-importech/app`).
- [ ] Framework: Next.js (se detecta solo). Build command: `npm run vercel-build` (aplica migraciones y construye).

## 3. Base de datos
- [ ] En el proyecto: *Storage → Marketplace → Neon (Postgres)* → crear. Vercel agrega `DATABASE_URL` solo.
- [ ] Revisar que `DATABASE_URL` exista en *Production* y *Preview*.

## 4. Secretos
- [ ] *Settings → Environment Variables*: `AUTH_SECRET` = texto aleatorio largo (por ejemplo `openssl rand -base64 48`).

## 5. Primer uso
- [ ] Abrir la URL → aparece «Bienvenido». Crear negocio, propietario/a (con PIN) y, si se desea, la cuenta de desarrollador.
- [ ] En *Configuración*: subir el logo y completar razón social, NIT y dirección (salen en los comprobantes).
- [ ] En *Usuarios*: crear al personal. Revisar los permisos del rol «Empleado/a».
- [ ] Cargar el inventario real con *Ingresar producto* (o recibiendo compras).

## 6. Traspaso
- [ ] Vercel: *Settings → Transfer* del proyecto al equipo del cliente (o invitar al cliente como Owner).
- [ ] Neon: pasar la propiedad del proyecto de base de datos al cliente (o exportar con `pg_dump` e importar en su cuenta).
- [ ] GitHub: transferir el repositorio.
- [ ] Entregar: URL, credenciales de administración, este documento y los datos de facturación de cada servicio.
- [ ] Anotar en el contrato qué servicios paga el cliente (Vercel, Neon, dominio).

## Copias de seguridad
- *Configuración → descargar inventario / ventas (CSV)* sirve como respaldo básico.
- Neon guarda historial de cambios según el plan; confirmar la retención contratada.
