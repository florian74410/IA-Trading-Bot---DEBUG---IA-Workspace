'use strict';
// Firefox UI tests, local fixtures only. Requires QA-installed playwright, never a runtime dependency.
var test=require('node:test'),assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http');
var firefox=require('playwright').firefox,root=path.resolve(__dirname,'../..');
var browser,server,base;
function fixtures(){var now=Date.now(),pools=Array.from({length:7},function(_,i){return{pairAddress:'fixture-'+i,base:{symbol:'WETH'},quote:{symbol:'USDC'},dexId:'Protocol-'+i+'-long-name',chainId:'ethereum',liquidityUsd:(i+1)*1000000,volume24hUsd:(i+1)*10000,labels:i===6?['0.3%']:[]};});
 return{snapshot:{timestamp:now,cefi:{observedAt:now,spotVolume24hUsd:1000000,exchanges:[{name:'Exchange A',volume24hUsd:600000,trustScore:9},{name:'Exchange B',volume24hUsd:400000,trustScore:8}],global:{totalVolume24hUsd:2000000,marketCapUsd:10000000},assets:[]},defi:{observedAt:now,tvlUsd:4000000,dexVolume24hUsd:200000,chains:[{name:'Ethereum',tvlUsd:3000000}],categories:[{name:'Lending',tvlUsd:2000000},{name:'DEX',tvlUsd:1000000}],dexProtocols:[{name:'Dex A',volume24hUsd:100000}],yieldPools:[],stablecoinMarketCapUsd:1100000,stablecoinHistory:[{timestamp:now-172800000,valueUsd:1000000},{timestamp:now-86400000,valueUsd:1200000},{timestamp:now,valueUsd:1100000}],dexVolumeHistory:Array.from({length:31},function(_,i){return{timestamp:now-i*86400000,valueUsd:10000+i*10};})},meta:{freshness:{cefi:{observedAt:now,expiresAt:now-1,ttlMs:45000},defi:{observedAt:now,expiresAt:now+90000,ttlMs:90000}}}},dex:{ok:true,canonicalSymbol:'ETH/USDC',pools:pools,bestPool:pools[0]},oi:{ok:true,cexOpenInterestUsd:900000,venues:[{source:'OKX',venueType:'CEX',openInterestNotionalUsd:900000},{source:'GMX',venueType:'DEX',openInterestNotionalUsd:100000}],coverage:{received:['OKX','GMX'],missing:['BYBIT']}},liq:{ok:true,count:2,coveredNotionalUsd:500,totalNotionalUsd:null,byProvider:[{provider:'OKX',count:2,knownEvents:1,observedNotionalUsd:500}],coverage:{providers:['OKX'],notionalKnownEvents:1,notionalUnknownEvents:1,notionalComplete:false}},streams:{ok:true,enabled:true,providers:[{provider:'OKX',state:'ONLINE'}]}};
}
test.before(async function(){
 server=http.createServer(function(req,res){var pathname=req.url.split('?')[0],file=pathname==='/statistiques'?'Frontend/Pages/statistiques_v1.0.html':pathname==='/assets/statistiques_v1.0.js'?'Frontend/JS/statistiques_v1.0.js':pathname==='/assets/statistiques_v1.0.css'?'Frontend/CSS/statistiques_v1.0.css':null;
  if(file){res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript');return res.end(fs.readFileSync(path.join(root,file)));}
  res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':'application/json');res.end(pathname.endsWith('.js')?'':'{}');
 });await new Promise(function(resolve){server.listen(0,'127.0.0.1',resolve);});base='http://127.0.0.1:'+server.address().port;
 browser=await firefox.launch({headless:true,firefoxUserPrefs:process.env.IATB_FIREFOX_CONTAINER==='1'?{'security.sandbox.content.level':0,'security.sandbox.gpu.level':0,'dom.ipc.forkserver.enable':false}:{}});
});
test.after(async function(){if(browser)await browser.close();if(server)await new Promise(function(resolve){server.close(resolve);});});
async function pageWith(options){
 options=options||{};var page=await browser.newPage({viewport:{width:options.width||1440,height:1000}}),data=fixtures(),calls=[],errors=[];
 page.on('pageerror',function(e){errors.push(e.message);});
 await page.route('**/communication/v1/ui/read',async function(route){var b=route.request().postDataJSON();calls.push(b);var a=b.action,d;
  if(options.delayAction===a)await new Promise(function(resolve){setTimeout(resolve,options.delayMs||1200);});
  if(options.failAction===a){await route.fulfill({status:503,json:{error:'FIXTURE_UNAVAILABLE'}});return;}
  if(a==='marketdata.financial.snapshot')d=data.snapshot;
  else if(a==='marketdata.financial.history'){var now=Date.now();d={ok:true,items:[{timestamp:now-7200000,cefi:{observedAt:now-7200000,spotVolume24hUsd:800000},defi:{observedAt:now-7200000,dexVolume24hUsd:150000}},{timestamp:now-1800000,cefi:{observedAt:now-1800000,spotVolume24hUsd:900000},defi:{observedAt:now-1800000,dexVolume24hUsd:180000}},{timestamp:now-900000,cefi:{observedAt:now-900000,spotVolume24hUsd:950000},defi:{observedAt:now-900000,dexVolume24hUsd:190000}}]};}
  else if(a==='marketdata.dex.liquidity.snapshot')d=options.emptyDex?{ok:true,pools:[]}:data.dex;
  else if(a==='marketdata.derivatives.open_interest')d=options.emptyOi?{ok:true,cexOpenInterestUsd:null,venues:[]}:data.oi;
  else if(a==='marketdata.liquidations.stats')d=options.emptyLiq?{ok:true,count:0,coveredNotionalUsd:0,coverage:{notionalKnownEvents:0,providers:[]}}:data.liq;
  else if(a==='marketdata.liquidations.streams')d=data.streams;
  else throw Error('Unexpected UI action '+a);
  await route.fulfill({json:{protocol:'CP/1',status:'OK',data:d}});
 });
 if(options.clock)await page.clock.install();
 await page.goto(base+'/statistiques#'+(options.section||'defi'));return{page:page,data:data,calls:calls,errors:errors};
}
test('Top pools rank real metrics and explain missing TVL/APY; cost uses one pool and documented units',async function(){
 var c=await pageWith(),p=c.page;try{
  await p.waitForFunction(function(){return document.querySelectorAll('.poolRankRow').length===10;});
  var groups=p.locator('.poolRankGroup');assert.equal(await groups.count(),4);
  assert.match(await groups.nth(2).innerText(),/TVL par pool non fournie/);assert.match(await groups.nth(3).innerText(),/APY non fourni/);
  assert.match(await groups.nth(0).locator('.poolRankRow').first().innerText(),/WETH\/USDC[\s\S]*Protocol-6-long-name[\s\S]*ethereum[\s\S]*7,0 M\$[\s\S]*DexScreener/);
  var cost=await p.locator('#defiExecutionCost').innerText();assert.match(cost,/COÛT TOTAL\s*Indisponible/);assert.match(cost,/fixture-6/);assert.match(cost,/30 \$/);assert.match(cost,/x·y=k/);assert.match(cost,/pas le slippage réel/);
  var impact=10000/(7000000/2+10000)*100;assert(cost.includes(impact.toLocaleString('fr-FR',{maximumFractionDigits:4})+' %'));assert(cost.includes((10000*impact/100).toLocaleString('fr-FR',{maximumFractionDigits:2})+' $'));
  await p.selectOption('#execTradeSize','1000');assert.match(await p.locator('#defiExecutionCost').innerText(),/3 \$/);
  await p.evaluate(function(){window.IATBStats.state.defi.swapLiquidity.pools.forEach(function(x){x.labels=[]});window.IATBStats.render();});assert.match(await p.locator('.execCostRow.fee').innerText(),/Frais DEX · N\/D/);
  // TVL and APY only appear when explicitly present; null is never a zero APY.
  await p.evaluate(function(){window.IATBStats.state.defi.yieldPools=[{symbol:'A/B',project:'Yield A',chain:'Chain A',tvlUsd:100,apy:0},{symbol:'C/D',project:'Yield B',chain:'Chain B',tvlUsd:200,apy:12},{symbol:'E/F',project:'Yield C',chain:'Chain C',tvlUsd:300,apy:null}];window.IATBStats.render();});
  assert.match(await groups.nth(2).locator('.poolRankRow').first().innerText(),/E\/F/);assert.equal(await groups.nth(3).locator('.poolRankRow').count(),2);assert.match(await groups.nth(3).locator('.poolRankRow').first().innerText(),/12 %/);
  assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
test('historical periods remain strict; graphs and stablecoin changes keep provenance, units and signs',async function(){
 var c=await pageWith(),p=c.page;try{
  await p.waitForFunction(function(){return document.querySelector('#defiVolumeChart svg');});
  await p.click('[data-defi-range="1H"]');assert.match(await p.locator('#defiVolumeSubtitle').innerText(),/24 h \(USD\).*1H.*DeFiLlama.*3 points/);
  var n=c.calls.length;await p.click('[data-defi-range="7J"]');assert.match(await p.locator('#defiVolumeSubtitle').innerText(),/journalier \(USD\).*7J/);assert.equal(c.calls.length,n);
  assert.equal(await p.locator('#defiStableFlow rect.stableIn').count(),1);assert.equal(await p.locator('#defiStableFlow rect.stableOut').count(),1);assert.match(await p.locator('#defiStableFlow').innerText(),/USD[\s\S]*pas des entrées\/sorties brutes/);
  assert.match(await p.locator('#defiStableFlow title').last().textContent(),/-100/);
  await p.evaluate(function(){window.IATBStats.state.defi.volumeHistory=[{timestamp:Date.now()-7200000,valueUsd:1},{timestamp:Date.now()-7000000,valueUsd:2}];window.IATBStats.state.defi.volumeRange='1H';window.IATBStats.render();});
  assert.equal(await p.locator('#defiVolumeChart svg').count(),0);assert.match(await p.locator('#defiVolumeChart').innerText(),/Historique 1H/);assert.equal(await p.locator('#defiBridgeVolume').innerText(),'N/D');
 }finally{await p.close();}
});
test('fast sources render before a slow one; no forced refresh, duplicate calls or full reload on range change',async function(){
 var c=await pageWith({section:'cefi',delayAction:'marketdata.derivatives.open_interest',delayMs:1600}),p=c.page;try{
  await p.waitForFunction(function(){return document.querySelector('#cefiVolume24').textContent!=='--';});
  assert.equal(await p.locator('#cefiOi').innerText(),'N/D');assert.match(await p.locator('#cefiDataStatus').innerText(),/données anciennes/);
  var snap=c.calls.find(function(x){return x.action==='marketdata.financial.snapshot';});assert.deepStrictEqual(snap.arguments,{force:false,staleWhileRevalidate:true});
  await p.waitForFunction(function(){return document.querySelector('#cefiOi').textContent!=='N/D';});
  assert.match(await p.locator('#cefiOi').locator('..').innerText(),/1 CEX.*partielle[\s\S]*OKX/);assert.match(await p.locator('#cefiLiq').innerText(),/≥ 500/);
  var before=c.calls.length;await p.getByRole('button',{name:'7J',exact:true}).first().click();await p.waitForTimeout(150);
  assert.equal(c.calls.length,before+1);assert.equal(c.calls[c.calls.length-1].action,'marketdata.financial.history');
  assert.equal(c.calls.filter(function(x){return x.action==='marketdata.derivatives.open_interest';}).length,1);
  assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
test('source failures and empty data keep explicit unavailable states and preserve last valid data',async function(){
 var c=await pageWith({failAction:'marketdata.dex.liquidity.snapshot'}),p=c.page;try{
  await p.waitForFunction(function(){return document.querySelector('#defiDataStatus').textContent.includes('FIXTURE_UNAVAILABLE');});assert.match(await p.locator('#defiExecutionCost').innerText(),/Estimation indisponible/);assert.notEqual(await p.locator('#defiTvl').innerText(),'--');
  await p.evaluate(function(){window.IATBStats.state.data.dex={ok:true,pools:[{base:{symbol:'WETH'},quote:{symbol:'USDC'},liquidityUsd:1000,volume24hUsd:1,chainId:'ETH',dexId:'DEX'}]};window.IATBStats.state.ui.lastAt.dex=0;location.hash='#cefi';});
  await p.waitForTimeout(100);await p.evaluate(function(){location.hash='#defi';});await p.waitForTimeout(150);assert.match(await p.locator('#defiExecutionCost').innerText(),/WETH\/USDC/);
 }finally{await p.close();}
 var empty=await pageWith({section:'cefi',emptyOi:true,emptyLiq:true});try{await empty.page.waitForTimeout(150);assert.equal(await empty.page.locator('#cefiOi').innerText(),'N/D');assert.equal(await empty.page.locator('#cefiLiq').innerText(),'N/D');assert.deepStrictEqual(empty.errors,[]);}finally{await empty.page.close();}
});
test('Firefox layout: pool text stays inside rows at 1440, 1024, 768 and 390 pixels',async function(){
 for(var width of [1440,1024,768,390]){var c=await pageWith({width:width}),p=c.page;try{
  await p.waitForFunction(function(){return document.querySelectorAll('.poolRankRow').length===10;});
  var over=await p.evaluate(function(){return Array.from(document.querySelectorAll('.poolRankRow,.poolRankGroup,.executionCostPanel')).filter(function(el){return el.scrollWidth>el.clientWidth+1;}).map(function(el){return el.className;});});
  assert.deepStrictEqual(over,[],String(width)+'px overflow');
  assert(await p.evaluate(function(){return document.documentElement.scrollWidth<=innerWidth+1;}),String(width)+'px page overflow');
  if(process.env.IATB_STATISTICS_SCREENSHOTS)await p.screenshot({path:path.join(process.env.IATB_STATISTICS_SCREENSHOTS,'statistics-defi-'+width+'.png'),fullPage:true});
 }finally{await p.close();}}
});

test('navigation reuses in-flight requests and server view does not collect financial data',async function(){
 var c=await pageWith({delayAction:'marketdata.dex.liquidity.snapshot',delayMs:900}),p=c.page;try{
  await p.waitForFunction(function(){return window.IATBStats&&window.IATBStats.state.ui.inflight[window.IATBStats.state.ui.wanted.dex];});
  await p.evaluate(function(){location.hash='#cefi';});await p.waitForTimeout(60);await p.evaluate(function(){location.hash='#defi';});await p.waitForTimeout(1000);
  assert.equal(c.calls.filter(function(x){return x.action==='marketdata.dex.liquidity.snapshot';}).length,1);
  assert.equal(c.calls.filter(function(x){return x.action==='marketdata.financial.snapshot';}).length,1);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
 var serverView=await pageWith({section:'server'});try{await serverView.page.waitForTimeout(100);assert.equal(serverView.calls.length,0);}finally{await serverView.page.close();}
});

test('stale snapshots get one bounded recheck; null values never become invented zero dollars',async function(){
 var c=await pageWith({clock:true}),p=c.page;try{
  await p.waitForFunction(function(){return window.IATBStats&&window.IATBStats.state.ui.snapshotFollowup;});
  await p.clock.fastForward(15100);await p.waitForTimeout(100);
  assert.equal(c.calls.filter(function(x){return x.action==='marketdata.financial.snapshot';}).length,2);
  await p.clock.fastForward(16000);await p.waitForTimeout(100);
  assert.equal(c.calls.filter(function(x){return x.action==='marketdata.financial.snapshot';}).length,2);
  c.data.snapshot.defi.tvlUsd=null;c.data.snapshot.defi.stablecoinMarketCapUsd=null;
  await p.evaluate(function(){window.IATBStats.state.ui.lastAt.snapshot=0;location.hash='#cefi';});
  await p.waitForTimeout(120);await p.evaluate(function(){location.hash='#defi';});await p.waitForTimeout(100);
  assert.equal(await p.locator('#defiTvl').innerText(),'N/D');assert.equal(await p.locator('#defiStable').innerText(),'N/D');
 }finally{await p.close();}
});

 test('liquidations show all-pair observed amounts, counts, sources and explicit unknowns',async function(){
 var c=await pageWith({section:'cefi'}),p=c.page;try{
  await p.waitForFunction(function(){return document.querySelector('#cefiLiq').textContent.includes('500');});
  assert.deepStrictEqual(c.calls.find(function(x){return x.action==='marketdata.liquidations.stats';}).arguments,{windowMs:86400000});
  var panel=p.locator('#cefiLiq').locator('..');assert.match(await panel.innerText(),/2 événements.*1 valorisés \/ 1 N\/D/);assert.match(await panel.innerText(),/OKX : 2 événements, 500/);assert.match(await panel.innerText(),/faillite pour OKX\/Bybit/);
  await p.setViewportSize({width:390,height:900});assert(await p.evaluate(function(){var el=document.querySelector('#cefiLiq').parentElement;return el.scrollWidth<=el.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1;}),'liquidation card must wrap on mobile');
  c.data.liq={ok:true,count:3,coveredNotionalUsd:null,coverage:{notionalKnownEvents:0,notionalUnknownEvents:3,notionalComplete:false,providers:['BYBIT']}};
  await p.evaluate(function(){window.IATBStats.state.ui.lastAt.liq=0;location.hash='#server';});await p.waitForTimeout(50);await p.evaluate(function(){location.hash='#cefi';});await p.waitForTimeout(150);
  assert.equal(await p.locator('#cefiLiq').innerText(),'N/D');assert.match(await panel.innerText(),/3 événements.*0 valorisés \/ 3 N\/D/);assert.deepStrictEqual(c.errors,[]);
 }finally{await p.close();}
});
