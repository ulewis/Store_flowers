const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {JSDOM}=require('jsdom');

test('Shared pages contain server-rendered product metadata, safe URLs and working asset paths',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'flowers-build-'));
  try {
    for(const file of ['index.html','admin.html','assets','scripts'])fs.cpSync(file,path.join(root,file),{recursive:true});
    const products=[{id:'P1',nombre:'Abejita & girasol',precio:89,descripcion:'Con dedicatoria',imagen_principal:'assets/products/abejita.webp',activo:true},{id:'P2',nombre:'Ovejita',precio:89,descripcion:'Un regalo',imagen_principal:'assets/products/ovejita.webp',activo:true},{id:'P3',nombre:'Oculto',activo:false}];
    fs.writeFileSync(path.join(root,'fixture.json'),JSON.stringify({products}));
    execFileSync(process.execPath,['scripts/build-storefront.mjs'],{cwd:root,env:{...process.env,CATALOG_FIXTURE:path.join(root,'fixture.json'),SITE_URL:'https://example.org/shop/'}});
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'_site/assets/product-links.json')));
    assert.equal(Object.keys(manifest).length,2);
    for(const p of products.slice(0,2)){
      const url=new URL(manifest[p.id],'https://example.org/shop/').href;
      const dom=new JSDOM(fs.readFileSync(path.join(root,'_site',manifest[p.id],'index.html'),'utf8'),{url});
      const d=dom.window.document;
      assert.equal(d.title,`${p.nombre} | Magaly Detalles`);
      assert.equal(d.querySelector('[property="og:title"]').content,d.title);
      assert.match(d.querySelector('[property="og:description"]').content,/S\/ 89.00/);
      assert.equal(d.querySelector('[property="og:image"]').content,new URL(p.imagen_principal,'https://example.org/shop/').href);
      assert.equal(d.querySelector('[rel=canonical]').href,url);
      assert.equal(d.body.dataset.productId,p.id);
      assert.equal(d.querySelector('script[src="assets/app.js"]').src,'https://example.org/shop/assets/app.js');
      dom.window.close();
    }
    assert.equal(fs.existsSync(path.join(root,'_site/apps-script')),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
