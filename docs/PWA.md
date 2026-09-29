# PWA · Guía para el demo y para la app real (TypeScript)

## Qué tiene el demo hoy

| Archivo | Para qué sirve |
|---|---|
| `manifest.webmanifest` | Nombre, colores, íconos y atajos (Nueva venta, Inventario, Ingresar producto) |
| `sw.js` | Guarda la app en el dispositivo para que abra **sin internet**. Cada publicación genera una versión nueva (`__BUILD__` lo reemplaza el workflow) |
| `assets/icons/` | Íconos 192, 512, *maskable* (Android), `apple-touch-icon` (iPhone) y favicon |
| `js/app.js` (sección PWA) | Botón **Instalar app**, aviso "Hay una versión nueva", indicador **Sin conexión** y atajos `?go=` |

Cómo se instala:
- **Android / Chrome / Edge / escritorio:** botón *Instalar app* de la barra superior, o menú del navegador → *Instalar*.
- **iPhone / iPad (Safari):** Compartir → *Agregar a pantalla de inicio*. Safari no permite un botón automático; la app muestra los pasos.

Cómo se actualiza: al publicar una versión nueva, la app instalada muestra "Hay una versión nueva disponible → Actualizar". Nunca mezcla archivos de dos versiones.

## Para la app real (después del contrato)

Todo lo anterior se reutiliza. Lo que cambia es que ahora hay servidor y datos reales.

### 1. Herramientas
Con Vite + TypeScript, usa **`vite-plugin-pwa`** (Workbox) en lugar de escribir `sw.js` a mano:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',            // el usuario decide cuándo actualizar
      manifest: false,                    // reutiliza manifest.webmanifest (o genera el de cada cliente, ver punto 4)
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/catalog'),  // lecturas: red primero, caché si no hay internet
            handler: 'NetworkFirst', options: { cacheName: 'api-catalog', networkTimeoutSeconds: 4, expiration: { maxAgeSeconds: 86400 } } },
        ],
      },
    }),
  ],
});
```

### 2. Datos sin internet (lo más importante en una tienda)
- **Lecturas** (inventario, clientes, precios): `NetworkFirst` con caché; guarda una copia en **IndexedDB** (Dexie) para búsquedas rápidas y sin conexión.
- **Escrituras** (ventas, apartados, pagos): guárdalas primero en una **cola local** (*outbox* en IndexedDB) y envíalas al servidor cuando vuelva la conexión (Workbox Background Sync donde exista; en iOS, al abrir la app). Cada operación lleva un **ID único (idempotencia)** para no duplicar ventas.
- **Conflictos:** el stock lo decide el servidor. Si dos sedes venden el mismo IMEI sin conexión, la segunda queda "pendiente de revisión", nunca se pierde.
- **Numeración de comprobantes:** reserva bloques de números por sede o usa numeración provisional que el servidor confirma. La factura electrónica DIAN **siempre** la emite el servidor.

### 3. Seguridad
- Solo HTTPS. Tokens de vida corta con refresco; no guardes contraseñas en el dispositivo.
- **No** pongas en caché respuestas con datos sensibles en el service worker compartido (`/api/auth`, `/api/users`). Excluye esas rutas.
- Al cerrar sesión, borra caché de API e IndexedDB del usuario.
- Los permisos se validan **en el servidor**; los de la interfaz solo ocultan botones.

### 4. Marca por cliente (logo propio)
El manifiesto no puede leer el `localStorage`. Para que cada tienda instale la app con **su** nombre e ícono:
- Sirve `manifest.webmanifest` desde el servidor por cliente (`/manifest.webmanifest` según el dominio o subdominio) con su `name`, `theme_color` e íconos.
- Al subir el logo, el servidor genera los PNG 192 / 512 / *maskable* 512 / 180 (por ejemplo con `sharp`) y los publica.

### 5. iPhone y iPad
- Instalación manual (Compartir → Agregar a pantalla de inicio).
- Notificaciones push solo con la app **instalada** y iOS 16.4 o superior.
- Safari puede borrar los datos de un sitio que no se usa en varias semanas: **el servidor es la fuente de verdad**, la copia local es un apoyo.

### 6. Lista de verificación antes de entregar
- [ ] Lighthouse → categoría PWA en verde.
- [ ] Modo avión: abre, navega, registra una venta, reconecta y se sincroniza sin duplicar.
- [ ] Actualización: publicar versión nueva y ver el aviso "Actualizar".
- [ ] Instalada en Android, iPhone y escritorio.
- [ ] Cerrar sesión limpia los datos locales.
