'use strict';
// Local fixtures only. Real HTML/CSS/JS and Indicator Engine math; no external requests or live orders.
var test=require('node:test'),assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http');
var firefox=require('playwright').firefox,root=path.resolve(__dirname,'../..');
var Engine=require('../../Indicators/Engine/indicator_engine'),Registry=require('../../Indicators/Engine/indicator_registry').Registry;
var registry=new Registry(path.join(root,'Indicators')),browser,server,base,FIXTURE_NOW=Date.now();
function calendarFixture(){
 var at=Math.floor(FIXTURE_NOW/60000)*60-25*60+23;
 function event(id,source,time,extra){return Object.assign({id:id,source:source,title:id,date:new Date(time*1000).toISOString().slice(0,10),startAtUtc:new Date(time*1000).toISOString()},extra)}
 return {fed:{events:[event('FOMC controlled','FED',at,{forecast:0,actual:.25,previous:.5,importance:'HIGH'}),event('Press conference','FED',at),{id:'date-only',title:'Official date only',date:new Date(FIXTURE_NOW+86400000).toISOString().slice(0,10)}]},cme:{events:[event('CME controlled','CME',at+300),event('Future expiration','CME',FIXTURE_NOW/1000+3600)]}};
}
function candles(symbol,tf){var step=tf==='5m'?300000:60000,at=Math.floor(FIXTURE_NOW/step)*step-239*step,price=symbol==='ETHUSD'?3000:60000;
 return Array.from({length:240},function(_,i){var p=price+i*2+Math.sin(i/5)*30;return[at+i*step,p,p+12,p-12,p+Math.sin(i/3)*9,100+i];});}
