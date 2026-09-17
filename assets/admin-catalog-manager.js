(() => {
  const cfg = window.STORE_CONFIG || {};
  const $ = (q,e=document) => e.querySelector(q);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const bool = v => v === true || String(v).toLowerCase() === 'true';

  function token(){ return localStorage.getItem('sf_admin_token') || ''; }

  async function getSnapshot(){
    if(!cfg.API_URL || !token()) throw new Error('Inicia sesión en administración.');
    try{
      const r=await fetch(cfg.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'adminSnapshot',payload:{token:token()}}),redirect:'follow'});
      const j=await r.json();
      if(j.ok!==false)return j.data||j;
      if(!String(j.error||'').includes('Acción no válida'))throw new Error(j.error||'No se pudo cargar la configuración.');
    }catch(e){
      if(!String(e.message||'').includes('Acción no válida')){/* usa compatibilidad GET */}
    }
    const u = new URL(cfg.API_URL);
    u.searchParams.set('action','adminSnapshot');
    u.searchParams.set('token',token());
    const r = await fetch(u,{redirect:'follow'});
    const j = await r.json();
    if(j.ok === false) throw new Error(j.error || 'No se pudo cargar la configuración.');
    return j.data || j;
  }

  async function post(action,payload={}){
    const r = await fetch(cfg.API_URL,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,payload:{...payload,token:token()}}),
      redirect:'follow'
    });
    const j = await r.json();
    if(j.ok === false) throw new Error(j.error || 'No se pudo guardar.');
    return j.data || j;
  }

  function notify(text, error=false){
    let el = document.getElementById('catalogManagerToast');
    if(!el){
      el=document.createElement('div');el.id='catalogManagerToast';el.className='toast';document.body.appendChild(el);
    }
    el.textContent=text;
    el.style.background=error?'#7b2e2e':'';
    el.classList.add('show');
    clearTimeout(notify._t);notify._t=setTimeout(()=>el.classList.remove('show'),2600);
  }

  function addStyles(){
    if(document.getElementById('catalogManagerStyles')) return;
    const s=document.createElement('style');s.id='catalogManagerStyles';s.textContent=`
      .catalog-manager-card{margin-bottom:18px}.catalog-manager-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:end}.catalog-manager-form .wide{grid-column:span 2}.catalog-manager-form label{display:flex;flex-direction:column;gap:6px;font:600 12px/1.25 'DM Sans',sans-serif;color:#6c625e}.catalog-manager-form input,.catalog-manager-form textarea{width:100%;box-sizing:border-box;border:1px solid rgba(33,30,30,.15);border-radius:12px;background:#fff;padding:11px 12px;font:500 14px/1.25 'DM Sans',sans-serif;color:#211e1e}.catalog-manager-form textarea{resize:vertical;min-height:72px}.catalog-manager-form .check{flex-direction:row;align-items:center;gap:8px;padding-bottom:10px}.catalog-manager-form .check input{width:auto}.catalog-manager-actions{display:flex;gap:8px;align-items:center}.catalog-manager-actions button{border:0;border-radius:999px;padding:11px 16px;font-weight:700;cursor:pointer}.catalog-manager-actions .save{background:#211e1e;color:#fff}.catalog-manager-actions .clear{background:#f1ece8;color:#3d3633}.catalog-manager-list{margin-top:18px;display:grid;gap:8px}.catalog-manager-row{display:grid;grid-template-columns:minmax(160px,1.3fr) minmax(150px,1.5fr) 80px 90px;gap:10px;align-items:center;padding:11px 12px;border:1px solid rgba(33,30,30,.09);border-radius:13px;background:#fff}.catalog-manager-row small{display:block;color:#7d7470;margin-top:3px}.catalog-manager-row button{justify-self:end;border:0;border-radius:999px;padding:8px 12px;background:#f1ece8;cursor:pointer;font-weight:700}.catalog-manager-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.catalog-manager-heading p{margin:4px 0 0;color:#756e6b}.manager-loading{padding:14px 0;color:#756e6b}
      @media(max-width:920px){.catalog-manager-form{grid-template-columns:repeat(2,minmax(0,1fr))}.catalog-manager-form .wide{grid-column:span 2}.catalog-manager-row{grid-template-columns:1fr 90px}.catalog-manager-row .description{grid-column:1/-1;grid-row:2}.catalog-manager-row .order{display:none}}
      @media(max-width:560px){.catalog-manager-form{grid-template-columns:1fr}.catalog-manager-form .wide{grid-column:auto}.catalog-manager-actions{grid-column:1/-1}.catalog-manager-actions button{flex:1}.catalog-manager-row{grid-template-columns:minmax(0,1fr) auto}.catalog-manager-row .description{grid-column:1/-1}.catalog-manager-heading{display:block}}
    `;document.head.appendChild(s);
  }

  function categoryCard(){
    const section=document.querySelector('[data-admin-section="products"]');
    if(!section || document.getElementById('categoryManager')) return;
    const first=section.querySelector('.admin-card');
    const card=document.createElement('div');card.id='categoryManager';card.className='admin-card catalog-manager-card';
    card.innerHTML=`
      <div class="catalog-manager-heading"><div><h2>Categorías y campañas</h2><p>Crea ocasiones nuevas sin modificar código.</p></div></div>
      <form id="categoryManagerForm" class="catalog-manager-form">
        <input type="hidden" name="categoria_id">
        <label>Nombre<input name="nombre" required placeholder="Navidad"></label>
        <label>Emoji<input name="emoji" maxlength="8" placeholder="🎄"></label>
        <label>Orden<input name="orden" type="number" min="0" value="99"></label>
        <label class="check"><input name="activo" type="checkbox" checked> Visible</label>
        <label class="wide">Descripción<textarea name="descripcion" placeholder="Detalles para celebrar..."></textarea></label>
        <label>Mostrar desde<input name="fecha_inicio" type="date"></label>
        <label>Mostrar hasta<input name="fecha_fin" type="date"></label>
        <div class="catalog-manager-actions"><button class="save" type="submit">Guardar categoría</button><button class="clear" type="button" id="clearCategoryManager">Nueva</button></div>
      </form>
      <div id="categoryManagerList" class="catalog-manager-list"><div class="manager-loading">Cargando categorías…</div></div>`;
    section.insertBefore(card,first);
  }

  function deliveryCard(){
    const section=document.querySelector('[data-admin-section="delivery"]');
    if(!section || document.getElementById('newDeliveryManager')) return;
    const card=document.createElement('div');card.id='newDeliveryManager';card.className='admin-card catalog-manager-card';
    card.innerHTML=`
      <div class="catalog-manager-heading"><div><h2>Nueva / editar zona de delivery</h2><p>Agrega distritos o modifica todos los datos de una zona existente.</p></div></div>
      <form id="newDeliveryForm" class="catalog-manager-form">
        <input type="hidden" name="zona_id">
        <label>Nombre de zona<input name="nombre" required placeholder="Los Ejidos"></label>
        <label>Distrito<input name="distrito" required placeholder="Piura"></label>
        <label>Costo S/<input name="costo" type="number" min="0" step="0.5" value="0"></label>
        <label>Orden<input name="orden" type="number" min="0" value="99"></label>
        <label class="wide">Nota<textarea name="nota" placeholder="Costo referencial sujeto a dirección exacta."></textarea></label>
        <label class="check"><input name="requiere_cotizacion" type="checkbox" checked> Cotizar antes de confirmar</label>
        <label class="check"><input name="activo" type="checkbox" checked> Activa</label>
        <div class="catalog-manager-actions"><button class="save" type="submit">Guardar zona</button><button class="clear" type="button" id="clearDeliveryManager">Nueva</button></div>
      </form>
      <div id="deliveryManagerList" class="catalog-manager-list"><div class="manager-loading">Cargando zonas…</div></div>`;
    section.insertBefore(card,section.firstElementChild);
  }

  let snapshot=null;

  function renderCategories(){
    const list=document.getElementById('categoryManagerList');if(!list || !snapshot) return;
    const cats=[...(snapshot.categories||[])].sort((a,b)=>Number(a.orden||99)-Number(b.orden||99));
    list.innerHTML=cats.length?cats.map(c=>`<div class="catalog-manager-row" data-category-id="${esc(c.categoria_id)}"><div><strong>${esc(c.emoji||'🎁')} ${esc(c.nombre)}</strong><small>${bool(c.activo)?'Visible':'Oculta'}${c.fecha_inicio||c.fecha_fin?` · ${esc(c.fecha_inicio||'…')} → ${esc(c.fecha_fin||'…')}`:''}</small></div><div class="description">${esc(c.descripcion||'')}</div><div class="order">#${Number(c.orden||0)}</div><button type="button" data-edit-category="${esc(c.categoria_id)}">Editar</button></div>`).join(''):'<div class="manager-loading">No hay categorías.</div>';
    list.querySelectorAll('[data-edit-category]').forEach(b=>b.onclick=()=>fillCategory(b.dataset.editCategory));
  }

  function fillCategory(id){
    const c=(snapshot?.categories||[]).find(x=>String(x.categoria_id)===String(id));if(!c)return;
    const f=document.getElementById('categoryManagerForm');
    ['categoria_id','nombre','emoji','orden','descripcion','fecha_inicio','fecha_fin'].forEach(k=>{if(f.elements[k])f.elements[k].value=c[k]??'';});
    f.elements.activo.checked=bool(c.activo);
    f.scrollIntoView({behavior:'smooth',block:'center'});
  }

  function clearCategory(){
    const f=document.getElementById('categoryManagerForm');if(!f)return;f.reset();f.elements.categoria_id.value='';f.elements.orden.value='99';f.elements.activo.checked=true;
  }

  function renderDeliveryManager(){
    const list=document.getElementById('deliveryManagerList');if(!list||!snapshot)return;
    const zones=[...(snapshot.delivery||[])].sort((a,b)=>Number(a.orden||99)-Number(b.orden||99));
    list.innerHTML=zones.length?zones.map(z=>'<div class="catalog-manager-row"><div><strong>'+esc(z.nombre)+'</strong><small>'+(bool(z.activo)?'Activa':'Inactiva')+' · '+(bool(z.requiere_cotizacion)?'Cotizar':'S/ '+Number(z.costo||0).toFixed(2))+'</small></div><div class="description">'+esc(z.distrito||'')+(z.nota?' · '+esc(z.nota):'')+'</div><div class="order">#'+Number(z.orden||0)+'</div><button type="button" data-edit-delivery-full="'+esc(z.zona_id)+'">Editar</button></div>').join(''):'<div class="manager-loading">No hay zonas.</div>';
    list.querySelectorAll('[data-edit-delivery-full]').forEach(b=>b.onclick=()=>fillDelivery(b.dataset.editDeliveryFull));
  }

  function fillDelivery(id){
    const z=(snapshot?.delivery||[]).find(x=>String(x.zona_id)===String(id));if(!z)return;
    const f=document.getElementById('newDeliveryForm');
    ['zona_id','nombre','distrito','costo','orden','nota'].forEach(k=>{if(f.elements[k])f.elements[k].value=z[k]??'';});
    f.elements.requiere_cotizacion.checked=bool(z.requiere_cotizacion);
    f.elements.activo.checked=bool(z.activo);
    f.scrollIntoView({behavior:'smooth',block:'center'});
  }

  function clearDelivery(){
    const f=document.getElementById('newDeliveryForm');if(!f)return;
    f.reset();f.elements.zona_id.value='';f.elements.orden.value='99';f.elements.costo.value='0';f.elements.requiere_cotizacion.checked=true;f.elements.activo.checked=true;
  }

  async function refresh(){
    try{snapshot=await getSnapshot();renderCategories();renderDeliveryManager();}
    catch(e){const l=document.getElementById('categoryManagerList');if(l)l.innerHTML=`<div class="manager-loading">${esc(e.message)}</div>`;}
  }

  function bind(){
    const cf=document.getElementById('categoryManagerForm');
    if(cf)cf.onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,d=Object.fromEntries(new FormData(f));try{await post('adminSaveCategory',{...d,orden:Number(d.orden||99),activo:f.elements.activo.checked});notify('Categoría guardada');clearCategory();await refresh();}catch(err){notify(err.message,true);}};
    const cc=document.getElementById('clearCategoryManager');if(cc)cc.onclick=clearCategory;
    const df=document.getElementById('newDeliveryForm');
    if(df)df.onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,d=Object.fromEntries(new FormData(f));try{await post('adminSaveDelivery',{zona_id:d.zona_id||'',nombre:d.nombre,distrito:d.distrito,costo:Number(d.costo||0),requiere_cotizacion:f.elements.requiere_cotizacion.checked,activo:f.elements.activo.checked,orden:Number(d.orden||99),nota:d.nota||''});notify(d.zona_id?'Zona actualizada':'Zona agregada');clearDelivery();await refresh();setTimeout(()=>document.getElementById('refreshAdmin')?.click(),150);}catch(err){notify(err.message,true);}};
    const cd=document.getElementById('clearDeliveryManager');if(cd)cd.onclick=clearDelivery;
  }

  function mount(){
    if(!document.body.classList.contains('admin-body'))return;
    addStyles();categoryCard();deliveryCard();bind();
    const wait=()=>{if(localStorage.getItem('sf_admin_token'))refresh();else setTimeout(wait,500);};wait();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
