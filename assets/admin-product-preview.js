(() => {
  const cfg=window.STORE_CONFIG||{};
  const $=(q,e=document)=>e.querySelector(q);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const token=()=>localStorage.getItem('sf_admin_token')||'';

  async function post(action,payload={}){
    if(!cfg.API_URL)throw new Error('API no configurada.');
    const r=await fetch(cfg.API_URL,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,payload:{...payload,token:token()}}),
      redirect:'follow'
    });
    const j=await r.json();
    if(j.ok===false)throw new Error(j.error||'No se pudo completar la operación.');
    return j.data||j;
  }

  async function snapshot(){
    return post('adminSnapshot');
  }

  function blobToBase64(blob){
    return new Promise((resolve,reject)=>{
      const fr=new FileReader();
      fr.onload=()=>resolve(String(fr.result).split(',')[1]||'');
      fr.onerror=()=>reject(new Error('No se pudo leer la imagen.'));
      fr.readAsDataURL(blob);
    });
  }

  async function loadSource(file){
    if('createImageBitmap' in window){
      try{
        const bmp=await createImageBitmap(file);
        return {source:bmp,width:bmp.width,height:bmp.height,close:()=>bmp.close?.()};
      }catch(e){}
    }
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{
        const x=new Image();
        x.onload=()=>resolve(x);
        x.onerror=()=>reject(new Error('No se pudo abrir la imagen.'));
        x.src=url;
      });
      return {source:img,width:img.naturalWidth,height:img.naturalHeight,close:()=>URL.revokeObjectURL(url)};
    }catch(e){URL.revokeObjectURL(url);throw e;}
  }

  function canvasBlob(canvas,type,quality){
    return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
  }

  async function compressImage(file){
    if(!file||!String(file.type).startsWith('image/'))throw new Error('Selecciona un archivo de imagen.');
    if(file.size>20*1024*1024)throw new Error('La foto original es demasiado pesada.');
    const img=await loadSource(file);
    try{
      let scale=Math.min(1,1600/Math.max(img.width,img.height));
      let quality=.86;
      let blob=null;
      let mime='image/webp';
      for(let attempt=0;attempt<7;attempt++){
        const w=Math.max(1,Math.round(img.width*scale));
        const h=Math.max(1,Math.round(img.height*scale));
        const canvas=document.createElement('canvas');
        canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d',{alpha:false});
        ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
        ctx.drawImage(img.source,0,0,w,h);
        blob=await canvasBlob(canvas,'image/webp',quality);
        if(!blob){
          mime='image/jpeg';
          blob=await canvasBlob(canvas,'image/jpeg',quality);
        }else mime=blob.type||'image/webp';
        if(blob&&blob.size<=850*1024)break;
        scale*=.82;
        quality=Math.max(.58,quality-.07);
      }
      if(!blob)throw new Error('El navegador no pudo comprimir la imagen.');
      if(blob.size>900*1024)throw new Error('No se pudo reducir la imagen por debajo del límite permitido.');
      return {mimeType:mime||'image/webp',base64:await blobToBase64(blob)};
    }finally{img.close();}
  }

  function mount(){
    if(!document.body.classList.contains('admin-body'))return;
    const form=$('#productForm');
    if(!form||$('#productImageManager'))return;
    const main=form.elements.imagen_principal;
    const extra=form.elements.imagenes;
    if(!main||!extra)return;

    const style=document.createElement('style');
    style.textContent='.image-manager{grid-column:1/-1;border:1px solid rgba(33,30,30,.12);border-radius:18px;padding:15px;background:#fbf8f6}.image-manager-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:13px}.image-manager-head strong{display:block}.image-manager-head small{display:block;color:#776e6a;margin-top:3px}.github-connect{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:8px;align-items:center;margin-bottom:13px}.github-connect input{width:100%;border:1px solid rgba(33,30,30,.15);border-radius:11px;padding:10px 12px;font:inherit}.image-status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 9px;background:#f0ebe8;font-size:11px;font-weight:800}.image-status.ok{background:#e9f4ec;color:#477052}.image-status.warn{background:#fff0df;color:#8b632d}.github-token-help{display:block;color:#776e6a;font-size:11px;line-height:1.4;margin:-4px 0 12px}.image-upload-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.image-upload-actions label,.image-upload-actions button{border:0;border-radius:999px;padding:10px 14px;background:#211e1e;color:#fff;font:700 12px/1 DM Sans,sans-serif;cursor:pointer}.image-upload-actions .secondary{background:#eee7e3;color:#3f3835}.image-upload-actions input{display:none}.image-progress{min-height:20px;color:#756c68;font-size:12px;margin:4px 0 8px}.admin-product-preview-grid{display:flex;gap:9px;overflow-x:auto;min-height:96px;padding-bottom:2px}.admin-image-card{width:94px;flex:0 0 94px;position:relative}.admin-image-card img{width:94px;height:94px;object-fit:cover;border-radius:13px;border:1px solid rgba(33,30,30,.1);background:#fff}.admin-image-card b{position:absolute;left:5px;bottom:6px;background:rgba(33,30,30,.82);color:#fff;padding:4px 6px;border-radius:999px;font-size:9px}.admin-image-card button{position:absolute;right:5px;top:5px;width:25px;height:25px;border:0;border-radius:50%;background:rgba(255,255,255,.92);font-size:16px;cursor:pointer}.admin-product-preview-empty{display:grid;place-items:center;min-height:94px;width:100%;color:#847976;font-size:12px}@media(max-width:620px){.image-manager-head{display:block}.image-manager-head .image-status{margin-top:8px}.github-connect{grid-template-columns:1fr 1fr}.github-connect input{grid-column:1/-1;font-size:16px}.image-upload-actions>*{flex:1;text-align:center}.admin-image-card,.admin-image-card img{width:82px}.admin-image-card{flex-basis:82px}.admin-image-card img{height:82px}}';
    document.head.appendChild(style);

    const manager=document.createElement('div');
    manager.id='productImageManager';
    manager.className='image-manager';
    manager.innerHTML='<div class="image-manager-head"><div><strong>Fotos del producto</strong><small>Las fotos se comprimen y se publican automáticamente en GitHub Pages.</small></div><span class="image-status warn" id="githubImageStatus">Comprobando conexión…</span></div><div class="github-connect" id="githubConnectBox"><input id="githubTokenInput" type="password" autocomplete="off" placeholder="Token de GitHub (solo para conectarlo una vez)"><button type="button" class="soft-button" id="githubConnectButton">Conectar</button><button type="button" class="soft-button" id="githubDisconnectButton">Desconectar</button></div><small class="github-token-help">Usa un token de acceso limitado al repositorio Store_flowers, con permiso Contents: Read and write. El token se guarda solo en Script Properties.</small><div class="image-upload-actions"><label id="uploadMainLabel">📷 Subir principal<input id="uploadMainImage" type="file" accept="image/*"></label><label class="secondary" id="uploadExtraLabel">＋ Añadir fotos<input id="uploadExtraImages" type="file" accept="image/*" multiple></label></div><div class="image-progress" id="imageUploadProgress"></div><div class="admin-product-preview-grid" id="adminProductPreviewGrid"></div>';

    const anchor=extra.closest('.field')||extra.parentElement;
    anchor.insertAdjacentElement('afterend',manager);

    const status=$('#githubImageStatus');
    const progress=$('#imageUploadProgress');
    const grid=$('#adminProductPreviewGrid');
    let connected=false;

    function urls(){
      const extras=String(extra.value||'').split(/[|,\n]/).map(x=>x.trim()).filter(Boolean);
      return [main.value.trim(),...extras].filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,13);
    }

    function render(){
      const list=urls();
      if(!list.length){
        grid.innerHTML='<div class="admin-product-preview-empty">Aún no hay fotos asignadas.</div>';
        return;
      }
      grid.innerHTML=list.map((u,i)=>{
        return '<div class="admin-image-card"><img src="'+esc(u)+'" alt="Foto '+(i+1)+'" loading="lazy">'+(i===0?'<b>Principal</b>':'')+'<button type="button" data-remove-image="'+i+'" title="Quitar del producto">×</button></div>';
      }).join('');
      grid.querySelectorAll('[data-remove-image]').forEach(b=>b.onclick=()=>{
        const index=Number(b.dataset.removeImage);
        const current=urls();
        const removed=current[index];
        if(index===0){
          const rest=String(extra.value||'').split(/[|,\n]/).map(x=>x.trim()).filter(Boolean);
          main.value=rest.shift()||'';
          extra.value=rest.join('|');
        }else{
          const rest=String(extra.value||'').split(/[|,\n]/).map(x=>x.trim()).filter(Boolean).filter(x=>x!==removed);
          extra.value=rest.join('|');
        }
        main.dispatchEvent(new Event('input',{bubbles:true}));
        extra.dispatchEvent(new Event('input',{bubbles:true}));
        render();
      });
    }

    function setConnected(v,version){
      connected=!!v;
      status.className='image-status '+(connected?'ok':'warn');
      status.textContent=connected?'✓ GitHub conectado':(version&&version<'2026-09-17.5'?'Requiere Code.gs 2026-09-17.5':'GitHub sin conectar');
      $('#uploadMainLabel').style.opacity=connected?'1':'.5';
      $('#uploadExtraLabel').style.opacity=connected?'1':'.5';
      $('#githubDisconnectButton').disabled=!connected;
    }

    async function refreshConnection(){
      try{
        const s=await snapshot();
        setConnected(!!(s.integrations&&s.integrations.githubUpload),String(s.version||''));
      }catch(e){
        setConnected(false,'');
        status.textContent='No se pudo comprobar GitHub';
      }
    }

    $('#githubConnectButton').onclick=async()=>{
      const input=$('#githubTokenInput');
      const value=input.value.trim();
      if(!value){progress.textContent='Pega primero el token de GitHub.';return;}
      try{
        progress.textContent='Comprobando permisos de GitHub…';
        await post('adminSetGitHubToken',{githubToken:value});
        input.value='';
        setConnected(true,'2026-09-17.5');
        progress.textContent='GitHub conectado. Ya puedes subir fotos.';
      }catch(e){progress.textContent=e.message;}
    };

    $('#githubDisconnectButton').onclick=async()=>{
      if(!confirm('¿Desconectar la subida automática de imágenes?'))return;
      try{
        await post('adminClearGitHubToken',{});
        setConnected(false,'2026-09-17.5');
        progress.textContent='GitHub desconectado.';
      }catch(e){progress.textContent=e.message;}
    };

    async function uploadFiles(fileList,asMain){
      const files=[...fileList];
      if(!files.length)return;
      if(!connected){progress.textContent='Primero conecta GitHub.';return;}
      if(asMain&&files.length>1)files.splice(1);
      if(files.length>8)files.splice(8);
      for(let i=0;i<files.length;i++){
        try{
          progress.textContent='Comprimiendo '+(i+1)+' de '+files.length+': '+files[i].name+'…';
          const compressed=await compressImage(files[i]);
          progress.textContent='Subiendo '+(i+1)+' de '+files.length+'…';
          const result=await post('adminUploadProductImage',{
            productId:form.elements.id.value||'',
            productName:form.elements.nombre.value||files[i].name.replace(/\.[^.]+$/,''),
            mimeType:compressed.mimeType,
            base64:compressed.base64
          });
          if(asMain&&i===0)main.value=result.url;
          else{
            const existing=String(extra.value||'').split(/[|,\n]/).map(x=>x.trim()).filter(Boolean);
            if(!existing.includes(result.url))existing.push(result.url);
            extra.value=existing.join('|');
          }
          main.dispatchEvent(new Event('input',{bubbles:true}));
          extra.dispatchEvent(new Event('input',{bubbles:true}));
          render();
        }catch(e){
          progress.textContent='Error: '+e.message;
          return;
        }
      }
      progress.textContent='✓ '+(files.length===1?'Imagen publicada':'Imágenes publicadas')+'. Guarda el producto para conservar los cambios.';
    }

    $('#uploadMainImage').onchange=e=>{uploadFiles(e.target.files,true).finally(()=>e.target.value='');};
    $('#uploadExtraImages').onchange=e=>{uploadFiles(e.target.files,false).finally(()=>e.target.value='');};
    main.addEventListener('input',render);
    extra.addEventListener('input',render);
    document.addEventListener('click',e=>{if(e.target.closest('[data-edit-product]')||e.target.closest('#clearProductForm'))setTimeout(render,0);});

    render();
    refreshConnection();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();