const STORE_DB_ID = '1CU1g1v_xLceeDfGVwQw70W5xtxLiSEFa9u-WuGUlc1k';
const SHEETS = { PRODUCTS:'Productos', RESERVATIONS:'Reservas', ORDERS:'Pedidos', DELIVERY:'Delivery', CATEGORIES:'Categorias', CONFIG:'Configuracion', AUDIT:'Auditoria' };
const API_VERSION = '2026-09-17.5';
const TIMEZONE = 'America/Lima';
const GITHUB_REPO = 'ulewis/Store_flowers';
const GITHUB_BRANCH = 'main';
const GITHUB_PAGES_BASE = 'https://ulewis.github.io/Store_flowers/';
const MAX_IMAGE_BYTES = 900 * 1024;

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'bootstrap');
    if (action === 'health') return json_({ok:true, data:{status:'ok', version:API_VERSION, time:new Date().toISOString()}});
    if (action === 'bootstrap') return json_({ok:true, data:bootstrap_()});
    if (action === 'adminSnapshot') {
      requireAdmin_(e.parameter.token);
      return json_({ok:true, data:adminSnapshot_()});
    }
    return json_({ok:false, error:'Acción no válida.'});
  } catch (err) {
    return json_({ok:false, error:safeError_(err)});
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    const payload = body.payload || {};
    if (action === 'reserve') return json_({ok:true, data:reserve_(payload)});

    requireAdmin_(payload.token);
    if (action === 'adminSnapshot') return json_({ok:true, data:adminSnapshot_()});
    if (action === 'adminSetGitHubToken') return json_({ok:true, data:setGitHubToken_(payload)});
    if (action === 'adminClearGitHubToken') return json_({ok:true, data:clearGitHubToken_()});
    if (action === 'adminUploadProductImage') return json_({ok:true, data:uploadProductImage_(payload)});
    if (action === 'adminSetReservationDelivery') return json_({ok:true, data:setReservationDelivery_(payload)});
    if (action === 'adminConfirmReservation') return json_({ok:true, data:confirmReservation_(payload)});
    if (action === 'adminCancelReservation') return json_({ok:true, data:cancelReservation_(payload.reserva_id)});
    if (action === 'adminUpdateOrder') return json_({ok:true, data:updateOrder_(payload)});
    if (action === 'adminSaveProduct') return json_({ok:true, data:saveProduct_(payload)});
    if (action === 'adminSaveDelivery') return json_({ok:true, data:saveDelivery_(payload)});
    if (action === 'adminSaveCategory') return json_({ok:true, data:saveCategory_(payload)});
    if (action === 'adminSaveConfig') return json_({ok:true, data:saveConfig_(payload)});
    return json_({ok:false, error:'Acción no válida.'});
  } catch (err) {
    return json_({ok:false, error:safeError_(err)});
  }
}

function setup() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('ADMIN_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'').slice(0,16);
    props.setProperty('ADMIN_TOKEN', token);
  }

  const cfg = configMap_();
  if (!cfg.ADMIN_EMAIL) {
    const email = Session.getEffectiveUser().getEmail();
    if (email) setConfigValue_('ADMIN_EMAIL', email);
  }

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'releaseExpiredReservations')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('releaseExpiredReservations').timeBased().everyMinutes(5).create();

  Logger.log('ADMIN_TOKEN: ' + token);
  Logger.log('Base conectada: ' + STORE_DB_ID);
  return {adminToken:token, spreadsheetId:STORE_DB_ID, version:API_VERSION};
}

function releaseExpiredReservations() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return releaseExpiredReservationsNoLock_(); }
  finally { lock.releaseLock(); }
}

function bootstrap_() {
  const now = new Date();
  const products = rows_(SHEETS.PRODUCTS)
    .filter(p => bool_(p.activo) && inDateWindow_(p, now))
    .map(p => cleanRow_({...p, available_stock:Math.max(0, num_(p.stock_fisico) - num_(p.stock_reservado))}));
  const categories = rows_(SHEETS.CATEGORIES).filter(c => bool_(c.activo) && inDateWindow_(c, now)).map(cleanRow_);
  const delivery = rows_(SHEETS.DELIVERY).filter(d => bool_(d.activo)).map(cleanRow_);
  return {products, categories, delivery, config:publicConfig_(), version:API_VERSION};
}

