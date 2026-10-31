'use strict';
// Independent durable Auth21 proof claims for Firewall and Trading Engine.
// A proof must be consumable once per service; each has a different DB.
const fs=require('node:fs'),path=require('node:path');
function createProofReplayStore({file}={}){
 if(!file||!path.isAbsolute(file))throw Error('AUTH21_REPLAY_PATH_REQUIRED');
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const Database=require('better-sqlite3'),db=new Database(file);
 db.pragma('journal_mode = WAL');db.pragma('synchronous = FULL');db.pragma('busy_timeout = 5000');
 db.exec('CREATE TABLE IF NOT EXISTS proof_claims (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
 const claim=db.transaction((key,expiry,now)=>{
   if(typeof key!=='string'||!/^trading:[A-Za-z0-9_-]{22}$/.test(key)||!Number.isSafeInteger(expiry)||expiry<=now)return false;
   db.prepare('DELETE FROM proof_claims WHERE expires_at <= ?').run(now);
   return db.prepare('INSERT OR IGNORE INTO proof_claims(id,expires_at) VALUES (?,?)').run(key,expiry).changes===1;
 });
 return {claim,close:()=>db.close()};
}
module.exports={createProofReplayStore};
