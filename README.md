# Store Flowers

Tienda web para arreglos, flores, peluches y regalos por ocasión.

## Arquitectura

- **Frontend:** GitHub Pages (HTML/CSS/JavaScript, sin build obligatorio).
- **Datos y stock:** Google Sheets (`BD_TIENDA_ARREGLOS`).
- **API ligera:** Google Apps Script.
- **Cierre de venta:** WhatsApp con mensaje prellenado.
- **Notificaciones:** correo al administrador desde Apps Script.
- **Ubicación:** enlaces de Google Maps y dirección de entrega.

## Estado

La tienda, carrito, checkout, panel administrativo y backend están estructurados en este repositorio. Los valores privados (WhatsApp, URL del Web App y token de administración) se configuran fuera del código público.

## Carpetas

- `/index.html` — tienda.
- `/admin.html` — panel administrativo.
- `/assets` — estilos y JavaScript.
- `/apps-script` — backend para Google Apps Script.
- `/docs` — guía de configuración y despliegue.
