(() => {
  function mount() {
    if (!document.body.classList.contains('admin-body')) return;
    const topbar = document.querySelector('.admin-topbar');
    if (!topbar || document.getElementById('adminQuickSearch')) return;

    const style = document.createElement('style');
    style.textContent = `
      .admin-quick-search{position:relative;min-width:240px;max-width:360px;flex:1}.admin-quick-search input{width:100%;box-sizing:border-box;border:1px solid rgba(33,30,30,.14);border-radius:999px;background:#fff;padding:11px 38px 11px 15px;font:500 14px/1.2 'DM Sans',sans-serif;outline:none}.admin-quick-search input:focus{border-color:rgba(33,30,30,.4);box-shadow:0 0 0 3px rgba(33,30,30,.06)}.admin-quick-search button{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:0;border-radius:50%;background:#f2eeeb;cursor:pointer}.admin-filter-empty{padding:18px;color:#7d7470;text-align:center}
      .system-health{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.system-health-item{border:1px solid rgba(33,30,30,.1);border-radius:14px;padding:12px;background:#fbf9f7}.system-health-item span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#7d7470}.system-health-item strong{display:block;margin-top:5px;font-size:13px;overflow-wrap:anywhere}.system-health-item.ok strong{color:#3e6d4c}.system-health-item.warn strong{color:#9a6724}@media(max-width:900px){.system-health{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.admin-topbar{flex-wrap:wrap}.admin-quick-search{order:3;min-width:100%;max-width:none}.admin-quick-search input{font-size:16px}.system-health{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);

    const box = document.createElement('div');
    box.className = 'admin-quick-search';
    box.innerHTML = '<input id="adminQuickSearch" type="search" autocomplete="off" placeholder="Buscar en esta sección…" aria-label="Buscar en la sección actual"><button type="button" aria-label="Limpiar búsqueda">×</button>';
    const actions = topbar.querySelector('.admin-actions');
    if (actions) topbar.insertBefore(box, actions);
    else topbar.appendChild(box);

    const input = box.querySelector('input');
    const clear = box.querySelector('button');

    const dashboard=document.querySelector('[data-admin-section="dashboard"]');
    if(dashboard && !document.getElementById('systemHealthCard')){
      const card=document.createElement('div');
      card.id='systemHealthCard';
      card.className='admin-card';
      card.innerHTML='<h2>Estado del sistema</h2><div class="system-health" id="systemHealth"><div class="system-health-item"><span>Conexión</span><strong>Comprobando…</strong></div></div>';
      dashboard.insertBefore(card,dashboard.querySelector('.admin-card'));
    }

    async function refreshHealth(){
      const target=document.getElementById('systemHealth');
      if(!target)return;
      const token=localStorage.getItem('sf_admin_token')||'';
      if(!token){target.innerHTML='<div class="system-health-item warn"><span>Panel</span><strong>Inicia sesión para diagnosticar</strong></div>';return;}
      try{
        const cfg=window.STORE_CONFIG||{};
        let d=null;
        try{
          const rp=await fetch(cfg.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'adminSnapshot',payload:{token}}),redirect:'follow'});
          const jp=await rp.json();
          if(jp.ok!==false)d=jp.data||jp;
        }catch(e){}
        if(!d){
          const u=new URL(cfg.API_URL);u.searchParams.set('action','adminSnapshot');u.searchParams.set('token',token);
          const rg=await fetch(u,{redirect:'follow'});const jg=await rg.json();if(jg.ok===false)throw new Error(jg.error||'Sin conexión');
          d=jg.data||jg;
        }
        const emails=String(d.config?.ADMIN_EMAIL||'').split(/[;,]/).map(x=>x.trim()).filter(Boolean);
        const wa=String(d.config?.WHATSAPP_NUMBER||'').replace(/\D/g,'');
        const products=(d.products||[]).filter(p=>p.activo===true||String(p.activo).toLowerCase()==='true').length;
        const zones=(d.delivery||[]).filter(z=>z.activo===true||String(z.activo).toLowerCase()==='true').length;
        const github=!!d.integrations?.githubUpload;
        target.innerHTML=
          '<div class="system-health-item ok"><span>Backend</span><strong>'+String(d.version||'activo')+'</strong></div>'+
          '<div class="system-health-item '+(products?'ok':'warn')+'"><span>Productos activos</span><strong>'+products+'</strong></div>'+
          '<div class="system-health-item '+(zones?'ok':'warn')+'"><span>Zonas delivery</span><strong>'+zones+'</strong></div>'+
          '<div class="system-health-item '+(wa?'ok':'warn')+'"><span>WhatsApp</span><strong>'+(wa?'Configurado':'Falta configurar')+'</strong></div>'+
          '<div class="system-health-item '+(emails.length?'ok':'warn')+'"><span>Correos de aviso</span><strong>'+emails.length+' configurado'+(emails.length===1?'':'s')+'</strong></div>'+
          '<div class="system-health-item '+(github?'ok':'warn')+'"><span>Imágenes GitHub</span><strong>'+(github?'Conectado':'Sin conectar')+'</strong></div>';
      }catch(err){
        target.innerHTML='<div class="system-health-item warn"><span>Backend</span><strong>'+String(err.message||'No disponible')+'</strong></div>';
      }
    }

    function visibleSection() {
      return [...document.querySelectorAll('[data-admin-section]')].find(section => !section.classList.contains('hidden')) || null;
    }

    function applyFilter() {
      const section = visibleSection();
      if (!section) return;
      const q = input.value.trim().toLocaleLowerCase('es');
      section.querySelectorAll('.admin-table tbody tr').forEach(row => {
        if (row.querySelector('[colspan]')) return;
        const text = row.textContent.toLocaleLowerCase('es');
        row.hidden = !!q && !text.includes(q);
      });
    }

    input.addEventListener('input', applyFilter);
    clear.addEventListener('click', () => {
      input.value = '';
      applyFilter();
      input.focus();
    });

    document.querySelectorAll('[data-section]').forEach(button => {
      button.addEventListener('click', () => {
        input.value = '';
        requestAnimationFrame(applyFilter);
      });
    });

    const app = document.getElementById('adminApp');
    if (app) new MutationObserver(() => requestAnimationFrame(applyFilter)).observe(app, {childList:true, subtree:true});
    document.getElementById('refreshAdmin')?.addEventListener('click',()=>setTimeout(refreshHealth,300));
    document.getElementById('adminLoginButton')?.addEventListener('click',()=>setTimeout(refreshHealth,600));
    setTimeout(refreshHealth,700);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