function adminSnapshot_() {
  releaseExpiredReservations();
  return {
    products: rows_(SHEETS.PRODUCTS).map(cleanRow_),
    reservations: rows_(SHEETS.RESERVATIONS).map(cleanRow_),
    orders: rows_(SHEETS.ORDERS).map(cleanRow_),
    delivery: rows_(SHEETS.DELIVERY).map(cleanRow_),
    categories: rows_(SHEETS.CATEGORIES).map(cleanRow_),
    config: configMap_(),
    integrations: {githubUpload:!!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN'), githubRepo:GITHUB_REPO},
    version: API_VERSION
  };
}

function reserve_(p) {
  validateReservation_(p);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    releaseExpiredReservationsNoLock_();
    const cfg = configMap_();
    if (String(cfg.STORE_STATUS || 'open').toLowerCase() !== 'open') throw new Error('La tienda no está recibiendo reservas en este momento.');

    const phoneDigits = String(p.phone || '').replace(/\D/g,'');
    const pendingForPhone = rows_(SHEETS.RESERVATIONS).filter(r =>
      String(r.estado || '').toUpperCase() === 'PENDIENTE' &&
      String(r.cliente_whatsapp || '').replace(/\D/g,'') === phoneDigits
    );
    if (pendingForPhone.length >= 3) throw new Error('Ya existen varias reservas pendientes con este WhatsApp. Confirma o espera que venza una antes de crear otra.');

    const products = rows_(SHEETS.PRODUCTS);
    const byId = {};
    products.forEach(x => byId[String(x.id)] = x);
    const normalizedItems = [];
    const requestedById = {};
    let subtotal = 0;
    let totalQty = 0;
    const now = new Date();

    (p.items || []).forEach(item => {
      const pr = byId[String(item.id)];
      if (!pr || !bool_(pr.activo) || !inDateWindow_(pr, now)) throw new Error('Uno de los productos ya no está disponible. Actualiza el catálogo.');
      const qty = Math.max(1, Math.floor(num_(item.qty)));
      totalQty += qty;
      if (totalQty > 50) throw new Error('La reserva supera la cantidad máxima permitida.');
      const available = Math.max(0, num_(pr.stock_fisico) - num_(pr.stock_reservado));
      requestedById[String(pr.id)] = (requestedById[String(pr.id)] || 0) + qty;
      if (available < requestedById[String(pr.id)]) throw new Error(`${pr.nombre}: solo quedan ${available} unidad(es) disponibles.`);
      const price = num_(pr.precio);
      subtotal += price * qty;
      normalizedItems.push({
        id:String(pr.id),
        name:String(pr.nombre),
        qty,
        unitPrice:price,
        personalization:String(item.personalization || '').trim().slice(0,180)
      });
    });

    const zone = rows_(SHEETS.DELIVERY).find(d => String(d.zona_id) === String(p.zoneId) && bool_(d.activo));
    if (!zone) throw new Error('La zona de entrega ya no está disponible.');
    const quoteDelivery = bool_(zone.requiere_cotizacion);
    const delivery = quoteDelivery ? null : Math.max(0, num_(zone.costo));
    const total = delivery === null ? null : subtotal + delivery;
    const minutes = Math.max(5, num_(cfg.RESERVATION_MINUTES || 30));
    const created = new Date();
    const expires = new Date(created.getTime() + minutes * 60000);
    const reservationId = makeId_('RSV');

    Object.keys(requestedById).forEach(id => {
      const pr = byId[id];
      setCellByHeader_(SHEETS.PRODUCTS, pr._row, 'stock_reservado', num_(pr.stock_reservado) + requestedById[id]);
    });

    appendByHeaders_(SHEETS.RESERVATIONS, {
      reserva_id:reservationId,
      fecha_creacion:created,
      fecha_expiracion:expires,
      estado:'PENDIENTE',
      cliente_nombre:String(p.name || '').trim().slice(0,120),
      cliente_whatsapp:String(p.phone || '').trim().slice(0,40),
      cliente_email:String(p.email || '').trim().slice(0,160),
      fecha_entrega:String(p.deliveryDate || '').slice(0,30),
      franja_entrega:String(p.deliveryWindow || '').slice(0,80),
      direccion:String(p.address || '').trim().slice(0,300),
      distrito:String(zone.distrito || zone.nombre || '').slice(0,100),
      referencia:String(p.reference || '').trim().slice(0,250),
      maps_url:String(p.mapsUrl || '').trim().slice(0,1000),
      dedicatoria:String(p.dedication || '').trim().slice(0,500),
      observaciones:String(p.notes || '').trim().slice(0,500),
      items_json:JSON.stringify(normalizedItems),
      subtotal:subtotal,
      delivery:delivery === null ? '' : delivery,
      total:total === null ? '' : total,
      origen:String(p.origin || '').slice(0,1000),
      ip_hash:''
    });

    audit_('cliente','RESERVAR','reserva',reservationId,{items:normalizedItems, subtotal, delivery, total});
    try { sendReservationEmail_(reservationId, p, normalizedItems, zone, subtotal, delivery, total, expires); }
    catch (mailErr) { audit_('sistema','ERROR_CORREO','reserva',reservationId,{error:String(mailErr)}); }

    return {
      reserva_id:reservationId,
      subtotal,
      delivery,
      total,
      expires_at:expires.toISOString(),
      whatsapp_number:String(cfg.WHATSAPP_NUMBER || '')
    };
  } finally {
    lock.releaseLock();
  }
}

function setReservationDelivery_(p) {
  const reservationId = String(p.reserva_id || '').trim();
  if (!reservationId) throw new Error('Falta la reserva.');
  if (!hasValue_(p.delivery)) throw new Error('Ingresa el costo de delivery.');
  const delivery = Math.max(0, num_(p.delivery));

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    releaseExpiredReservationsNoLock_();
    const r = findBy_(SHEETS.RESERVATIONS,'reserva_id',reservationId);
    if (!r) throw new Error('Reserva no encontrada.');
    if (String(r.estado).toUpperCase() !== 'PENDIENTE') throw new Error('Solo se puede modificar el delivery de una reserva pendiente.');
    const total = num_(r.subtotal) + delivery;
    setCellByHeader_(SHEETS.RESERVATIONS,r._row,'delivery',delivery);
    setCellByHeader_(SHEETS.RESERVATIONS,r._row,'total',total);
    audit_('admin','COTIZAR_DELIVERY','reserva',reservationId,{delivery,total});
    return {reserva_id:reservationId, delivery, total};
  } finally {
    lock.releaseLock();
  }
}

