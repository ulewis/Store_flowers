# Store Flowers

Tienda web para arreglos, flores, peluches y regalos por ocasión.

## Arquitectura

- GitHub Pages para el frontend.
- Google Apps Script como API ligera.
- Google Sheets para productos, stock, reservas, pedidos, delivery y configuración.
- WhatsApp para la confirmación final con el cliente.

La tienda valida el stock en el servidor antes de reservar y utiliza reservas temporales para evitar sobreventa.


## Imágenes de productos

Las imágenes pueden cargarse directamente desde el panel administrativo. El navegador las comprime antes de enviarlas al backend y Apps Script las publica en el repositorio dentro de:

`assets/products/YYYY/MM/`

Cada imagen genera un commit en GitHub y queda disponible mediante GitHub Pages. La URL publicada se asigna automáticamente al producto.

La conexión con GitHub usa un token almacenado únicamente en Script Properties de Apps Script. Para minimizar permisos, debe ser un token limitado al repositorio `Store_flowers` con acceso `Contents: Read and write`. El token no se guarda en el frontend ni en Google Sheets.
