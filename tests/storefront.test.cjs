const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');
const script=fs.readFileSync('assets/app.js','utf8');
const fixture={config:{STORE_NAME:'Magaly Detalles',WHATSAPP_NUMBER:'51999999999',STORE_STATUS:'open',MIN_NOTICE_HOURS:6},categories:[{categoria_id:'flores',nombre:'Flores',emoji:'🌻',activo:true}],products:[{id:'P1',nombre:'Arreglo de prueba',precio:89,available_stock:3,activo:true,destacado:true,personalizable:true,categoria_id:'flores',imagen_principal:'assets/products/abejita.webp',descripcion:'Girasol y peluche'}],delivery:[{zona_id:'PIURA',nombre:'Piura',distrito:'Piura',costo:0,requiere_cotizacion:true,activo:true}]};
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function setup({catalog=fixture,fail=false,cart=[],post,url='https://example.org/Store_flowers/'}={}){
  const errors=[],calls=[],virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>{if(!/navigation|scrollIntoView/.test(error.message))errors.push(error);});
  const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const w=dom.window;
  w.STORE_CONFIG={API_URL:'https://example.org/api',PUBLIC_WHATSAPP:'51999999999'};
  w.localStorage.setItem('sf_cart',JSON.stringify(cart));
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=async (url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith('product-links.json'))return {ok:true,json:async()=>({P1:'productos/p1-test/'})};
    if(options.method==='POST'){
      await tick();return {ok:true,json:async()=>post?post(JSON.parse(options.body)):{ok:true,data:{reserva_id:'TEST-001',expires_at:'2026-09-19T18:00:00Z',whatsapp_number:'51999999999',subtotal:89,total:null,delivery:null}}};
    }
    if(fail)throw new Error('Offline');
    return {ok:true,json:async()=>({ok:true,data:structuredClone(catalog)})};
  };
  w.eval(script);
  const $=selector=>w.document.querySelector(selector);
  const click=selector=>{assert.ok($(selector),selector);$(selector).click();};
  return {dom,w,$,click,errors,calls,cart:()=>JSON.parse(w.localStorage.getItem('sf_cart')),close:()=>w.close()};
}
function contact(q){q.$('[name=name]').value='Cliente de prueba';q.$('[name=phone]').value='999999999';q.click('#checkoutNext');}
function delivery(q){q.$('[name=deliveryDate]').value=q.$('[name=deliveryDate]').min;q.$('[name=deliveryWindow]').value='A coordinar';q.$('#zoneSelect').value='PIURA';q.$('[name=address]').value='Dirección de prueba';q.$('#reservationConsent').checked=true;}
function submit(q){q.$('#checkoutForm').dispatchEvent(new q.w.Event('submit',{bubbles:true,cancelable:true}));}

