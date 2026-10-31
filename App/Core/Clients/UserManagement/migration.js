'use strict';
const fs=require('node:fs'),path=require('node:path');
// Explicit offline operation only. No identity DB/key is generated or replaced.
async function migrate(db,{backupFile,keyFile,confirm}={}){
 if(confirm!=='MIGRATE USER MANAGEMENT V1')throw Error('MIGRATION_CONFIRMATION_REQUIRED');
 if(!backupFile||!path.isAbsolute(backupFile)||fs.existsSync(backupFile))throw Error('MIGRATION_NEW_BACKUP_REQUIRED');
 if(!keyFile||!path.isAbsolute(keyFile)||fs.realpathSync(keyFile)!==keyFile||fs.realpathSync(path.dirname(backupFile))!==path.dirname(backupFile))throw Error('MIGRATION_CANONICAL_PATHS_REQUIRED');
 const stat=fs.lstatSync(keyFile);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)||!/^[a-f0-9]{64}$/i.test(fs.readFileSync(keyFile,'utf8').trim()))throw Error('MIGRATION_ORIGINAL_KEY_REQUIRED');
 if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw Error('MIGRATION_DB_INVALID');
 // SQLite online backup includes committed WAL. Operator must stop old writers
 // before migration; this code does not claim to coordinate the entire stack.
 const cipher=new (require('../client_crypto'))(keyFile,{clientDbPath:db.name});
 for(const row of db.prepare('SELECT first_name_enc,email_enc FROM clients').iterate()){cipher.open(row.first_name_enc);cipher.open(row.email_enc);}
 const fd=fs.openSync(backupFile,'wx',0o600);fs.closeSync(fd);
 await db.backup(backupFile);fs.chmodSync(backupFile,0o600);
 try{
  if(!db.prepare('SELECT 1 FROM client_schema_migrations WHERE version=3').get())db.exec(fs.readFileSync(path.join(__dirname,'../auth21_proposed_migrations/003_auth21_schema_v3.sql'),'utf8'));
  db.transaction(()=>{
   // Preserve legacy account IDs and ciphertext. SUPERADMIN maps to ADMIN.
   db.prepare("UPDATE client_accounts SET role='ADMIN' WHERE role='SUPERADMIN'").run();
   if(!db.pragma('table_info(client_sessions)').some(c=>c.name==='permissions_version'))db.exec('ALTER TABLE client_sessions ADD COLUMN permissions_version INTEGER NOT NULL DEFAULT 2');
   if(!db.prepare('SELECT 1 FROM client_schema_migrations WHERE version=4').get())db.prepare('UPDATE client_sessions SET revoked_at=? WHERE revoked_at IS NULL').run(Math.floor(Date.now()/1000));
   if(!db.pragma('table_info(client_security_audit)').some(c=>c.name==='result'))db.exec("ALTER TABLE client_security_audit ADD COLUMN result TEXT NOT NULL DEFAULT 'OK' CHECK(result IN ('OK','DENIED','FAILED'))");
   db.exec(`CREATE TABLE IF NOT EXISTS um_login_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,until_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS um_browser_state(client_id TEXT PRIMARY KEY REFERENCES clients(client_id),value_enc TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS um_secrets(client_id TEXT PRIMARY KEY REFERENCES clients(client_id),payload_enc TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS um_migration_claims(kind TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES clients(client_id));
    INSERT OR IGNORE INTO client_schema_migrations VALUES(4,'user_management_v1',datetime('now'));`);
  }).immediate();
  db.transaction(()=>{db.prepare('UPDATE client_sessions SET revoked_at=? WHERE revoked_at IS NULL AND permissions_version<>3').run(Math.floor(Date.now()/1000));db.prepare("INSERT OR IGNORE INTO client_schema_migrations VALUES(5,'user_management_owner_policy_v3',datetime('now'))").run();}).immediate();
  if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('MIGRATION_INTEGRITY_FAILED');
  return {version:5,backupFile,originalKeyPreserved:true};
 }catch(e){throw Object.assign(Error('MIGRATION_FAILED_RESTORE_BACKUP_OFFLINE'),{cause:e});}
}
module.exports={migrate};
