(() => {
  'use strict';
  const cfg = window.STORE_CONFIG || {};
  const $ = (q, el=document) => el.querySelector(q);
  const $$ = (q, el=document) => [...el.querySelectorAll(q)];
  const money = n => `${cfg.CURRENCY_SYMBOL || 'S/'} ${Number(n || 0).toFixed(2)}`;
  const toNum = n => Number.isFinite(Number(n)) ? Number(n) : 0;
  const parseBool = v => v === true || String(v).toLowerCase() === 'true';
  const escapeHtml = (s='') => String(s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
  const escapeAttr = escapeHtml;
  const storeGet = key => { try { return JSON.parse(localStorage.getItem(key)||'null'); } catch { return null; } };
  const storeSet = (key,value) => { try { localStorage.setItem(key,JSON.stringify(value)); } catch { /* Shopping works even when storage is unavailable. */ } };
  const storedCart = storeGet('sf_cart');
  const state = {
    data:{products:[],categories:[],delivery:[],config:{...cfg,WHATSAPP_NUMBER:cfg.PUBLIC_WHATSAPP}},
    cart:Array.isArray(storedCart) ? storedCart.filter(i=>i && typeof i.id==='string' && Number.isFinite(Number(i.qty)) && Number(i.qty)>0).map(i=>({id:i.id,qty:Math.floor(Number(i.qty)),personalization:String(i.personalization||'').slice(0,180)})) : [],
    category:'',search:'',sort:'featured',modalProduct:null,modalQty:1,apiReady:false,loading:false,reserving:false,links:{},checkoutStep:1
  };
  const homeUrl = () => new URL('.',document.baseURI);
  const categoryById = id => state.data.categories.find(c=>c.categoria_id===id);
  const productById = id => state.data.products.find(p=>String(p.id)===String(id));
  const isOpen = () => String(state.data.config.STORE_STATUS||'open').toLowerCase()==='open';
  const productEmoji = p => escapeHtml(categoryById(p.categoria_id)?.emoji || '🎁');
  const safeImage = value => {
    try { const url=new URL(String(value||''),document.baseURI); return value && ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  };
  const imagesFor = p => [p.imagen_principal,...String(p.imagenes||'').split(/[|,\n]/)].map(s=>safeImage(String(s||'').trim())).filter((v,i,a)=>v&&a.indexOf(v)===i);
  const stockFor = p => Math.max(0,Math.floor(toNum(p?.available_stock)));
  const cartQty = (id,except=-1) => state.cart.reduce((sum,item,index)=>sum+(item.id===id&&index!==except?item.qty:0),0);
  const subtotal = () => state.cart.reduce((sum,item)=>sum+toNum(productById(item.id)?.precio)*item.qty,0);
  function saveCart(){ storeSet('sf_cart',state.cart);renderCart(); }
  function reconcileCart(){
    const used={},next=[]; let changed=false;
    for(const item of state.cart){
      const p=productById(item.id);
      const remaining=p&&p.activo?Math.max(0,stockFor(p)-(used[item.id]||0)):0;
      const qty=Math.min(Math.max(0,Math.floor(toNum(item.qty))),remaining);
      if(qty!==item.qty)changed=true;
      if(qty){next.push({...item,qty});used[item.id]=(used[item.id]||0)+qty;}
    }
    state.cart=next;storeSet('sf_cart',next);return changed;
  }
  function normalize(data){
    if(!data || !Array.isArray(data.products) || !Array.isArray(data.categories) || !Array.isArray(data.delivery)) throw new Error('Catálogo incompleto');
    return {...data,
      products:data.products.map(p=>({...p,id:String(p.id),precio:toNum(p.precio),available_stock:Math.max(0,toNum(p.available_stock??(toNum(p.stock_fisico)-toNum(p.stock_reservado)))),activo:parseBool(p.activo),destacado:parseBool(p.destacado),personalizable:parseBool(p.personalizable)})),
      categories:data.categories.map(c=>({...c,activo:parseBool(c.activo)})),
      delivery:data.delivery.map(d=>({...d,costo:toNum(d.costo),activo:parseBool(d.activo),requiere_cotizacion:parseBool(d.requiere_cotizacion)})),
      config:{...cfg,WHATSAPP_NUMBER:cfg.PUBLIC_WHATSAPP,...data.config}
    };
  }
  async function request(url,options={},timeout=18000){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try {
      const response=await fetch(url,{...options,redirect:'follow',signal:controller.signal});
      if(!response.ok)throw new Error('No pudimos conectar con la tienda. Inténtalo nuevamente.');
      const data=await response.json();
      if(data.ok===false)throw new Error(data.error||'No pudimos completar la solicitud.');
      return data.data||data;
    } finally {clearTimeout(timer);}
  }
  async function bootstrap(){
    if(state.loading)return;
    state.loading=true;state.apiReady=false;
    $('#catalogStatus').hidden=false;$('#catalogStatusText').textContent='Cargando los detalles disponibles…';$('#retryCatalog').hidden=true;
    $('#productGrid').setAttribute('aria-busy','true');$('#emptyProducts').hidden=true;
    $('#productGrid').innerHTML=Array.from({length:4},()=>'<div class="skeleton-card" aria-hidden="true"></div>').join('');
    applyStoreStatus();
    try {
      if(!cfg.API_URL)throw new Error('Tienda sin conexión');
      const url=new URL(cfg.API_URL);url.searchParams.set('action','bootstrap');
      state.data=normalize(await request(url.href));state.apiReady=true;
      const changed=reconcileCart();
      document.title=`${state.data.config.STORE_NAME||'Magaly Detalles'} | Regalos y detalles en Piura`;
      $$('[data-store-name]').forEach(el=>el.textContent=state.data.config.STORE_NAME||'Magaly Detalles');
      renderCategories();renderProducts();renderCart();renderZones();setMinDate();
      $('#catalogStatus').hidden=true;
      if(changed)toast('Actualizamos tu carrito según el stock disponible.');
      updateWhatsApp();openLinkedProduct();
    } catch(error){
      $('#productGrid').innerHTML='';$('#categoryGrid').innerHTML='';$('#emptyProducts').hidden=true;
      $('#catalogStatusText').textContent='No pudimos consultar el catálogo y el stock. Vuelve a intentar o escríbenos por WhatsApp.';
      $('#retryCatalog').hidden=false;
    } finally {
      state.loading=false;$('#productGrid').setAttribute('aria-busy','false');applyStoreStatus();
    }
  }
  function applyStoreStatus(){
    const open=isOpen(),ready=state.apiReady&&open;
    $('#checkoutStart').disabled=!ready||!state.cart.length;
    $('#checkoutStart').textContent=!state.apiReady?'Esperando disponibilidad':open?'Continuar con la separación →':'Reservas pausadas temporalmente';
    $('#reserveButton').disabled=!ready||state.reserving;
    let banner=$('#storeStatusBanner');
    if(state.apiReady&&!open){
      if(!banner){banner=document.createElement('div');banner.id='storeStatusBanner';banner.className='store-status-banner';$('.site-header').insertAdjacentElement('afterend',banner);}
      banner.textContent='Por el momento no recibimos nuevas reservas. Puedes consultar el catálogo y escribirnos por WhatsApp.';banner.hidden=false;
    }else if(banner)banner.hidden=true;
  }
  function renderCategories(){
    const categories=state.data.categories.filter(c=>c.activo).sort((a,b)=>toNum(a.orden)-toNum(b.orden));
    $('#categoryGrid').innerHTML=`<button type="button" class="occasion-card ${!state.category?'active':''}" data-category="" aria-pressed="${!state.category}">Todos</button>`+categories.map(c=>`<button type="button" class="occasion-card ${state.category===c.categoria_id?'active':''}" data-category="${escapeAttr(c.categoria_id)}" aria-pressed="${state.category===c.categoria_id}"><span aria-hidden="true">${escapeHtml(c.emoji||'🎁')}</span>${escapeHtml(c.nombre)}</button>`).join('');
    $$('[data-category]').forEach(button=>button.onclick=()=>{state.category=button.dataset.category;renderCategories();renderProducts();});
  }
  function filteredProducts(){
    let list=state.data.products.filter(p=>p.activo);
    if(state.category)list=list.filter(p=>p.categoria_id===state.category);
    const simplify=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(state.search)list=list.filter(p=>simplify(`${p.nombre} ${p.descripcion}`).includes(simplify(state.search)));
    if(state.sort==='price-asc')list.sort((a,b)=>a.precio-b.precio);
    else if(state.sort==='price-desc')list.sort((a,b)=>b.precio-a.precio);
    else if(state.sort==='name')list.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    else list.sort((a,b)=>(Number(b.destacado)-Number(a.destacado))||(toNum(a.orden)-toNum(b.orden)));
    return list;
  }
  function productUrl(p){
    const path=state.links[p.id];
    if(typeof path==='string'&&/^productos\/[a-z0-9_-]+\/$/.test(path))return new URL(path,homeUrl()).href;
    const url=homeUrl();url.searchParams.set('producto',p.id);return url.href;
  }
  function bindImageErrors(root){
    $$('img',root).forEach(img=>img.onerror=()=>{const fallback=document.createElement('div');fallback.className='product-fallback';fallback.textContent='Fotografía no disponible';img.replaceWith(fallback);});
  }
  function renderProducts(){
    if(!state.apiReady)return;
    const products=filteredProducts();
    $('#productGrid').innerHTML=products.map(p=>{
      const stock=stockFor(p),image=imagesFor(p)[0],category=categoryById(p.categoria_id);
      const media=image?`<img loading="lazy" decoding="async" src="${escapeAttr(image)}" alt="${escapeAttr(p.nombre)}" width="440" height="496">`:`<div class="product-fallback"><span class="emoji">${productEmoji(p)}</span><small>Fotografía próximamente</small></div>`;
      return `<article class="product-card"><div class="product-media"><a class="product-photo-link" href="${escapeAttr(productUrl(p))}" data-open-product="${escapeAttr(p.id)}" aria-label="Ver ${escapeAttr(p.nombre)}">${media}</a>${p.etiqueta_stock?`<span class="product-badge">${escapeHtml(p.etiqueta_stock)}</span>`:''}</div><div class="product-info"><div class="product-meta">${escapeHtml(category?.nombre||'Detalle')}</div><div class="product-title-row"><h3><a href="${escapeAttr(productUrl(p))}" data-open-product="${escapeAttr(p.id)}">${escapeHtml(p.nombre)}</a></h3><div class="product-price">${money(p.precio)}</div></div><div class="product-purchase-row"><span class="stock-chip ${stock===0?'out':stock<=3?'low':''}">${stock===0?'Agotado':stock<=3?`Solo ${stock} disponibles`:'Disponible'}</span><div class="product-controls" data-product-controls="${escapeAttr(p.id)}"><button type="button" class="add-product" data-add="${escapeAttr(p.id)}" ${stock===0||!isOpen()?'disabled':''} aria-label="Agregar ${escapeAttr(p.nombre)}">${stock===0?'Agotado':'+ Agregar'}</button><div class="product-quantity" hidden><small>En tu carrito</small><div class="product-stepper"><button type="button" data-product-minus="${escapeAttr(p.id)}" aria-label="Reducir cantidad de ${escapeAttr(p.nombre)}">−</button><output class="product-quantity-value" aria-label="Cantidad de ${escapeAttr(p.nombre)} en el carrito" aria-live="polite">0</output><button type="button" data-product-plus="${escapeAttr(p.id)}" aria-label="Aumentar cantidad de ${escapeAttr(p.nombre)}">+</button></div></div></div></div></div></article>`;
    }).join('');
    $('#emptyProducts').hidden=products.length>0;
    const active=categoryById(state.category);$('#activeFilter').hidden=!active;
    if(active)$('#activeFilter').textContent=`${active.nombre} · ${products.length} ${products.length===1?'detalle':'detalles'}`;
    $$('[data-open-product]').forEach(link=>link.onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();openProduct(link.dataset.openProduct);});
    $$('[data-add]').forEach(button=>button.onclick=()=>addToCart(button.dataset.add));
    $$('[data-product-minus]').forEach(button=>button.onclick=()=>changeProductQuantity(button.dataset.productMinus,-1));
    $$('[data-product-plus]').forEach(button=>button.onclick=()=>changeProductQuantity(button.dataset.productPlus,1));
    syncProductQuantities();
    bindImageErrors($('#productGrid'));
  }
  function syncProductQuantities(){
    $$('[data-product-controls]').forEach(controls=>{
      const p=productById(controls.dataset.productControls);if(!p)return;
      const qty=cartQty(p.id),add=$('[data-add]',controls),stepper=$('.product-quantity',controls);
      const minus=$('[data-product-minus]',controls),plus=$('[data-product-plus]',controls);
      const focused=document.activeElement,hadFocus=controls.contains(focused);
      add.hidden=qty>0;stepper.hidden=qty===0;
      $('.product-quantity-value',controls).textContent=qty;
      add.disabled=!state.apiReady||!isOpen()||stockFor(p)===0;
      plus.disabled=!state.apiReady||!isOpen()||qty>=stockFor(p);
      if(hadFocus){
        if(qty===0&&focused!==add)add.focus();
        else if(qty>0&&(focused===add||(focused===plus&&plus.disabled)))minus.focus();
      }
    });
  }
  function changeProductQuantity(id,delta){
    const lines=state.cart.map((item,index)=>({item,index})).filter(line=>line.item.id===id);
    if(lines.length>1){
      openCart();toast('Elige en el carrito la dedicatoria cuya cantidad quieres cambiar.');return;
    }
    if(delta>0)addToCart(id,1,lines[0]?.item.personalization||'');
    else if(lines.length)changeCart(lines[0].index,-1);
  }
  function addToCart(id,qty=1,personalization=''){
    if(!state.apiReady||!isOpen())return toast('Consulta la disponibilidad antes de agregar productos.');
    const p=productById(id);if(!p)return false;
    const remaining=stockFor(p)-cartQty(id);
    if(remaining<=0){toast('Ya tienes en el carrito todas las unidades disponibles de este detalle.');return false;}
    const added=Math.min(Math.max(1,Math.floor(qty)),remaining);
    const existing=state.cart.find(i=>i.id===id&&i.personalization===personalization);
    if(existing)existing.qty+=added;else state.cart.push({id,qty:added,personalization});
    saveCart();toast(added<qty?`Agregamos ${added}: es el stock disponible.`:`${p.nombre} agregado al carrito`);return true;
  }
  function changeCart(index,delta){
    const item=state.cart[index];if(!item)return;
    const p=productById(item.id);if(!p)return;
    if(delta>0&&(!state.apiReady||cartQty(item.id)>=stockFor(p)))return toast('No hay más unidades disponibles de este detalle.');
    item.qty=Math.max(0,item.qty+delta);if(!item.qty)state.cart.splice(index,1);saveCart();
  }
  function renderCart(){
    syncProductQuantities();
    $('#cartCount').textContent=state.cart.reduce((sum,item)=>sum+item.qty,0);
    if(!state.apiReady){$('#cartItems').innerHTML='<p>Consulta el catálogo para comprobar la disponibilidad de tu carrito.</p>';applyStoreStatus();return;}
    $('#cartItems').innerHTML=state.cart.length?state.cart.map((item,index)=>{
      const p=productById(item.id);if(!p)return '';
      const image=imagesFor(p)[0];
      return `<div class="cart-line"><div class="cart-thumb">${image?`<img src="${escapeAttr(image)}" alt="">`:productEmoji(p)}</div><div><h4>${escapeHtml(p.nombre)}</h4>${item.personalization?`<small>${escapeHtml(item.personalization)}</small>`:''}<div class="cart-actions"><button type="button" data-cart-minus="${index}" aria-label="Reducir cantidad de ${escapeAttr(p.nombre)}">−</button><strong>${item.qty}</strong><button type="button" data-cart-plus="${index}" aria-label="Aumentar cantidad de ${escapeAttr(p.nombre)}" ${cartQty(item.id)>=stockFor(p)?'disabled':''}>+</button><button type="button" class="remove-link" data-cart-remove="${index}" aria-label="Quitar ${escapeAttr(p.nombre)}">Quitar</button></div></div><div class="line-price">${money(p.precio*item.qty)}</div></div>`;
    }).join(''):'<div class="empty-cart"><span aria-hidden="true">🛍️</span><strong>Tu próximo detalle empieza aquí</strong><p>Elige algo bonito para esa persona especial.</p><button type="button" class="soft-button" id="continueShopping">Ver los detalles</button></div>';
    $('#cartSubtotal').textContent=money(subtotal());updateCheckoutTotals();applyStoreStatus();
    $$('[data-cart-minus]').forEach(b=>b.onclick=()=>changeCart(+b.dataset.cartMinus,-1));
    $$('[data-cart-plus]').forEach(b=>b.onclick=()=>changeCart(+b.dataset.cartPlus,1));
    $$('[data-cart-remove]').forEach(b=>b.onclick=()=>{state.cart.splice(+b.dataset.cartRemove,1);saveCart();});
    if($('#continueShopping'))$('#continueShopping').onclick=()=>{closeLayer($('#cartDrawer'));$('#productos').scrollIntoView({behavior:'smooth'});};
    bindImageErrors($('#cartItems'));
  }
  const layerStack=[],returnFocus=new WeakMap();
  const focusable = el => $$('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',el).filter(node=>!node.closest('[hidden],[inert]')&&node.getClientRects().length);
  function syncLayers(){
    const top=layerStack.at(-1);$('#overlay').hidden=!top;document.body.classList.toggle('locked',!!top);
    $$('main,.site-header,footer,.announcement,.last-reservation-banner,#customWhatsApp').forEach(el=>{el.inert=!!top;});
    $$('.modal,.drawer').forEach(el=>{el.inert=el!==top;el.setAttribute('aria-hidden',String(el!==top));});
  }
  function openLayer(el){
    if(!layerStack.includes(el)){returnFocus.set(el,document.activeElement);layerStack.push(el);}
    el.classList.add('open');syncLayers();el.tabIndex=-1;(focusable(el)[0]||el).focus();
  }
  function closeLayer(el,{keepUrl=false}={}){
    const index=layerStack.indexOf(el);if(index<0)return;
    layerStack.splice(index,1);el.classList.remove('open');syncLayers();
    if(el.id==='productModal'&&!keepUrl){const url=new URL(location.href);url.searchParams.delete('producto');if(document.body.dataset.productId){history.replaceState({},'',homeUrl());delete document.body.dataset.productId;}else history.replaceState({},'',url);}
    const target=returnFocus.get(el);if(target?.isConnected&&!target.closest('[inert]'))target.focus();else if(layerStack.length)(focusable(layerStack.at(-1))[0]||layerStack.at(-1)).focus();
  }
  function openCart(){renderCart();openLayer($('#cartDrawer'));}
  function openProduct(id,updateUrl=true){
    const p=productById(id);if(!p||!p.activo)return;
    state.modalProduct=p;state.modalQty=1;
    $('#modalName').textContent=p.nombre;$('#modalPrice').textContent=money(p.precio);$('#modalDescription').textContent=p.descripcion||'';
    $('#modalCategory').textContent=categoryById(p.categoria_id)?.nombre||'Detalle';
    $('#modalStock').textContent=stockFor(p)>0?`${stockFor(p)} disponibles ahora`:'Agotado';
    $('#modalQty').textContent='1';$('#modalPersonalization').value='';$('#modalPersonalization').closest('.field').hidden=!p.personalizable;
    $('#modalAdd').disabled=stockFor(p)===0||!isOpen();
    const images=imagesFor(p),main=$('#modalMainImage');
    const showImage=index=>{main.innerHTML=images.length?`<img src="${escapeAttr(images[index])}" alt="${escapeAttr(p.nombre)}">`:'<div class="product-fallback">Fotografía próximamente</div>';main.disabled=!images.length;$$('[data-thumb]').forEach(b=>b.classList.toggle('active',+b.dataset.thumb===index));bindImageErrors(main);};
    $('#modalThumbs').innerHTML=images.length>1?images.map((url,index)=>`<button type="button" class="thumb" data-thumb="${index}" aria-label="Ver foto ${index+1}"><img src="${escapeAttr(url)}" alt=""></button>`).join(''):'';
    $$('[data-thumb]').forEach(b=>b.onclick=()=>showImage(+b.dataset.thumb));showImage(0);
    if(updateUrl){const url=new URL(location.href);url.searchParams.set('producto',p.id);history.pushState({},'',url);}
    openLayer($('#productModal'));
  }
  function openLinkedProduct(){
    const id=new URL(location.href).searchParams.get('producto')||document.body.dataset.productId;
    if(id){const p=productById(id);if(p?.activo)openProduct(id,false);else toast('Este detalle ya no está disponible. Mira las otras opciones del catálogo.');}
  }
  async function shareProduct(){
    const p=state.modalProduct;if(!p)return;
    const url=productUrl(p),title=`${p.nombre} | ${state.data.config.STORE_NAME||'Magaly Detalles'}`;
    try {
      if(navigator.share){await navigator.share({title,text:`${p.nombre} · ${money(p.precio)}`,url});return;}
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);toast('Enlace del detalle copiado.');return;}
    }catch(error){if(error.name==='AbortError')return;}
    const input=document.createElement('input');input.value=url;input.readOnly=true;input.setAttribute('aria-label','Enlace para compartir');$('#shareProduct').after(input);input.focus();input.select();toast('Copia este enlace para compartir el detalle.');input.addEventListener('blur',()=>input.remove(),{once:true});
  }
  function renderZones(){
    const selected=$('#zoneSelect').value;
    $('#zoneSelect').innerHTML='<option value="">Selecciona</option>'+state.data.delivery.filter(z=>z.activo).sort((a,b)=>toNum(a.orden)-toNum(b.orden)).map(z=>`<option value="${escapeAttr(z.zona_id)}">${escapeHtml(z.nombre)}</option>`).join('');
    if(state.data.delivery.some(z=>z.zona_id===selected))$('#zoneSelect').value=selected;
  }
  const selectedZone = () => state.data.delivery.find(z=>z.zona_id===$('#zoneSelect').value);
  function updateCheckoutTotals(){
    const sum=subtotal(),zone=selectedZone(),delivery=zone&&!zone.requiere_cotizacion?zone.costo:null;
    $('#checkoutSubtotal').textContent=money(sum);$('#checkoutDelivery').textContent=delivery===null?'Por confirmar':money(delivery);
    $('#checkoutTotal').textContent=delivery===null?`${money(sum)} + delivery`:money(sum+delivery);
    $('#deliveryNote').textContent=zone?.nota||'Confirmaremos el costo de delivery según la dirección.';
  }
  function setMinDate(){
    const date=new Date(Date.now()+Math.max(0,Number(state.data.config.MIN_NOTICE_HOURS??6))*3600000);
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const part=name=>parts.find(p=>p.type===name).value;
    $('[name="deliveryDate"]').min=`${part('year')}-${part('month')}-${part('day')}`;
  }
  function setCheckoutStep(step){
    state.checkoutStep=step;const delivery=step===2;
    $('#contactStep').hidden=delivery;$('#deliveryStep').hidden=!delivery;$('#deliveryStep').disabled=!delivery;
    $('#checkoutFinal').hidden=!delivery;$('#reservationConsent').disabled=!delivery;
    $('#contactProgress').toggleAttribute('aria-current',!delivery);$('#deliveryProgress').toggleAttribute('aria-current',delivery);
    (delivery?$('#deliveryProgress'):$('#contactProgress')).setAttribute('aria-current','step');
    $('#checkoutTitle').textContent=delivery?'¿Dónde lo entregamos?':'Tus datos de contacto';
    $('#checkoutIntro').textContent=delivery?'Indica la entrega. Confirmaremos el stock antes de separar.':'Primero, tus datos para coordinar el pedido.';
    $('#checkoutModal').scrollTop=0;
    $(delivery?'[name="deliveryDate"]':'[name="name"]').focus();
  }
  function validateContact(){
    const name=$('[name="name"]'),phone=$('[name="phone"]');
    name.setCustomValidity(name.value.trim()?'':'Escribe tu nombre.');
    const digits=phone.value.replace(/\D/g,'');phone.setCustomValidity(digits.length>=9&&digits.length<=15?'':'Escribe un número de WhatsApp válido.');
    for(const input of $$('input',$('#contactStep'))){if(!input.checkValidity()){setCheckoutStep(1);input.reportValidity();return false;}}
    return true;
  }
  function openCheckout(){
    if(!state.apiReady||!isOpen())return toast('No podemos separar productos por el momento. Consúltanos por WhatsApp.');
    if(!state.cart.length)return toast('Agrega al menos un detalle.');
    $('#checkoutMessage').hidden=true;closeLayer($('#cartDrawer'));setMinDate();openLayer($('#checkoutModal'));setCheckoutStep(1);updateCheckoutTotals();
  }
  function makeMapsUrl(){
    const query=[$('[name="address"]').value,selectedZone()?.distrito||'',state.data.config.DEFAULT_CITY||'Piura',state.data.config.COUNTRY||'Perú'].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }
  function makeWhatsApp(number,reservation,payload){
    const digits=String(number||'').replace(/\D/g,'');if(!digits)return '';
    const has=value=>value!==null&&value!==undefined&&String(value)!=='';
    const lines=[`Hola, quiero confirmar mi pedido ${reservation.reserva_id||reservation.id||''}.`,'',...payload.items.map(i=>`• ${i.name} x${i.qty} — ${money(i.unitPrice*i.qty)}${i.personalization?`\n  ${i.personalization}`:''}`),'',`Productos: ${money(reservation.subtotal??payload.subtotal)}`,`Delivery: ${has(reservation.delivery)?money(reservation.delivery):'por confirmar'}`,`Total estimado: ${has(reservation.total)?money(reservation.total):money(payload.subtotal)+' + delivery'}`,'',`Entrega: ${payload.deliveryDate} · ${payload.deliveryWindow}`,`Dirección: ${payload.address}`,`Zona: ${payload.zoneName}`,payload.reference?`Referencia: ${payload.reference}`:'',payload.mapsUrl?`Ubicación: ${payload.mapsUrl}`:'',payload.dedication?`Dedicatoria: ${payload.dedication}`:'',payload.notes?`Observaciones: ${payload.notes}`:''].filter(Boolean);
    return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join('\n'))}`;
  }
  async function reserve(event){
    event.preventDefault();
    if(state.reserving)return;
    if(state.checkoutStep===1){if(validateContact())setCheckoutStep(2);return;}
    const form=event.currentTarget;
    if(!validateContact())return;
    if(!state.apiReady||!isOpen()||!state.cart.length)return toast('Consulta el catálogo antes de separar.');
    if(!form.reportValidity())return;
    const fd=new FormData(form),zone=selectedZone();if(!zone)return;
    const items=state.cart.map(i=>{const p=productById(i.id);return {...i,name:p.nombre,unitPrice:p.precio};});
    const payload={name:String(fd.get('name')||'').trim(),phone:String(fd.get('phone')||'').trim(),email:String(fd.get('email')||'').trim(),deliveryDate:fd.get('deliveryDate'),deliveryWindow:fd.get('deliveryWindow'),zoneId:zone.zona_id,zoneName:zone.nombre,address:String(fd.get('address')||'').trim(),reference:String(fd.get('reference')||'').trim(),mapsUrl:String(fd.get('mapsUrl')||'').trim()||makeMapsUrl(),dedication:String(fd.get('dedication')||'').trim(),notes:String(fd.get('notes')||'').trim(),items,subtotal:subtotal(),origin:location.href};
    const button=$('#reserveButton'),message=$('#checkoutMessage');message.hidden=true;state.reserving=true;button.disabled=true;button.textContent='Verificando stock…';
    try {
      const result=await request(cfg.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'reserve',payload})},45000);
      const id=result.reserva_id||result.id;if(!id)throw new Error('No recibimos la confirmación de la reserva. Consúltanos por WhatsApp antes de intentarlo nuevamente.');
      const wa=makeWhatsApp(result.whatsapp_number||state.data.config.WHATSAPP_NUMBER||cfg.PUBLIC_WHATSAPP,result,payload);
      const quantities={};items.forEach(i=>{quantities[i.id]=(quantities[i.id]||0)+i.qty;});
      Object.entries(quantities).forEach(([productId,qty])=>{const p=productById(productId);if(p)p.available_stock=Math.max(0,stockFor(p)-qty);});
      state.cart=[];saveCart();renderProducts();
      storeSet('sf_last_reservation',{id,expires_at:result.expires_at||'',created_at:new Date().toISOString()});
      closeLayer($('#checkoutModal'));form.reset();setMinDate();updateCheckoutTotals();
      window.dispatchEvent(new CustomEvent('sf:reservation-created'));
      $('#reservationSummary').textContent=`Tu reserva ${id} se registró correctamente.${result.expires_at?' La separación es temporal.':''}`;
      const link=$('#reservationWhatsApp');link.hidden=!wa;if(wa)link.href=wa;
      openLayer($('#reservationSuccess'));
      if(wa)setTimeout(()=>window.location.assign(wa),700);
    } catch(error){
      message.hidden=false;message.textContent=error.name==='AbortError'?'La confirmación está demorando. Escríbenos por WhatsApp para verificar si se registró antes de volver a separar.':error.message||'No pudimos confirmar la separación.';
    } finally {state.reserving=false;button.textContent='Separar productos y continuar por WhatsApp →';applyStoreStatus();}
  }
  function updateWhatsApp(){
    const number=String(state.data.config.WHATSAPP_NUMBER||cfg.PUBLIC_WHATSAPP||'').replace(/\D/g,'');
    $('#customWhatsApp').hidden=!number;
    if(number)$('#customWhatsApp').href=`https://wa.me/${number}?text=${encodeURIComponent('Hola, quisiera consultar por un detalle.')}`;
  }
  function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3200);}
  function bind(){
    $('#cartOpen').onclick=openCart;$('#checkoutStart').onclick=openCheckout;$('#retryCatalog').onclick=bootstrap;
    $('#overlay').onclick=()=>{const top=layerStack.at(-1);if(top&&!state.reserving)closeLayer(top);};
    const layers={cart:'#cartDrawer',product:'#productModal',checkout:'#checkoutModal',photo:'#photoModal',success:'#reservationSuccess'};
    $$('[data-close]').forEach(button=>button.onclick=()=>{if(state.reserving)return;closeLayer($(layers[button.dataset.close]));});
    $('#searchToggle').onclick=()=>{$('#productos').scrollIntoView({behavior:'smooth'});$('#searchInput').focus();};
    $('#searchInput').oninput=e=>{state.search=e.target.value.trim();renderProducts();};
    $('#sortSelect').onchange=e=>{state.sort=e.target.value;renderProducts();};
    $('#clearFilters').onclick=()=>{state.category='';state.search='';$('#searchInput').value='';renderCategories();renderProducts();};
    $$('[data-modal-qty]').forEach(button=>{button.setAttribute('aria-label',button.dataset.modalQty==='plus'?'Aumentar cantidad':'Reducir cantidad');button.onclick=()=>{if(!state.modalProduct)return;state.modalQty=Math.max(1,Math.min(state.modalQty+(button.dataset.modalQty==='plus'?1:-1),stockFor(state.modalProduct)-cartQty(state.modalProduct.id)));$('#modalQty').textContent=state.modalQty;};});
    $('#modalAdd').onclick=()=>{const p=state.modalProduct;if(p&&addToCart(p.id,state.modalQty,p.personalizable?$('#modalPersonalization').value.trim():'')){closeLayer($('#productModal'));openCart();}};
    $('#modalMainImage').onclick=()=>{const img=$('#modalMainImage img');if(img){$('#zoomImage').src=img.src;$('#zoomImage').alt=img.alt;openLayer($('#photoModal'));}};
    $('#shareProduct').onclick=shareProduct;
    $('#checkoutNext').onclick=()=>{if(validateContact())setCheckoutStep(2);};$('#checkoutBack').onclick=()=>setCheckoutStep(1);
    $$('input',$('#contactStep')).forEach(input=>input.oninput=()=>input.setCustomValidity(''));
    $('#zoneSelect').onchange=updateCheckoutTotals;$('#checkoutForm').onsubmit=reserve;
    $('#openMap').onclick=()=>window.open(makeMapsUrl(),'_blank','noopener');
    $('#useLocation').onclick=()=>{const status=$('#locationStatus');if(!navigator.geolocation){status.textContent='Puedes pegar un enlace de Google Maps.';return;}status.textContent='Obteniendo ubicación…';navigator.geolocation.getCurrentPosition(pos=>{$('#mapsUrl').value=`https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;status.textContent='Ubicación agregada. Comprueba que corresponde al lugar de entrega.';},()=>{status.textContent='No pudimos obtener la ubicación. Puedes pegar un enlace de Google Maps.';},{enableHighAccuracy:true,timeout:10000,maximumAge:60000});};
    document.addEventListener('keydown',event=>{const top=layerStack.at(-1);if(!top)return;if(event.key==='Escape'&&!state.reserving){closeLayer(top);return;}if(event.key==='Tab'){const nodes=focusable(top),first=nodes[0],last=nodes.at(-1);if(!first){event.preventDefault();top.focus();}else if(event.shiftKey&&(document.activeElement===first||document.activeElement===top)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    window.addEventListener('popstate',()=>{[...layerStack].reverse().forEach(el=>closeLayer(el,{keepUrl:true}));openLinkedProduct();});
    $('#year').textContent=new Date().getFullYear();updateWhatsApp();renderCart();
  }
  bind();bootstrap();
  request(new URL('assets/product-links.json',document.baseURI).href,{},8000).then(links=>{state.links=links;if(state.apiReady)renderProducts();}).catch(()=>{});
})();
