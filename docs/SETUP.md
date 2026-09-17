# Activación de Store Flowers

La mayor parte de la tienda ya funciona como sitio estático. Para activar **reservas reales, stock compartido, correos y administración**, falta desplegar el backend de Google Apps Script una sola vez.

## 1. Base de datos

La tienda ya está preparada para usar la hoja privada **BD_TIENDA_ARREGLOS** con estas pestañas:

- Productos
- Reservas
- Pedidos
- Delivery
- Categorias
- Configuracion
- Auditoria

No publiques esta hoja en la web.

## 2. Crear el Web App de Apps Script

1. Abre `script.google.com` y crea un proyecto nuevo, por ejemplo `STORE_FLOWERS_API`.
2. Copia el contenido de `apps-script/Code.gs` dentro de `Code.gs`.
3. En **Configuración del proyecto**, activa la visualización del archivo de manifiesto y reemplaza `appsscript.json` por el archivo incluido en este repositorio.
4. Ejecuta manualmente la función `setup()` una vez y autoriza el acceso a Google Sheets y Gmail.
5. Abre el registro de ejecución y copia el valor `ADMIN_TOKEN`. Es privado. No lo subas a GitHub.
6. En **Implementar → Nueva implementación → Aplicación web** usa:
   - Ejecutar como: **yo**.
   - Quién tiene acceso: **cualquier persona**.
7. Copia la URL terminada en `/exec`.

## 3. Conectar el frontend

Edita `assets/config.js` y coloca la URL en:

```js
API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec'
```

El número de WhatsApp y el correo administrativo se administran desde la hoja o desde `/admin.html`; no es necesario exponer el correo en GitHub.

En `Configuracion` completa al menos:

- `WHATSAPP_NUMBER`: formato internacional sin `+`, espacios ni guiones; por ejemplo `51XXXXXXXXX`.
- `ADMIN_EMAIL`: correo que recibirá las reservas.
- `STORE_NAME`: nombre final de la marca.

## 4. Probar antes de vender

Comprueba este flujo:

1. Añadir dos productos al carrito.
2. Completar dirección y ubicación.
3. Separar el pedido.
4. Verificar que aparece en `Reservas`.
5. Verificar que `stock_reservado` aumentó.
6. Confirmar desde `/admin.html`.
7. Verificar que la reserva cambia a `CONFIRMADA`, aparece un registro en `Pedidos` y disminuye `stock_fisico`.
8. Crear otra reserva y dejarla vencer; el trigger debe devolver el stock reservado automáticamente.

## 5. GitHub Pages

El repositorio incluye un workflow de GitHub Pages. Si Pages todavía no está activo, entra una sola vez en **Settings → Pages**, selecciona **GitHub Actions** como fuente y ejecuta de nuevo el workflow si fuera necesario.

Posteriormente puedes asociar un dominio propio desde **Settings → Pages → Custom domain**.

## Seguridad

- La hoja de cálculo se mantiene privada.
- El cliente solo puede consultar catálogo y crear reservas.
- Las operaciones administrativas requieren `ADMIN_TOKEN`.
- El token se guarda en `Script Properties` y en el `localStorage` del navegador del administrador, nunca en el repositorio.
- El backend recalcula precios y stock desde Google Sheets; no confía en los precios enviados por el navegador.
