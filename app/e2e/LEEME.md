# Pruebas de navegador (Playwright)

Recorren la aplicación real con una tienda vacía. Requieren Playwright y un Chromium instalado.

```bash
npm run build
rm -rf .data
AUTH_SECRET=prueba-0123456789abcdef0123456789abcdef npx next start -p 3101 &
node e2e/flujo-basico.cjs      # configuración inicial, verificación oficial, venta, permisos
# reinicia el servidor con .data limpio antes de cada archivo:
node e2e/flujo-completo.cjs    # apartados, garantías, taller, compras, configuración
node e2e/escaner.cjs           # lectura de una foto de caja con IMEI y serie
```
