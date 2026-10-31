'use strict';
// Local fixtures only. Real HTML/CSS/JS and Indicator Engine math; no external requests or live orders.
var test=require('node:test'),assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http');
var firefox=require('playwright').firefox,root=path.resolve(__dirname,'../..');
var Engine=require('../../Indicators/Engine/indicator_engine'),Registry=require('../../Indicators/Engine/indicator_registry').Registry;
var registry=new Registry(path.join(root,'Indicators')),browser,server,base,FIXTURE_NOW=Date.now();
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
 options=options||{};var page=await browser.newPage({viewport:{width:options.width||1440,height:1000}}),calls=[],errors=[],custom=Object.create(null);
 page.on('pageerror',function(e){errors.push(e.message);});
 await page.addInitScript(function(selected){if(localStorage.getItem('iatb.indicators.selected.v2')==null)localStorage.setItem('iatb.indicators.selected.v2',JSON.stringify(selected));},options.selected||['rsi','macd']);
 await page.route('**/*',async function(route){var req=route.request(),u=new URL(req.url()),p=u.pathname;
  if(u.origin===base&&(p==='/ia-trading'||p.startsWith('/assets/')))return route.continue();
  if(u.origin===base&&p==='/settings')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Navigation fixture</title><a href="/ia-trading">Trading IA</a>'});
  assert.equal(u.origin,base,'no external requests in QA');var d={ok:true,items:[],events:[],strategies:[],instances:[],logs:[]};
  if(p==='/api/status')d={ok:true,version:'2.1.0',role:'USER',defaultMarketSource:'KRAKEN',defaultSymbol:'BTCUSD',defaultInterval:'1m',candles:240,memoryMB:64,openai:false};
  if(p==='/api/health')d={ok:true,version:'2.1.0'};
  if(p==='/ui-data/market/candles'){var sym=u.searchParams.get('symbol'),tf=u.searchParams.get('interval');var marketRows=candles(sym,tf);if(options.noVolume)marketRows.forEach(function(row){row[5]=null});d={ok:true,candles:marketRows,provider:u.searchParams.get('exchange'),timeframe:tf,timeframeValidated:true};}
  if(p.startsWith('/communication/v1/ui/')){
   var b=req.postDataJSON(),a=b.action,args=b.arguments||{};calls.push(b);assert(!/^trading\./.test(a),'no Trading Engine action');
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
test('PR7 base: V2 Ichimoku/Bollinger surfaces and MACD/RSI panes are loaded',async function(){
 var c=await pageWith({selected:['ichimoku_cloud','bollinger_bands','macd','rsi','supertrend']}),p=c.page;try{
  await p.waitForFunction(function(){return window.IATBIndicatorVisualV2&&document.querySelector('[data-indicator-id=macd]')&&document.querySelector('[data-indicator-id=macd]').__renderState});
  var state=await p.evaluate(function(){var ctl=IATBActiveChartController,cv=ctl.canvas,a=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data,n=0;for(var i=0;i<a.length;i+=4)if(a[i+1]>40&&a[i+1]>a[i]*1.3&&a[i+1]>a[i+2]*1.1)n++;return{layers:ctl.indicatorBatch.filter(function(x){return x.result&&x.result.display.visual&&x.result.display.visual.layers}).length,pixels:n,panes:document.querySelectorAll('#indicatorDockBody [data-indicator-id]').length};});
  assert(state.layers>=2);assert(state.pixels>100);assert.equal(state.panes,2);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});

async function drag(p,tool,ax,ay,bx,by){await p.locator('[data-tool="'+tool+'"]').click();var box=await p.locator('#iaChartHost').boundingBox(),geo=await p.evaluate(function(){return IATBActiveChartController._geom});function point(x,y){return{x:box.x+geo.L+x*geo.cw,y:box.y+geo.priceTop+y*geo.priceH}}var a=point(ax,ay),b=point(bx,by);await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps:6});await p.mouse.up();return{a:a,b:b};}
async function items(p){return p.evaluate(function(){return IATBChartDrawings.instance.items})}
async function openStudio(p){await p.locator('#indicatorStudioButton').click();await p.waitForSelector('#indicatorStudio[open]')}
test('toolbar uses canonical market/pair controls, shows supported chart types and captures actual canvases',async function(){
 var c=await pageWith(),p=c.page;try{
  assert.equal(await p.locator('#indicatorStudioButton').count(),1);assert.equal(await p.locator('.iatbIndPanel').count(),0);assert.equal(await p.locator('.iatbDrawDock').count(),1);assert.equal(await p.locator('#exchangeSelect').count(),1);assert.equal(await p.locator('#symbol').count(),1);
  assert.equal(await p.getByLabel('Type de graphique',{exact:true}).inputValue(),'candles');assert(await p.getByLabel('Type de graphique',{exact:true}).isDisabled());
  await p.selectOption('#interval','5m');await p.waitForFunction(function(){return IATBChartWorkspace.toolbar.controls.dataset.timeframe==='5m'});
  assert.equal(await p.getByRole('button',{name:'Capture du graphique PNG',exact:true}).count(),0);
  await p.getByRole('button',{name:'Paramètres d’affichage',exact:true}).click();assert(await p.getByRole('group',{name:'Paramètres d’affichage'}).isVisible());await p.keyboard.press('Escape');assert(!(await p.getByRole('group',{name:'Paramètres d’affichage'}).isVisible()));assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
test('Studio searches/categories, activation, model create/rename/load/update/delete and persistence',async function(){
 var c=await pageWith(),p=c.page;try{await openStudio(p);await p.getByLabel('Rechercher un indicateur',{exact:true}).fill('ichimoku');assert.equal(await p.locator('.cvIndicatorRow').count(),1);assert.match(await p.locator('.cvBadge').innerText(),/Sur prix/);
  await p.getByLabel('Activer Ichimoku Cloud',{exact:true}).check();await p.waitForFunction(function(){return IATBIndicatorUI.state().selected.includes('ichimoku_cloud')});await p.getByLabel('Rechercher un indicateur',{exact:true}).fill('');await p.getByLabel('Catégorie',{exact:true}).selectOption('momentum');assert((await p.locator('.cvIndicatorRow').count())>1);
  await p.getByRole('button',{name:'Mes modèles',exact:true}).click();await p.getByLabel('Nom du modèle',{exact:true}).fill('Cloud et momentum');await p.getByRole('button',{name:'Enregistrer le modèle',exact:true}).click();await p.getByLabel('Renommer Cloud et momentum',{exact:true}).fill('Mon modèle');await p.getByLabel('Renommer Cloud et momentum',{exact:true}).dispatchEvent('change');await p.getByRole('button',{name:'Mettre à jour',exact:true}).click();
  await p.getByRole('button',{name:'Indicateurs',exact:true}).click();await p.getByRole('button',{name:'Tout désactiver',exact:true}).click();await p.waitForFunction(function(){return IATBIndicatorUI.state().selected.length===0});await p.getByRole('button',{name:'Mes modèles',exact:true}).click();await p.getByRole('button',{name:'Charger',exact:true}).click();await p.waitForFunction(function(){return IATBIndicatorUI.state().selected.includes('ichimoku_cloud')});
  await p.getByRole('button',{name:'Fermer',exact:true}).click();await p.reload();await p.waitForFunction(function(){return window.IATBChartWorkspace&&IATBIndicatorUI.state().selected.includes('ichimoku_cloud')});await openStudio(p);await p.getByRole('button',{name:'Mes modèles',exact:true}).click();await p.getByLabel('Renommer Mon modèle',{exact:true}).waitFor({state:'visible'});assert.equal(await p.getByLabel('Renommer Mon modèle',{exact:true}).count(),1);await p.getByRole('button',{name:'Supprimer',exact:true}).click();assert.equal(await p.locator('.cvModelRow').count(),0);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
test('Studio decorates V2 metadata without recomputation or modifying engine outputs',async function(){
 var c=await pageWith({selected:['ichimoku_cloud','macd','rsi','bollinger_bands','supertrend']}),p=c.page;try{await openStudio(p);await p.getByRole('button',{name:'Réglages Ichimoku Cloud',exact:true}).click();var before=c.calls.filter(function(x){return x.action==='indicator.compute_batch_data'}).length;
  await p.getByLabel('Opacité couche 1',{exact:true}).fill('0.35');await p.getByLabel('Opacité couche 1',{exact:true}).dispatchEvent('change');assert.equal(await p.evaluate(function(){return IATBActiveChartController.indicatorBatch.find(function(x){return x.result.id==='ichimoku_cloud'}).result.display.visual.layers[0].opacity}),.35);
  await p.getByLabel('Afficher couche 1',{exact:true}).uncheck();assert.equal(await p.evaluate(function(){return IATBActiveChartController.indicatorBatch.find(function(x){return x.result.id==='ichimoku_cloud'}).result.display.visual.layers[0].visible}),false);
  assert.equal(c.calls.filter(function(x){return x.action==='indicator.compute_batch_data'}).length,before);await p.getByRole('button',{name:'← Catalogue',exact:true}).click();await p.getByRole('button',{name:'Visibilité Ichimoku Cloud',exact:true}).click();assert(!(await p.evaluate(function(){return IATBActiveChartController.indicatorBatch.some(function(x){return x.result.id==='ichimoku_cloud'})})));assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
test('draw real trend line, move anchor and object, lock/hide/delete, undo/redo and reload',async function(){
 var c=await pageWith(),p=c.page;try{var created=await drag(p,'trend',.3,.6,.65,.35);assert.equal((await items(p)).length,1);var original=(await items(p))[0];assert(original.points[0].time>1e9&&original.points[0].price>10000);
  await p.mouse.move(created.b.x,created.b.y);await p.mouse.down();await p.mouse.move(created.b.x+25,created.b.y+15,{steps:5});await p.mouse.up();assert.notDeepStrictEqual((await items(p))[0].points,original.points);
  var before=c.calls.filter(function(x){return x.action==='indicator.compute_batch_data'}).length;await p.getByLabel('Verrouillé',{exact:true}).check();assert((await items(p))[0].locked);await p.getByLabel('Visible',{exact:true}).uncheck();assert.equal((await items(p))[0].visible,false);await p.getByLabel('Visible',{exact:true}).check();assert.equal(c.calls.filter(function(x){return x.action==='indicator.compute_batch_data'}).length,before);
  await p.reload();await p.waitForFunction(function(){return window.IATBChartWorkspace&&IATBChartDrawings.instance.items.length===1});assert((await items(p))[0].locked);await p.getByLabel('Dessin à modifier',{exact:true}).selectOption(original.id);await p.locator('[data-tool=delete]').click();assert.equal((await items(p)).length,0);await p.locator('[data-tool=undo]').click();assert.equal((await items(p)).length,1);await p.locator('[data-tool=redo]').click();assert.equal((await items(p)).length,0);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
test('Fibonacci up/down, extension, horizontal/vertical, rectangle, measure, text and cancel are interactive',async function(){
 var c=await pageWith(),p=c.page;try{var tools=['fib','fib','horizontal','vertical','rectangle','measure','text'];for(var i=0;i<tools.length;i++)await drag(p,tools[i],.3,i===1?.3:.65,.65,i===1?.65:.3);var all=await items(p);assert.equal(all.length,7);assert.deepStrictEqual(all[0].levels,[0,.236,.382,.5,.618,.786,1]);
  await p.locator('[data-tool=extension]').click();var box=await p.locator('#iaChartHost').boundingBox();for(var point of [[.3,.65],[.6,.3],[.7,.5]])await p.mouse.click(box.x+point[0]*box.width,box.y+point[1]*box.height);assert.equal((await items(p)).at(-1).type,'extension');assert.equal((await items(p)).at(-1).points.length,3);
  var before=(await items(p)).length;await p.locator('[data-tool=trend]').click();await p.mouse.click(box.x+300,box.y+200);await p.keyboard.press('Escape');assert.equal((await items(p)).length,before);assert.equal(await p.evaluate(function(){return IATBChartDrawings.instance.mode}),'cursor');assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
test('Long/Short TP SL handles, ratios, quantity and invalid levels are checked without broker actions',async function(){
 var c=await pageWith(),p=c.page;try{for(var tool of ['long','short']){await drag(p,tool,.3,.6,.65,.3);var o=(await items(p)).at(-1);assert.equal(o.points.length,3);var m=await p.evaluate(function(x){return IATBChartDrawings.metrics(x.type,x.points[0].price,x.points[1].price,x.points[2].price)},o);assert(m.ok);assert(Math.abs(m.ratio-2)<1e-8);await p.getByLabel('Quantité théorique (actif de base)',{exact:true}).fill('2');await p.getByLabel('Quantité théorique (actif de base)',{exact:true}).dispatchEvent('change');assert.match(await p.locator('.cvDrawingProperties output').innerText(),/gain/);}
  var old=(await items(p)).at(-1).points[2].price;await p.getByLabel('SL',{exact:true}).fill('1');await p.getByLabel('SL',{exact:true}).dispatchEvent('change');assert.equal((await items(p)).at(-1).points[2].price,old);assert.match(await p.locator('.cvStatus').innerText(),/incohérents/);assert(c.calls.every(function(x){return !/^trading\./.test(x.action)}));assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
test('drawing anchors survive zoom/pan/timeframe and source changes with explicit scope',async function(){
 var c=await pageWith(),p=c.page;try{await drag(p,'trend',.3,.6,.65,.3);var initial=(await items(p))[0];await p.getByLabel('Tous timeframes',{exact:true}).check();await p.evaluate(function(){var c=IATBActiveChartController;c.setVisibleCount(60);c.panOffset=40;c.invalidate()});await p.waitForTimeout(80);assert.deepStrictEqual((await items(p))[0].points,initial.points);
  await p.selectOption('#interval','5m');await p.waitForTimeout(300);assert.equal((await items(p)).length,1);assert.equal((await items(p))[0].scope,'pair');await p.selectOption('#exchangeSelect','BINANCE',{force:true});await p.waitForTimeout(300);assert.equal((await items(p)).length,0);await p.selectOption('#exchangeSelect','KRAKEN',{force:true});await p.waitForTimeout(300);assert.equal((await items(p)).length,1);assert.deepStrictEqual((await items(p))[0].points,initial.points);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});

 test('JSON import uses the existing installation path and refreshes the Studio catalog',async function(){
 var c=await pageWith(),p=c.page;try{await openStudio(p);await p.getByRole('button',{name:'Importer JSON',exact:true}).click();var def=JSON.parse(fs.readFileSync(path.join(root,'Indicators/BuiltIn/RSI.indicator.json'),'utf8'));def.id='qa_import_rsi';def.name='QA Imported RSI';await p.getByLabel('Importer un indicateur JSON',{exact:true}).setInputFiles({name:'qa.indicator.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(def))});await p.waitForFunction(function(){return IATBIndicatorUI.state().selected.includes('qa_import_rsi')});assert(c.calls.some(function(x){return x.action==='indicator.definition.create'}));await p.getByRole('button',{name:'Indicateurs',exact:true}).click();await p.getByLabel('Rechercher un indicateur',{exact:true}).fill('QA Imported');assert.equal(await p.locator('.cvIndicatorRow').count(),1);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
 test('responsive workspace, actual pointer wheel, focus and handler cleanup preserve the renderer',async function(){
 var c=await pageWith({selected:['ichimoku_cloud','macd','rsi','bollinger_bands','supertrend']}),p=c.page;try{for(var w of [1440,1024,768,390]){await p.setViewportSize({width:w,height:1000});await openStudio(p);assert(await p.locator('#indicatorStudio').isVisible());assert(await p.locator('#indicatorStudio').evaluate(function(d){return d.getBoundingClientRect().width<=innerWidth}));await p.keyboard.press('Escape');assert(!(await p.locator('#indicatorStudio').isVisible()));}
  await p.setViewportSize({width:1440,height:1000});await p.waitForFunction(function(){var c=window.IATBActiveChartController,g=c&&c._geom;return !!(g&&g.cw>100&&g.priceH>100)});var plot=await p.evaluate(function(){var c=IATBActiveChartController,g=c._geom,r=c.canvas.getBoundingClientRect();return{x:r.left+g.L+g.cw/2,y:r.top+g.priceTop+g.priceH/2}});await p.mouse.move(plot.x,plot.y);var before=await p.evaluate(function(){return IATBActiveChartController.visibleCount});await p.mouse.wheel(0,-100);await p.waitForFunction(function(n){return IATBActiveChartController.visibleCount<n},before,{timeout:3000});
  await p.locator('#chartFocusBtn').click();assert(await p.locator('#chartRestoreBtn').isVisible());await p.locator('#chartRestoreBtn').click();await p.evaluate(function(){var w=IATBChartWorkspace,c=w.controller;w.destroy();window.qaClean={canvas:document.querySelectorAll('#iatbDrawSurface').length,dock:document.querySelectorAll('.iatbDrawDock').length,renderer:!!window.IATBIndicatorVisualV2};c.invalidate()});assert.deepStrictEqual(await p.evaluate(function(){return qaClean}),{canvas:0,dock:0,renderer:true});assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});

test('market/pair menus reuse native changes and restore keyboard focus',async function(){
 var c=await pageWith(),p=c.page;try{
  await p.locator('#iatbPairPickerButton').click();await p.locator('#iatbMarketPickerSearch').fill('ETH');await p.keyboard.press('Escape');assert(await p.locator('#iatbPairPickerButton').evaluate(function(b){return b===document.activeElement}));
  await p.locator('#iatbPairPickerButton').click();await p.locator('#iatbMarketPickerSearch').fill('ETH');await p.keyboard.press('Enter');await p.waitForFunction(function(){return IATBActiveChartController.context.symbol==='ETHUSD'});assert.match(await p.locator('#iatbPairPickerLabel').innerText(),/ETH/);
  await p.locator('#iatbExchangePickerButton').click();await p.locator('#iatbMarketPickerSearch').fill('BINANCE');await p.keyboard.press('Enter');await p.waitForFunction(function(){return IATBActiveChartController.context.source==='BINANCE'});assert.match(await p.locator('#iatbExchangePickerLabel').innerText(),/BINANCE/);assert.equal(await p.locator('#exchangeSelect').count(),1);assert.equal(await p.locator('#symbol').count(),1);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
test('workspace visual inspection captures use local fixtures only',async function(){
 if(!process.env.IATB_WORKSPACE_SCREENSHOTS)return;
 var c=await pageWith({selected:['ichimoku_cloud','bollinger_bands','macd','rsi']}),p=c.page;try{
  await drag(p,'long',.3,.6,.65,.3);await p.screenshot({path:process.env.IATB_WORKSPACE_SCREENSHOTS+'-chart.png'});await openStudio(p);await p.screenshot({path:process.env.IATB_WORKSPACE_SCREENSHOTS+'-studio.png'});
 }finally{await p.close();}
});

test('navigation away and back preserves drawings and does not duplicate handlers',async function(){
 var c=await pageWith(),p=c.page;try{
  await drag(p,'trend',.3,.6,.65,.3);var original=(await items(p))[0];await p.locator('a[href="/settings"]').first().click();await p.waitForURL('**/settings');await p.keyboard.press('Delete');await p.getByRole('link',{name:'Trading IA',exact:true}).click();await p.waitForFunction(function(){return window.IATBChartWorkspace&&IATBChartDrawings.instance.items.length===1});assert.equal(await p.locator('#indicatorStudioButton').count(),1);assert.equal(await p.locator('#iatbDrawSurface').count(),1);assert.deepStrictEqual((await items(p))[0].points,original.points);await drag(p,'horizontal',.3,.6,.65,.3);assert.equal((await items(p)).length,2);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});

test('integrated DEBUG preserves overlay counts and dock visibility through clear/reselect',async function(){
 var c=await pageWith({selected:['ichimoku_cloud','bollinger_bands']}),p=c.page;try{
  await p.waitForFunction(function(){return document.querySelector('#indicatorDock').dataset.overlayCount==='2'});assert(!(await p.locator('#indicatorDock').isVisible()));
  await p.evaluate(function(){return IATBIndicatorUI.configure(['ichimoku_cloud','rsi'])});await p.waitForFunction(function(){return document.querySelector('#indicatorDock').dataset.overlayCount==='1'&&document.querySelector('[data-indicator-id=rsi]')});assert(await p.locator('#indicatorDock').isVisible());
  await p.evaluate(function(){return IATBIndicatorUI.configure([])});await p.waitForFunction(function(){return !document.querySelector('#indicatorDock').classList.contains('active')});assert.equal(await p.locator('#indicatorDock').getAttribute('data-overlay-count'),'0');assert(!(await p.locator('#indicatorDock').isVisible()));assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});

test('v2.1.1 pair selector remains above chart and supports selection',async function(){
 var c=await pageWith(),p=c.page;
 try{
  await p.locator('#iatbPairPickerButton').click();
  var pop=p.locator('#iatbMarketPickerPopover');
  await pop.waitFor({state:'visible'});
  assert.equal(await pop.evaluate(function(el){return el.matches(':popover-open')}),true);
  var layer=await pop.evaluate(function(el){
   var r=el.getBoundingClientRect(),x=r.left+Math.min(30,r.width/2),y=r.top+Math.min(15,r.height/2);
   return{top:document.elementFromPoint(x,y)===el||el.contains(document.elementFromPoint(x,y)),fixed:getComputedStyle(el).position==='fixed'};
  });
  assert.equal(layer.fixed,true,'popover should not be clipped by chart');
  assert.equal(layer.top,true,'popover should own the hit-tested position');
  await pop.locator('[role=option]').filter({hasText:'ETH/USD'}).first().click();
  assert.equal(await p.locator('#symbol').inputValue(),'ETHUSD');
  assert.equal(await pop.isVisible(),false);
  assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
test('v2.1.1 drawing tool polish preserves accessible buttons and states',async function(){
 var c=await pageWith(),p=c.page;
 try{
  var dock=p.locator('.iatbDrawDock');
  assert.equal(await dock.locator('button').count(),14);
  var trend=dock.locator('[data-tool=trend]');
  await trend.click();
  assert.equal(await trend.getAttribute('aria-pressed'),'true');
  assert.equal(await dock.locator('[data-tool=cursor]').getAttribute('aria-pressed'),'false');
  assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