test('Catalog loading has a visible state and does not fabricate stock on failure',async()=>{
  const q=setup({fail:true,cart:[{id:'P1',qty:2,personalization:''}]});
  assert.equal(q.$('#productGrid').getAttribute('aria-busy'),'true');await tick();
  assert.equal(q.$('#productGrid').children.length,0);assert.equal(q.$('#retryCatalog').hidden,false);
  assert.equal(q.$('#checkoutStart').disabled,true);assert.equal(q.cart()[0].qty,2);
  assert.match(q.$('#catalogStatusText').textContent,/No pudimos/);assert.deepEqual(q.errors,[]);q.close();
});
test('Different dedications cannot exceed aggregate product stock',async()=>{
  const q=setup();await tick();
  for(const text of ['Ana','Luis','Carmen','Otro']){
    q.click('[data-open-product="P1"]');q.$('#modalPersonalization').value=text;q.click('#modalAdd');
    if(q.$('#cartDrawer').classList.contains('open'))q.click('[data-close=cart]');else q.click('[data-close=product]');
  }
  assert.equal(q.cart().reduce((s,i)=>s+i.qty,0),3);assert.equal(q.cart().length,3);assert.deepEqual(q.errors,[]);q.close();
});
test('Restored cart reconciles aggregate quantities against current stock',async()=>{
  const q=setup({cart:[{id:'P1',qty:2,personalization:'Ana'},{id:'P1',qty:2,personalization:'Luis'}]});await tick();
  assert.deepEqual(q.cart().map(i=>i.qty),[2,1]);q.click('#cartOpen');assert.equal(q.$('[data-cart-plus]').disabled,true);q.close();
});
test('Two-step checkout validates contact, preserves it when navigating back, and enables delivery',async()=>{
  const q=setup();await tick();q.click('[data-add]');q.click('#cartOpen');q.click('#checkoutStart');
  q.click('#checkoutNext');assert.equal(q.$('#deliveryStep').hidden,true);
  contact(q);assert.equal(q.$('#contactStep').hidden,true);assert.equal(q.$('#deliveryStep').disabled,false);
  q.click('#checkoutBack');assert.equal(q.$('[name=name]').value,'Cliente de prueba');assert.equal(q.$('#reservationConsent').disabled,true);q.close();
});
test('Async reservation succeeds after currentTarget is cleared and retains a usable WhatsApp link',async()=>{
  const q=setup();await tick();q.click('[data-add]');q.click('#cartOpen');q.click('#checkoutStart');contact(q);delivery(q);
  submit(q);submit(q);await tick();await tick();
  assert.equal(q.calls.filter(c=>c.options.method==='POST').length,1);
  assert.equal(q.$('#reservationSuccess').classList.contains('open'),true);
  const link=q.$('#reservationWhatsApp').href;assert.match(link,/^https:\/\/wa.me\/51999999999\?text=/);assert.match(decodeURIComponent(link),/TEST-001/);
  assert.equal(q.cart().length,0);assert.equal(JSON.parse(q.w.localStorage.getItem('sf_last_reservation')).id,'TEST-001');assert.equal(q.$('[name=name]').value,'');
  assert.deepEqual(q.errors,[]);q.close();
});
test('A rejected reservation keeps the cart and customer inputs for correction',async()=>{
  const q=setup({post:()=>({ok:false,error:'Solo quedan 0 unidades.'})});await tick();q.click('[data-add]');q.click('#cartOpen');q.click('#checkoutStart');contact(q);delivery(q);submit(q);await tick();await tick();
  assert.equal(q.cart().length,1);assert.equal(q.$('[name=name]').value,'Cliente de prueba');assert.match(q.$('#checkoutMessage').textContent,/Solo quedan/);assert.equal(q.$('#reserveButton').disabled,false);q.close();
});
test('Deep links open the product, image enlargement closes back to the detail, and sharing copies its URL',async()=>{
  const q=setup({url:'https://example.org/Store_flowers/?producto=P1'});let copied='';Object.defineProperty(q.w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});await tick();
  assert.equal(q.$('#productModal').classList.contains('open'),true);q.click('#modalMainImage');assert.equal(q.$('#photoModal').classList.contains('open'),true);assert.equal(q.$('#productModal').inert,true);
  q.click('[data-close=photo]');assert.equal(q.$('#productModal').inert,false);q.click('#shareProduct');await tick();assert.equal(copied,'https://example.org/Store_flowers/productos/p1-test/');
  q.click('[data-close=product]');assert.equal(new URL(q.w.location.href).searchParams.has('producto'),false);q.close();
});
test('Closed store blocks additions and checkout',async()=>{
  const catalog=structuredClone(fixture);catalog.config.STORE_STATUS='paused';const q=setup({catalog});await tick();assert.equal(q.$('[data-add]').disabled,true);assert.equal(q.$('#checkoutStart').disabled,true);assert.equal(q.$('#storeStatusBanner').hidden,false);q.close();
});

test('Catalogue changes from Add to a quantity stepper, respects stock, and returns to Add at zero',async()=>{
  const q=setup();await tick();
  assert.equal(q.$('.product-quantity').hidden,true);
  q.click('[data-add]');
  assert.equal(q.$('[data-add]').hidden,true);
  assert.equal(q.$('.product-quantity').hidden,false);
  assert.equal(q.$('.product-quantity-value').textContent,'1');
  q.click('[data-product-plus]');q.click('[data-product-plus]');
  assert.equal(q.$('.product-quantity-value').textContent,'3');
  assert.equal(q.$('[data-product-plus]').disabled,true);
  assert.equal(q.$('#cartCount').textContent,'3');
  assert.equal(q.$('#cartSubtotal').textContent,'S/ 267.00');
  q.click('[data-product-minus]');q.click('[data-product-minus]');q.click('[data-product-minus]');
  assert.equal(q.cart().length,0);assert.equal(q.$('[data-add]').hidden,false);
  assert.equal(q.$('.product-quantity').hidden,true);q.close();
});
test('Catalogue quantity follows restored cart, cart edits, and product customizations',async()=>{
  const q=setup({cart:[{id:'P1',qty:2,personalization:'Para Ana'}]});await tick();
  assert.equal(q.$('.product-quantity-value').textContent,'2');
  q.click('[data-product-plus]');
  assert.equal(q.cart().length,1);assert.equal(q.cart()[0].personalization,'Para Ana');
  q.click('#cartOpen');q.click('[data-cart-minus]');
  assert.equal(q.$('.product-quantity-value').textContent,'2');
  q.click('[data-cart-remove]');
  assert.equal(q.$('[data-add]').hidden,false);q.click('[data-close=cart]');
  q.click('[data-open-product]');q.$('#modalPersonalization').value='Para Luis';q.click('#modalAdd');
  assert.equal(q.$('.product-quantity-value').textContent,'1');q.close();
});
test('With different dedications, catalogue controls let the customer choose the cart line',async()=>{
  const q=setup({cart:[{id:'P1',qty:1,personalization:'Ana'},{id:'P1',qty:1,personalization:'Luis'}]});await tick();
  assert.equal(q.$('.product-quantity-value').textContent,'2');
  q.click('[data-product-minus]');
  assert.equal(q.$('#cartDrawer').classList.contains('open'),true);
  assert.deepEqual(q.cart().map(i=>i.qty),[1,1]);q.close();
});
