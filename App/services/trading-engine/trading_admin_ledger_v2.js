'use strict';
// Durable, fail-closed ADMIN command ledger. No secrets or raw identity tokens stored.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
class AdminCommandLedger {
 constructor({file,now=Date.now,db=null}={}){
  if(!file)throw Error('LEDGER_PATH_REQUIRED');
  this.file=path.resolve(file);this.now=now;
  fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
  const Database=require('better-sqlite3');
  this.ownsDb=!db;this.db=db||new Database(this.file);
  this.db.pragma('journal_mode = WAL');this.db.pragma('synchronous = FULL');this.db.pragma('busy_timeout = 5000');
  this.db.exec(`CREATE TABLE IF NOT EXISTS admin_commands(
    command_id TEXT PRIMARY KEY, command TEXT NOT NULL, actor_hash TEXT NOT NULL,
    fingerprint TEXT NOT NULL, received_at INTEGER NOT NULL, decision TEXT NOT NULL, detail TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS admin_commands_time ON admin_commands(received_at);`);
  this.ins=this.db.prepare('INSERT INTO admin_commands(command_id,command,actor_hash,fingerprint,received_at,decision,detail) VALUES(?,?,?,?,?,?,?)');
  this.get=this.db.prepare('SELECT command_id,command,actor_hash,fingerprint,received_at,decision,detail FROM admin_commands WHERE command_id=?');
 }
 record({command_id,command,actor,fingerprint,decision,detail}){
  const actor_hash=crypto.createHash('sha256').update(String(actor)).digest('hex');
  const existing=this.get.get(command_id);
  if(existing)return {ok:false,error:'ADMIN_COMMAND_REPLAY',previousDecision:existing.decision};
  try{
   this.ins.run(command_id,command,actor_hash,fingerprint,this.now(),decision,String(detail||'').slice(0,100));
   return {ok:true};
  }catch(e){if(e.code==='SQLITE_CONSTRAINT_PRIMARYKEY')return {ok:false,error:'ADMIN_COMMAND_REPLAY'};throw e;}
 }
 close(){if(this.ownsDb)this.db.close();}
}
module.exports={AdminCommandLedger};
