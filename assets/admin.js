(() => {
  const cfg = window.STORE_CONFIG || {};
  const $ = (q,e=document) => e.querySelector(q);
  const $$ = (q,e=document) => [...e.querySelectorAll(q)];
  const money = n => `${cfg.CURRENCY_SYMBOL || 'S/'} ${Number(n || 0).toFixed(2)}`;
  let token = localStorage.getItem('sf_admin_token') || '';
  let data = null;

  const esc = s => String(s ?? '').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
  const bool = v => v === true || String(v).toLowerCase() === 'true';
  const hasVal = v => v !== undefined && v !== null && String(v).trim() !== '';
  const parseItems = s => { try { return JSON.parse(String(s || '[]')) || []; } catch { return []; } };
  const digits = s => String(s || '').replace(/\D/g,'');

  function toast(t){
    const el=$('#toast');
    el.textContent=t;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t=setTimeout(()=>el.classList.remove('show'),2400);
  }

  async function get(action,params={}){
    if(!cfg.API_URL) throw new Error('Primero debes conectar la URL del Web App en assets/config.js');
    if(action==='adminSnapshot'){
      try{
        const r=await fetch(cfg.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'adminSnapshot',payload:{...params,token}}),redirect:'follow'});
        const j=await r.json();
        if(j.ok!==false)return j.data||j;
        if(!String(j.error||'').includes('Acción no válida'))throw new Error(j.error||'Acceso denegado');
      }catch(e){
        if(!String(e.message||'').includes('Acción no válida'))throw e;
      }
    }
    const u=new URL(cfg.API_URL);
    u.searchParams.set('action',action);
    u.searchParams.set('token',token);
    Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
    const r=await fetch(u,{redirect:'follow'});
    const j=await r.json();
    if(j.ok===false) throw new Error(j.error||'Acceso denegado');
    return j.data||j;
  }

  async function post(action,payload={}){
    if(!cfg.API_URL) throw new Error('API no configurada');
    const r=await fetch(cfg.API_URL,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,payload:{...payload,token}}),
      redirect:'follow'
    });
    const j=await r.json();
    if(j.ok===false) throw new Error(j.error||'Operación no completada');
    return j.data||j;
  }

  async function login(){
    const msg=$('#adminLoginMessage');
    token=$('#adminToken').value.trim();
    msg.hidden=true;
    if(!token){msg.hidden=false;msg.textContent='Ingresa el token.';return;}
    try{
      await refresh();
      localStorage.setItem('sf_admin_token',token);
      $('#adminLogin').classList.add('hidden');
      $('#adminApp').classList.remove('hidden');
    }catch(e){msg.hidden=false;msg.textContent=e.message;}
  }

  async function refresh(){
    data=await get('adminSnapshot');
    render();
  }

  function render(){
    if(!data)return;
    const name=data.config?.STORE_NAME||cfg.STORE_NAME||'Store Flowers';
    $$('[data-store-name]').forEach(e=>e.textContent=name);
    renderMetrics();
    renderProducts();
    renderReservations();
    renderOrders();
    renderDelivery();
    renderSettings();
  }

  function table(headers,rows){
    const labelRows=rows.map(row=>{
      let i=0;
      return row.replace(/<td(\s[^>]*)?>/g,(m,attrs='')=>{
        const label=headers[i++]||'';
        return `<td${attrs||''} data-label="${esc(label)}">`;
      });
    });
    return `<table class="admin-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${labelRows.join('')||`<tr><td colspan="${headers.length}">Sin registros.</td></tr>`}</tbody></table>`;
  }

  function statusClass(s){
    s=String(s||'').toUpperCase();
    return s.includes('PEND')?'pending':(s.includes('CONF')||s.includes('ENTREG')||s.includes('LISTO'))?'ok':(s.includes('CANCEL')||s.includes('EXPIR'))?'cancelled':'';
  }

  function renderMetrics(){
    const products=data.products||[],reservations=data.reservations||[],orders=data.orders||[];
    const available=products.reduce((s,p)=>s+Math.max(0,Number(p.stock_fisico||0)-Number(p.stock_reservado||0)),0);
    const pending=reservations.filter(r=>String(r.estado).toUpperCase()==='PENDIENTE').length;
    const confirmed=orders.filter(o=>String(o.estado).toUpperCase()!=='CANCELADO').length;
    const revenue=orders.filter(o=>String(o.estado).toUpperCase()!=='CANCELADO').reduce((s,o)=>s+Number(o.total||0),0);
    $('#metrics').innerHTML=`<article class="metric"><span>Stock disponible</span><strong>${available}</strong></article><article class="metric"><span>Reservas pendientes</span><strong>${pending}</strong></article><article class="metric"><span>Pedidos</span><strong>${confirmed}</strong></article><article class="metric"><span>Venta registrada</span><strong>${money(revenue)}</strong></article>`;

    const recent=reservations.slice().reverse().slice(0,6).map(r=>`<tr><td>${esc(r.reserva_id)}</td><td>${esc(r.cliente_nombre)}</td><td><span class="status ${statusClass(r.estado)}">${esc(r.estado)}</span></td><td>${esc(r.fecha_entrega)}</td><td>${hasVal(r.total)?money(r.total):money(r.subtotal)+' + delivery'}</td></tr>`);
    $('#recentReservations').innerHTML=table(['Reserva','Cliente','Estado','Entrega','Monto'],recent);

    const low=products.filter(p=>Math.max(0,Number(p.stock_fisico||0)-Number(p.stock_reservado||0))<=3).map(p=>`<tr><td>${esc(p.nombre)}</td><td>${p.stock_fisico}</td><td>${p.stock_reservado}</td><td><strong>${Math.max(0,Number(p.stock_fisico)-Number(p.stock_reservado))}</strong></td></tr>`);
    $('#lowStock').innerHTML=table(['Producto','Físico','Reservado','Disponible'],low);
  }

  function renderProducts(){
    const cats=data.categories||[];
    $('#adminCategorySelect').innerHTML=cats.map(c=>`<option value="${esc(c.categoria_id)}">${esc(c.nombre)}${bool(c.activo)?'':' (oculta)'}</option>`).join('');
    const rows=(data.products||[]).map(p=>{
      const avail=Math.max(0,Number(p.stock_fisico||0)-Number(p.stock_reservado||0));
      return `<tr><td>${esc(p.id)}</td><td>${esc(p.nombre)}</td><td>${money(p.precio)}</td><td>${p.stock_fisico}</td><td>${p.stock_reservado}</td><td>${avail}</td><td>${bool(p.activo)?'Sí':'No'}</td><td><div class="admin-actions"><button data-edit-product="${esc(p.id)}">Editar</button><button data-toggle-product="${esc(p.id)}">${bool(p.activo)?'Ocultar':'Activar'}</button></div></td></tr>`;
    });
    $('#productsTable').innerHTML=table(['ID','Producto','Precio','Físico','Reservado','Disponible','Activo','Acciones'],rows);
    $$('[data-edit-product]').forEach(b=>b.onclick=()=>fillProduct(b.dataset.editProduct));
    $$('[data-toggle-product]').forEach(b=>b.onclick=async()=>{
      const p=data.products.find(x=>x.id===b.dataset.toggleProduct);
      await act(()=>post('adminSaveProduct',{...p,activo:!bool(p.activo)}),'Producto actualizado');
    });
  }

  function fillProduct(id){
    const p=data.products.find(x=>x.id===id);if(!p)return;
    const f=$('#productForm');
    ['id','nombre','categoria_id','precio','stock_fisico','etiqueta_stock','imagen_principal','imagenes','orden','fecha_inicio','fecha_fin','descripcion'].forEach(k=>{if(f.elements[k])f.elements[k].value=p[k]??'';});
    ['activo','destacado','personalizable'].forEach(k=>f.elements[k].checked=bool(p[k]));
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function productPayload(f){
    const o=Object.fromEntries(new FormData(f));
    return {
      id:o.id||'',nombre:o.nombre,categoria_id:o.categoria_id,precio:Number(o.precio||0),stock_fisico:Number(o.stock_fisico||0),etiqueta_stock:o.etiqueta_stock||'',imagen_principal:o.imagen_principal||'',imagenes:o.imagenes||'',orden:Number(o.orden||99),fecha_inicio:o.fecha_inicio||'',fecha_fin:o.fecha_fin||'',descripcion:o.descripcion||'',activo:f.elements.activo.checked,destacado:f.elements.destacado.checked,personalizable:f.elements.personalizable.checked
    };
  }

  function reservationDeliveryValue(id){
    const el=$(`[data-res-delivery="${CSS.escape(id)}"]`);
    return el ? el.value.trim() : '';
  }

  function renderReservations(){
    const rows=(data.reservations||[]).slice().reverse().map(r=>{
      const pending=String(r.estado).toUpperCase()==='PENDIENTE';
      const delivery=hasVal(r.delivery)?Number(r.delivery):'';
      const total=hasVal(r.total)?money(r.total):money(r.subtotal)+' + delivery';
      return `<tr>
        <td>${esc(r.reserva_id)}</td>
        <td>${esc(r.cliente_nombre)}<br><small>${esc(r.cliente_whatsapp)}</small></td>
        <td>${esc(r.fecha_entrega)}<br><small>${esc(r.franja_entrega)}</small></td>
        <td>${esc(r.distrito)}</td>
        <td>${pending?`<input class="compact-number" data-res-delivery="${esc(r.reserva_id)}" type="number" min="0" step="0.5" value="${delivery}" placeholder="Cotizar">`:(hasVal(r.delivery)?money(r.delivery):'—')}</td>
        <td class="admin-money">${total}</td>
        <td><span class="status ${statusClass(r.estado)}">${esc(r.estado)}</span></td>
        <td><div class="admin-actions">
          <button data-detail-res="${esc(r.reserva_id)}">Detalle</button>
          ${pending?`<button data-save-res-delivery="${esc(r.reserva_id)}">Guardar delivery</button><button data-confirm-res="${esc(r.reserva_id)}">Confirmar</button><button data-cancel-res="${esc(r.reserva_id)}">Cancelar</button>`:''}
        </div></td>
      </tr>`;
    });
    $('#reservationsTable').innerHTML=table(['Reserva','Cliente','Entrega','Zona','Delivery','Total','Estado','Acciones'],rows);

    $$('[data-detail-res]').forEach(b=>b.onclick=()=>openReservationDetail(b.dataset.detailRes));
    $$('[data-save-res-delivery]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.saveResDelivery,v=reservationDeliveryValue(id);
      if(v==='')return toast('Ingresa el costo de delivery.');
      act(()=>post('adminSetReservationDelivery',{reserva_id:id,delivery:Number(v)}),'Delivery guardado');
    });
    $('[data-confirm-res]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.confirmRes,v=reservationDeliveryValue(id);
      if(!window.confirm(`¿Confirmar la reserva ${id}? Esto descontará el stock físico y creará el pedido.`))return;
      const payload={reserva_id:id};
      if(v!=='')payload.delivery=Number(v);
      act(()=>post('adminConfirmReservation',payload),'Pedido confirmado');
    });
    $('[data-cancel-res]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.cancelRes;
      if(!window.confirm(`¿Cancelar la reserva ${id}? El stock reservado volverá a estar disponible.`))return;
      act(()=>post('adminCancelReservation',{reserva_id:id}),'Reserva cancelada');
    });
  }

  function renderOrders(){
    const states=['CONFIRMADO','PREPARANDO','LISTO','ENVIADO','ENTREGADO','CANCELADO'];
    const rows=(data.orders||[]).slice().reverse().map(o=>`<tr>
      <td>${esc(o.pedido_id)}</td>
      <td>${esc(o.cliente_nombre)}<br><small>${esc(o.cliente_whatsapp)}</small></td>
      <td>${esc(o.fecha_entrega)}</td>
      <td>${money(o.delivery)}</td>
      <td class="admin-money">${money(o.total)}</td>
      <td><select data-order-status="${esc(o.pedido_id)}">${states.map(s=>`<option ${String(o.estado).toUpperCase()===s?'selected':''}>${s}</option>`).join('')}</select></td>
      <td><div class="admin-actions"><button data-save-order="${esc(o.pedido_id)}">Guardar estado</button><button data-detail-order="${esc(o.pedido_id)}">Detalle</button></div></td>
    </tr>`);
    $('#ordersTable').innerHTML=table(['Pedido','Cliente','Entrega','Delivery','Total','Estado','Acciones'],rows);
    $('[data-save-order]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.saveOrder;
      const sel=$(`[data-order-status="${CSS.escape(id)}"]`);
      if(sel.value==='CANCELADO'&&!window.confirm(`¿Marcar el pedido ${id} como CANCELADO?`))return;
      act(()=>post('adminUpdateOrder',{pedido_id:id,estado:sel.value}),'Estado actualizado');
    });
    $$('[data-detail-order]').forEach(b=>b.onclick=()=>openOrderDetail(b.dataset.detailOrder));
  }

  function renderDelivery(){
    const rows=(data.delivery||[]).map(d=>`<tr><td>${esc(d.nombre)}</td><td><input data-delivery-cost="${esc(d.zona_id)}" type="number" min="0" step="0.5" value="${Number(d.costo||0)}"></td><td><input data-delivery-quote="${esc(d.zona_id)}" type="checkbox" ${bool(d.requiere_cotizacion)?'checked':''}></td><td><input data-delivery-active="${esc(d.zona_id)}" type="checkbox" ${bool(d.activo)?'checked':''}></td><td>${esc(d.nota||'')}</td><td><button data-save-delivery="${esc(d.zona_id)}">Guardar</button></td></tr>`);
    $('#deliveryTable').innerHTML=table(['Zona','Costo','Cotizar','Activo','Nota',''],rows);
    $$('[data-save-delivery]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.saveDelivery,d=data.delivery.find(x=>x.zona_id===id);
      const payload={...d,costo:Number($(`[data-delivery-cost="${CSS.escape(id)}"]`).value||0),requiere_cotizacion:$(`[data-delivery-quote="${CSS.escape(id)}"]`).checked,activo:$(`[data-delivery-active="${CSS.escape(id)}"]`).checked};
      act(()=>post('adminSaveDelivery',payload),'Delivery actualizado');
    });
  }

  function renderSettings(){
    const allowed=['STORE_NAME','WHATSAPP_NUMBER','ADMIN_EMAIL','RESERVATION_MINUTES','DEFAULT_CITY','DEFAULT_REGION','COUNTRY','STORE_STATUS','MIN_NOTICE_HOURS'];
    const rows=allowed.map(k=>`<tr><td><strong>${k}</strong></td><td><input data-setting="${k}" value="${esc(data.config?.[k]??'')}"></td><td><button data-save-setting="${k}">Guardar</button></td></tr>`);
    $('#settingsTable').innerHTML=table(['Clave','Valor',''],rows);
    $$('[data-save-setting]').forEach(b=>b.onclick=()=>{
      const k=b.dataset.saveSetting,v=$(`[data-setting="${CSS.escape(k)}"]`).value;
      act(()=>post('adminSaveConfig',{key:k,value:v}),'Configuración actualizada');
    });
  }

  function itemListHtml(raw){
    const items=parseItems(raw);
    if(!items.length)return '<div class="admin-detail-box wide"><p>No hay detalle de productos.</p></div>';
    return `<div class="admin-item-list">${items.map(i=>`<div class="admin-item-line"><div><strong>${esc(i.name||i.id)}</strong><small>${i.personalization?esc(i.personalization):''}</small></div><div><strong>x${Number(i.qty||0)}</strong><br><small>${money(Number(i.unitPrice||0)*Number(i.qty||0))}</small></div></div>`).join('')}</div>`;
  }

  function contactActions(phone,mapsUrl,id){
    const wa=digits(phone);
    const waHref=wa?`https://wa.me/${wa}?text=${encodeURIComponent(`Hola, te escribo por tu pedido ${id}.`)}`:'';
    return `<div class="admin-detail-actions">${waHref?`<a href="${waHref}" target="_blank" rel="noopener">💬 WhatsApp</a>`:''}${mapsUrl?`<a href="${esc(mapsUrl)}" target="_blank" rel="noopener">📍 Abrir ubicación</a>`:''}</div>`;
  }

  function openReservationDetail(id){
    const r=(data.reservations||[]).find(x=>String(x.reserva_id)===String(id));
    if(!r)return;
    $('#adminDetailEyebrow').textContent='RESERVA';
    $('#adminDetailTitle').textContent=r.reserva_id;
    $('#adminDetailContent').innerHTML=`
      <div class="admin-detail-grid">
        <div class="admin-detail-box"><span>Cliente</span><strong>${esc(r.cliente_nombre)}</strong><p>${esc(r.cliente_whatsapp)}${r.cliente_email?`<br>${esc(r.cliente_email)}`:''}</p></div>
        <div class="admin-detail-box"><span>Estado</span><strong>${esc(r.estado)}</strong><p>Vence: ${formatDateTime(r.fecha_expiracion)}</p></div>
        <div class="admin-detail-box"><span>Entrega</span><strong>${esc(r.fecha_entrega)}</strong><p>${esc(r.franja_entrega)} · ${esc(r.distrito)}</p></div>
        <div class="admin-detail-box"><span>Total</span><strong>${hasVal(r.total)?money(r.total):money(r.subtotal)+' + delivery'}</strong><p>Delivery: ${hasVal(r.delivery)?money(r.delivery):'Por cotizar'}</p></div>
        <div class="admin-detail-box wide"><span>Dirección</span><strong>${esc(r.direccion)}</strong>${r.referencia?`<p>Referencia: ${esc(r.referencia)}</p>`:''}</div>
        ${r.dedicatoria?`<div class="admin-detail-box wide"><span>Dedicatoria</span><p>${esc(r.dedicatoria)}</p></div>`:''}
        ${r.observaciones?`<div class="admin-detail-box wide"><span>Observaciones</span><p>${esc(r.observaciones)}</p></div>`:''}
      </div>
      <h3>Productos</h3>
      ${itemListHtml(r.items_json)}
      ${contactActions(r.cliente_whatsapp,r.maps_url,r.reserva_id)}
    `;
    openDetail();
  }

  function openOrderDetail(id){
    const o=(data.orders||[]).find(x=>String(x.pedido_id)===String(id));
    if(!o)return;
    const states=['CONFIRMADO','PREPARANDO','LISTO','ENVIADO','ENTREGADO','CANCELADO'];
    const methods=['','Yape','Plin','Transferencia','Efectivo','Otro'];
    $('#adminDetailEyebrow').textContent='PEDIDO';
    $('#adminDetailTitle').textContent=o.pedido_id;
    $('#adminDetailContent').innerHTML=`
      <div class="admin-detail-grid">
        <div class="admin-detail-box"><span>Cliente</span><strong>${esc(o.cliente_nombre)}</strong><p>${esc(o.cliente_whatsapp)}${o.cliente_email?`<br>${esc(o.cliente_email)}`:''}</p></div>
        <div class="admin-detail-box"><span>Reserva de origen</span><strong>${esc(o.reserva_id)}</strong><p>Confirmado: ${formatDateTime(o.fecha_confirmacion)}</p></div>
        <div class="admin-detail-box"><span>Entrega</span><strong>${esc(o.fecha_entrega)}</strong><p>${esc(o.franja_entrega||'')} · ${esc(o.distrito)}</p></div>
        <div class="admin-detail-box"><span>Total</span><strong>${money(o.total)}</strong><p>Subtotal ${money(o.subtotal)} · Delivery ${money(o.delivery)}</p></div>
        <div class="admin-detail-box wide"><span>Dirección</span><strong>${esc(o.direccion)}</strong>${o.referencia?`<p>Referencia: ${esc(o.referencia)}</p>`:''}</div>
        ${o.dedicatoria?`<div class="admin-detail-box wide"><span>Dedicatoria</span><p>${esc(o.dedicatoria)}</p></div>`:''}
        ${o.observaciones?`<div class="admin-detail-box wide"><span>Observaciones del cliente</span><p>${esc(o.observaciones)}</p></div>`:''}
      </div>
      <h3>Productos</h3>
      ${itemListHtml(o.items_json)}
      <div class="admin-edit-grid">
        <label><span>Estado</span><select id="detailOrderStatus">${states.map(s=>`<option ${String(o.estado).toUpperCase()===s?'selected':''}>${s}</option>`).join('')}</select></label>
        <label><span>Delivery</span><input id="detailOrderDelivery" type="number" min="0" step="0.5" value="${Number(o.delivery||0)}"></label>
        <label><span>Método de pago</span><select id="detailOrderPayment">${methods.map(m=>`<option value="${esc(m)}" ${String(o.metodo_pago||'')===m?'selected':''}>${m||'Sin registrar'}</option>`).join('')}</select></label>
        <label class="wide"><span>Notas internas</span><textarea id="detailOrderNotes" rows="3" placeholder="Indicaciones internas, pago, entrega...">${esc(o.notas_admin||'')}</textarea></label>
      </div>
      <div class="admin-detail-actions">
        <button class="primary-button" id="saveOrderDetail" type="button">Guardar cambios</button>
        ${contactActions(o.cliente_whatsapp,o.maps_url,o.pedido_id).replace('<div class="admin-detail-actions">','').replace('</div>','')}
      </div>
    `;
    $('#saveOrderDetail').onclick=()=>{
      const payload={
        pedido_id:o.pedido_id,
        estado:$('#detailOrderStatus').value,
        delivery:Number($('#detailOrderDelivery').value||0),
        metodo_pago:$('#detailOrderPayment').value,
        notas_admin:$('#detailOrderNotes').value.trim()
      };
      act(()=>post('adminUpdateOrder',payload),'Pedido actualizado').then(()=>closeDetail());
    };
    openDetail();
  }

  function formatDateTime(v){
    if(!v)return '—';
    const d=new Date(v);
    if(Number.isNaN(d.getTime()))return esc(v);
    return d.toLocaleString('es-PE',{dateStyle:'short',timeStyle:'short'});
  }

  function openDetail(){
    const m=$('#adminDetailModal');
    m.classList.add('open');
    m.setAttribute('aria-hidden','false');
    document.body.classList.add('locked');
  }

  function closeDetail(){
    const m=$('#adminDetailModal');
    m.classList.remove('open');
    m.setAttribute('aria-hidden','true');
    document.body.classList.remove('locked');
  }

  async function act(fn,ok){
    try{await fn();toast(ok);await refresh();return true;}
    catch(e){toast(e.message);return false;}
  }

  function switchSection(name){
    $$('[data-admin-section]').forEach(s=>s.classList.toggle('hidden',s.dataset.adminSection!==name));
    $$('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===name));
    const titles={dashboard:'Resumen',products:'Productos',reservations:'Reservas',orders:'Pedidos',delivery:'Delivery',settings:'Configuración'};
    $('#adminTitle').textContent=titles[name]||'Administración';
  }

  $('#adminLoginButton').onclick=login;
  $('#adminToken').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
  $('#refreshAdmin').onclick=()=>act(()=>refresh(),'Actualizado');
  $('#adminLogout').onclick=()=>{localStorage.removeItem('sf_admin_token');location.reload();};
  $$('[data-section]').forEach(b=>b.onclick=()=>switchSection(b.dataset.section));
  $('#productForm').onsubmit=e=>{e.preventDefault();act(()=>post('adminSaveProduct',productPayload(e.currentTarget)),'Producto guardado').then(ok=>{if(ok)e.currentTarget.reset();});};
  $('#clearProductForm').onclick=()=>$('#productForm').reset();
  $('#adminDetailClose').onclick=closeDetail;
  $('#adminDetailModal').onclick=e=>{if(e.target.id==='adminDetailModal')closeDetail();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#adminDetailModal').classList.contains('open'))closeDetail();});

  if(token){$('#adminToken').value=token;login();}
})();
