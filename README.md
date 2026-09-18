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

## Frontend y publicación

- La portada utiliza las fotografías del repositorio y el catálogo consulta el stock real. Si la API falla, muestra un aviso con reintento y conserva el carrito.
- La compra separa contacto y entrega. Las cantidades de todas las dedicatorias se suman por producto antes de agregarlas al carrito.
- `npm ci` y `npm test` ejecutan pruebas de compra con respuestas simuladas, sin crear reservas reales.
- `npm run build` prepara `_site` y consulta el catálogo público para generar enlaces de producto con metadatos de vista previa. GitHub Pages ejecuta las pruebas antes de publicar.
- Los metadatos se renuevan en cada despliegue; los precios y el stock visibles siempre proceden de la API. Para un producto nuevo sin página generada todavía, el enlace usa `?producto=ID`.
- Si el catálogo no responde durante la compilación, la tienda se publica con enlaces de consulta y sin páginas individuales nuevas.
- El despliegue incluye únicamente las páginas y los recursos públicos; no incluye pruebas, dependencias ni el código de Apps Script.
