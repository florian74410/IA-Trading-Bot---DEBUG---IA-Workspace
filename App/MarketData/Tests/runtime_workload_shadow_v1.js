'use strict';

var fs=require('fs'),path=require('path'),CPClient=require('../../Core/Communication/cp1_client');
var ROOT=path.resolve(__dirname,'../..'),routerPort=+(process.env.ROUTER_PORT||8021);
var client=new CPClient({root:ROOT,routerPort:routerPort,timeout:20000,maxBytes:6*1024*1024});
var OUT=process.env.IATB_WORKLOAD_DIR||path.join(ROOT,'.runtime','workload');
fs.mkdirSync(OUT,{recursive:true});
var startFile=path.join(OUT,'workload_start_ms.txt'),startedAt=fs.existsSync(startFile)?+fs.readFileSync(startFile,'utf8').trim():Date.now(),results=[],hardFailures=0,softFailures=0;
if(!fs.existsSync(startFile))fs.writeFileSync(startFile,String(startedAt));

function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
function req(target,action,args){
 return new Promise(function(resolve,reject){client.request(target,action,args||{},'analysis',function(e,o){if(e)return reject(e);resolve(o);});});
}
async function step(label,target,action,args,opt){
 opt=opt||{};var t=Date.now();
 try{
  var out=await req(target,action,args),ms=Date.now()-t;
  results.push({label:label,ok:true,latencyMs:ms,target:target,action:action,summary:summary(out)});
  console.log('[WORKLOAD OK] '+label+' '+ms+'ms '+JSON.stringify(summary(out)));
  return out;
 }catch(e){
  var ms2=Date.now()-t,row={label:label,ok:false,latencyMs:ms2,target:target,action:action,error:String(e&&e.message||e),response:e&&e.response||null,soft:!!opt.soft};
  results.push(row);if(opt.soft)softFailures++;else hardFailures++;
  console.log((opt.soft?'[WORKLOAD WARN] ':'[WORKLOAD FAIL] ')+label+' '+ms2+'ms '+row.error+(row.response?' '+JSON.stringify(row.response):''));
  if(!opt.soft)throw e;
  return null;
 }
}
function summary(o){
 if(!o||typeof o!=='object')return{};
 var s={};
 ['provider','source','exchange','cache','schema','symbol','timeframe','scope','venueCount','poolCount','count','status'].forEach(function(k){if(o[k]!=null)s[k]=o[k];});
 if(Array.isArray(o.candles))s.candles=o.candles.length;
 if(o.cefi)s.cefi=true;if(o.defi)s.defi=true;
 return s;
}
async function parallel(label,calls){
 var t=Date.now(),rows=await Promise.all(calls.map(function(c){return req(c.target,c.action,c.args).then(function(o){return{ok:true,out:o};},function(e){return{ok:false,error:String(e&&e.message||e)};});}));
 rows.forEach(function(x,i){results.push({label:label+' #'+(i+1),ok:x.ok,latencyMs:Date.now()-t,target:calls[i].target,action:calls[i].action,error:x.error||null,summary:x.ok?summary(x.out):null,soft:true});if(!x.ok)softFailures++;});
 console.log('[WORKLOAD PARALLEL] '+label+' '+JSON.stringify(rows.map(function(x){return x.ok?summary(x.out):{error:x.error};})));
 return rows;
}

