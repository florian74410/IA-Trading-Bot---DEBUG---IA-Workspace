'use strict';
var fs=require('fs'),path=require('path'),os=require('os'),SqliteCompat=require('../../Core/Shared/sqlite_compat');
function q(s){return "'"+String(s==null?'':s).replace(/'/g,"''")+"'";}
function n(v){v=+v;return isFinite(v)?v:null;}
function Store(o){
 o=o||{};this.native=null;
 this.retentionDays=Math.max(7,Math.min(365,+o.retentionDays||90));
 this.file=path.resolve(o.file||process.env.IATB_API_TELEMETRY_DB||path.join(process.env.IATB_DATA_ROOT||path.join(os.homedir(),'IA-TB-UserData-Server'),'Shared Data','MarketData','api_telemetry.db'));
 this.ready=false;this.lastError='';this.lastPruneAt=0;this.snapshotGate=o.snapshotGate||null;if(this.snapshotGate&&typeof this.snapshotGate.assertWritable!=='function')throw new Error('SNAPSHOT_GATE_INVALID');if(this.snapshotGate)this.snapshotGate.assertWritable();this.init();
}
Store.prototype.run=function(sql,read){if(this.snapshotGate)this.snapshotGate.assertWritable();
 if(!this.native)this.native=new SqliteCompat(this.file,{timeoutMs:5000});
 return this.native.run(sql,read);
};
Store.prototype.close=function(){if(this.snapshotGate)this.snapshotGate.assertWritable();if(this.native){this.native.close();this.native=null;}};
Store.prototype.init=function(){if(this.snapshotGate)this.snapshotGate.assertWritable();try{
 this.run("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;"+
 " CREATE TABLE IF NOT EXISTS api_calls(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT,timestamp INTEGER NOT NULL,completed_at INTEGER,provider TEXT,host TEXT,method TEXT,path TEXT,dataset TEXT,phase TEXT,status_code INTEGER,ok INTEGER,latency_ms INTEGER,response_bytes INTEGER,cost REAL,priority TEXT,freshness TEXT,criticality TEXT,cache_opportunity INTEGER,dedup_opportunity INTEGER,budget_short_allow INTEGER,budget_long_allow INTEGER,error_code TEXT,meta_json TEXT);"+
 " CREATE INDEX IF NOT EXISTS idx_api_calls_ts ON api_calls(timestamp);"+
 " CREATE INDEX IF NOT EXISTS idx_api_calls_provider_ts ON api_calls(provider,timestamp);"+
 " CREATE INDEX IF NOT EXISTS idx_api_calls_dataset_ts ON api_calls(dataset,timestamp);"+
 " CREATE INDEX IF NOT EXISTS idx_api_calls_request ON api_calls(request_id); CREATE TABLE IF NOT EXISTS stream_events(id INTEGER PRIMARY KEY AUTOINCREMENT,timestamp INTEGER NOT NULL,provider TEXT NOT NULL,event_type TEXT NOT NULL,state TEXT,connections INTEGER,reconnects INTEGER,subscriptions INTEGER,messages INTEGER,last_message_at INTEGER,last_heartbeat_at INTEGER,error_code TEXT,meta_json TEXT); CREATE INDEX IF NOT EXISTS idx_stream_ts ON stream_events(timestamp); CREATE INDEX IF NOT EXISTS idx_stream_provider_ts ON stream_events(provider,timestamp);");
 this.ready=true;this.prune(true);
 }catch(e){this.ready=false;this.lastError=e.message;}
};
Store.prototype.save=function(x){if(this.snapshotGate)this.snapshotGate.assertWritable();
 if(!this.ready||!x)return false;
 try{
  this.run("INSERT INTO api_calls(request_id,timestamp,completed_at,provider,host,method,path,dataset,phase,status_code,ok,latency_ms,response_bytes,cost,priority,freshness,criticality,cache_opportunity,dedup_opportunity,budget_short_allow,budget_long_allow,error_code,meta_json) VALUES("+[
   q(x.requestId||''),Math.round(+x.timestamp||Date.now()),x.completedAt?Math.round(+x.completedAt):'NULL',q(String(x.provider||'UNKNOWN').toUpperCase()),q(x.host||''),q(String(x.method||'GET').toUpperCase()),q(x.path||''),q(String(x.dataset||'').toUpperCase()),q(String(x.phase||'').toUpperCase()),x.statusCode!=null?Math.round(+x.statusCode):'NULL',x.ok==null?'NULL':(x.ok?1:0),n(x.latencyMs)!=null?Math.round(+x.latencyMs):'NULL',n(x.responseBytes)!=null?Math.round(+x.responseBytes):'NULL',n(x.cost)!=null?+x.cost:'NULL',q(x.priority||''),q(x.freshness||''),q(x.criticality||''),x.cacheOpportunity==null?'NULL':(x.cacheOpportunity?1:0),x.dedupOpportunity==null?'NULL':(x.dedupOpportunity?1:0),x.budgetShortAllow==null?'NULL':(x.budgetShortAllow?1:0),x.budgetLongAllow==null?'NULL':(x.budgetLongAllow?1:0),q(x.errorCode||''),q(JSON.stringify(x.meta||{}))
  ].join(',')+");");
  this.lastError='';this.prune(false);return true;
 }catch(e){this.lastError=e.message;return false;}
};
Store.prototype.prune=function(force){if(this.snapshotGate)this.snapshotGate.assertWritable();
 if(!this.ready)return;if(!force&&Date.now()-this.lastPruneAt<3600000)return;
 try{var cut=Date.now()-this.retentionDays*86400000;this.run('DELETE FROM api_calls WHERE timestamp < '+Math.round(cut)+'; DELETE FROM stream_events WHERE timestamp < '+Math.round(cut)+';');this.lastPruneAt=Date.now();this.lastError='';}catch(e){this.lastError=e.message;}
};
Store.prototype.saveStream=function(x){if(this.snapshotGate)this.snapshotGate.assertWritable();
 if(!this.ready||!x)return false;
 try{this.run("INSERT INTO stream_events(timestamp,provider,event_type,state,connections,reconnects,subscriptions,messages,last_message_at,last_heartbeat_at,error_code,meta_json) VALUES("+[
  Math.round(+x.timestamp||Date.now()),q(String(x.provider||'UNKNOWN').toUpperCase()),q(String(x.eventType||'STATUS').toUpperCase()),q(String(x.state||'').toUpperCase()),
  n(x.connections)!=null?Math.round(+x.connections):'NULL',n(x.reconnects)!=null?Math.round(+x.reconnects):'NULL',n(x.subscriptions)!=null?Math.round(+x.subscriptions):'NULL',
  n(x.messages)!=null?Math.round(+x.messages):'NULL',n(x.lastMessageAt)!=null?Math.round(+x.lastMessageAt):'NULL',n(x.lastHeartbeatAt)!=null?Math.round(+x.lastHeartbeatAt):'NULL',
  q(x.errorCode||''),q(JSON.stringify(x.meta||{}))
 ].join(',')+");");this.lastError='';this.prune(false);return true;}catch(e){this.lastError=e.message;return false;}
};
Store.prototype.streamHistory=function(o){if(this.snapshotGate)this.snapshotGate.assertWritable();
 o=o||{};if(!this.ready)return{ok:false,error:'STREAM_TELEMETRY_SQL_UNAVAILABLE',items:[]};
 var provider=String(o.provider||'').toUpperCase(),since=Math.max(0,+o.since||0),limit=Math.max(1,Math.min(10000,+o.limit||500)),where=[];
 if(provider)where.push('provider='+q(provider));if(since)where.push('timestamp>='+Math.round(since));
 try{var raw=this.run('SELECT timestamp,provider,event_type,state,connections,reconnects,subscriptions,messages,last_message_at,last_heartbeat_at,error_code FROM stream_events'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY timestamp DESC LIMIT '+limit+';',true).trim(),items=[];
  if(raw)raw.split(/\r?\n/).filter(Boolean).forEach(function(line){var a=line.split('\t');items.push({timestamp:+a[0]||null,provider:a[1],eventType:a[2],state:a[3],connections:a[4]?+a[4]:null,reconnects:a[5]?+a[5]:null,subscriptions:a[6]?+a[6]:null,messages:a[7]?+a[7]:null,lastMessageAt:a[8]?+a[8]:null,lastHeartbeatAt:a[9]?+a[9]:null,errorCode:a[10]});});
  return{ok:true,schema:'marketdata.stream.telemetry.history/1.0',items:items,count:items.length,retentionDays:this.retentionDays};
 }catch(e){this.lastError=e.message;return{ok:false,error:e.message,items:[]};}
};
Store.prototype.streamSummary=function(o){if(this.snapshotGate)this.snapshotGate.assertWritable();
 o=o||{};if(!this.ready)return{ok:false,error:'STREAM_TELEMETRY_SQL_UNAVAILABLE',providers:[]};var since=Math.max(0,+o.since||Date.now()-86400000);
 try{var raw=this.run("SELECT provider,COUNT(*),MAX(messages),MAX(reconnects),MAX(subscriptions),MAX(last_message_at),MAX(last_heartbeat_at),SUM(CASE WHEN event_type='ERROR' OR state='ERROR' OR state='DEGRADED' THEN 1 ELSE 0 END) FROM stream_events WHERE timestamp>="+Math.round(since)+" GROUP BY provider ORDER BY provider;",true).trim(),rows=[];
  if(raw)raw.split(/\r?\n/).filter(Boolean).forEach(function(line){var a=line.split('\t');rows.push({provider:a[0],samples:+a[1]||0,messages:+a[2]||0,reconnects:+a[3]||0,subscriptions:+a[4]||0,lastMessageAt:+a[5]||null,lastHeartbeatAt:+a[6]||null,errorSamples:+a[7]||0});});
  return{ok:true,schema:'marketdata.stream.telemetry.summary/1.0',since:since,providers:rows};
 }catch(e){this.lastError=e.message;return{ok:false,error:e.message,providers:[]};}
};
Store.prototype.history=function(o){if(this.snapshotGate)this.snapshotGate.assertWritable();
 o=o||{};if(!this.ready)return{ok:false,error:'API_TELEMETRY_SQL_UNAVAILABLE',items:[]};
 var provider=String(o.provider||'').toUpperCase(),dataset=String(o.dataset||'').toUpperCase(),phase=String(o.phase||'HTTP_END').toUpperCase(),since=Math.max(0,+o.since||0),limit=Math.max(1,Math.min(10000,+o.limit||500)),where=[];
 if(provider)where.push('provider='+q(provider));if(dataset)where.push('dataset='+q(dataset));if(phase)where.push('phase='+q(phase));if(since)where.push('timestamp>='+Math.round(since));
 try{var raw=this.run('SELECT request_id,timestamp,completed_at,provider,host,method,path,dataset,phase,status_code,ok,latency_ms,response_bytes,cost,priority,freshness,criticality,cache_opportunity,dedup_opportunity,budget_short_allow,budget_long_allow,error_code FROM api_calls'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY timestamp DESC LIMIT '+limit+';',true).trim(),items=[];
  if(raw)raw.split(/\r?\n/).filter(Boolean).forEach(function(line){var a=line.split('\t');items.push({requestId:a[0],timestamp:+a[1]||null,completedAt:+a[2]||null,provider:a[3],host:a[4],method:a[5],path:a[6],dataset:a[7],phase:a[8],statusCode:a[9]?+a[9]:null,ok:a[10]===''?null:a[10]==='1',latencyMs:a[11]?+a[11]:null,responseBytes:a[12]?+a[12]:null,cost:a[13]?+a[13]:null,priority:a[14],freshness:a[15],criticality:a[16],cacheOpportunity:a[17]===''?null:a[17]==='1',dedupOpportunity:a[18]===''?null:a[18]==='1',budgetShortAllow:a[19]===''?null:a[19]==='1',budgetLongAllow:a[20]===''?null:a[20]==='1',errorCode:a[21]});});
  return{ok:true,schema:'marketdata.api.telemetry.history/1.0',items:items,count:items.length,retentionDays:this.retentionDays};
 }catch(e){this.lastError=e.message;return{ok:false,error:e.message,items:[]};}
};
Store.prototype.summary=function(o){if(this.snapshotGate)this.snapshotGate.assertWritable();
 o=o||{};if(!this.ready)return{ok:false,error:'API_TELEMETRY_SQL_UNAVAILABLE',providers:[]};
 var since=Math.max(0,+o.since||Date.now()-86400000),where="phase='HTTP_END' AND timestamp>="+Math.round(since);
 try{var raw=this.run("SELECT provider,COUNT(*),SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END),SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END),ROUND(AVG(latency_ms),1),SUM(COALESCE(response_bytes,0)),SUM(COALESCE(cost,0)) FROM api_calls WHERE "+where+" GROUP BY provider ORDER BY COUNT(*) DESC;",true).trim(),rows=[];
  if(raw)raw.split(/\r?\n/).filter(Boolean).forEach(function(line){var a=line.split('\t');rows.push({provider:a[0],calls:+a[1]||0,success:+a[2]||0,errors:+a[3]||0,avgLatencyMs:+a[4]||0,responseBytes:+a[5]||0,cost:+a[6]||0});});
  return{ok:true,schema:'marketdata.api.telemetry.summary/1.0',since:since,providers:rows};
 }catch(e){this.lastError=e.message;return{ok:false,error:e.message,providers:[]};}
};
Store.prototype.purgeManual=function(o){if(this.snapshotGate)this.snapshotGate.assertWritable();
 o=o||{};if(String(o.confirm||'')!=='PURGE')return{ok:false,error:'PURGE_CONFIRMATION_REQUIRED'};
 if(!this.ready)return{ok:false,error:'API_TELEMETRY_SQL_UNAVAILABLE'};
 var target=String(o.target||'ALL').toUpperCase(),before=+o.before||0,where=before?' WHERE timestamp < '+Math.round(before):'',parts=[];
 if(target==='ALL'||target==='API')parts.push('DELETE FROM api_calls'+where+';');
 if(target==='ALL'||target==='STREAM')parts.push('DELETE FROM stream_events'+where+';');
 if(!parts.length)return{ok:false,error:'PURGE_TARGET_INVALID'};
 try{var beforeStatus=this.status();this.run(parts.join(' '));var afterStatus=this.status();this.lastError='';return{ok:true,target:target,before:before||null,removedApi:Math.max(0,(beforeStatus.events||0)-(afterStatus.events||0)),removedStreams:Math.max(0,(beforeStatus.streamEvents||0)-(afterStatus.streamEvents||0)),remainingApi:afterStatus.events||0,remainingStreams:afterStatus.streamEvents||0};}
 catch(e){this.lastError=e.message;return{ok:false,error:e.message};}
};
// Reuse persistent HTTP telemetry: failed attempts count, duplicate phases do not.
Store.prototype.coingeckoUsage=function(){if(this.snapshotGate)this.snapshotGate.assertWritable();
 if(!this.ready||this.lastError||this.retentionDays<30)return{ok:false,error:'COINGECKO_QUOTA_HISTORY_UNAVAILABLE'};
 try{
  var now=Date.now(),r=this.run("SELECT COUNT(DISTINCT CASE WHEN phase='HTTP_START' THEN request_id END),COUNT(DISTINCT CASE WHEN phase='HTTP_START' AND timestamp>="+(now-60000)+" THEN request_id END) FROM api_calls WHERE provider='COINGECKO' AND timestamp>="+(now-2592000000)+";",true).trim().split('\t');
  var last=this.run("SELECT completed_at,meta_json FROM api_calls WHERE provider='COINGECKO' AND phase='HTTP_END' AND status_code=429 ORDER BY timestamp DESC LIMIT 1;",true).trim().split('\t'),until=0;
  if(last[0]){var at=+last[0],h=JSON.parse(last[1]||'{}').quotaHeaders||{},raw=h['retry-after'],delay=isFinite(+raw)?+raw*1000:Math.max(0,Date.parse(raw)-at)||0;until=at+Math.max(900000,delay);}
  return{ok:true,monthUsed:+r[0]||0,minuteUsed:+r[1]||0,cooldownUntil:until,windowMs:2592000000,scope:'THIS_MARKET_DATA_TELEMETRY_NOT_SHARED_IP_OR_ACCOUNT'};
 }catch(e){return{ok:false,error:e.message};}
};
Store.prototype.status=function(){if(this.snapshotGate)this.snapshotGate.assertWritable();
 var count=0,oldest=null,newest=null,providers=0,streamEvents=0,streamProviders=0;if(this.ready)try{
  var r=this.run('SELECT COUNT(*),MIN(timestamp),MAX(timestamp) FROM api_calls;',true).trim().split('\t');count=+r[0]||0;oldest=+r[1]||null;newest=+r[2]||null;providers=+(this.run("SELECT COUNT(DISTINCT provider) FROM api_calls WHERE provider<>'';",true).trim())||0;streamEvents=+(this.run('SELECT COUNT(*) FROM stream_events;',true).trim())||0;streamProviders=+(this.run("SELECT COUNT(DISTINCT provider) FROM stream_events WHERE provider<>'';",true).trim())||0;
 }catch(e){this.lastError=e.message;}
 var size=0;try{size=fs.existsSync(this.file)?fs.statSync(this.file).size:0;}catch(e){}return{ok:this.ready,mode:'SQLITE',file:this.file,sizeBytes:size,retentionDays:this.retentionDays,events:count,providers:providers,streamEvents:streamEvents,streamProviders:streamProviders,oldestTimestamp:oldest,newestTimestamp:newest,lastError:this.lastError||null};
};
module.exports=Store;
