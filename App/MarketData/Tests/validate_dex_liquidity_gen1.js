'use strict';
// REAL GEN-1 validation. No fixtures, no service start/stop, no trading action.
// Pipe into the existing marketdata container from the host checkout (QA excluded from image).
var assert=require('assert'),path=require('path');
var root=process.argv[1]==='-'?process.cwd():path.resolve(__dirname,'../..');
var Client=require(path.join(root,'Core/Communication/cp1_client'));
var Database=require(path.join(root,'node_modules/better-sqlite3'));
var cp=new Client({root:root,timeout:25000,maxBytes:2*1024*1024});
function call(action,args){return new Promise(function(resolve,reject){cp.request('marketdata',action,args||{},'summary',function(e,d,envelope){if(e)return reject(e);if(envelope&&envelope.status==='ERROR')return reject(new Error(JSON.stringify(d)));resolve(d);});});}
async function read(force){
 var r=await fetch('http://127.0.0.1:'+(process.env.IATB_UI_PORT||8000)+'/communication/v1/ui/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:'marketdata',action:'marketdata.dex.liquidity.snapshot',arguments:{symbol:'ETHUSDC',force:force}}),signal:AbortSignal.timeout(25000)});
 var envelope=await r.json(),d=envelope.data||envelope;
 assert.equal(r.status,200,JSON.stringify(envelope));assert.equal(envelope.status,'OK',JSON.stringify(envelope));
 assert.equal(d.ok,true);assert(d.poolCount>0);assert.equal(d.pools.length,d.poolCount);
 var total=d.pools.reduce(function(n,p){assert(p.liquidityUsd>=0);return n+p.liquidityUsd;},0);
 assert(Math.abs(total-d.liquidityUsd)<=Math.max(0.01,total*1e-9));
 assert.equal(d.canonicalSymbol,'ETH/USDC');assert.equal(d.provenance,'DEXSCREENER:/latest/dex/search');
 assert(['PASS','WARN'].includes(d.firewall.decision));assert(!/BYPASS|DISABLED|WOULD_REJECT/.test(d.firewall.reason||''));
 console.log(JSON.stringify({phase:force?'forced':'read',observedAt:d.observedAt,poolCount:d.poolCount,liquidityUsd:d.liquidityUsd,cache:d.cache,firewall:d.firewall,provenance:d.provenance,partial:d.partial,errors:d.errors}));
 return d;
}
async function main(){
 assert.notEqual(process.env.IATB_TRADING_LIVE,'1','LIVE must remain disabled');
 var fw=await fetch('http://127.0.0.1:'+(process.env.IATB_FIREWALL_PORT||8017)+'/health').then(function(r){return r.json();});
 assert.equal(fw.firewallEnabled,true);assert.equal(fw.bypassMode,false);
 var health=await call('marketdata.health');assert.equal(health.offlineDiagnostic,false);
 var ttl=health.dexLiquidity.cache.ttlMs,interval=health.dexLiquidity.storage.persistIntervalMs;
 assert(health.dexLiquidity.storage.ok,'SQLite unavailable');
 var first=await read(true);assert.equal(first.cache,'MISS');
 var hit=await read(false);assert.equal(hit.cache,'HIT');
 assert.deepStrictEqual(Object.assign({},hit,{cache:'MISS'}),first,'HIT changed snapshot data');
 var wait=Math.max(ttl,interval)+1000;assert(wait<=120000,'TTL/persist interval exceeds two minutes; validate expiry separately');
 console.log('Waiting '+wait+' ms for cache expiry and persistence interval; no configuration is changed.');
 while(wait>0){var step=Math.min(wait,30000);await new Promise(function(resolve){setTimeout(resolve,step);});wait-=step;if(wait)console.log('Remaining '+wait+' ms');}
 var expired=await read(false);assert.equal(expired.cache,'MISS');assert(expired.observedAt>first.observedAt);
 var history=await call('marketdata.dex.liquidity.history',{symbol:'ETH/USDC',limit:5});assert.equal(history.ok,true);
 var persisted=history.items.find(function(x){return x.observedAt===expired.observedAt;});assert(persisted,'expired snapshot missing from SQLite history');assert.deepStrictEqual(persisted,expired);
 var current=await call('marketdata.health');assert.equal(current.dexLiquidity.cache.entries>0,true);assert(current.dexLiquidity.storage.dexLiquiditySnapshots>0);
 // New read-only SQLite connection proves retrieval from disk, not the Collector cache.
 var db=new Database(current.dexLiquidity.storage.file,{readonly:true,fileMustExist:true});
 try{var rows=db.prepare('SELECT data_json FROM dex_liquidity_snapshots WHERE symbol = ? AND timestamp = ?').all('ETH/USDC',expired.observedAt);assert(rows.some(function(row){return row.data_json===JSON.stringify(expired);}), 'disk row differs from the application response');}finally{db.close();}
 console.log(JSON.stringify({result:'GEN1_DEX_LIQUIDITY_PASS',fixture:false,version:current.version,cache:current.dexLiquidity.cache,storage:current.dexLiquidity.storage,lastFirewall:current.dexLiquidity.lastFirewall}));
}
main().catch(function(e){console.error('GEN1_DEX_LIQUIDITY_FAIL',e.stack||e);process.exitCode=1;});