function confirmReservation_(p) {
  const reservationId = String((p && p.reserva_id) || '').trim();
  if (!reservationId) throw new Error('Falta la reserva.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    releaseExpiredReservationsNoLock_();
    let r = findBy_(SHEETS.RESERVATIONS,'reserva_id',reservationId);
    if (!r) throw new Error('Reserva no encontrada.');
    if (String(r.estado).toUpperCase() !== 'PENDIENTE') throw new Error('La reserva ya no está pendiente.');

    let delivery = hasValue_(r.delivery) ? Math.max(0, num_(r.delivery)) : null;
    if (p && hasValue_(p.delivery)) {
      delivery = Math.max(0, num_(p.delivery));
      const updatedTotal = num_(r.subtotal) + delivery;
      setCellByHeader_(SHEETS.RESERVATIONS,r._row,'delivery',delivery);
      setCellByHeader_(SHEETS.RESERVATIONS,r._row,'total',updatedTotal);
      r.delivery = delivery;
      r.total = updatedTotal;
    }
    if (delivery === null) throw new Error('Define el costo de delivery antes de confirmar el pedido.');

    const items = parseItems_(r.items_json);
    if (!items.length) throw new Error('La reserva no contiene productos válidos.');
    const products = rows_(SHEETS.PRODUCTS);
    const byId = {};
    products.forEach(x => byId[String(x.id)] = x);

    const qtyById = aggregateItemQty_(items);
    Object.keys(qtyById).forEach(id => {
      const pr = byId[id];
      if (!pr) throw new Error('Producto de la reserva no encontrado.');
      const qty = qtyById[id];
      if (num_(pr.stock_reservado) < qty) throw new Error(`${pr.nombre}: el stock reservado ya no coincide. Revisa la reserva.`);
      if (num_(pr.stock_fisico) < qty) throw new Error(`${pr.nombre}: el stock físico ya no es suficiente. Revisa el inventario.`);
    });
    Object.keys(qtyById).forEach(id => {
      const pr = byId[id];
      const qty = qtyById[id];
      setCellByHeader_(SHEETS.PRODUCTS,pr._row,'stock_fisico',num_(pr.stock_fisico)-qty);
      setCellByHeader_(SHEETS.PRODUCTS,pr._row,'stock_reservado',num_(pr.stock_reservado)-qty);
    });

    const total = num_(r.subtotal) + delivery;
    setCellByHeader_(SHEETS.RESERVATIONS,r._row,'delivery',delivery);
    setCellByHeader_(SHEETS.RESERVATIONS,r._row,'total',total);
    setCellByHeader_(SHEETS.RESERVATIONS,r._row,'estado','CONFIRMADA');

    const orderId = makeId_('PED');
    appendByHeaders_(SHEETS.ORDERS, {
      pedido_id:orderId,
      reserva_id:r.reserva_id,
      fecha:new Date(),
      estado:'CONFIRMADO',
      cliente_nombre:r.cliente_nombre,
      cliente_whatsapp:r.cliente_whatsapp,
      fecha_entrega:r.fecha_entrega,
      direccion:r.direccion,
      distrito:r.distrito,
      maps_url:r.maps_url,
      items_json:r.items_json,
      subtotal:r.subtotal,
      delivery:delivery,
      total:total,
      metodo_pago:'',
      notas_admin:'',
      fecha_confirmacion:new Date(),
      fecha_entrega_real:'',
      cliente_email:r.cliente_email,
      franja_entrega:r.franja_entrega,
      referencia:r.referencia,
      dedicatoria:r.dedicatoria,
      observaciones:r.observaciones
    });

    audit_('admin','CONFIRMAR','reserva',r.reserva_id,{pedido_id:orderId,delivery,total});
    return {pedido_id:orderId,reserva_id:r.reserva_id,delivery,total};
  } finally {
    lock.releaseLock();
  }
}

function cancelReservation_(reservationId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = findBy_(SHEETS.RESERVATIONS,'reserva_id',reservationId);
    if (!r) throw new Error('Reserva no encontrada.');
    if (String(r.estado).toUpperCase() !== 'PENDIENTE') throw new Error('La reserva ya no está pendiente.');
    releaseStockForReservation_(r);
    setCellByHeader_(SHEETS.RESERVATIONS,r._row,'estado','CANCELADA');
    audit_('admin','CANCELAR','reserva',r.reserva_id,{});
    return {reserva_id:r.reserva_id};
  } finally {
    lock.releaseLock();
  }
}

