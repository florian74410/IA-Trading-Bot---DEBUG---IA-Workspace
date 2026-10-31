'use strict';

var fs=require('fs'),path=require('path'),http=require('http'),Store=require('../Storage/api_telemetry_store');
var ROOT=path.resolve(__dirname,'../..'),DIR=process.env.IATB_WORKLOAD_DIR||path.join(ROOT,'.runtime','workload');
var db=process.env.IATB_API_TELEMETRY_DB||path.join(DIR,'api_telemetry.db');
var startFile=path.join(DIR,'workload_start_ms.txt'),since=+fs.readFileSync(startFile,'utf8').trim();
var store=new Store({file:db,retentionDays:90});

function rows(sql){
 var raw=store.run(sql,true).trim();if(!raw)return[];
 return raw.split(/\r?\n/).filter(Boolean).map(function(line){return line.split('\t');});
}
function num(v){v=+v;return isFinite(v)?v:0;}
function getHealth(){
 return new Promise(function(resolve){
  var q=http.get({host:'127.0.0.1',port:+(process.env.IATB_MARKET_DATA_PORT||8013),path:'/health',timeout:5000},function(r){var a=[];r.on('data',function(c){a.push(c);});r.on('end',function(){try{resolve(JSON.parse(Buffer.concat(a).toString('utf8')||'{}'));}catch(e){resolve(null);}});});
  q.on('error',function(){resolve(null);});q.on('timeout',function(){q.destroy();resolve(null);});
 });
}
function table(title,headers,data){
 console.log('\n### '+title);console.log(headers.join(' | '));console.log(headers.map(function(){return'---';}).join(' | '));
 data.forEach(function(r){console.log(r.join(' | '));});
}
(async function(){
 var httpRows=rows("SELECT provider,COUNT(*),SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END),SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END),ROUND(AVG(latency_ms),1),ROUND(MAX(latency_ms),1),ROUND(SUM(COALESCE(cost,0)),2),SUM(COALESCE(response_bytes,0)) FROM api_calls WHERE phase='HTTP_END' AND timestamp>="+Math.round(since)+" GROUP BY provider ORDER BY COUNT(*) DESC;");
 var providerSummary=httpRows.map(function(a){return{provider:a[0],calls:num(a[1]),success:num(a[2]),errors:num(a[3]),avgLatencyMs:num(a[4]),maxLatencyMs:num(a[5]),cost:num(a[6]),bytes:num(a[7])};});
 table('HTTP provider telemetry',['Provider','Calls','OK','Errors','Avg ms','Max ms','Cost','Bytes'],providerSummary.map(function(x){return[x.provider,x.calls,x.success,x.errors,x.avgLatencyMs,x.maxLatencyMs,x.cost,x.bytes];}));

 var datasets=rows("SELECT provider,COALESCE(NULLIF(dataset,''),'(unclassified)'),COUNT(*),ROUND(SUM(COALESCE(cost,0)),2),SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) FROM api_calls WHERE phase='HTTP_END' AND timestamp>="+Math.round(since)+" GROUP BY provider,dataset ORDER BY COUNT(*) DESC LIMIT 50;");
 table('HTTP datasets',['Provider','Dataset','Calls','Cost','Errors'],datasets);

 var logical=rows("SELECT provider,dataset,COUNT(*),SUM(CASE WHEN cache_opportunity=1 THEN 1 ELSE 0 END),SUM(CASE WHEN dedup_opportunity=1 THEN 1 ELSE 0 END),SUM(CASE WHEN cache_opportunity=1 OR dedup_opportunity=1 THEN 1 ELSE 0 END) FROM api_calls WHERE phase='ORCHESTRATOR_START' AND timestamp>="+Math.round(since)+" GROUP BY provider,dataset ORDER BY COUNT(*) DESC;");
 table('Logical Broker observations',['Provider','Dataset','Observed','Cache opp.','Dedup opp.','Avoidable union'],logical);

 var totals=rows("SELECT COUNT(*),SUM(CASE WHEN cache_opportunity=1 THEN 1 ELSE 0 END),SUM(CASE WHEN dedup_opportunity=1 THEN 1 ELSE 0 END),SUM(CASE WHEN cache_opportunity=1 OR dedup_opportunity=1 THEN 1 ELSE 0 END) FROM api_calls WHERE phase='ORCHESTRATOR_START' AND timestamp>="+Math.round(since)+";");
 var t=totals[0]||['0','0','0','0'],observed=num(t[0]),avoidable=num(t[3]);
 var statusRows=rows("SELECT provider,status_code,COUNT(*) FROM api_calls WHERE phase='HTTP_END' AND timestamp>="+Math.round(since)+" AND (status_code>=400 OR error_code<>'') GROUP BY provider,status_code ORDER BY COUNT(*) DESC;");
 table('HTTP errors / rate-limit signals',['Provider','Status','Count'],statusRows);

 var stream=store.streamSummary({since:since});
 table('Stream telemetry',['Provider','Samples','Messages','Reconnects','Subscriptions','Error samples'],(stream.providers||[]).map(function(x){return[x.provider,x.samples,x.messages,x.reconnects,x.subscriptions,x.errorSamples];}));

 var metaRows=rows("SELECT provider,meta_json FROM api_calls WHERE phase='HTTP_END' AND timestamp>="+Math.round(since)+" AND meta_json<>'';");
 var peakMap={};
 metaRows.forEach(function(row){try{var provider=row[0],m=JSON.parse(row[1]||'{}');(m.scopeBudgets||[]).forEach(function(x){var scope=x.scope||'UNKNOWN',k=provider+'|'+scope,used=num(x.used),limit=x.limit==null?null:num(x.limit),cur=peakMap[k]||{provider:provider,scope:scope,kind:x.kind||'',source:x.source||'',peakUsed:0,limit:limit};if(used>cur.peakUsed)cur.peakUsed=used;if(limit!=null)cur.limit=limit;peakMap[k]=cur;});}catch(e){}});
 var budgetPeaks=Object.keys(peakMap).sort().map(function(k){var x=peakMap[k];x.utilizationPct=x.limit?Math.round(x.peakUsed/x.limit*1000)/10:null;return x;});
 table('Shadow budget peaks',['Provider','Scope','Kind','Peak used','Limit','Utilization %','Source'],budgetPeaks.map(function(x){return[x.provider,x.scope,x.kind,x.peakUsed,x.limit==null?'?':x.limit,x.utilizationPct==null?'?':x.utilizationPct,x.source];}));

 var health=await getHealth(),budget=health&&health.apiRequestOrchestrator&&health.apiRequestOrchestrator.budget&&health.apiRequestOrchestrator.budget.providers||{};
 var budgetRows=[];
 Object.keys(budget).sort().forEach(function(id){
  var p=budget[id],sc=p.limitScopes||{},scopeKeys=Object.keys(sc);
  if(!scopeKeys.length)budgetRows.push([id,p.limitModel,p.shortUsed||0,p.shortLimit==null?'?':p.shortLimit,p.longUsed||0,p.longLimit==null?'?':p.longLimit,'-']);
  else scopeKeys.forEach(function(k){var x=sc[k];budgetRows.push([id,x.kind,x.used||0,x.limit==null?'?':x.limit,'-','-',k+(x.minIntervalMs?' @'+x.minIntervalMs+'ms':'')]);});
 });
 table('Shadow budget state',['Provider','Model','Used','Limit','Long used','Long limit','Scope'],budgetRows);

 var cache=health&&health.cache||{},micro=health&&health.microstructure||{},dex=health&&health.dexLiquidity||{};
 var reportFile=path.join(DIR,'workload_report.json'),workload=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile,'utf8')):{};
 var summary={
  schema:'iatb.marketdata.workload.telemetry-analysis/1.0',
  since:since,generatedAt:Date.now(),workload:{durationMs:workload.durationMs||null,steps:workload.steps||0,success:workload.success||0,softFailures:workload.softFailures||0},
  http:{totalCalls:providerSummary.reduce(function(z,x){return z+x.calls;},0),totalErrors:providerSummary.reduce(function(z,x){return z+x.errors;},0),totalCost:providerSummary.reduce(function(z,x){return z+x.cost;},0),providers:providerSummary},
  broker:{observed:observed,cacheOpportunities:num(t[1]),dedupOpportunities:num(t[2]),avoidableUnion:avoidable,avoidablePct:observed?Math.round(avoidable/observed*1000)/10:0},
  budgetPeaks:budgetPeaks,
  caches:{marketData:cache,microstructure:micro.cache||null,openInterest:micro.openInterestCache||null,dexLiquidity:dex.cache||null},
  streams:stream.providers||[],
  regionalNotes:statusRows.filter(function(x){return x[0]==='BINANCE'&&String(x[1])==='451';}).length?['BINANCE_HTTP_451_US_CI_REGION_BLOCK']:[],
  shadowMode:health&&health.apiRequestOrchestrator&&health.apiRequestOrchestrator.mode||null
 };
 fs.writeFileSync(path.join(DIR,'telemetry_summary.json'),JSON.stringify(summary,null,2));
 console.log('\n=== TELEMETRY SUMMARY ===');
 console.log(JSON.stringify(summary,null,2));
 if(summary.shadowMode!=='SHADOW')process.exit(2);
})().catch(function(e){console.error(e&&e.stack||e);process.exit(1);});
