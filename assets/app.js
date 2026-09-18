(() => {
  const cfg = window.STORE_CONFIG || {};
  const $ = (q, el=document) => el.querySelector(q);
  const $$ = (q, el=document) => [...el.querySelectorAll(q)];
  const money = n => `${cfg.CURRENCY_SYMBOL || 'S/'} ${Number(n || 0).toFixed(2)}`;

  const demoData = {
    config:{STORE_NAME:cfg.STORE_NAME||'Magaly Detalles',WHATSAPP_NUMBER:cfg.PUBLIC_WHATSAPP||'',RESERVATION_MINUTES:cfg.RESERVATION_MINUTES||30},
    categories:[
      {categoria_id:'flores-amarillas',nombre:'Flores amarillas',emoji:'🌻',descripcion:'Detalles para el 21 de septiembre.',activo:true,orden:1},
      {categoria_id:'cumpleanos',nombre:'Cumpleaños',emoji:'🎂',descripcion:'Regalos para celebrar.',activo:true,orden:2},
      {categoria_id:'graduacion',nombre:'Graduación',emoji:'🎓',descripcion:'Detalles para nuevos logros.',activo:true,orden:3},
      {categoria_id:'dia-madre',nombre:'Día de la Madre',emoji:'💐',descripcion:'Arreglos para mamá.',activo:true,orden:4},
      {categoria_id:'aniversario',nombre:'Aniversario',emoji:'❤️',descripcion:'Detalles para celebrar juntos.',activo:true,orden:5},
      {categoria_id:'san-valentin',nombre:'San Valentín',emoji:'💝',descripcion:'Regalos románticos.',activo:true,orden:6}
    ],
    products:[
      {id:'PRD-001',nombre:'Arreglo Abejita',slug:'arreglo-abejita',categoria_id:'flores-amarillas',descripcion:'Arreglo con peluche de abejita, girasol, globo y chocolates. Peluche y texto del globo sujetos a stock.',precio:89,stock_fisico:8,stock_reservado:0,available_stock:8,activo:true,destacado:true,imagen_principal:'',imagenes:'',etiqueta_stock:'Edición especial',personalizable:true,orden:1},
      {id:'PRD-002',nombre:'Arreglo Ovejita',slug:'arreglo-ovejita',categoria_id:'flores-amarillas',descripcion:'Arreglo con ovejita, girasol, globo y chocolates. Peluche y texto del globo sujetos a stock.',precio:89,stock_fisico:8,stock_reservado:0,available_stock:8,activo:true,destacado:true,imagen_principal:'',imagenes:'',etiqueta_stock:'Edición especial',personalizable:true,orden:2},
      {id:'PRD-003',nombre:'Osa amarilla',slug:'osa-amarilla',categoria_id:'flores-amarillas',descripcion:'Detalle con osa de traje amarillo y chocolates. Peluche sujeto a stock.',precio:49,stock_fisico:6,stock_reservado:0,available_stock:6,activo:true,destacado:false,imagen_principal:'',imagenes:'',etiqueta_stock:'Stock limitado',personalizable:true,orden:3},
      {id:'PRD-004',nombre:'Girasol con lluvia y globo',slug:'girasol-lluvia-globo',categoria_id:'flores-amarillas',descripcion:'Un girasol con decoración tipo lluvia/planta y globo pequeño.',precio:15,stock_fisico:20,stock_reservado:0,available_stock:20,activo:true,destacado:false,imagen_principal:'',imagenes:'',etiqueta_stock:'Detalle individual',personalizable:true,orden:4}
    ],
    delivery:[
      {zona_id:'DEL-PIURA',nombre:'Piura',distrito:'Piura',costo:0,requiere_cotizacion:true,activo:true,orden:1,nota:'Costo por definir según dirección.'},
      {zona_id:'DEL-CASTILLA',nombre:'Castilla',distrito:'Castilla',costo:0,requiere_cotizacion:true,activo:true,orden:2,nota:'Costo por definir según dirección.'},
      {zona_id:'DEL-26O',nombre:'Veintiséis de Octubre',distrito:'Veintiséis de Octubre',costo:0,requiere_cotizacion:true,activo:true,orden:3,nota:'Costo por definir según dirección.'},
      {zona_id:'DEL-CATACAOS',nombre:'Catacaos',distrito:'Catacaos',costo:0,requiere_cotizacion:true,activo:true,orden:4,nota:'Costo por definir según dirección.'},
      {zona_id:'DEL-OTRO',nombre:'Otra zona',distrito:'Otro',costo:0,requiere_cotizacion:true,activo:true,orden:99,nota:'Se cotiza antes de confirmar.'}
    ]
  };

  const state = { data: demoData, cart: loadCart(), category:'', search:'', sort:'featured', modalProduct:null, modalQty:1, apiReady:false };

  function loadCart(){ try { return JSON.parse(localStorage.getItem('sf_cart') || '[]'); } catch { return []; } }
  function saveCart(){ localStorage.setItem('sf_cart', JSON.stringify(state.cart)); renderCart(); }
  function reconcileCart(){
    let changed=false;
    const next=[];
    state.cart.forEach(item=>{
      const p=state.data.products.find(x=>String(x.id)===String(item.id));
      if(!p || !p.activo || Number(p.available_stock||0)<=0){changed=true;return;}
      const qty=Math.max(1,Math.min(Number(item.qty||1),Number(p.available_stock||0)));
      if(qty!==Number(item.qty||1))changed=true;
      next.push({...item,qty});
    });
    state.cart=next;
    localStorage.setItem('sf_cart',JSON.stringify(state.cart));
    return changed;
  }
  function parseBool(v){ return v === true || String(v).toLowerCase() === 'true'; }
  function toNum(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
  function normalize(data){
    const products=(data.products||[]).map(p=>({...p,precio:toNum(p.precio),stock_fisico:toNum(p.stock_fisico),stock_reservado:toNum(p.stock_reservado),available_stock:p.available_stock!==undefined?toNum(p.available_stock):Math.max(0,toNum(p.stock_fisico)-toNum(p.stock_reservado)),activo:parseBool(p.activo),destacado:parseBool(p.destacado),personalizable:parseBool(p.personalizable)}));
    const delivery=(data.delivery||[]).map(d=>({...d,costo:toNum(d.costo),requiere_cotizacion:parseBool(d.requiere_cotizacion),activo:parseBool(d.activo)}));
    const categories=(data.categories||[]).map(c=>({...c,activo:parseBool(c.activo)}));
    return {...data,products,delivery,categories,config:{...demoData.config,...(data.config||{})}};
  }

  async function apiGet(action, params={}){
    if(!cfg.API_URL) throw new Error('API no configurada');
    const url=new URL(cfg.API_URL);
    url.searchParams.set('action',action);
    Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
    const res=await fetch(url.toString(),{method:'GET',redirect:'follow'});
    if(!res.ok) throw new Error('No se pudo consultar la tienda');
    return res.json();
  }

  async function apiPost(action,payload){
    if(!cfg.API_URL) throw new Error('API no configurada');
    const res=await fetch(cfg.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,payload}),redirect:'follow'});
    if(!res.ok) throw new Error('No se pudo registrar la separación');
    return res.json();
  }

  async function bootstrap(){
    if(cfg.API_URL){
      try{
        const data=await apiGet('bootstrap');
        if(data && data.ok!==false){ state.data=normalize(data.data||data); state.apiReady=true; }
      }catch(err){
        console.warn('Backend no disponible; se muestra el catálogo local sin permitir reservas reales.',err);
      }
    }
    const cartAdjusted=reconcileCart();
    document.title=`${state.data.config.STORE_NAME||cfg.STORE_NAME||'Magaly Detalles'} | Regalos y detalles en Piura`;
    $$('[data-store-name]').forEach(el=>el.textContent=state.data.config.STORE_NAME||cfg.STORE_NAME||'Magaly Detalles');
    renderCategories();
    renderProducts();
    renderCart();
    renderZones();
    setMinDate();
    applyStoreStatus();
    if(cartAdjusted) setTimeout(()=>toast('Actualizamos tu carrito según el stock disponible.'),250);
  }

  function applyStoreStatus(){
    const status=String(state.data.config.STORE_STATUS||'open').toLowerCase();
    const open=status==='open';
    const start=$('#checkoutStart');
    const reserve=$('#reserveButton');
    if(start){
      start.disabled=!open;
      start.textContent=open?'Continuar con la separación →':status==='paused'?'Reservas pausadas temporalmente':'Tienda cerrada temporalmente';
    }
    if(reserve) reserve.disabled=!open;
    let banner=document.getElementById('storeStatusBanner');
    if(!open){
      if(!banner){
        banner=document.createElement('div');
        banner.id='storeStatusBanner';
        banner.className='store-status-banner';
        const header=document.querySelector('.site-header');
        if(header) header.insertAdjacentElement('afterend',banner);
      }
      banner.textContent=status==='paused'
        ? 'Estamos pausando nuevas reservas por el momento. Puedes revisar el catálogo y volver más tarde.'
        : 'La tienda no está recibiendo nuevas reservas en este momento.';
      banner.hidden=false;
    }else if(banner){
      banner.hidden=true;
    }
  }

  function categoryById(id){ return state.data.categories.find(c=>c.categoria_id===id); }
  function productEmoji(p){ const c=categoryById(p.categoria_id); return c?.emoji || '🎁'; }
  function imagesFor(p){ return [p.imagen_principal,...String(p.imagenes||'').split(/[|,\n]/)].map(s=>String(s||'').trim()).filter((v,i,a)=>v&&a.indexOf(v)===i); }
  function mediaHtml(p){ const imgs=imagesFor(p); if(imgs.length) return `<img loading="lazy" src="${escapeAttr(imgs[0])}" alt="${escapeAttr(p.nombre)}" onerror="this.parentElement.innerHTML='<div class=&quot;product-fallback&quot;><span class=&quot;emoji&quot;>${productEmoji(p)}</span><small>Foto del producto</small></div>'">`; return `<div class="product-fallback"><span class="emoji">${productEmoji(p)}</span><small>Foto del producto</small></div>`; }
  function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m])); }
  function escapeAttr(s=''){ return escapeHtml(s); }

  function renderCategories(){
    const items=state.data.categories.filter(c=>c.activo).sort((a,b)=>toNum(a.orden)-toNum(b.orden));
    $('#categoryGrid').innerHTML=items.map(c=>`<article class="occasion-card ${state.category===c.categoria_id?'active':''}" data-category="${escapeAttr(c.categoria_id)}"><span>${c.emoji||'🎁'}</span><div><strong>${escapeHtml(c.nombre)}</strong><small>${escapeHtml(c.descripcion||'')}</small></div></article>`).join('');
    $$('.occasion-card').forEach(card=>card.addEventListener('click',()=>{
      state.category=state.category===card.dataset.category?'':card.dataset.category;
      renderCategories();renderProducts();$('#productos').scrollIntoView({behavior:'smooth'});
    }));
  }

  function filteredProducts(){
    let list=state.data.products.filter(p=>p.activo);
    if(state.category) list=list.filter(p=>p.categoria_id===state.category);
    if(state.search){ const q=state.search.toLowerCase(); list=list.filter(p=>`${p.nombre} ${p.descripcion}`.toLowerCase().includes(q)); }
    if(state.sort==='price-asc') list.sort((a,b)=>a.precio-b.precio);
    else if(state.sort==='price-desc') list.sort((a,b)=>b.precio-a.precio);
    else if(state.sort==='name') list.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    else list.sort((a,b)=>(Number(b.destacado)-Number(a.destacado))||(toNum(a.orden)-toNum(b.orden)));
    return list;
  }

  function renderProducts(){
    const list=filteredProducts();
    $('#productGrid').innerHTML=list.map(p=>{
      const stock=toNum(p.available_stock),low=stock>0&&stock<=3,out=stock<=0,c=categoryById(p.categoria_id);
      return `<article class="product-card" data-product="${escapeAttr(p.id)}"><div class="product-media" data-open-product="${escapeAttr(p.id)}">${mediaHtml(p)}${p.etiqueta_stock?`<span class="product-badge">${escapeHtml(p.etiqueta_stock)}</span>`:''}<button class="quick-add" data-add="${escapeAttr(p.id)}" ${out?'disabled':''} aria-label="Agregar ${escapeAttr(p.nombre)}">+</button></div><div class="product-info"><div class="product-meta">${escapeHtml(c?.nombre||'Detalle')}</div><div class="product-title-row"><h3>${escapeHtml(p.nombre)}</h3><div class="product-price">${money(p.precio)}</div></div><span class="stock-chip ${out?'out':low?'low':''}">${out?'Agotado':low?`Solo ${stock} disponibles`:'Disponible'}</span></div></article>`;
    }).join('');
    $('#emptyProducts').hidden=!!list.length;
    const active=state.category?categoryById(state.category):null;
    $('#activeFilter').hidden=!active;
    if(active) $('#activeFilter').textContent=`${active.emoji||''} ${active.nombre} · tocar categoría nuevamente para limpiar`;
    $$('[data-open-product]').forEach(el=>el.addEventListener('click',e=>{if(e.target.closest('[data-add]'))return;openProduct(el.dataset.openProduct);}));
    $$('[data-add]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();addToCart(btn.dataset.add,1,'');}));
  }

  function addToCart(id,qty=1,personalization=''){
    const p=state.data.products.find(x=>x.id===id);
    if(!p||p.available_stock<=0)return toast('Este producto está agotado.');
    const existing=state.cart.find(i=>i.id===id&&i.personalization===personalization);
    const current=existing?.qty||0;
    const next=Math.min(current+qty,p.available_stock);
    if(existing)existing.qty=next;
    else state.cart.push({id,qty:Math.min(qty,p.available_stock),personalization});
    saveCart();toast(`${p.nombre} agregado al carrito`);
  }

  function changeCart(index,delta){
    const item=state.cart[index],p=state.data.products.find(x=>x.id===item.id);
    if(!item||!p)return;
    item.qty=Math.max(0,Math.min(item.qty+delta,p.available_stock));
    if(item.qty===0)state.cart.splice(index,1);
    saveCart();
  }

  function renderCart(){
    const body=$('#cartItems');if(!body)return;
    let subtotalValue=0,count=0;
    if(!state.cart.length)body.innerHTML='<div class="empty-cart"><span>🛍️</span><strong>Tu carrito está vacío</strong><p>Agrega algún detalle para empezar.</p></div>';
    else body.innerHTML=state.cart.map((item,i)=>{
      const p=state.data.products.find(x=>x.id===item.id);if(!p)return'';
      subtotalValue+=p.precio*item.qty;count+=item.qty;
      const img=imagesFor(p)[0];
      return `<div class="cart-line"><div class="cart-thumb">${img?`<img src="${escapeAttr(img)}" alt="">`:productEmoji(p)}</div><div><h4>${escapeHtml(p.nombre)}</h4>${item.personalization?`<small>${escapeHtml(item.personalization)}</small>`:''}<div class="cart-actions"><button data-cart-minus="${i}">−</button><strong>${item.qty}</strong><button data-cart-plus="${i}">+</button><button class="remove-link" data-cart-remove="${i}">Quitar</button></div></div><div class="line-price">${money(p.precio*item.qty)}</div></div>`;
    }).join('');
    $('#cartCount').textContent=count;
    $('#cartSubtotal').textContent=money(subtotalValue);
    $('#checkoutSubtotal').textContent=money(subtotalValue);
    updateCheckoutTotals();
    $$('[data-cart-minus]').forEach(b=>b.onclick=()=>changeCart(+b.dataset.cartMinus,-1));
    $$('[data-cart-plus]').forEach(b=>b.onclick=()=>changeCart(+b.dataset.cartPlus,1));
    $$('[data-cart-remove]').forEach(b=>b.onclick=()=>{state.cart.splice(+b.dataset.cartRemove,1);saveCart();});
  }

  function subtotal(){return state.cart.reduce((s,i)=>{const p=state.data.products.find(x=>x.id===i.id);return s+(p?p.precio*i.qty:0);},0);}
  function openLayer(el){$('#overlay').hidden=false;document.body.classList.add('locked');el.classList.add('open');el.setAttribute('aria-hidden','false');}
  function closeLayer(el){el.classList.remove('open');el.setAttribute('aria-hidden','true');if(!$('.drawer.open')&&!$('.modal.open')){$('#overlay').hidden=true;document.body.classList.remove('locked');}}
  function openCart(){openLayer($('#cartDrawer'));}

  function openProduct(id){
    const p=state.data.products.find(x=>x.id===id);if(!p)return;
    state.modalProduct=p;state.modalQty=1;
    $('#modalName').textContent=p.nombre;
    $('#modalPrice').textContent=money(p.precio);
    $('#modalDescription').textContent=p.descripcion||'';
    $('#modalCategory').textContent=categoryById(p.categoria_id)?.nombre||'Detalle';
    $('#modalStock').textContent=p.available_stock>0?`${p.available_stock} disponibles ahora`:'Agotado';
    $('#modalQty').textContent='1';
    $('#modalPersonalization').value='';
    $('#modalPersonalization').closest('.field').style.display=p.personalizable?'flex':'none';
    $('#modalAdd').disabled=p.available_stock<=0;
    const imgs=imagesFor(p),main=$('#modalMainImage');
    main.innerHTML=imgs.length?`<img src="${escapeAttr(imgs[0])}" alt="${escapeAttr(p.nombre)}">`:`<div class="product-fallback"><span class="emoji">${productEmoji(p)}</span><small>Agrega las fotos reales desde administración</small></div>`;
    $('#modalThumbs').innerHTML=imgs.map((u,i)=>`<button class="thumb ${i===0?'active':''}" data-thumb="${i}"><img src="${escapeAttr(u)}" alt=""></button>`).join('');
    $$('[data-thumb]').forEach(b=>b.onclick=()=>{main.innerHTML=`<img src="${escapeAttr(imgs[+b.dataset.thumb])}" alt="${escapeAttr(p.nombre)}">`;$$('.thumb').forEach(x=>x.classList.remove('active'));b.classList.add('active');});
    openLayer($('#productModal'));
  }

  function renderZones(){
    const sel=$('#zoneSelect');if(!sel)return;
    sel.innerHTML='<option value="">Selecciona</option>'+state.data.delivery.filter(d=>d.activo).sort((a,b)=>toNum(a.orden)-toNum(b.orden)).map(d=>`<option value="${escapeAttr(d.zona_id)}">${escapeHtml(d.nombre)}</option>`).join('');
  }
  function selectedZone(){return state.data.delivery.find(d=>d.zona_id===$('#zoneSelect').value);}
  function updateCheckoutTotals(){
    const s=subtotal(),z=selectedZone();let delivery=null;
    if(z&&!z.requiere_cotizacion)delivery=z.costo;
    $('#checkoutSubtotal').textContent=money(s);
    $('#checkoutDelivery').textContent=delivery===null?'Por confirmar':money(delivery);
    $('#checkoutTotal').textContent=delivery===null?`${money(s)} + delivery`:money(s+delivery);
    $('#deliveryNote').textContent=z?.nota||'El costo final de delivery puede requerir confirmación según la dirección.';
  }
  function localDateString(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
  function setMinDate(){const d=new Date();d.setHours(d.getHours()+Number(state.data.config.MIN_NOTICE_HOURS||6));const input=$('[name="deliveryDate"]');if(input)input.min=localDateString(d);}
  function openCheckout(){
    if(String(state.data.config.STORE_STATUS||'open').toLowerCase()!=='open')return toast('La tienda no está recibiendo reservas en este momento.');
    if(!state.cart.length)return toast('Agrega al menos un producto.');
    const msg=$('#checkoutMessage');
    if(!state.apiReady){msg.hidden=false;msg.textContent='La separación de stock todavía no está activa. Estamos terminando la conexión segura de la tienda.';}else msg.hidden=true;
    closeLayer($('#cartDrawer'));setTimeout(()=>openLayer($('#checkoutModal')),180);updateCheckoutTotals();
  }
  function makeMapsUrl(){
    const form=new FormData($('#checkoutForm'));
    const q=[form.get('address'),selectedZone()?.distrito||'',state.data.config.DEFAULT_CITY||cfg.DEFAULT_CITY||'Piura',state.data.config.COUNTRY||cfg.COUNTRY||'Perú'].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  function makeWhatsApp(number,reservation,payload){
    if(!number)return'';
    const hasTotal=reservation.total!==null&&reservation.total!==undefined&&String(reservation.total)!=='';
    const hasDelivery=reservation.delivery!==null&&reservation.delivery!==undefined&&String(reservation.delivery)!=='';
    const lines=[
      `Hola, quiero confirmar mi pedido ${reservation.reserva_id||reservation.id||''}.`,'',
      ...payload.items.map(i=>`• ${i.name} x${i.qty} — ${money(i.unitPrice*i.qty)}${i.personalization?`\n  ${i.personalization}`:''}`),'',
      `Productos: ${money(reservation.subtotal??payload.subtotal)}`,
      `Delivery: ${hasDelivery?money(reservation.delivery):'por confirmar'}`,
      `Total estimado: ${hasTotal?money(reservation.total):money(payload.subtotal)+' + delivery'}`,'',
      `Entrega: ${payload.deliveryDate} · ${payload.deliveryWindow}`,
      `Dirección: ${payload.address}`,
      `Zona: ${payload.zoneName}`,
      payload.mapsUrl?`Ubicación: ${payload.mapsUrl}`:'',
      payload.dedication?`Dedicatoria: ${payload.dedication}`:'',
      payload.notes?`Observaciones: ${payload.notes}`:''
    ].filter(Boolean);
    return `https://wa.me/${String(number).replace(/\D/g,'')}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  async function reserve(e){
    e.preventDefault();
    const btn=$('#reserveButton'),msg=$('#checkoutMessage');
    msg.hidden=true;
    if(!state.cart.length)return toast('Tu carrito está vacío.');
    if(!state.apiReady){msg.hidden=false;msg.textContent='La separación real de stock todavía no está conectada. No se generó ninguna reserva.';return;}

    const fd=new FormData(e.currentTarget),z=selectedZone();
    if(!z)return;
    const items=state.cart.map(i=>{const p=state.data.products.find(x=>x.id===i.id);return{id:i.id,name:p?.nombre||i.id,qty:i.qty,personalization:i.personalization||'',unitPrice:p?.precio||0};});
    const payload={
      name:String(fd.get('name')||'').trim(),phone:String(fd.get('phone')||'').trim(),email:String(fd.get('email')||'').trim(),deliveryDate:fd.get('deliveryDate'),deliveryWindow:fd.get('deliveryWindow'),zoneId:z.zona_id,zoneName:z.nombre,address:String(fd.get('address')||'').trim(),reference:String(fd.get('reference')||'').trim(),mapsUrl:String(fd.get('mapsUrl')||'').trim()||makeMapsUrl(),dedication:String(fd.get('dedication')||'').trim(),notes:String(fd.get('notes')||'').trim(),items,subtotal:subtotal(),origin:location.href
    };

    btn.disabled=true;btn.textContent='Verificando stock…';
    try{
      let result=await apiPost('reserve',payload);
      if(result.ok===false)throw new Error(result.error||'No se pudo separar el pedido.');
      result=result.data||result;
      const number=result.whatsapp_number||state.data.config.WHATSAPP_NUMBER||cfg.PUBLIC_WHATSAPP;
      const wa=makeWhatsApp(number,result,payload);
      state.cart=[];saveCart();
      localStorage.setItem('sf_last_reservation',JSON.stringify({id:result.reserva_id,expires_at:result.expires_at||'',created_at:new Date().toISOString()}));
      window.dispatchEvent(new CustomEvent('sf:reservation-created'));
      closeLayer($('#checkoutModal'));
      e.currentTarget.reset();
      setMinDate();
      updateCheckoutTotals();
      toast(`Reserva ${result.reserva_id} creada`);

      if(wa){
        setTimeout(()=>window.location.assign(wa),350);
      }else{
        toast(`Reserva ${result.reserva_id} registrada. Falta configurar WhatsApp.`);
      }
    }catch(err){
      msg.hidden=false;msg.textContent=err.message||'Ocurrió un problema al separar el pedido.';
    }finally{
      btn.disabled=false;btn.textContent='Separar productos y continuar por WhatsApp →';
    }
  }

  function toast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2200);}
  function bind(){
    $('#cartOpen').onclick=openCart;
    $('#checkoutStart').onclick=openCheckout;
    $('#overlay').onclick=()=>{$$('.open.drawer,.open.modal').forEach(closeLayer);};
    $$('[data-close]').forEach(b=>b.onclick=()=>{const map={cart:'#cartDrawer',product:'#productModal',checkout:'#checkoutModal'};closeLayer($(map[b.dataset.close]));});
    $('#searchToggle').onclick=()=>{$('#productos').scrollIntoView({behavior:'smooth'});setTimeout(()=>$('#searchInput').focus(),400);};
    $('#searchInput').oninput=e=>{state.search=e.target.value.trim();renderProducts();};
    $('#sortSelect').onchange=e=>{state.sort=e.target.value;renderProducts();};
    $('#showAllCategories').onclick=()=>{state.category='';renderCategories();renderProducts();$('#productos').scrollIntoView({behavior:'smooth'});};
    $$('[data-modal-qty]').forEach(b=>b.onclick=()=>{if(!state.modalProduct)return;state.modalQty=Math.max(1,Math.min(state.modalQty+(b.dataset.modalQty==='plus'?1:-1),state.modalProduct.available_stock));$('#modalQty').textContent=state.modalQty;});
    $('#modalAdd').onclick=()=>{if(!state.modalProduct)return;const personalization=state.modalProduct.personalizable?$('#modalPersonalization').value.trim():'';addToCart(state.modalProduct.id,state.modalQty,personalization);closeLayer($('#productModal'));openCart();};
    $('#zoneSelect').onchange=updateCheckoutTotals;
    $('#checkoutForm').onsubmit=reserve;
    $('#openMap').onclick=()=>window.open(makeMapsUrl(),'_blank','noopener');
    $('#useLocation').onclick=()=>{
      const status=$('#locationStatus');
      if(!navigator.geolocation){status.textContent='Tu navegador no permite compartir ubicación.';return;}
      status.textContent='Obteniendo ubicación…';
      navigator.geolocation.getCurrentPosition(pos=>{const u=`https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;$('#mapsUrl').value=u;status.textContent='Ubicación agregada correctamente.';},()=>status.textContent='No se pudo obtener la ubicación. Puedes pegar un enlace de Google Maps.',{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
    };
    const custom=$('#customWhatsApp');
    if(custom)custom.onclick=()=>{const n=state.data.config.WHATSAPP_NUMBER||cfg.PUBLIC_WHATSAPP;if(!n)return toast('Falta configurar el WhatsApp de la tienda.');window.location.assign(`https://wa.me/${String(n).replace(/\D/g,'')}?text=${encodeURIComponent('Hola, quisiera consultar por un detalle.')}`);};
    document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.open.drawer,.open.modal').forEach(closeLayer);});
    $('#year').textContent=new Date().getFullYear();
  }

  bind();
  bootstrap();
})();