function updateOrder_(p) {
  const orderId = String((p && p.pedido_id) || '').trim();
  if (!orderId) throw new Error('Falta el pedido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = findBy_(SHEETS.ORDERS,'pedido_id',orderId);
    if (!row) throw new Error('Pedido no encontrado.');

    const allowed = ['CONFIRMADO','PREPARANDO','LISTO','ENVIADO','ENTREGADO','CANCELADO'];
    const current = String(row.estado || '').toUpperCase();
    const status = String(p.estado || current || '').toUpperCase();
    if (allowed.indexOf(status) < 0) throw new Error('Estado no válido.');
    if (current === 'ENTREGADO' && status !== 'ENTREGADO') throw new Error('Un pedido entregado no puede volver a otro estado.');
    if (current === 'CANCELADO' && status !== 'CANCELADO') throw new Error('Un pedido cancelado no puede reactivarse.');

    if (status === 'CANCELADO' && current !== 'CANCELADO') restoreStockForOrder_(row);

    const changes = {estado:status};
    if (hasValue_(p.delivery)) {
      const delivery = Math.max(0,num_(p.delivery));
      changes.delivery = delivery;
      changes.total = num_(row.subtotal) + delivery;
    }
    if (p.metodo_pago !== undefined) changes.metodo_pago = String(p.metodo_pago || '').slice(0,80);
    if (p.notas_admin !== undefined) changes.notas_admin = String(p.notas_admin || '').slice(0,500);
    if (status === 'ENTREGADO' && !row.fecha_entrega_real) changes.fecha_entrega_real = new Date();

    updateRowByHeaders_(SHEETS.ORDERS,row._row,changes);
    audit_('admin','ACTUALIZAR','pedido',row.pedido_id,{...changes,estado_anterior:current});
    return {pedido_id:row.pedido_id,...changes};
  } finally {
    lock.releaseLock();
  }
}
function saveProduct_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!String(p.nombre || '').trim()) throw new Error('El producto necesita nombre.');
    const categoryId = String(p.categoria_id || '').trim();
    if (categoryId && !findBy_(SHEETS.CATEGORIES,'categoria_id',categoryId)) throw new Error('La categoría seleccionada no existe.');

    const products = rows_(SHEETS.PRODUCTS);
    const row = p.id ? products.find(x => String(x.id) === String(p.id)) : null;
    const id = row ? String(row.id) : nextProductId_(products);
    const stockFisico = Math.max(0,Math.floor(num_(p.stock_fisico)));
    const stockReservado = row ? Math.max(0,Math.floor(num_(row.stock_reservado))) : 0;
    if (stockFisico < stockReservado) throw new Error(`El stock físico no puede ser menor al stock reservado (${stockReservado}).`);

    const mainImage = safeHttpUrl_(p.imagen_principal);
    const extraImages = normalizeImageUrls_(p.imagenes);
    const record = {
      id,
      nombre:String(p.nombre).trim().slice(0,120),
      slug:slug_(p.nombre),
      categoria_id:categoryId,
      descripcion:String(p.descripcion || '').trim().slice(0,1000),
      precio:Math.max(0,num_(p.precio)),
      stock_fisico:stockFisico,
      stock_reservado:stockReservado,
      activo:bool_(p.activo),
      destacado:bool_(p.destacado),
      imagen_principal:mainImage,
      imagenes:extraImages,
      etiqueta_stock:String(p.etiqueta_stock || '').trim().slice(0,80),
      personalizable:bool_(p.personalizable),
      orden:Math.max(0,Math.floor(num_(p.orden || 99))),
      fecha_inicio:p.fecha_inicio !== undefined ? dateOnlyInput_(p.fecha_inicio) : (row ? dateOnlyInput_(row.fecha_inicio) : ''),
      fecha_fin:p.fecha_fin !== undefined ? dateOnlyInput_(p.fecha_fin) : (row ? dateOnlyInput_(row.fecha_fin) : '')
    };
    if (record.fecha_inicio && record.fecha_fin && record.fecha_fin < record.fecha_inicio) throw new Error('La fecha final del producto no puede ser anterior a la fecha inicial.');

    if (row) updateRowByHeaders_(SHEETS.PRODUCTS,row._row,record);
    else appendByHeaders_(SHEETS.PRODUCTS,record);
    audit_('admin','GUARDAR','producto',id,{...record,imagenes:extraImages ? '[configuradas]' : ''});
    return {id};
  } finally {
    lock.releaseLock();
  }
}
function saveDelivery_(p) {
  const zones = rows_(SHEETS.DELIVERY);
  let row = p.zona_id ? zones.find(x => String(x.zona_id) === String(p.zona_id)) : null;

  if (!row && !String(p.nombre || '').trim()) throw new Error('La zona necesita nombre.');

  if (!row) {
    let id = 'DEL-' + slug_(p.nombre).toUpperCase().replace(/-/g,'_');
    if (!id || id === 'DEL-') id = 'DEL-' + Utilities.getUuid().slice(0,6).toUpperCase();
    if (zones.some(x => String(x.zona_id) === id)) id += '-' + Utilities.getUuid().slice(0,4).toUpperCase();
    const record = {
      zona_id:id,
      nombre:String(p.nombre || '').trim().slice(0,100),
      distrito:String(p.distrito || p.nombre || '').trim().slice(0,100),
      costo:Math.max(0,num_(p.costo)),
      requiere_cotizacion:bool_(p.requiere_cotizacion),
      activo:bool_(p.activo),
      orden:num_(p.orden || 99),
      nota:String(p.nota || '').trim().slice(0,250)
    };
    appendByHeaders_(SHEETS.DELIVERY,record);
    audit_('admin','CREAR','delivery',id,record);
    return {zona_id:id,created:true};
  }

  const changes = {
    nombre:p.nombre !== undefined ? String(p.nombre || '').trim().slice(0,100) : row.nombre,
    distrito:p.distrito !== undefined ? String(p.distrito || '').trim().slice(0,100) : row.distrito,
    costo:Math.max(0,num_(p.costo)),
    requiere_cotizacion:bool_(p.requiere_cotizacion),
    activo:bool_(p.activo),
    orden:p.orden !== undefined ? num_(p.orden || 99) : row.orden,
    nota:p.nota !== undefined ? String(p.nota || '').trim().slice(0,250) : row.nota
  };
  updateRowByHeaders_(SHEETS.DELIVERY,row._row,changes);
  audit_('admin','GUARDAR','delivery',row.zona_id,changes);
  return {zona_id:row.zona_id,created:false};
}

