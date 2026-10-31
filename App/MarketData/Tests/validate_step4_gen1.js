'use strict';
// REAL GEN-1 reads only. No fixtures, forced collection, stream/Engine start or DB write.
var assert=require('assert'),path=require('path');
var root=process.argv[1]==='-'?process.cwd():path.resolve(__dirname,'../..');
var Client=require(path.join(root,'Core/Communication/cp1_client'));
var Database=require(path.join(root,'node_modules/better-sqlite3'));
var cp=new Client({root:root,timeout:25000,maxBytes:4*1024*1024});
function call(action,args){return new Promise(function(resolve,reject){cp.request('marketdata',action,args||{},'summary',function(e,d,envelope){if(e)return reject(e);if(envelope&&envelope.status==='ERROR')return reject(new Error(JSON.stringify(d)));resolve(d);});});}
async function ui(action,args){
 var r=await fetch('http://127.0.0.1:'+(process.env.IATB_UI_PORT||8000)+'/communication/v1/ui/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:'marketdata',action:action,arguments:args}),signal:AbortSignal.timeout(25000)});
 var envelope=await r.json();assert.equal(r.status,200,JSON.stringify(envelope));assert.equal(envelope.status,'OK',JSON.stringify(envelope));return envelope.data;
}
async function main(){
 assert.notEqual(process.env.IATB_TRADING_LIVE,'1');
 var fw=await fetch('http://127.0.0.1:'+(process.env.IATB_FIREWALL_PORT||8017)+'/health').then(function(r){return r.json();});assert.equal(fw.firewallEnabled,true);assert.equal(fw.bypassMode,false);
 var before=await call('marketdata.health');assert.equal(before.version,'2.0.1');assert.equal(before.offlineDiagnostic,false);
 assert(before.financial.ttl.cefiMs>=1800000);assert(before.registry.refreshMs>=1800000);assert.equal(before.coingecko.maxRetries,0);assert.equal(before.coingecko.rawResponseCache,false);
 var started=Date.now();
 var snapshots=await Promise.all([1,2,3].map(function(){return ui('marketdata.financial.snapshot',{force:false,staleWhileRevalidate:true});}));
 snapshots.forEach(function(s){assert(s.cefi,'No validated CeFi snapshot yet');assert.equal(s.meta.firewall,'VALIDATED_BEFORE_STORE');assert(s.meta.quality&&s.meta.quality.ok);assert(s.cefi.observedAt>0);assert(s.cefi.exchanges&&s.cefi.exchanges.length,'Exchange coverage not ready; retry after initial enrichment');});
 var after=await call('marketdata.health'),cg=after.coingecko;
 console.log(JSON.stringify({phase:'COINGECKO_CACHED_READS',fixture:false,durationMs:Date.now()-started,observedAt:snapshots.map(function(s){return s.cefi.observedAt;}),callsBefore:before.coingecko.calls,callsAfter:cg.calls,deduplicated:cg.deduplicated,cooldownUntil:cg.cooldownUntil,usage:cg.usage,lastError:cg.lastError}));
 // An unrelated periodic registry/enrichment cycle may run concurrently; print actual HTTP paths.
 var telemetry=after.apiTelemetry.storage||after.apiTelemetry.store;
 if(telemetry&&telemetry.file){var apiDb=new Database(telemetry.file,{readonly:true,fileMustExist:true});try{console.log(JSON.stringify({phase:'COINGECKO_HTTP',rows:apiDb.prepare("SELECT path,phase,status_code,COUNT(DISTINCT request_id) AS attempts FROM api_calls WHERE provider='COINGECKO' AND timestamp>=? GROUP BY path,phase,status_code").all(started)}));}finally{apiDb.close();}}
 var stats=await ui('marketdata.liquidations.stats',{windowMs:86400000});assert.equal(stats.ok,true);assert.equal(stats.coverage.storage,'SQLITE_24H');assert.equal(stats.coverage.truncated,false);assert.equal(stats.count,stats.coverage.notionalKnownEvents+stats.coverage.notionalUnknownEvents);
 assert.equal(stats.byProvider.reduce(function(n,x){return n+x.count;},0),stats.count);
 if(!stats.coverage.notionalKnownEvents)assert.equal(stats.coveredNotionalUsd,null);
 if(stats.coverage.notionalUnknownEvents)assert.equal(stats.totalNotionalUsd,null);
 var db=new Database(after.microstructure.storage.file,{readonly:true,fileMustExist:true}),sample;
 try{
  // Use exact API boundaries, so new stream messages cannot create a comparison race.
  var stored=db.prepare('SELECT data_json,notional_usd FROM liquidation_events WHERE timestamp>=? AND timestamp<=?').all(stats.since,stats.to),count=0,sum=0;
  assert.equal(stored.length,stats.count);
  stored.forEach(function(row){var x=JSON.parse(row.data_json);if(x.normalizationStatus!=='NORMALIZED'||!x.normalizationReceipt||row.notional_usd==null)return;
   assert(x.provenance);assert(x.firewall&&['PASS','WARN'].includes(x.firewall.decision));assert(x.firewall.checkedAt);assert(!/BYPASS|DISABLED/.test(x.firewall.reason||''));
   var receipt=x.normalizationReceipt;assert(receipt.observedAssetPriceUsd>0);assert(receipt.priceSource);assert(Math.abs(receipt.sourceAmount*receipt.observedAssetPriceUsd-row.notional_usd)<=Math.max(.000001,row.notional_usd*1e-9));
   if(x.provider==='OKX')assert(x.contract&&x.contract.checkedAt&&x.contract.provenance);
   count++;sum+=row.notional_usd;if(!sample)sample=x;
  });
  assert.equal(count,stats.coverage.notionalKnownEvents);if(count)assert(Math.abs(sum-stats.coveredNotionalUsd)<=Math.max(.000001,sum*1e-9));
 }finally{db.close();}
 var streams=await ui('marketdata.liquidations.streams',{});
 console.log(JSON.stringify({phase:'LIQUIDATIONS_SQL',fixture:false,stats:stats,streams:streams,sample:sample||null}));
 var pending=[];if(!sample)pending.push('WAIT_FOR_NEW_NORMALIZED_STREAM_EVENT');if(cg.cooldownUntil>Date.now())pending.push('COINGECKO_COOLDOWN_ACTIVE');if(cg.lastError)pending.push(cg.lastError);
 var observe=Number(process.env.IATB_STEP4_OBSERVE_MS)||0;
 if(observe){
  assert(observe>=3900000&&observe<=86400000,'Observation must cover at least 65 minutes, at most 24h');
  assert(telemetry&&telemetry.file,'HTTP telemetry required');
  var end=Date.now()+observe,tick=0;console.log('Passive observation: '+observe+' ms. No forced collection or provider probe.');
  while(Date.now()<end){await new Promise(function(done){setTimeout(done,Math.min(30000,end-Date.now()));});if(++tick%10===0)console.log(JSON.stringify({phase:'OBSERVATION',remainingMs:Math.max(0,end-Date.now()),coingecko:(await call('marketdata.health')).coingecko}));}
  var finalSnapshot=await ui('marketdata.financial.snapshot',{force:false,staleWhileRevalidate:true}),finalHealth=await call('marketdata.health');
  var observedDb=new Database(telemetry.file,{readonly:true,fileMustExist:true}),observed;
  try{observed=observedDb.prepare("SELECT path,status_code,COUNT(*) AS calls FROM api_calls WHERE provider='COINGECKO' AND phase='HTTP_END' AND timestamp>=? GROUP BY path,status_code").all(started);}finally{observedDb.close();}
  console.log(JSON.stringify({phase:'PASSIVE_HTTP_RESULTS',rows:observed,cefiObservedAt:finalSnapshot.cefi&&finalSnapshot.cefi.observedAt,coingecko:finalHealth.coingecko}));
  if(observed.some(function(x){return x.status_code===429;}))pending.push('HTTP_429_DURING_OBSERVATION');
  if(!observed.some(function(x){return x.status_code===200&&x.path.endsWith('/global');})||!observed.some(function(x){return x.status_code===200&&x.path.endsWith('/coins/markets');}))pending.push('SUCCESSFUL_CEFI_REFRESH_NOT_OBSERVED');
  if(!(finalSnapshot.cefi&&finalSnapshot.cefi.observedAt>snapshots[0].cefi.observedAt&&finalSnapshot.cefi.exchanges&&finalSnapshot.cefi.exchanges.length))pending.push('CEFI_REFRESH_OR_EXCHANGES_NOT_CONFIRMED');
 }
 console.log(JSON.stringify({result:pending.length?'GEN1_STEP4_PENDING':observe?'GEN1_STEP4_OBSERVATION_PASS':'GEN1_STEP4_SMOKE_PASS',fixture:false,pending:pending,note:'Complete Firefox checks in Documentation/FINAL_STEP4_DEBUG_2.0.1.md; Overflow approval is still required.'}));
 if(pending.length)process.exitCode=2;
}
main().catch(function(e){console.error('GEN1_STEP4_FAIL',e.stack||e);process.exitCode=1;});
