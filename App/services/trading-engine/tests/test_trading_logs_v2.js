'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {TradingLogsV2}=require('../trading_logs_v2'),{formatExecutionLog}=require('../trading_logs_formatter_v2');
function fixture(t,options={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-logs-v24-'));const file=path.join(dir,'history.jsonl');const logs=new TradingLogsV2(dir,{file,...options});t.after(()=>{if(!logs.closed)logs.close();fs.rmSync(dir,{recursive:true,force:true});});return {dir,file,logs};}
function event(extra={}){return {event_id:'event-1',timestamp:1730000000000,event_type:'ORDER_ACCEPTED',exchange:'BINANCE',symbol:'BTC/USDT',request_id:'request-1',ok:true,...extra};}
test('legacy API and WAL mirror survive restart; both outputs redact credentials',t=>{
 const {dir,file,logs}=fixture(t);
 const input=event({metadata:{token:'FIXTURE_TOKEN',apiSecret:'FIXTURE_API_SECRET',nested:{access_token:'FIXTURE_ACCESS'},error:'provider password=FIXTURE_PASSWORD'}});
 logs.append(input);assert.equal(input.metadata.token,'FIXTURE_TOKEN');
 assert.equal(logs.list({}).length,1);assert.equal(logs.listSqlite({}).length,1);
 for(const raw of [fs.readFileSync(file,'utf8'),JSON.stringify(logs.listSqlite({}))])for(const secret of ['FIXTURE_TOKEN','FIXTURE_API_SECRET','FIXTURE_ACCESS','FIXTURE_PASSWORD'])assert(!raw.includes(secret));
 assert.equal(logs.db.pragma('journal_mode',{simple:true}),'wal');
 for(const f of [file,logs.dbFile])assert.equal(fs.statSync(f).mode&0o777,0o600);
 logs.close();const again=new TradingLogsV2(dir,{file});assert.equal(again.listSqlite({exchange:'binance'}).length,1);again.close();
});
test('events sharing request_id are retained; no-ID backfill deduplicates across restart',t=>{
 const {dir,file,logs}=fixture(t);logs.append(event());logs.append(event({event_id:'event-2',event_type:'ORDER_FILLED'}));
 logs.append(event({event_id:undefined,event_type:'ORDER_CANCELLED'}));logs.append(event({event_id:undefined,event_type:'POSITION_CLOSED'}));
 assert.equal(logs.listSqlite({}).length,4);logs.close();
 const again=new TradingLogsV2(dir,{file});assert.equal(again.listSqlite({}).length,4);again.reconcile();assert.equal(again.listSqlite({}).length,4);again.close();
});
test('real SQLite read-only failure leaves JSONL readable and is repaired after restart',t=>{
 const {dir,file,logs}=fixture(t);logs.append(event());logs.db.pragma('query_only = ON');
 assert.equal(logs.append(event({event_id:'event-2'})),false);assert.equal(logs.list({}).length,2);assert.equal(logs.listSqlite({}).length,1);
 assert.equal(logs.status().pendingReplay,true);assert.equal(logs.status().lastError,'TRADING_LOGS_SQLITE_UNAVAILABLE');logs.close();
 const again=new TradingLogsV2(dir,{file});assert.equal(again.listSqlite({}).length,2);assert.equal(again.status().pendingReplay,false);again.close();
});
test('JSONL write failure never creates an unmatched SQLite event',t=>{
 const {dir,logs}=fixture(t);logs.legacy.file=dir;logs.file=dir;
 assert.throws(()=>logs.append(event()));assert.equal(logs.listSqlite({}).length,0);
});
test('frozen snapshot never creates SQLite/WAL or appends; replay works after thaw',t=>{
 const gate={heldEpoch:7,assertWritable(){if(this.heldEpoch!==null)throw Error('SNAPSHOT_FROZEN');}};
 const {logs}=fixture(t,{snapshotGate:gate,resumeFrozenReadOnly:true});assert.equal(fs.existsSync(logs.dbFile),false);
 assert.throws(()=>logs.append(event()),/SNAPSHOT_FROZEN/);assert.throws(()=>logs.listSqlite({}),/SNAPSHOT_FROZEN/);
 gate.heldEpoch=null;assert.equal(logs.reconcile(),true);assert.equal(logs.append(event()),true);assert.equal(logs.listSqlite({}).length,1);
});
test('history import is bounded, handles malformed lines explicitly and preserves source',t=>{
 const {file,logs}=fixture(t);fs.writeFileSync(file,JSON.stringify(event())+'\n{broken\n');assert.equal(logs.reconcile(),false);assert.equal(logs.status().malformedLegacyLines,1);assert.equal(logs.listSqlite({}).length,1);
 const before=fs.readFileSync(file,'utf8');logs.maxReplayBytes=1;assert.equal(logs.reconcile(),false);assert.equal(logs.status().lastError,'TRADING_LOGS_REPLAY_LIMIT');assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('formatter preserves real zero values and redacts unsafe error text',()=>{
 const out=formatExecutionLog(event({quantity:0,filled_quantity:0,average_price:0,timestamp:0,metadata:{error:'https://user:FIXTURE_PASSWORD@host.invalid'}}));
 assert.equal(out.quantity,0);assert.equal(out.filledQuantity,0);assert.equal(out.averagePrice,0);assert.equal(out.timestamp,0);assert(!out.error.includes('FIXTURE_PASSWORD'));
});
test('separate user namespace files stay separate; shared database override is rejected',t=>{
 const {dir}=fixture(t);const a=new TradingLogsV2(dir,{file:path.join(dir,'alice','history.jsonl')}),b=new TradingLogsV2(dir,{file:path.join(dir,'bob','history.jsonl')});
 try{a.append(event());assert.equal(a.listSqlite({}).length,1);assert.equal(b.listSqlite({}).length,0);assert.throws(()=>new TradingLogsV2(dir,{file:path.join(dir,'bob','history.jsonl'),dbFile:a.dbFile}),/NAMESPACE_MISMATCH/);}finally{a.close();b.close();}
});
test('configured data root owns the persistent history namespace',t=>{
 const {dir}=fixture(t);const before=process.env.IATB_DATA_ROOT;const previous=process.env.IATB_TRADING_HISTORY;delete process.env.IATB_TRADING_HISTORY;process.env.IATB_DATA_ROOT=dir;let logs;
 try{logs=new TradingLogsV2(dir,{username:'alice'});assert.equal(logs.file,path.join(dir,'User Data','alice','trading_history.jsonl'));logs.append(event());assert.equal(logs.list({}).length,1);}finally{logs?.close();if(before===undefined)delete process.env.IATB_DATA_ROOT;else process.env.IATB_DATA_ROOT=before;if(previous===undefined)delete process.env.IATB_TRADING_HISTORY;else process.env.IATB_TRADING_HISTORY=previous;}
});