function saveCategory_(p) {
  if (!String(p.nombre || '').trim()) throw new Error('La categoría necesita nombre.');
  const categories = rows_(SHEETS.CATEGORIES);
  let row = p.categoria_id ? categories.find(x => String(x.categoria_id) === String(p.categoria_id)) : null;
  let id = row ? String(row.categoria_id) : slug_(p.nombre);
  if (!id) id = 'categoria-' + Utilities.getUuid().slice(0,6).toLowerCase();
  if (!row && categories.some(x => String(x.categoria_id) === id)) id += '-' + Utilities.getUuid().slice(0,4).toLowerCase();

  const record = {
    categoria_id:id,
    nombre:String(p.nombre || '').trim().slice(0,100),
    emoji:String(p.emoji || '🎁').trim().slice(0,8),
    descripcion:String(p.descripcion || '').trim().slice(0,220),
    activo:bool_(p.activo),
    orden:Math.max(0,Math.floor(num_(p.orden || 99))),
    fecha_inicio:dateOnlyInput_(p.fecha_inicio),
    fecha_fin:dateOnlyInput_(p.fecha_fin)
  };
  if (record.fecha_inicio && record.fecha_fin && record.fecha_fin < record.fecha_inicio) throw new Error('La fecha final de la categoría no puede ser anterior a la fecha inicial.');
  if (row) updateRowByHeaders_(SHEETS.CATEGORIES,row._row,record);
  else appendByHeaders_(SHEETS.CATEGORIES,record);
  audit_('admin',row ? 'GUARDAR' : 'CREAR','categoria',id,record);
  return {categoria_id:id,created:!row};
}

