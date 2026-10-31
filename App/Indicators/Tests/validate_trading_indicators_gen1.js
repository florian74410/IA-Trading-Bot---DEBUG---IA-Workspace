'use strict';
// REAL GEN-1 read-only validation: existing candles, UI CP/1 compute_data, no fixtures or orders.
var assert=require('assert');
var base='http://127.0.0.1:'+(process.env.IATB_UI_PORT||8000);
async function json(url,options){var r=await fetch(base+url,Object.assign({signal:AbortSignal.timeout(25000)},options||{})),x=await r.json();assert.equal(r.status,200,JSON.stringify(x));return x;}
async function read(target,action,args){var x=await json('/communication/v1/ui/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:target,action:action,arguments:args||{}})});assert.equal(x.status,'OK',JSON.stringify(x));return x.data;}
async function main(){
 assert.notEqual(process.env.IATB_TRADING_LIVE,'1');
 var source=String(process.env.IATB_VALIDATE_SOURCE||'KRAKEN').toUpperCase(),symbol=String(process.env.IATB_VALIDATE_SYMBOL||'BTCUSD').toUpperCase(),tf=process.env.IATB_VALIDATE_TIMEFRAME||'1m';
 var health=await read('marketdata','marketdata.health',{});assert.equal(health.offlineDiagnostic,false);
 var raw=await json('/ui-data/market/candles?exchange='+encodeURIComponent(source)+'&symbol='+encodeURIComponent(symbol)+'&interval='+encodeURIComponent(tf)+'&limit=240');
 assert(Array.isArray(raw.candles)&&raw.candles.length>=100,'At least 100 actual candles required');assert.notEqual(raw.timeframeValidated,false);assert.equal(raw.requestedTimeframe||raw.timeframe||tf,tf);
 var candles=raw.candles.map(function(c){return Array.isArray(c)?{time:c[0],open:c[1],high:c[2],low:c[3],close:c[4],volume:c[5]}:c;});
 var batch=await read('indicator','indicator.compute_batch_data',{symbol:symbol,timeframe:tf,source:source,candles:candles,requests:[{id:'rsi',params:{}},{id:'macd',params:{}},{id:'ema',params:{}}]});
 assert.equal(batch.symbol,symbol);assert.equal(batch.timeframe,tf);assert.equal(batch.source,source);assert.equal(batch.input,'PROVIDED_DATA');assert.equal(batch.results.length,3);
 var times=Array.from(new Set(candles.map(function(c){var t=+(c.time!=null?c.time:c.timestamp);return Math.round(t<1e11?t*1000:t);}))).sort(function(a,b){return a-b;});
 batch.results.forEach(function(item){assert.equal(item.ok,true,JSON.stringify(item));var r=item.result;assert.equal(r.state,'READY');assert.deepStrictEqual(r.times,times,'indicator timestamps must match the actual chart candles');var known=Object.keys(r.values).some(function(k){return r.values[k].some(function(v){return v!=null&&Number.isFinite(+v);});});assert(known,'no computed series');});
 console.log(JSON.stringify({result:'GEN1_INDICATOR_DATA_PASS',fixture:false,source:source,symbol:symbol,timeframe:tf,candles:times.length,provenance:batch.provenance,indicators:batch.results.map(function(x){return{id:x.result.id,state:x.result.state,display:x.result.display,latest:x.result.latest};}),note:'Data path only. Firefox must additionally confirm visible plots, pan/zoom, source/timeframe switches and no console errors.'},null,2));
}
main().catch(function(e){console.error('GEN1_INDICATOR_DATA_FAIL',e.stack||e);process.exitCode=1;});
