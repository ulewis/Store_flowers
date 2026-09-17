# Activación final de Store Flowers

La tienda, el carrito, el panel administrativo y la base **BD_TIENDA_ARREGLOS** ya están preparados. Para activar reservas reales, stock compartido, liberación automática de reservas y correos, solo falta publicar una vez el backend de Google Apps Script.

## 1. Crear el backend desde la misma hoja

1. Abre **BD_TIENDA_ARREGLOS**.
2. Ve a **Extensiones → Apps Script**.
3. Borra el contenido inicial de `Code.gs`.
4. Copia completo el archivo `apps-script/Code.gs` de este repositorio y pégalo allí.
5. Guarda el proyecto con un nombre como `STORE_FLOWERS_API`.
6. En el selector de funciones elige **setup** y pulsa **Ejecutar**.
7. Autoriza los permisos solicitados para Google Sheets y envío de correo.
8. Abre el **registro de ejecución** y guarda el valor `ADMIN_TOKEN` en un lugar privado. No lo publiques ni lo subas a GitHub.

`setup()` también crea automáticamente el proceso que libera cada 5 minutos las reservas vencidas. Si `ADMIN_EMAIL` está vacío, intenta usar como correo administrador la cuenta de Google que ejecuta la configuración.

## 2. Publicar como aplicación web

En Apps Script:

1. Ve a **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Ejecutar como: **Yo**.
4. Quién tiene acceso: **Cualquier persona**.
5. Pulsa **Implementar**.
6. Copia la URL pública que termina en `/exec`.

La URL `/exec` no es una contraseña y sí debe colocarse en el frontend para que la tienda pueda hablar con el backend.

## 3. Conectar GitHub Pages

En `assets/config.js` se coloca la URL así:

```js
API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec'
```

Después de guardar ese cambio, GitHub Pages se despliega automáticamente.

## 4. WhatsApp

En la pestaña `Configuracion` de **BD_TIENDA_ARREGLOS**, `WHATSAPP_NUMBER` debe contener el número internacional sin `+`, espacios ni guiones. Para Perú:

```text
51XXXXXXXXX
```

La web crea primero la reserva real y recién después abre WhatsApp con el código de reserva, productos, entrega, dirección, ubicación y total estimado.

## 5. Flujo de stock

Cuando el cliente pulsa **Separar productos y continuar por WhatsApp**:

1. El backend vuelve a verificar el stock real.
2. Aumenta `stock_reservado`.
3. Crea un registro `PENDIENTE` en `Reservas`.
4. Envía un correo al administrador con los datos del pedido.
5. El cliente continúa a WhatsApp.
6. Si no se confirma dentro del tiempo configurado, el sistema marca la reserva como `EXPIRADA` y devuelve automáticamente el stock.

Al confirmar desde `/admin.html`, la reserva pasa a `CONFIRMADA`, disminuye `stock_fisico`, disminuye `stock_reservado` y se crea el pedido.

## 6. Delivery por dirección

Las zonas pueden tener precio fijo o quedar como **Cotizar**. Para una reserva que requiere cotización, el administrador puede ingresar el costo exacto de delivery antes de confirmar. El sistema recalcula el total y conserva ese valor dentro del pedido.

## 7. Panel administrativo

Abre:

```text
https://ulewis.github.io/Store_flowers/admin.html
```

Ingresa el `ADMIN_TOKEN` generado por `setup()`. El token queda guardado solo en el navegador donde iniciaste sesión.

Desde el panel puedes:

- cambiar stock, precio y disponibilidad de productos;
- revisar reservas completas;
- cotizar delivery;
- confirmar o cancelar reservas;
- ver dirección y ubicación en Maps;
- contactar al cliente por WhatsApp;
- gestionar estados de pedidos;
- registrar método de pago y notas internas;
- configurar zonas de delivery;
- modificar WhatsApp, correo y otros parámetros de la tienda.

## Seguridad

- La hoja de cálculo permanece privada.
- El navegador nunca modifica directamente Google Sheets.
- Los precios y el stock se vuelven a calcular en el servidor.
- Dos clientes no pueden reservar simultáneamente la misma última unidad porque el backend usa bloqueo de escritura.
- Las operaciones administrativas requieren `ADMIN_TOKEN`.
- El correo administrador no se publica en GitHub.
- Si el backend no está disponible, la tienda no genera reservas ficticias.
