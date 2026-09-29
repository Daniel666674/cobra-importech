# Importech · Demo de control de inventario iPhone

Demo interactivo (HTML estático, sin backend) de un sistema de inventario, trazabilidad y automatizaciones para una tienda de iPhone.

- `index.html`: el demo completo. Se abre con doble clic en cualquier navegador.
- `docs/propuesta-iphone.html`: la propuesta comercial.

## Qué incluye

Dashboard, inventario por IMEI con línea de tiempo por equipo, ingreso con verificación de IMEI, trade-in con cotización automática, taller, apartados y cuotas con recordatorios por WhatsApp, garantías, clientes, compras e importación con costo real, sedes y transferencias, 12 automatizaciones y reportes.

## Importante

- Todos los datos son ficticios y se reinician al recargar la página.
- La verificación de IMEI (hurto, extravío, iCloud, operador) está **simulada**. Se puede probar con los botones "Probar con" de la pantalla *Ingresar equipo*.
- El backend se construye después de la firma del contrato.

## Publicación

Al hacer push a `main`, el workflow `deploy-pages.yml` publica el sitio en GitHub Pages.
