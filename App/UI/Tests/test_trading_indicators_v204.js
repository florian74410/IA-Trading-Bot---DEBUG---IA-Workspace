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
 options=options||{};var page=await browser.newPage({viewport:{width:options.width||1440,height:1000}}),calls=[],errors=[];
 page.on('pageerror',function(e){errors.push(e.message);});
 await page.addInitScript(function(selected){localStorage.setItem('iatb.indicators.selected.v2',JSON.stringify(selected));},options.selected||['rsi','macd']);
 await page.route('**/*',async function(route){var req=route.request(),u=new URL(req.url()),p=u.pathname;
  if(u.origin===base&&(p==='/ia-trading'||p.startsWith('/assets/')))return route.continue();
  assert.equal(u.origin,base,'no external requests in QA');var d={ok:true,items:[],events:[],strategies:[],instances:[],logs:[]};
  if(p==='/api/status')d={ok:true,version:'2.1.0',role:'USER',defaultMarketSource:'KRAKEN',defaultSymbol:'BTCUSD',defaultInterval:'1m',candles:240,memoryMB:64,openai:false};
  if(p==='/api/health')d={ok:true,version:'2.1.0'};
  if(p==='/ui-data/market/candles'){var sym=u.searchParams.get('symbol'),tf=u.searchParams.get('interval');var marketRows=candles(sym,tf);if(options.noVolume)marketRows.forEach(function(row){row[5]=null});d={ok:true,candles:marketRows,provider:u.searchParams.get('exchange'),timeframe:tf,timeframeValidated:true};}
  if(p.startsWith('/communication/v1/ui/')){
   var b=req.postDataJSON(),a=b.action,args=b.arguments||{};calls.push(b);assert(!/^trading\./.test(a),'no Trading Engine action');
   if(a==='marketdata.health')d={ok:true,providers:['KRAKEN','BINANCE','OKX'].map(function(id){return{id:id,label:id,type:'CEX',enabled:true,capabilities:['candles']};})};
   if(a==='marketdata.symbols')d={ok:true,symbols:[{symbol:'BTCUSD',label:'BTC/USD'},{symbol:'ETHUSD',label:'ETH/USD'}]};
   if(a==='indicator.registry.reload')d={ok:true,items:registry.list(),status:registry.status()};
   if(a==='indicator.settings.get')d={ok:true,settings:{indicators:registry.list().map(function(x){return{id:x.id,enabled:true};})}};
   if(a==='indicator.compute_batch_data'||a==='indicator.compute_batch'){
    if(options.delay)await new Promise(function(done){setTimeout(done,options.delay);});
    if(options.fail) return route.fulfill({status:503,json:{error:'FIXTURE_INDICATOR_UNAVAILABLE'}});
    var rows=args.candles||candles(args.symbol,args.timeframe);d={symbol:args.symbol,timeframe:args.timeframe,source:args.source,results:Engine.computeBatch(registry,rows,args.requests),provenance:{candleCount:rows.length}};
   }
   d={protocol:'CP/1',status:'OK',data:d};
  }
  await route.fulfill({json:d});
 });
 await page.goto(base+'/ia-trading');await page.waitForFunction(function(){return window.IATBActiveChartController&&window.IATBActiveChartController.rows.length===240;});
 if(options.waitBatch!==false)await page.waitForFunction(function(){return window.IATBIndicatorBatch&&window.IATBIndicatorBatch.results.length>0;});
 return{page:page,calls:calls,errors:errors};
}
test('computed RSI/MACD are visible below the real Trading chart',async function(){
 var c=await pageWith(),p=c.page;try{
  assert(await p.locator('#indicatorDock').isVisible(),'calculated indicators must not be hidden by workspace CSS');
  var layout=await p.evaluate(function(){var dock=document.querySelector('#indicatorDock'),area=document.querySelector('#chartArea'),body=document.querySelector('#indicatorDockBody');return{height:dock.clientHeight,clipped:dock.getBoundingClientRect().bottom>area.getBoundingClientRect().bottom+1,scroll:body.scrollHeight>body.clientHeight};});assert(layout.height>=218);assert.equal(layout.clipped,false,'entire dock must be inside the chart area');assert(layout.scroll,'multiple panes remain reachable by scrolling');
  await p.waitForFunction(function(){return document.querySelector('[data-indicator-id=macd]').__renderState&&document.querySelector('[data-indicator-id=macd]').__renderState.state==='DRAWN'});
  assert.equal(await p.locator('#indicatorDockBody [data-indicator-id]').count(),2);assert.deepStrictEqual(c.errors,[]);
  var macd=await p.locator('[data-indicator-id=macd]').evaluate(function(el){var state=el.__renderState,data=el.querySelector('canvas').getContext('2d').getImageData(0,0,el.querySelector('canvas').width,el.querySelector('canvas').height).data,n=0;for(var i=0;i<data.length;i+=4)if((data[i]>200&&data[i+1]<130&&data[i+2]>90)||(data[i]<80&&data[i+1]>150&&data[i+2]>100))n++;return{histogram:state.series.find(function(s){return s.key==='histogram'}).render,pixels:n,min:state.min,max:state.max};});assert.equal(macd.histogram,'histogram');assert(macd.pixels>30,'actual histogram pixels, not only a READY label');assert(macd.min<=0&&macd.max>=0);
  if(process.env.IATB_INDICATOR_SCREENSHOT)await p.locator('#chartArea').screenshot({path:process.env.IATB_INDICATOR_SCREENSHOT});
 }finally{await p.close();}
});

 test('price overlays retain warm-up gaps, draw on candles and do not create duplicate oscillator charts',async function(){
 var c=await pageWith({selected:['ema','parabolic_sar','bollinger_bands']}),p=c.page;try{
  await p.waitForFunction(function(){return Object.keys(window.IATBActiveChartController.indicatorSeries).length===5});
  var state=await p.evaluate(function(){var ctl=window.IATBActiveChartController,cv=ctl.canvas,pixels=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data,n=0;for(var i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-77)<8&&Math.abs(pixels[i+1]-183)<8&&Math.abs(pixels[i+2]-239)<8)n++;return{points:ctl.indicatorSeries['ind:parabolic_sar:value'].options.render,warm:ctl.indicatorSeries['ind:ema:value'].data.slice(0,19).map(function(p){return p.value}),pricePixels:n,rendered:ctl.getRenderState().rendered};});
  assert.equal(state.points,'points');assert(state.warm.every(function(x){return x===null}));assert(state.pricePixels>30);assert.equal(state.rendered,100);assert.equal(await p.locator('#indicatorDockBody canvas').count(),0);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
 test('oscillators follow candle timestamps through pan, zoom and resize',async function(){
 var c=await pageWith(),p=c.page;try{
  await p.evaluate(function(){var ctl=window.IATBActiveChartController;ctl.setVisibleCount(40);ctl.panOffset=120;ctl.invalidate();});
  await p.waitForFunction(function(){var ctl=window.IATBActiveChartController,el=document.querySelector('[data-indicator-id=rsi]');return el.__renderState&&el.__renderState.from===ctl.visibleRows()[0].time});
  for(var width of [1440,1024,768,390]){
   await p.setViewportSize({width:width,height:1000});await p.waitForTimeout(100);
   var aligned=await p.evaluate(function(){var ctl=window.IATBActiveChartController,pane=document.querySelector('[data-indicator-id=rsi]'),s=pane.__renderState,rows=ctl.visibleRows();return{from:s.from,to:s.to,first:rows[0].time,last:rows[rows.length-1].time,width:s.plotWidth,main:ctl._geom.cw,offset:pane.querySelector('canvas').getBoundingClientRect().left+s.plotLeft-ctl.canvas.getBoundingClientRect().left-ctl._geom.L,count:s.pointCount};});
   assert.equal(aligned.from,aligned.first);assert.equal(aligned.to,aligned.last);assert.equal(aligned.width,aligned.main);assert(Math.abs(aligned.offset)<1);assert(aligned.count>0);assert(await p.locator('#indicatorDock').isVisible());
   assert(await p.evaluate(function(){return document.querySelector('#indicatorDock').getBoundingClientRect().bottom<=document.querySelector('#chartArea').getBoundingClientRect().bottom+1;}),'dock clipped at '+width);
  }
  await p.setViewportSize({width:1440,height:1000});var before=c.calls.filter(function(x){return x.action==='indicator.compute_batch_data'}).length;await p.getByRole('button',{name:'Paramètres d’affichage',exact:true}).click();await p.selectOption('#visible','150');await p.waitForTimeout(400);assert.equal(c.calls.filter(function(x){return x.action==='indicator.compute_batch_data'}).length,before,'a visible-window change reuses the computed batch');
  await p.evaluate(function(){window.IATBActiveChartController.setVisibleCount(60,false)});await p.waitForTimeout(80);assert.equal(await p.locator('[data-indicator-id=rsi]').evaluate(function(e){return e.__renderState.series[0].points.length}),60);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
 test('null values, warming, missing outputs and nullable scale bounds stay explicit',async function(){
 var c=await pageWith({selected:['rsi']}),p=c.page;try{
  await p.evaluate(function(){var rows=window.IATBActiveChartController.rows,r={id:'fixture',name:'Warm fixture',state:'WARMING',candleCount:3,requiredCandles:15,display:{min:null,max:null},outputs:{hidden:{chart:false}},latest:{value:null},times:rows.map(function(c){return c.time*1000}),values:{value:rows.map(function(){return null}),hidden:rows.map(function(){return 10000})}};window.IATBIndicatorJsonReader.accept([{ok:true,result:r}]);});
  await p.waitForTimeout(50);assert.match(await p.locator('.indicatorReaderNoData').innerText(),/Chauffe/);assert.equal(await p.locator('.indicatorReaderLatest').innerText(),'value --');assert.equal(await p.locator('[data-indicator-id=fixture]').evaluate(function(e){return e.__renderState.pointCount}),0);
  await p.evaluate(function(){var r=window.IATBIndicatorJsonReader.batch[0].result;r.values.value=r.times.map(function(_,i){return -50+i/10});window.IATBIndicatorJsonReader.accept([{ok:true,result:r}]);});await p.waitForTimeout(50);
  var s=await p.locator('[data-indicator-id=fixture]').evaluate(function(e){return e.__renderState});assert(s.max<0,'null scale max must not become zero');assert.equal(s.series.length,1);assert.equal(s.pointCount,100);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
 test('provider errors keep candles and show errors without claiming a rendered indicator',async function(){
 var c=await pageWith({fail:true}),p=c.page;try{await p.waitForFunction(function(){return document.querySelectorAll('.indicatorReaderError').length===2});assert.equal(await p.locator('#indicatorDockBody canvas').count(),0);assert.match(await p.locator('.iatbIndStatus').innerText(),/FIXTURE_INDICATOR_UNAVAILABLE/);assert.equal(await p.evaluate(function(){return window.IATBActiveChartController.getRenderState().rendered}),100);assert.deepStrictEqual(c.errors,[]);}finally{await p.close();}
});
 test('late results never cross a source/timeframe change; pending work recomputes the current chart',async function(){
 var c=await pageWith({delay:700,waitBatch:false}),p=c.page;try{
  await p.waitForTimeout(50);await p.selectOption('#interval','5m');await p.selectOption('#exchangeSelect','BINANCE');await p.selectOption('#symbol','ETHUSD');
  await p.waitForFunction(function(){var b=window.IATBIndicatorBatch,c=window.IATBActiveChartController;return b&&b.results[0]&&b.results[0].ok&&b.context.timeframe==='5m'&&b.context.exchange==='BINANCE'&&b.context.symbol==='ETHUSD'&&c.context.source==='BINANCE'&&document.querySelector('[data-indicator-id=rsi]');});
  var state=await p.evaluate(function(){var b=window.IATBIndicatorBatch,c=window.IATBActiveChartController;return{context:b.context,times:b.results[0].result.times,rows:c.rows.map(function(r){return r.time*1000})};});assert.deepStrictEqual(state.times,state.rows);assert.equal(state.context.timeframe,'5m');assert.equal(state.context.exchange,'BINANCE');assert.equal(state.context.symbol,'ETHUSD');assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
 test('concurrent refreshes share one compute and one chart dispatch; removing indicators clears the view',async function(){
 var c=await pageWith(),p=c.page;try{
  var before=c.calls.filter(function(x){return x.action==='indicator.compute_batch_data'}).length;
  var n=await p.evaluate(async function(){var ctl=window.IATBActiveChartController,original=ctl.applyIndicatorBatch,count=0;ctl.applyIndicatorBatch=function(b){count++;return original.call(this,b)};await Promise.all([IATBIndicatorUI.refresh(true),IATBIndicatorUI.refresh(true),IATBIndicatorUI.refresh(true)]);return count;});
  assert.equal(c.calls.filter(function(x){return x.action==='indicator.compute_batch_data'}).length,before+1);assert.equal(n,1);await p.evaluate(async function(){await IATBIndicatorUI.remove('rsi');await IATBIndicatorUI.remove('macd')});assert.equal(await p.locator('#indicatorDockBody .indicatorJsonPane').count(),0);assert.equal(await p.evaluate(function(){return Object.keys(IATBActiveChartController.indicatorSeries).length}),0);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});

test('all 20 native indicators and JSON output render modes remain consumable',async function(){
 var c=await pageWith({selected:['rsi']}),p=c.page;try{
  var batches=registry.list().filter(function(x){return x.id!=='liquidity_heatmap'}).map(function(x){return Engine.computeBatch(registry,candles('BTCUSD','1m'),[{id:x.id,params:{}}])[0]});
  // Use the current chart timestamps, as the real compute_data route does.
  await p.evaluate(function(results){var ctl=window.IATBActiveChartController;results.forEach(function(x){x.result.times=ctl.rows.map(function(row){return row.time*1000})});ctl.applyIndicatorBatch(results);},batches);await p.waitForTimeout(100);
  assert.equal(await p.locator('[data-indicator-id]').count(),batches.filter(function(x){return x.result.display.pane!=='price'}).length);assert.equal(await p.evaluate(function(){return IATBActiveChartController.indicatorBatch.length}),20);assert.equal(await p.locator('.indicatorReaderError').count(),0);
  var states=await p.locator('#indicatorDockBody .indicatorJsonPane').evaluateAll(function(panes){return panes.map(function(p){return p.__renderState.state})});assert(states.every(function(s){return s==='DRAWN'||s==='OVERLAY'}));
  await p.evaluate(function(){var ctl=window.IATBActiveChartController,times=ctl.rows.map(function(r){return r.time}),values=times.map(function(_,i){return i%10===0?null:Math.sin(i/7)});window.IATBIndicatorJsonReader.accept([{ok:true,result:{id:'custom_fixture',name:'Custom output fixture',state:'READY',display:{pane:'separate',min:null,max:null},times:times,values:{area:values,markers:values,bars:values},outputs:{area:{render:'area'},markers:{render:'markers'},bars:{render:'bars'}}}}]);});await p.waitForTimeout(50);
  assert.equal(await p.locator('[data-indicator-id=custom_fixture]').evaluate(function(e){return e.__renderState.series.length}),3);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});

test('focus/restore and a page reload preserve selected indicator rendering',async function(){
 var c=await pageWith(),p=c.page;try{
  await p.click('#chartFocusBtn');await p.waitForTimeout(150);assert(await p.locator('#indicatorDock').isVisible());assert(await p.locator('#chartRestoreBtn').isVisible());
  assert(await p.evaluate(function(){return document.querySelector('#indicatorDock').getBoundingClientRect().bottom<=innerHeight+1}));
  await p.click('#chartRestoreBtn');await p.reload();await p.waitForFunction(function(){return document.querySelector('[data-indicator-id=rsi]')&&document.querySelector('[data-indicator-id=rsi]').__renderState&&document.querySelector('[data-indicator-id=rsi]').__renderState.state==='DRAWN'});assert.equal(await p.locator('[data-indicator-id]').count(),2);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});

test('removing a selection during an in-flight compute cannot restore removed series',async function(){
 var c=await pageWith({delay:700,waitBatch:false}),p=c.page;try{
  await p.evaluate(async function(){await Promise.all([IATBIndicatorUI.remove('rsi'),IATBIndicatorUI.remove('macd')])});await p.waitForTimeout(100);
  assert.equal(await p.locator('[data-indicator-id]').count(),0);assert.deepStrictEqual(await p.evaluate(function(){return IATBIndicatorUI.state().selected}),[]);assert.equal(await p.evaluate(function(){return Object.keys(IATBActiveChartController.indicatorSeries).length}),0);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});

test('an indicator requiring missing volume fails explicitly while RSI still renders',async function(){
 var c=await pageWith({selected:['rsi','mfi'],noVolume:true}),p=c.page;try{
  await p.waitForFunction(function(){var r=document.querySelector('[data-indicator-id=rsi]');return r&&r.__renderState&&r.__renderState.state==='DRAWN'});
  assert.equal(await p.locator('.indicatorReaderError').count(),1);assert.match(await p.locator('.iatbIndStatus').innerText(),/PARTIEL/);assert.match(await p.locator('.iatbIndResult.bad').innerText(),/Volume réel indisponible/);assert.equal(await p.locator('[data-indicator-id=mfi] canvas').count(),0);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
