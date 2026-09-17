(() => {
  function mount(){
    if(!document.body.classList.contains('admin-body')) return;
    const form=document.getElementById('productForm');
    if(!form || document.getElementById('productImagePreview')) return;
    const main=form.elements.imagen_principal;
    const extra=form.elements.imagenes;
    if(!main || !extra) return;
    const box=document.createElement('div');
    box.id='productImagePreview';
    box.className='admin-product-preview';
    box.innerHTML='<div class="admin-product-preview-head"><strong>Previsualización</strong><small>Así se verán las imágenes cargadas.</small></div><div class="admin-product-preview-grid"></div>';
    const wide=form.querySelector('.field-wide');
    if(wide) form.insertBefore(box,wide); else form.appendChild(box);
    const style=document.createElement('style');
    style.textContent='.admin-product-preview{grid-column:1/-1;border:1px dashed rgba(33,30,30,.18);border-radius:15px;padding:12px;background:#fbf8f6}.admin-product-preview-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.admin-product-preview-head small{color:#7a706d;font-size:11px}.admin-product-preview-grid{display:flex;gap:9px;overflow-x:auto;min-height:84px}.admin-product-preview-grid img{width:84px;height:84px;object-fit:cover;border-radius:12px;border:1px solid rgba(33,30,30,.1);background:#fff;flex:none}.admin-product-preview-empty{display:grid;place-items:center;min-height:84px;width:100%;color:#847976;font-size:12px}@media(max-width:560px){.admin-product-preview-head{display:block}.admin-product-preview-head small{display:block;margin-top:3px}.admin-product-preview-grid img{width:74px;height:74px}}';
    document.head.appendChild(style);
    const grid=box.querySelector('.admin-product-preview-grid');
    const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    function urls(){return [main.value,...String(extra.value||'').split(/[|,\n]/)].map(x=>x.trim()).filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,8);}
    function render(){
      const list=urls();
      grid.innerHTML=list.length?list.map((u,i)=>'<img src="'+esc(u)+'" alt="Vista previa '+(i+1)+'" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity=\'.25\';this.title=\'No se pudo cargar esta imagen\'">').join(''):'<div class="admin-product-preview-empty">Agrega una URL de imagen para verla aquí.</div>';
    }
    main.addEventListener('input',render);
    extra.addEventListener('input',render);
    document.addEventListener('click',e=>{if(e.target.closest('[data-edit-product]')||e.target.closest('#clearProductForm'))setTimeout(render,0);});
    const table=document.getElementById('productsTable');
    if(table)new MutationObserver(()=>setTimeout(render,0)).observe(table,{childList:true,subtree:true});
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();