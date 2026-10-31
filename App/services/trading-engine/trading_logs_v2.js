'use strict';
// v2.4 compatibility migration: JSONL is authoritative, SQLite is repairable.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Database=require('better-sqlite3'),LegacyHistory=require('./history-store');
function redact(value,key=''){
 if(Array.isArray(value))return value.map(v=>redact(v,key));
 if(!value||typeof value!=='object'){
  if(typeof value!=='string')return value;
  if(/^(error|error_message|errorMessage)$/i.test(key)&&!/^[-A-Z0-9_: .]{1,120}$/.test(value))return '[REDACTED_ERROR]';
  return value.replace(/\bBearer\s+[^\s,;]+/gi,'Bearer [REDACTED]').replace(/\b(password|api[_-]?key|api[_-]?secret|access[_-]?token|authorization)\s*[:=]\s*[^\s,;&]+/gi,'$1=[REDACTED]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[REDACTED]@');
 }
 const out={};
 for(const [k,v] of Object.entries(value)){
  if(['__proto__','constructor','prototype'].includes(k))continue;
  const clean=k.replace(/[^a-z0-9]/gi,'').toLowerCase();
  if(/(?:secret|password|token|privatekey|apikey|authorization|cookie|signature|mnemonic|seedphrase|credential|accountticket)/.test(clean)||['headers','rawresponse','rawrequest'].includes(clean))out[k]='[REDACTED]';
  else out[k]=redact(v,k);
 }
 return out;
}
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(!x||typeof x!=='object')return x;return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));}
function ensurePrivateFile(file){try{const fd=fs.openSync(file,'ax',0o600);fs.closeSync(fd);}catch(e){if(e.code!=='EEXIST')throw e;}if(fs.lstatSync(file).isSymbolicLink())throw Error('TRADING_LOGS_SYMBOLIC_FILE');}
function eventId(e){return typeof e.event_id==='string'&&e.event_id||typeof e.execution_id==='string'&&e.execution_id||'legacy-'+crypto.createHash('sha256').update(JSON.stringify(canonical(e))).digest('hex');}
class TradingLogsV2{
 constructor(root,options={}){
  this.snapshotGate=options.snapshotGate||null;this.maxReplayBytes=options.maxReplayBytes||64*1024*1024;
  const user=String(options.username||process.env.IATB_USERDATA_USER||'default').replace(/[^A-Za-z0-9._-]/g,'_');
  const file=options.file||process.env.IATB_TRADING_HISTORY||(process.env.IATB_DATA_ROOT?path.join(process.env.IATB_DATA_ROOT,'User Data',user,'trading_history.jsonl'):undefined);
  this.legacy=new LegacyHistory(root,{...options,...(file?{file}: {})});this.file=this.legacy.file;
  this.dbFile=path.resolve(options.dbFile||process.env.IATB_TRADING_LOGS_DB||path.join(path.dirname(this.file),'trading_logs.db'));
  if(path.dirname(this.dbFile)!==path.dirname(this.file)||this.dbFile===this.file)throw Error('TRADING_LOGS_NAMESPACE_MISMATCH');
  this.db=null;this.insert=null;this.closed=false;this.lastError=null;this.pending=true;this.malformedLines=0;
  // Never create SQLite/WAL files or run pragmas during a frozen snapshot.
  if(!this.frozen())this.reconcile();
 }
 frozen(){return !!this.snapshotGate&&this.snapshotGate.heldEpoch!=null;}
 writable(){if(this.snapshotGate)this.snapshotGate.assertWritable();if(this.closed)throw Error('TRADING_LOGS_CLOSED');}
 open(){
  this.writable();if(this.db)return;
  ensurePrivateFile(this.dbFile);const db=new Database(this.dbFile);this.db=db;
  try{
   db.pragma('journal_mode = WAL');db.pragma('busy_timeout = 5000');
   db.exec(`CREATE TABLE IF NOT EXISTS execution_logs(log_id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,timestamp INTEGER NOT NULL,event_type TEXT,exchange TEXT,symbol TEXT,request_id TEXT,risk_approval_id TEXT,client_order_id TEXT,exchange_order_id TEXT,payload_json TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS ix_execution_logs_time ON execution_logs(timestamp);
   CREATE INDEX IF NOT EXISTS ix_execution_logs_request ON execution_logs(request_id);
   CREATE INDEX IF NOT EXISTS ix_execution_logs_exchange_order ON execution_logs(exchange,exchange_order_id);`);
   this.insert=db.prepare(`INSERT OR IGNORE INTO execution_logs(event_id,timestamp,event_type,exchange,symbol,request_id,risk_approval_id,client_order_id,exchange_order_id,payload_json,created_at) VALUES(@event_id,@timestamp,@event_type,@exchange,@symbol,@request_id,@risk_approval_id,@client_order_id,@exchange_order_id,@payload_json,@created_at)`);
  }catch(e){db.close();this.db=null;throw e;}
 }
 writeSqlite(event){
  this.writable();this.open();const safe=redact(event),timestamp=Number.isFinite(Number(safe.timestamp))?Number(safe.timestamp):0;
  this.insert.run({event_id:eventId(safe),timestamp,event_type:safe.event_type||null,exchange:safe.exchange?String(safe.exchange).toUpperCase():null,symbol:safe.symbol?String(safe.symbol).toUpperCase():null,request_id:safe.request_id||null,risk_approval_id:safe.risk_approval_id||null,client_order_id:safe.client_order_id||null,exchange_order_id:safe.exchange_order_id||null,payload_json:JSON.stringify(safe),created_at:Date.now()});
 }
 reconcile(){
  this.writable();this.pending=true;
  try{
   this.open();let raw='';
   try{if(fs.statSync(this.file).size>this.maxReplayBytes)throw Error('TRADING_LOGS_REPLAY_LIMIT');raw=fs.readFileSync(this.file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
   let malformed=0;
   this.db.transaction(()=>{for(const line of raw.split(/\r?\n/)){
    if(!line.trim())continue;let event;try{event=JSON.parse(line);}catch(_){malformed++;continue;}
    if(!event||typeof event!=='object'||Array.isArray(event)){malformed++;continue;}
    this.writeSqlite(event);
   }})();
   this.malformedLines=malformed;this.pending=false;this.lastError=malformed?'TRADING_LOGS_MALFORMED_LEGACY_LINES':null;return !malformed;
  }catch(e){this.lastError=e.message==='TRADING_LOGS_REPLAY_LIMIT'?e.message:'TRADING_LOGS_SQLITE_UNAVAILABLE';return false;}
 }
 append(event){
  this.writable();if(!event||typeof event!=='object'||Array.isArray(event))throw Error('TRADING_LOG_EVENT_INVALID');
  // Redact once, BEFORE both destinations. Never persist the caller's object.
  const safe=JSON.parse(JSON.stringify(redact(event)));
  if(safe.timestamp==null||!Number.isFinite(Number(safe.timestamp)))safe.timestamp=Date.now();
  ensurePrivateFile(this.file);this.legacy.append(safe);
  if(this.pending)return this.reconcile();
  try{this.writeSqlite(safe);return true;}catch(_){this.pending=true;this.lastError='TRADING_LOGS_SQLITE_UNAVAILABLE';return false;}
 }
 list(options){return this.legacy.list(options).map(x=>redact(x));}
 listSqlite({limit=200,since=0,exchange,symbol}={}){
  // Never expose SQLite through a new public/CP1 route during migration.
  if(!this.db){if(this.frozen())throw Error('TRADING_LOGS_SNAPSHOT_FROZEN');if(!this.reconcile())throw Error(this.lastError);}
  const count=Math.min(2000,Math.max(1,Math.trunc(Number(limit)||200))),args=[Number(since)||0];
  let sql='SELECT payload_json FROM execution_logs WHERE timestamp >= ?';
  if(exchange){sql+=' AND exchange = ?';args.push(String(exchange).toUpperCase());}
  if(symbol){sql+=' AND symbol = ?';args.push(String(symbol).toUpperCase());}
  sql+=' ORDER BY timestamp DESC,log_id DESC LIMIT ?';args.push(count);
  return this.db.prepare(sql).all(...args).reverse().map(r=>redact(JSON.parse(r.payload_json)));
 }
 status(){return {mode:'JSONL_SQLITE_WAL',authoritative:'JSONL',sqliteReady:!!this.db,pendingReplay:this.pending,malformedLegacyLines:this.malformedLines,lastError:this.lastError};}
 close(){if(this.db)this.db.close();this.db=null;this.closed=true;}
}
module.exports={TradingLogsV2,redact};
