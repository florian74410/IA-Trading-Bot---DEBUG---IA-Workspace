'use strict';
var http=require('http'),assert=require('assert');
function get(path){
 return new Promise(function(resolve,reject){
  var q=http.get({host:'127.0.0.1',port:8013,path:path,timeout:10000},function(r){
   var a=[];r.on('data',function(c){a.push(c);});r.on('end',function(){try{resolve(JSON.parse(Buffer.concat(a).toString('utf8')||'{}'));}catch(e){reject(e);}});
  });q.on('error',reject);q.on('timeout',function(){q.destroy(new Error('TIMEOUT'));});
 });
}
get('/health').then(function(h){
 assert(h&&h.ok,'MarketData health unavailable');
 assert(/shadow/i.test(String(h.componentVersion||'')),'component must remain Shadow');
 var o=h.apiRequestOrchestrator||{};assert.equal(o.mode,'SHADOW');assert.equal(o.shadow,true);
 var p=o.budget&&o.budget.providers||{};
 ['COINGECKO','DEFILLAMA','GMX','DEXSCREENER','BINANCE','HYPERLIQUID','KRAKEN','OKX','BYBIT'].forEach(function(id){assert(p[id],id+' budget profile missing');});
 assert(p.BINANCE.limitScopes&&p.BINANCE.limitScopes.BINANCE_SPOT_WEIGHT,'Binance Spot weighted scope missing');
 assert(p.HYPERLIQUID.limitScopes&&p.HYPERLIQUID.limitScopes.HYPERLIQUID_REST_WEIGHT,'Hyperliquid weighted scope missing');
 assert.equal(p.OKX.limitScopes.OKX_CANDLES.limit,40);
 assert.equal(p.OKX.limitScopes.OKX_BOOKS.limit,40);
 assert.equal(p.OKX.limitScopes.OKX_OPEN_INTEREST.limit,null);
 assert.equal(p.BYBIT.limitScopes.BYBIT_GLOBAL_IP.limit,600);
 assert.equal(p.KRAKEN.limitModel,'SAFE_PACE');
 console.log('PASS runtime Shadow Orchestrator profiles and mode');
}).catch(function(e){console.error(e&&e.stack||e);process.exit(1);});
