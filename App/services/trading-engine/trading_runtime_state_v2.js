'use strict';
// The existing lifecycle now shares the FULL/WAL ADMIN journal. JSON is imported once.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const STATES=new Set(['STOPPED','STARTING','RUNNING','DRAINING','DRAINING_BLOCKED','RECONCILING','EMERGENCY_HALTED','DEGRADED','ERROR']);
const BLOCKED=new Set([...STATES].filter(s=>s!=='RUNNING'));
const PRESERVE=new Set(['EMERGENCY_HALTED','DRAINING','DRAINING_BLOCKED','RECONCILING','ERROR']);
function defaultPath(env=process.env){return path.resolve(env.IATB_DATA_ROOT||path.join(require('os').homedir(),'IA-TB-UserData-Server'),'User Data',String(env.IATB_USERDATA_USER||'default').replace(/[^A-Za-z0-9._-]/g,'_'),'trading_runtime_state.json');}
class RuntimeState {
 constructor(options={}){
  this.file=path.resolve(options.file||process.env.IATB_TRADING_RUNTIME_STATE||defaultPath());this.now=options.now||Date.now;
  this.dbFile=options.dbFile||path.join(path.dirname(this.file),'trading_admin_actions.db');
  try{
   fs.mkdirSync(path.dirname(this.dbFile),{recursive:true,mode:0o700});
   this.db=new (require('better-sqlite3'))(this.dbFile);
   this.storeIdentity=fs.statSync(this.dbFile);
   fs.chmodSync(this.dbFile,0o600);
   this.db.pragma('journal_mode = WAL');this.db.pragma('synchronous = FULL');this.db.pragma('busy_timeout = 5000');
   this.db.exec(`CREATE TABLE IF NOT EXISTS trading_lifecycle(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS trading_operations(id TEXT PRIMARY KEY,kind TEXT NOT NULL,run_id TEXT,phase TEXT NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS trading_lifecycle_events(seq INTEGER PRIMARY KEY,at INTEGER NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL);`);
   this.db.transaction(()=>{
    if(!this.db.prepare('SELECT id FROM trading_lifecycle WHERE id=1').get()){
     let prior={schema:1,state:'STOPPED',reason:'INITIAL_INSTALL',recovery_required:true,updated_at:this.now(),generation:0};
     try{prior=JSON.parse(fs.readFileSync(this.file,'utf8'));if(prior.schema!==1||!STATES.has(prior.state))throw Error('INVALID');}
     catch(e){if(e.code!=='ENOENT')prior={...prior,state:'ERROR',reason:'STATE_STORE_UNREADABLE',recovery_required:true};}
     this.db.prepare('INSERT INTO trading_lifecycle VALUES(1,?)').run(JSON.stringify({...prior,generation:0}));
    }
   }).immediate();
   fs.chmodSync(this.dbFile,0o600);
  }catch(_){this.failed=true;}
 }
 snapshot(){
  try{
   if(this.failed||!this.db)throw Error('STORE');
   const st=fs.statSync(this.dbFile);if(st.ino!==this.storeIdentity.ino||st.dev!==this.storeIdentity.dev)throw Error('STORE_REPLACED');
   const s=JSON.parse(this.db.prepare('SELECT data FROM trading_lifecycle WHERE id=1').get().data);
   if(s.schema!==1||!STATES.has(s.state)||!Number.isSafeInteger(s.generation))throw Error('STATE');
   return {...s,execution_allowed:s.state==='RUNNING'&&s.recovery_required===false};
  }catch(_){return {schema:1,state:'ERROR',reason:'STATE_STORE_UNREADABLE',recovery_required:true,execution_allowed:false};}
 }
 transition(state,reason,extra={}){
  if(!STATES.has(state))throw Error('RUNTIME_STATE_INVALID');
  return this.db.transaction(()=>{
   const prior=this.snapshot();if(prior.reason==='STATE_STORE_UNREADABLE')throw Error('STATE_STORE_UNREADABLE');
   if(prior.state==='EMERGENCY_HALTED'&&state!=='EMERGENCY_HALTED')throw Error('EMERGENCY_RECOVERY_REQUIRED');
   const next={...prior,...extra,schema:1,state,reason:String(reason||'UNSPECIFIED'),updated_at:this.now(),generation:prior.generation+1};delete next.execution_allowed;
   this.db.prepare('UPDATE trading_lifecycle SET data=? WHERE id=1').run(JSON.stringify(next));
   this.db.prepare('INSERT INTO trading_lifecycle_events(at,state,reason) VALUES(?,?,?)').run(this.now(),state,next.reason);
   return this.snapshot();
  }).immediate();
 }
 boot(){const s=this.snapshot();if(['RUNNING','STARTING','DEGRADED'].includes(s.state))this.transition('ERROR','UNCLEAN_SHUTDOWN_RECONCILIATION_REQUIRED',{recovery_required:true});else if(['DRAINING','RECONCILING'].includes(s.state))this.transition('DRAINING_BLOCKED','INTERRUPTED_DRAIN_RECONCILIATION_REQUIRED',{recovery_required:true});return this.snapshot();}
 shutdown(){const s=this.snapshot();if(PRESERVE.has(s.state))return s;return this.transition('STOPPED','PROCESS_SIGNAL_STOP',{recovery_required:true});}
 canExecute(){return this.snapshot().execution_allowed;}
 // Never hold a transaction across await. Reserve durably BEFORE the final send fence.
 submit({id=crypto.randomUUID(),kind='ORDER',runId=null,generation},send){
  this.db.prepare('INSERT INTO trading_operations VALUES(?,?,?,?,?)').run(id,kind,runId,'UNCERTAIN',this.now());
  let result;
  this.db.transaction(()=>{
   const s=this.snapshot();
   const allowed=runId?s.state==='DRAINING'&&s.run_id===runId:s.execution_allowed;
   if(!allowed||(generation!==undefined&&generation!==s.generation)){
    this.db.prepare('UPDATE trading_operations SET phase=? WHERE id=?').run('NOT_SENT',id);return;
   }
   result={promise:send()}; // synchronous invocation of the transport, no async queue here
  }).immediate();
  if(!result)throw Error('TRADING_SUBMISSION_REVOKED');
  return result.promise;
 }
 close(){if(this.db&&this.db.open)this.db.close();}
}
module.exports={RuntimeState,STATES,BLOCKED,defaultPath};