test.before(async function(){
 server=http.createServer(function(req,res){var p=req.url.split('?')[0],file=p==='/ia-trading'?'Frontend/Pages/app_v1.0.html':null;
  if(p.startsWith('/assets/'))for(var dir of ['JS','CSS','Assets','Protocols']){var candidate='Frontend/'+dir+'/'+path.basename(p);if(fs.existsSync(path.join(root,candidate))){file=candidate;break;}}
  if(!file){res.writeHead(404);return res.end('{}');}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'image/svg+xml');res.end(fs.readFileSync(path.join(root,file)));
 });await new Promise(function(done){server.listen(0,'127.0.0.1',done);});base='http://127.0.0.1:'+server.address().port;
 browser=await firefox.launch({headless:true,firefoxUserPrefs:process.env.IATB_FIREFOX_CONTAINER==='1'?{'security.sandbox.content.level':0,'security.sandbox.gpu.level':0,'dom.ipc.forkserver.enable':false}:{}});
});
test.after(async function(){if(browser)await browser.close();if(server)await new Promise(function(done){server.close(done);});});
async function pageWith(options){
 options=options||{};var page=await browser.newPage({viewport:{width:options.width||1440,height:1000},hasTouch:!!options.touch}),calls=[],errors=[],custom=Object.create(null),econPreference=null;
 page.on('pageerror',function(e){errors.push(e.message);});
 await page.addInitScript(function(selected){if(localStorage.getItem('iatb.indicators.selected.v2')==null)localStorage.setItem('iatb.indicators.selected.v2',JSON.stringify(selected));},options.selected||['rsi','macd']);
 await page.route('**/*',async function(route){var req=route.request(),u=new URL(req.url()),p=u.pathname;
  if(u.origin===base&&(p==='/ia-trading'||p.startsWith('/assets/')))return route.continue();
  if(u.origin===base&&p==='/settings')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Navigation fixture</title><a href="/ia-trading">Trading IA</a>'});
  assert.equal(u.origin,base,'no external requests in QA');var d={ok:true,items:[],events:[],strategies:[],instances:[],logs:[]};
  if(p==='/api/status')d={ok:true,version:'2.1.0',role:'USER',defaultMarketSource:'KRAKEN',defaultSymbol:'BTCUSD',defaultInterval:'1m',candles:240,memoryMB:64,openai:false};
  if(p==='/auth21/csrf')d={csrfToken:'fixture-csrf'};
  if(p==='/auth21/preferences'){if(req.method()==='PUT'){const b=req.postDataJSON();assert.equal(req.headers()['x-iatb-csrf'],'fixture-csrf');assert.deepEqual(Object.keys(b).sort(),['key','scope','value']);assert.equal(b.scope,'chart');assert.equal(b.key,'chartEconomicEvents');econPreference=b.value;}d={value:econPreference};}
  if(p==='/api/health')d={ok:true,version:'2.1.0'};
  if(p==='/ui-data/market/candles'){var sym=u.searchParams.get('symbol'),tf=u.searchParams.get('interval');var marketRows=candles(sym,tf);if(options.noVolume)marketRows.forEach(function(row){row[5]=null});d={ok:true,candles:marketRows,provider:u.searchParams.get('exchange'),timeframe:tf,timeframeValidated:true};}
  if(p.startsWith('/communication/v1/ui/')){
   var b=req.postDataJSON(),a=b.action,args=b.arguments||{};calls.push(b);assert(!/^trading\./.test(a),'no Trading Engine action');
   if(a==='fundamental.calendar.upcoming'){if(options.unavailable)return route.fulfill({status:503,json:{error:'UNAVAILABLE'}});d={ok:true,calendars:options.empty?{}:calendarFixture()};}
   if(a==='marketdata.health')d={ok:true,providers:['KRAKEN','BINANCE','OKX'].map(function(id){return{id:id,label:id,type:'CEX',enabled:true,capabilities:['candles']};})};
   if(a==='marketdata.symbols')d={ok:true,symbols:[{symbol:'BTCUSD',label:'BTC/USD'},{symbol:'ETHUSD',label:'ETH/USD'}]};
   if(a==='indicator.registry.reload')d={ok:true,items:registry.list().concat(Object.keys(custom).map(function(id){var d=custom[id];return{id:id,name:d.name,category:d.category,kind:'Custom',display:d.display,outputs:d.outputs,chartAvailable:true}})),status:registry.status()};
   if(a==='indicator.settings.get')d={ok:true,settings:{indicators:registry.list().map(function(x){return{id:x.id,enabled:true};})}};
   if(a==='indicator.definition.create'){var def=args.definition,v=require('../../Indicators/Engine/indicator_registry').validateDefinition(def,'Custom',null,false);if(!v.ok)return route.fulfill({status:400,json:{error:v.errors.join('; ')}});custom[def.id]=def;d={ok:true,id:def.id};}
   if(a==='indicator.compute_batch_data'||a==='indicator.compute_batch'){
    if(options.delay)await new Promise(function(done){setTimeout(done,options.delay);});
    if(options.fail) return route.fulfill({status:503,json:{error:'FIXTURE_INDICATOR_UNAVAILABLE'}});
    var rows=args.candles||candles(args.symbol,args.timeframe);d={symbol:args.symbol,timeframe:args.timeframe,source:args.source,results:Engine.computeBatch({get:function(id){return custom[id]||registry.get(id)},safeNative:registry.safeNative},rows,args.requests),provenance:{candleCount:rows.length}};
   }
   d={protocol:'CP/1',status:'OK',data:d};
  }
  await route.fulfill({json:d});
 });
 await page.goto(base+'/ia-trading');await page.waitForFunction(function(){return window.IATBActiveChartController&&window.IATBActiveChartController.rows.length===240;});
 if(options.waitBatch!==false)await page.waitForFunction(function(){return window.IATBIndicatorBatch&&window.IATBIndicatorBatch.results.length>0;});
 await page.waitForFunction(function(){return window.IATBChartWorkspace&&window.IATBIndicatorStudio.mounted});return{page:page,calls:calls,errors:errors};
}
test('Firefox: real canvas line pixels, exact badges, grouping, keyboard tooltip and future navigation without synthetic candles',async()=>{
 const c=await pageWith(),p=c.page;
 try{
  await p.waitForSelector('.iatbEconomicBadge');
  const metrics=await p.evaluate(()=>{
   const c=IATBActiveChartController,e=c.economicMarkers.find(e=>e.label==='FOMC controlled'),x=c.timeToCoordinate(e.time),d=devicePixelRatio;
   const sample=()=>{const a=c.ctx.getImageData(Math.floor(x*d)-2,Math.floor(c._geom.priceTop+110)*d,5*d,120*d).data;return Array.from(a)};
   c.draw();const withLine=sample(),saved=c.economicMarkers;c.economicMarkers=[];c.draw();const without=sample();c.economicMarkers=saved;c.draw();
   return {pixels:withLine.reduce((n,v,i)=>n+(v!==without[i]?1:0),0),groups:c.economicGroups.map(g=>({size:g.events.length,x:g.x})),x:x,count:c.rows.length};
  });
  assert.ok(metrics.pixels>30,'dashed translucent line changes real Canvas pixels');assert.ok(metrics.groups.some(g=>g.size===2));
  const fed=p.locator('.iatbEconomicBadge').filter({hasText:'FED'});await fed.focus();
  await p.waitForSelector('.iatbEconomicTooltip:not([hidden])');const tip=await p.locator('.iatbEconomicTooltip').innerText();
  for(const text of ['FOMC controlled','Press conference','Prévision : 0','Précédent : 0.5','Réel : 0.25','Indisponible'])assert.ok(tip.includes(text),text);
  assert.equal(await fed.locator('span').first().evaluate(e=>getComputedStyle(e).color),'rgb(246, 191, 97)');
  assert.equal(await p.locator('.iatbEconomicBadge span').filter({hasText:'CME'}).first().evaluate(e=>getComputedStyle(e).color),'rgb(90, 207, 255)');
  if(process.env.IATB_QA_ARTIFACTS){fs.mkdirSync(process.env.IATB_QA_ARTIFACTS,{recursive:true});await p.screenshot({path:path.join(process.env.IATB_QA_ARTIFACTS,'events-tooltip-firefox.png')});}
  await p.keyboard.press('Escape');assert.equal(await p.locator('.iatbEconomicTooltip').isVisible(),false);
  assert.equal(await p.locator('.iatbEconomicChip,#iatbChartEconomicRail').count(),0);
  await p.evaluate(()=>{const c=IATBActiveChartController;c.locateEconomicEvent(c.economicMarkers.find(e=>e.label==='Future expiration'))});
  await p.waitForFunction(()=>IATBActiveChartController.panOffset<0);
  assert.equal(await p.evaluate(()=>IATBActiveChartController.rows.length),metrics.count);
  assert.ok(await p.locator('.iatbEconomicBadge').filter({hasText:'CME'}).count());
  const directory=process.env.IATB_QA_ARTIFACTS;if(directory){fs.mkdirSync(directory,{recursive:true});await p.screenshot({path:path.join(directory,'events-future-firefox.png')});}
  assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close()}
});
test('Firefox: zoom, pan, timeframe/context changes keep event and drawing coordinates consistent',async()=>{
 const {page:p,errors}=await pageWith();try{
 await p.waitForSelector('.iatbEconomicBadge');
 const result=await p.evaluate(()=>{
  const c=IATBActiveChartController,ev=c.economicMarkers[0],t=ev.time;
  c.setVisibleCount(80);c.panOffset=12;c.draw();let x=c.timeToCoordinate(t);const roundtrip=Math.abs(c.coordinateToTime(x)-t);
  const drawing=IATBChartDrawings.instance.xy({time:t,price:60000});
  c.setContext('ETHUSD','5m','BINANCE');const step=300;c.setCandles(Array.from({length:100},(_,i)=>({time:t-80*step+i*step,open:100,high:103,low:98,close:101,volume:1})));c.draw();
  return {roundtrip:roundtrip,drawing:Math.abs(drawing.x-x),changed:Math.abs(c.coordinateToTime(c.timeToCoordinate(t))-t),groups:c.economicGroups.length};
 });assert.ok(result.roundtrip<1e-5);assert.ok(result.drawing<1e-5);assert.ok(result.changed<1e-5);assert.ok(result.groups>0);assert.deepStrictEqual(errors,[]);
 }finally{await p.close()}
});
test('Firefox: empty/unavailable calendar gives no invented badges or lines',async()=>{
 for(const options of [{empty:true},{unavailable:true}]){const {page:p,errors}=await pageWith(options);try{await p.waitForTimeout(100);assert.equal(await p.locator('.iatbEconomicBadge').count(),0);assert.equal(await p.evaluate(()=>IATBActiveChartController.economicMarkers.length),0);assert.deepStrictEqual(errors,[])}finally{await p.close()}}
});
test('Firefox: touchscreen badge exposes all details and dismisses on Escape',async()=>{
 const {page:p}=await pageWith({touch:true});try{await p.waitForSelector('.iatbEconomicBadge');await p.locator('.iatbEconomicBadge').first().tap();assert.equal(await p.locator('.iatbEconomicTooltip').isVisible(),true);await p.keyboard.press('Escape');assert.equal(await p.locator('.iatbEconomicTooltip').isVisible(),false)}finally{await p.close()}
});
test('Firefox: expanded toolbar remains responsive and account event preference survives reload',async()=>{
 const {page:p,errors}=await pageWith();try{
  await p.waitForSelector('.iatbEconomicBadge');
  const toggle=p.locator('#iatbEconomicToggle');
  await Promise.all([p.waitForResponse(r=>r.url().endsWith('/auth21/preferences')&&r.request().method()==='PUT'),toggle.click()]);await p.waitForFunction(()=>IATBActiveChartController.economicMarkers.length===0);
  assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.equal(await p.locator('.iatbEconomicBadge').count(),0);
  await p.reload();await p.waitForSelector('#iatbEconomicToggle[aria-pressed="false"]');
  assert.equal(await p.locator('.iatbEconomicBadge').count(),0);await toggle.click();await p.waitForSelector('.iatbEconomicBadge');
  await p.locator('#chartFocusBtn').click();
  for(const width of [390,768,1024,1280,1440]){
   await p.setViewportSize({width,height:1000});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const state=await p.evaluate(()=>{
    const controls=document.querySelector('#chartArea>.controls'),r=controls.getBoundingClientRect(),host=document.getElementById('iaChartHost').getBoundingClientRect();
    const nodes=Array.from(controls.querySelectorAll('#iatbPairPickerButton,#iatbExchangePickerButton,#interval,select[aria-label="Type de graphique"],#chartRestoreBtn,#iatbEconomicToggle,#indicatorStudioButton,button[aria-label="Afficher les outils de dessin"],button[aria-label="Paramètres d’affichage"]'));
    const bounded=nodes.length===9&&nodes.every(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1});
    const c=IATBActiveChartController,g=c.economicGroups[0];if(g)c.showEconomicTooltip(g);
    const t=c.economicTooltip.getBoundingClientRect(),h=c.container.getBoundingClientRect();
    return{bounded,canvasBelow:host.top>=r.bottom-1,viewport:document.getElementById('chartArea').getBoundingClientRect().bottom<=innerHeight+1,top:r.top,overflow:controls.scrollWidth-controls.clientWidth,tooltip:!g||t.left>=h.left&&t.right<=h.right+1&&t.top>=h.top&&t.bottom<=h.bottom+1};
   });
   if(process.env.IATB_QA_ARTIFACTS){fs.mkdirSync(process.env.IATB_QA_ARTIFACTS,{recursive:true});await p.screenshot({path:path.join(process.env.IATB_QA_ARTIFACTS,'expanded-'+width+'-firefox.png'),fullPage:true});}
   assert.ok(state.bounded,JSON.stringify({width,...state}));assert.ok(state.viewport,JSON.stringify({width,...state}));assert.ok(state.canvasBelow,JSON.stringify({width,...state}));assert.ok(state.top>=76,JSON.stringify({width,...state}));assert.ok(state.overflow<=1,JSON.stringify({width,...state}));assert.ok(state.tooltip,JSON.stringify({width,...state}));
  }
  assert.equal(await p.locator('button[title*="PNG"]').count(),0);
  await p.keyboard.press('Escape');await p.locator('#chartRestoreBtn').click();assert.deepStrictEqual(errors,[]);
 }finally{await p.close()}
});