(async function(){
 console.log('=== IA-TB Runtime Workload Shadow v1 ===');
 console.log('startedAt='+startedAt);

 await step('MarketData health','marketdata','marketdata.health',{});

 // Financial/reference workload: one real refresh, then read-only reuse.
 await step('Financial refresh','marketdata','marketdata.financial.refresh',{}, {soft:true});
 await step('Financial snapshot #1','marketdata','marketdata.financial.snapshot',{force:false});
 await step('Financial snapshot #2','marketdata','marketdata.financial.snapshot',{force:false});
 await step('BTC reference price #1','marketdata','marketdata.asset.price',{symbol:'BTC',currency:'usd'},{soft:true});
 await step('BTC reference price #2 cached','marketdata','marketdata.asset.price',{symbol:'BTC',currency:'usd'},{soft:true});

 // User-like chart navigation. Repeated calls exercise application caches.
 await step('Kraken BTC 1h','marketdata','marketdata.candles',{symbol:'BTCUSD',timeframe:'1h',limit:180,source:'KRAKEN'},{soft:true});
 await step('Kraken BTC 1h repeat','marketdata','marketdata.candles',{symbol:'BTCUSD',timeframe:'1h',limit:180,source:'KRAKEN'},{soft:true});
 await sleep(1100);
 await step('Kraken ETH 4h','marketdata','marketdata.candles',{symbol:'ETHUSD',timeframe:'4h',limit:180,source:'KRAKEN'},{soft:true});
 await step('OKX BTC 1h','marketdata','marketdata.candles',{symbol:'BTCUSD',timeframe:'1h',limit:180,source:'OKX'},{soft:true});
 await step('OKX BTC 1h repeat','marketdata','marketdata.candles',{symbol:'BTCUSD',timeframe:'1h',limit:180,source:'OKX'},{soft:true});
 await step('OKX SOL 15m','marketdata','marketdata.candles',{symbol:'SOLUSD',timeframe:'15m',limit:180,source:'OKX'},{soft:true});
 await step('Bybit BTC 15m','marketdata','marketdata.candles',{symbol:'BTCUSD',timeframe:'15m',limit:180,source:'BYBIT'},{soft:true});
 await step('Hyperliquid ETH 1h','marketdata','marketdata.candles',{symbol:'ETHUSD',timeframe:'1h',limit:180,source:'HYPERLIQUID'},{soft:true});
 await step('GMX BTC 4h','marketdata','marketdata.candles',{symbol:'BTCUSD',timeframe:'4h',limit:180,source:'GMX'},{soft:true});
 await step('Binance BTC 1h regional probe','marketdata','marketdata.candles',{symbol:'BTCUSD',timeframe:'1h',limit:180,source:'BINANCE'},{soft:true});

 // Microstructure and derivative workload.
 await step('OKX orderbook','marketdata','marketdata.microstructure.snapshot',{symbol:'BTCUSD',source:'OKX',depth:20,force:false},{soft:true});
 await step('OKX orderbook cached','marketdata','marketdata.microstructure.snapshot',{symbol:'BTCUSD',source:'OKX',depth:20,force:false},{soft:true});
 await step('Bybit orderbook','marketdata','marketdata.microstructure.snapshot',{symbol:'BTCUSD',source:'BYBIT',depth:20,force:false},{soft:true});
 await step('Hyperliquid orderbook','marketdata','marketdata.microstructure.snapshot',{symbol:'BTCUSD',source:'HYPERLIQUID',depth:20,force:false},{soft:true});
 await step('Aggregate OI','marketdata','marketdata.derivatives.open_interest',{symbol:'BTCUSD',sources:['OKX','BYBIT','HYPERLIQUID','GMX']},{soft:true});
 await step('Aggregate OI cached','marketdata','marketdata.derivatives.open_interest',{symbol:'BTCUSD',sources:['OKX','BYBIT','HYPERLIQUID','GMX']},{soft:true});

 // DEX pool liquidity, then a controlled concurrent duplicate pair.
 await step('DEX liquidity BTC','marketdata','marketdata.dex.liquidity.snapshot',{symbol:'BTCUSD',force:false},{soft:true});
 await step('DEX liquidity BTC cached','marketdata','marketdata.dex.liquidity.snapshot',{symbol:'BTCUSD',force:false},{soft:true});
 await parallel('DEX liquidity duplicate-force observation',[
  {target:'marketdata',action:'marketdata.dex.liquidity.snapshot',args:{symbol:'ETHUSD',force:true}},
  {target:'marketdata',action:'marketdata.dex.liquidity.snapshot',args:{symbol:'ETHUSD',force:true}}
 ]);

 // Downstream consumers using MarketData through Router CP/1.
 await step('Indicator financial context','indicator','indicator.financial_context',{scope:'ALL'},{soft:true});
 await step('Liquidity financial context','liquidity','liquidity.financial',{scope:'ALL'},{soft:true});
 await step('Liquidation stats','marketdata','marketdata.liquidations.stats',{symbol:'BTCUSD',windowMs:900000},{soft:true});
 await step('Liquidation stream status','marketdata','marketdata.liquidations.streams',{}, {soft:true});

 console.log('[WORKLOAD] background observation window 32s: active refresh + stream telemetry');
 await sleep(32000);
 var endedAt=Date.now(),report={schema:'iatb.marketdata.workload/1.0',startedAt:startedAt,endedAt:endedAt,durationMs:endedAt-startedAt,steps:results.length,success:results.filter(function(x){return x.ok;}).length,softFailures:softFailures,hardFailures:hardFailures,results:results};
 fs.writeFileSync(path.join(OUT,'workload_report.json'),JSON.stringify(report,null,2));
 console.log('=== WORKLOAD COMPLETE ===');
 console.log(JSON.stringify({durationMs:report.durationMs,steps:report.steps,success:report.success,softFailures:softFailures,hardFailures:hardFailures}));
 if(hardFailures)process.exit(1);
})().catch(function(e){
 console.error(e&&e.stack||e);
 try{fs.writeFileSync(path.join(OUT,'workload_report.json'),JSON.stringify({schema:'iatb.marketdata.workload/1.0',startedAt:startedAt,endedAt:Date.now(),hardFailures:hardFailures+1,softFailures:softFailures,results:results,error:String(e&&e.message||e)},null,2));}catch(x){}
 process.exit(1);
});