function saveConfig_(p) {
  const allowed = ['STORE_NAME','WHATSAPP_NUMBER','ADMIN_EMAIL','RESERVATION_MINUTES','DEFAULT_CITY','DEFAULT_REGION','COUNTRY','STORE_STATUS','MIN_NOTICE_HOURS'];
  const key = String(p.key || '');
  if (allowed.indexOf(key) < 0) throw new Error('Configuración no editable.');
  let value = String(p.value ?? '').trim();

  if (key === 'STORE_NAME' && !value) throw new Error('El nombre de la tienda no puede quedar vacío.');
  if (key === 'STORE_STATUS') {
    value = value.toLowerCase();
    if (['open','paused','closed'].indexOf(value) < 0) throw new Error('STORE_STATUS debe ser open, paused o closed.');
  }
  if (key === 'WHATSAPP_NUMBER') {
    value = value.replace(/\D/g,'');
    if (value.length < 8 || value.length > 15) throw new Error('Ingresa WhatsApp en formato internacional.');
  }
  if (key === 'ADMIN_EMAIL') {
    const emails = value.split(/[;,]/).map(x=>x.trim()).filter(Boolean);
    if (!emails.length || emails.some(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) throw new Error('Revisa los correos de aviso.');
    value = emails.join(',');
  }
  if (key === 'RESERVATION_MINUTES') {
    const n = Math.floor(num_(value));
    if (n < 5 || n > 1440) throw new Error('La reserva debe durar entre 5 y 1440 minutos.');
    value = String(n);
  }
  if (key === 'MIN_NOTICE_HOURS') {
    const n = Math.floor(num_(value));
    if (n < 0 || n > 720) throw new Error('La anticipación debe estar entre 0 y 720 horas.');
    value = String(n);
  }

  setConfigValue_(key,value);
  audit_('admin','CONFIGURAR','config',key,{});
  return {key,value};
}
function releaseExpiredReservationsNoLock_() {
  const now = new Date();
  let count = 0;
  rows_(SHEETS.RESERVATIONS).forEach(r => {
    if (String(r.estado).toUpperCase() !== 'PENDIENTE') return;
    const expiry = date_(r.fecha_expiracion);
    if (!expiry || expiry.getTime() > now.getTime()) return;
    releaseStockForReservation_(r);
    setCellByHeader_(SHEETS.RESERVATIONS,r._row,'estado','EXPIRADA');
    audit_('sistema','EXPIRAR','reserva',r.reserva_id,{});
    count++;
  });
  return {released:count};
}

function releaseStockForReservation_(r) {
  const qtyById = aggregateItemQty_(parseItems_(r.items_json));
  const products = rows_(SHEETS.PRODUCTS);
  const byId = {};
  products.forEach(x => byId[String(x.id)] = x);
  Object.keys(qtyById).forEach(id => {
    const pr = byId[id];
    if (pr) setCellByHeader_(SHEETS.PRODUCTS,pr._row,'stock_reservado',Math.max(0,num_(pr.stock_reservado)-qtyById[id]));
  });
}

function restoreStockForOrder_(order) {
  const qtyById = aggregateItemQty_(parseItems_(order.items_json));
  const products = rows_(SHEETS.PRODUCTS);
  const byId = {};
  products.forEach(x => byId[String(x.id)] = x);
  Object.keys(qtyById).forEach(id => {
    const pr = byId[id];
    if (pr) setCellByHeader_(SHEETS.PRODUCTS,pr._row,'stock_fisico',num_(pr.stock_fisico)+qtyById[id]);
  });
}

function sendReservationEmail_(id,p,items,zone,subtotal,delivery,total,expires) {
  const cfg = configMap_();
  const recipients = String(cfg.ADMIN_EMAIL || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
  if (!recipients.length) return;

  const itemText = items.map(i => `• ${i.name} x${i.qty} — S/ ${(i.unitPrice*i.qty).toFixed(2)}${i.personalization ? ' | '+i.personalization : ''}`).join('\n');
  const body = [
    `Nueva reserva: ${id}`,
    '',
    `Cliente: ${p.name}`,
    `WhatsApp: ${p.phone}`,
    p.email ? `Correo: ${p.email}` : '',
    `Entrega: ${p.deliveryDate} · ${p.deliveryWindow}`,
    `Zona: ${zone.nombre}`,
    `Dirección: ${p.address}`,
    p.reference ? `Referencia: ${p.reference}` : '',
    p.mapsUrl ? `Maps: ${p.mapsUrl}` : '',
    '',
    itemText,
    '',
    `Subtotal: S/ ${subtotal.toFixed(2)}`,
    `Delivery: ${delivery === null ? 'POR COTIZAR' : 'S/ '+delivery.toFixed(2)}`,
    `Total: ${total === null ? 'POR CONFIRMAR' : 'S/ '+total.toFixed(2)}`,
    p.dedication ? `\nDedicatoria: ${p.dedication}` : '',
    p.notes ? `\nObservaciones: ${p.notes}` : '',
    `\nLa reserva vence: ${Utilities.formatDate(expires,'America/Lima','dd/MM/yyyy HH:mm')}`
  ].filter(Boolean).join('\n');

  const itemRows = items.map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${html_(i.name)} × ${i.qty}${i.personalization ? `<br><small>${html_(i.personalization)}</small>` : ''}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">S/ ${(i.unitPrice*i.qty).toFixed(2)}</td></tr>`).join('');
  const wa = String(p.phone || '').replace(/\D/g,'');
  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#262121">
      <div style="background:#262121;color:white;padding:20px 24px;border-radius:16px 16px 0 0">
        <div style="font-size:13px;opacity:.8">NUEVA RESERVA</div>
        <div style="font-size:24px;font-weight:700;margin-top:4px">${html_(id)}</div>
      </div>
      <div style="border:1px solid #eadfd8;border-top:0;padding:24px;border-radius:0 0 16px 16px">
        <p><strong>${html_(p.name)}</strong><br>WhatsApp: ${html_(p.phone)}${p.email ? `<br>Correo: ${html_(p.email)}` : ''}</p>
        <p><strong>Entrega:</strong> ${html_(p.deliveryDate)} · ${html_(p.deliveryWindow)}<br><strong>Zona:</strong> ${html_(zone.nombre)}<br><strong>Dirección:</strong> ${html_(p.address)}${p.reference ? `<br><strong>Referencia:</strong> ${html_(p.reference)}` : ''}</p>
        <p>${p.mapsUrl ? `<a href="${htmlAttr_(p.mapsUrl)}" style="display:inline-block;margin-right:10px">Abrir ubicación</a>` : ''}${wa ? `<a href="https://wa.me/${wa}">Contactar por WhatsApp</a>` : ''}</p>
        <table style="width:100%;border-collapse:collapse;margin:18px 0">${itemRows}</table>
        <table style="width:100%;border-collapse:collapse">
          <tr><td>Subtotal</td><td style="text-align:right">S/ ${subtotal.toFixed(2)}</td></tr>
          <tr><td>Delivery</td><td style="text-align:right">${delivery === null ? '<strong>POR COTIZAR</strong>' : 'S/ '+delivery.toFixed(2)}</td></tr>
          <tr><td style="padding-top:8px"><strong>Total</strong></td><td style="padding-top:8px;text-align:right"><strong>${total === null ? 'POR CONFIRMAR' : 'S/ '+total.toFixed(2)}</strong></td></tr>
        </table>
        ${p.dedication ? `<p><strong>Dedicatoria:</strong><br>${html_(p.dedication)}</p>` : ''}
        ${p.notes ? `<p><strong>Observaciones:</strong><br>${html_(p.notes)}</p>` : ''}
        <p style="margin-top:22px;color:#746b68;font-size:13px">La reserva vence ${Utilities.formatDate(expires,'America/Lima','dd/MM/yyyy HH:mm')} si todavía no ha sido confirmada.</p>
      </div>
    </div>`;

  MailApp.sendEmail({
    to:recipients.join(','),
    subject:`Nueva reserva ${id} — ${p.name}`,
    body,
    htmlBody,
    name:String(cfg.STORE_NAME || 'Store Flowers')
  });
}

function validateReservation_(p) {
  if (!String(p.name || '').trim()) throw new Error('Falta el nombre del cliente.');
  const phoneDigits = String(p.phone || '').replace(/\D/g,'');
  if (phoneDigits.length < 8 || phoneDigits.length > 15) throw new Error('Ingresa un WhatsApp válido.');

  const deliveryDate = String(p.deliveryDate || '').trim();
  if (!deliveryDate) throw new Error('Falta la fecha de entrega.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || dateOnlyInput_(deliveryDate) !== deliveryDate) throw new Error('La fecha de entrega no es válida.');
  const cfg = configMap_();
  const minHours = Math.max(0, num_(cfg.MIN_NOTICE_HOURS || 0));
  const minDate = Utilities.formatDate(new Date(Date.now() + minHours * 60 * 60 * 1000), 'America/Lima', 'yyyy-MM-dd');
  if (deliveryDate < minDate) throw new Error('La fecha de entrega no cumple con la anticipación mínima de la tienda.');

  const email = String(p.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('El correo ingresado no es válido.');
  if (!String(p.deliveryWindow || '').trim()) throw new Error('Falta el horario de entrega.');
  if (!String(p.zoneId || '').trim()) throw new Error('Falta la zona de entrega.');
  if (!String(p.address || '').trim()) throw new Error('Falta la dirección.');
  if (!Array.isArray(p.items) || !p.items.length) throw new Error('El carrito está vacío.');
  if (p.items.length > 20) throw new Error('Demasiados productos diferentes en una sola reserva.');
}

function setGitHubToken_(p) {
  const token = String((p && p.githubToken) || '').trim();
  if (token.length < 20) throw new Error('El token de GitHub no parece válido.');
  const test = githubRequestWithToken_(token,'get','/repos/'+GITHUB_REPO,null);
  if (test && test.permissions && test.permissions.push === false) throw new Error('El token no tiene permiso de escritura en el repositorio.');
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN',token);
  audit_('admin','CONFIGURAR','integracion','github',{repo:GITHUB_REPO});
  return {configured:true,repo:GITHUB_REPO};
}

function clearGitHubToken_() {
  PropertiesService.getScriptProperties().deleteProperty('GITHUB_TOKEN');
  audit_('admin','DESCONECTAR','integracion','github',{repo:GITHUB_REPO});
  return {configured:false,repo:GITHUB_REPO};
}

function uploadProductImage_(p) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Primero configura la conexión con GitHub en el panel.');
  const mime = String((p && p.mimeType) || '').toLowerCase();
  const extByMime = {'image/webp':'webp','image/jpeg':'jpg','image/png':'png'};
  const ext = extByMime[mime];
  if (!ext) throw new Error('Formato de imagen no permitido.');
  const base64 = String((p && p.base64) || '').replace(/^data:[^;]+;base64,/,'').trim();
  if (!base64) throw new Error('La imagen está vacía.');
  let bytes;
  try { bytes = Utilities.base64Decode(base64); } catch (e) { throw new Error('No se pudo leer la imagen.'); }
  if (bytes.length < 100) throw new Error('La imagen está vacía o dañada.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('La imagen sigue siendo demasiado pesada después de comprimirla.');
  validateImageSignature_(bytes,mime);

  const now = new Date();
  const folder = Utilities.formatDate(now,TIMEZONE,'yyyy/MM');
  const baseName = slug_((p && (p.productName || p.productId)) || 'producto').slice(0,60) || 'producto';
  const suffix = Utilities.getUuid().slice(0,8).toLowerCase();
  const path = 'assets/products/'+folder+'/'+baseName+'-'+suffix+'.'+ext;
  const response = githubRequestWithToken_(token,'put','/repos/'+GITHUB_REPO+'/contents/'+path,{
    message:'Agregar imagen de producto: '+baseName,
    content:Utilities.base64Encode(bytes),
    branch:GITHUB_BRANCH
  });
  const url = GITHUB_PAGES_BASE + path;
  audit_('admin','SUBIR_IMAGEN','producto',String((p&&p.productId)||''),{path,size:bytes.length,commit:response && response.commit ? response.commit.sha : ''});
  return {url,path,sizeBytes:bytes.length,commitSha:response && response.commit ? response.commit.sha : ''};
}

function githubRequestWithToken_(token,method,path,payload) {
  const options = {
    method:String(method||'get').toLowerCase(),
    muteHttpExceptions:true,
    headers:{
      'Authorization':'Bearer '+token,
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'Store-Flowers-Apps-Script'
    }
  };
  if (payload !== null && payload !== undefined) {
    options.contentType='application/json';
    options.payload=JSON.stringify(payload);
  }
  const res = UrlFetchApp.fetch('https://api.github.com'+path,options);
  const code = res.getResponseCode();
  let body={};
  try { body=JSON.parse(res.getContentText()||'{}'); } catch(e) {}
  if (code < 200 || code >= 300) {
    const msg=String(body.message||('GitHub respondió '+code)).slice(0,220);
    throw new Error('GitHub: '+msg);
  }
  return body;
}

function validateImageSignature_(bytes,mime) {
  const b=i=>(bytes[i]||0)&255;
  const okWebp = bytes.length>12 && b(0)===82 && b(1)===73 && b(2)===70 && b(3)===70 && b(8)===87 && b(9)===69 && b(10)===66 && b(11)===80;
  const okJpeg = bytes.length>3 && b(0)===255 && b(1)===216 && b(2)===255;
  const okPng = bytes.length>8 && b(0)===137 && b(1)===80 && b(2)===78 && b(3)===71;
  if ((mime==='image/webp'&&!okWebp)||(mime==='image/jpeg'&&!okJpeg)||(mime==='image/png'&&!okPng)) throw new Error('El contenido de la imagen no coincide con su formato.');
}


function publicConfig_() {
  const c = configMap_();
  const keys = ['STORE_NAME','CURRENCY','WHATSAPP_NUMBER','RESERVATION_MINUTES','DEFAULT_CITY','DEFAULT_REGION','COUNTRY','STORE_STATUS','MIN_NOTICE_HOURS'];
  const out = {};
  keys.forEach(k => out[k] = c[k] ?? '');
  return out;
}

function configMap_() {
  const out = {};
  rows_(SHEETS.CONFIG).forEach(r => { if (r.clave) out[String(r.clave)] = r.valor; });
  return out;
}

function setConfigValue_(key,value) {
  const row = findBy_(SHEETS.CONFIG,'clave',key);
  if (row) setCellByHeader_(SHEETS.CONFIG,row._row,'valor',value);
  else appendByHeaders_(SHEETS.CONFIG,{clave:key,valor:value,tipo:'text',descripcion:''});
}

function requireAdmin_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!expected) throw new Error('Ejecuta setup() una vez antes de usar administración.');
  if (!token || String(token) !== expected) throw new Error('Token de administración incorrecto.');
}

function audit_(actor,action,entity,id,detail) {
  try {
    appendByHeaders_(SHEETS.AUDIT,{fecha:new Date(),actor,accion:action,entidad:entity,entidad_id:id,detalle_json:JSON.stringify(detail || {})});
  } catch (e) {}
}

function db_(){ return SpreadsheetApp.openById(STORE_DB_ID); }
function sheet_(name){ const sh=db_().getSheetByName(name); if(!sh)throw new Error(`Falta la pestaña ${name}.`); return sh; }
function headers_(name){ const sh=sheet_(name); const last=Math.max(1,sh.getLastColumn()); return sh.getRange(1,1,1,last).getValues()[0].map(String); }
function rows_(name){ const sh=sheet_(name); const h=headers_(name); const lr=sh.getLastRow(); if(lr<2)return[]; return sh.getRange(2,1,lr-1,h.length).getValues().map((vals,i)=>{const o={_row:i+2};h.forEach((k,j)=>o[k]=vals[j]);return o;}); }
function appendByHeaders_(name,obj){ const sh=sheet_(name),h=headers_(name); sh.appendRow(h.map(k=>obj[k]===undefined?'':obj[k])); }
function updateRowByHeaders_(name,row,obj){ const sh=sheet_(name),h=headers_(name),current=sh.getRange(row,1,1,h.length).getValues()[0]; h.forEach((k,i)=>{if(obj[k]!==undefined)current[i]=obj[k]}); sh.getRange(row,1,1,h.length).setValues([current]); }
function setCellByHeader_(name,row,header,value){ const sh=sheet_(name),h=headers_(name),idx=h.indexOf(header); if(idx<0)throw new Error(`Falta columna ${header}.`); sh.getRange(row,idx+1).setValue(value); }
function findBy_(name,header,value){ return rows_(name).find(r=>String(r[header])===String(value)); }
function cleanRow_(r){ const o={}; Object.keys(r).forEach(k=>{if(k==='_row')return;const v=r[k];o[k]=v instanceof Date?v.toISOString():v;}); return o; }
function parseItems_(s){ try{return JSON.parse(String(s||'[]'))||[]}catch(e){return[]} }
function num_(v){ const n=Number(v); return isFinite(n)?n:0; }
function bool_(v){ return v===true||String(v).toLowerCase()==='true'||String(v)==='1'; }
function hasValue_(v){ return v !== undefined && v !== null && String(v).trim() !== ''; }
function date_(v){ if(v instanceof Date)return v;if(!v)return null;const d=new Date(v);return isNaN(d.getTime())?null:d; }
function dateOnlyInput_(v){
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v,TIMEZONE,'yyyy-MM-dd');
  const s=String(v).trim().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d=new Date(s+'T12:00:00-05:00');
  if (isNaN(d.getTime()) || Utilities.formatDate(d,TIMEZONE,'yyyy-MM-dd')!==s) return '';
  return s;
}
function inDateWindow_(r,now){ const today=Utilities.formatDate(now||new Date(),TIMEZONE,'yyyy-MM-dd'),a=dateOnlyInput_(r.fecha_inicio),b=dateOnlyInput_(r.fecha_fin);if(a&&today<a)return false;if(b&&today>b)return false;return true; }
function aggregateItemQty_(items){ const out={};(items||[]).forEach(i=>{const id=String(i.id||'');const q=Math.max(0,Math.floor(num_(i.qty)));if(id&&q)out[id]=(out[id]||0)+q;});return out; }
function safeHttpUrl_(v){ const s=String(v||'').trim();if(!s)return '';if(!/^https:\/\//i.test(s))throw new Error('Las imágenes deben usar una URL https:// válida.');return s.slice(0,2000); }
function normalizeImageUrls_(v){ const parts=String(v||'').split(/[|,\n]/).map(x=>x.trim()).filter(Boolean);const unique=[];parts.forEach(x=>{const u=safeHttpUrl_(x);if(unique.indexOf(u)<0)unique.push(u);});return unique.slice(0,12).join('|'); }
function makeId_(prefix){ return `${prefix}-${Utilities.formatDate(new Date(),'America/Lima','yyyyMMdd')}-${Utilities.getUuid().slice(0,6).toUpperCase()}`; }
function nextProductId_(products){ let max=0;products.forEach(p=>{const m=String(p.id||'').match(/PRD-(\d+)/);if(m)max=Math.max(max,Number(m[1]))});return `PRD-${String(max+1).padStart(3,'0')}`; }
function slug_(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function safeError_(e){ return String((e&&e.message)||e||'Error inesperado.').slice(0,500); }
function html_(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function htmlAttr_(s){ return html_(s); }
function json_(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
