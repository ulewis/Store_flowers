(() => {
  const cfg = window.STORE_CONFIG || {};
  const REQUIRED = '2026-09-17.5';

  function compare(a,b){
    const pa=String(a||'').split(/[-.]/).map(x=>Number(x)||0),pb=String(b||'').split(/[-.]/).map(x=>Number(x)||0);
    for(let i=0;i<Math.max(pa.length,pb.length);i++){const d=(pa[i]||0)-(pb[i]||0);if(d)return d;}
    return 0;
  }

  function lock(message){
    ['categoryManagerForm','newDeliveryForm','productImageManager'].forEach(id=>{
      const form=document.getElementById(id);if(!form)return;
      form.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);
      form.querySelectorAll('label').forEach(el=>{if(el.htmlFor||el.querySelector('input[type=file]'))el.style.pointerEvents='none';});
      if(!form.previousElementSibling?.classList?.contains('backend-upgrade-note')&&!form.querySelector('.backend-upgrade-note')){
        const note=document.createElement('div');note.className='backend-upgrade-note';note.textContent=message;
        note.style.cssText='margin:0 0 14px;padding:11px 13px;border-radius:12px;background:#fff3df;color:#6d4b16;font:600 13px/1.4 DM Sans,sans-serif';
        if(id==='productImageManager')form.insertBefore(note,form.firstChild);else form.parentNode.insertBefore(note,form);
      }
    });
  }

  async function check(){
    if(!document.body.classList.contains('admin-body')||!cfg.API_URL)return;
    try{
      const u=new URL(cfg.API_URL);u.searchParams.set('action','health');
      const r=await fetch(u,{redirect:'follow'}),j=await r.json();
      const version=j?.data?.version||'';
      if(compare(version,REQUIRED)<0) lock(`La tienda pública sigue operativa. Para crear categorías o zonas nuevas falta publicar el backend ${REQUIRED}.`);
    }catch{lock('No se pudo comprobar la versión del backend. Las altas nuevas quedan temporalmente deshabilitadas.');}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(check,700));else setTimeout(check,700);
})();
