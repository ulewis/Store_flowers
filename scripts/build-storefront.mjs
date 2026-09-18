import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root=process.cwd(),out=path.join(root,'_site');
const base=new URL(process.env.SITE_URL||'https://ulewis.github.io/Store_flowers/');
if(!base.pathname.endsWith('/'))base.pathname+='/';
if(!['https:','http:'].includes(base.protocol))throw new Error('Invalid SITE_URL');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active=v=>v===true||String(v).toLowerCase()==='true';
const safeImage=value=>{try{const u=new URL(value,base);return value&&['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const config=await readFile('assets/config.js','utf8');
const endpoint=config.match(/API_URL:\s*'([^']+)'/)?.[1];
let products=[];
try {
  let data;
  if(process.env.CATALOG_FIXTURE){data=JSON.parse(await readFile(process.env.CATALOG_FIXTURE,'utf8'));}
  else {
    if(!endpoint)throw new Error('Missing catalog endpoint');
    const url=new URL(endpoint);url.searchParams.set('action','bootstrap');
    const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw new Error(`Catalog HTTP ${response.status}`);
    data=await response.json();
  }
  if(data.ok===false)throw new Error(data.error||'Catalog unavailable');
  products=(data.data||data).products;
  if(!Array.isArray(products))throw new Error('Invalid catalog');
  products=products.filter(p=>active(p.activo));
} catch(error) {
  // Query-string links still work; a catalog outage must not block a frontend fix.
  console.warn(`Product social previews unavailable for this build: ${error.message}`);
  products=[];
}
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const file of ['index.html','admin.html','assets'])await cp(path.join(root,file),path.join(out,file),{recursive:true});
const template=await readFile('index.html','utf8');
const price=p=>`S/ ${Number(p.precio||0).toFixed(2)}`;
function metadata({title,description,url,image}){
  return `<link rel="canonical" href="${escape(url)}">\n  <meta property="og:type" content="website">\n  <meta property="og:locale" content="es_PE">\n  <meta property="og:site_name" content="Magaly Detalles">\n  <meta property="og:title" content="${escape(title)}">\n  <meta property="og:description" content="${escape(description)}">\n  <meta property="og:url" content="${escape(url)}">\n  <meta name="twitter:card" content="${image?'summary_large_image':'summary'}">\n  <meta name="twitter:title" content="${escape(title)}">\n  <meta name="twitter:description" content="${escape(description)}">${image?`\n  <meta property="og:image" content="${escape(image)}">\n  <meta name="twitter:image" content="${escape(image)}">`:''}`;
}
const links={};
for(const product of products){
  const id=String(product.id),slug=id.toLowerCase().replace(/[^a-z0-9_-]/g,'-').slice(0,65)||'detalle';
  const route=`productos/${slug}-${createHash('sha256').update(id).digest('hex').slice(0,8)}/`;
  links[id]=route;
  const title=`${product.nombre} | Magaly Detalles`,description=`${price(product)} · ${String(product.descripcion||'Detalle preparado en Piura.').slice(0,250)} · Precio y stock sujetos a disponibilidad.`,url=new URL(route,base).href,image=safeImage(product.imagen_principal);
  const html=template.replace('<head>','<head>\n  <base href="../../">')
    .replace(/<title>[^<]*<\/title>/,`<title>${escape(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${escape(description)}">`)
    .replace('</head>',`  ${metadata({title,description,url,image})}\n</head>`)
    .replace('<body>',`<body data-product-id="${escape(id)}">`);
  const folder=path.join(out,route);await mkdir(folder,{recursive:true});await writeFile(path.join(folder,'index.html'),html);
}
await writeFile(path.join(out,'assets/product-links.json'),JSON.stringify(links,null,2));
const rootMeta=metadata({title:'Magaly Detalles | Regalos y detalles en Piura',description:'Flores, peluches y regalos para sorprender. Elige tu detalle y coordina la entrega en Piura por WhatsApp.',url:base.href,image:new URL('assets/products/abejita.webp',base).href});
await writeFile(path.join(out,'index.html'),template.replace('</head>',`  ${rootMeta}\n</head>`));
console.log(`Storefront ready: ${products.length} product preview pages.`);
