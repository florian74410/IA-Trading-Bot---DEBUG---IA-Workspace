'use strict';
/* Auth 2.1 OFFLINE v3 migration trial — deliberately unusable with service DBs.
 * Takes an already opened better-sqlite3 connection; no runtime/paths imports.
 * Only accepts a dedicated, newly-created, real temporary fixture directory.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const SQL_FILE=path.join(__dirname,'../../Core/Clients/auth21_proposed_migrations/003_auth21_schema_v3.sql');
const V3_NAME='auth21_schema_v3_offline_proposal';
function insistFixture(db,fixtureRoot){
 if(!db || typeof db.prepare!=='function' || typeof db.exec!=='function' ||
    !fixtureRoot || typeof fixtureRoot!=='string' || typeof db.name!=='string')throw Error('AUTH21_FIXTURE_ONLY');
 const home=fs.realpathSync(fixtureRoot),tmp=fs.realpathSync(os.tmpdir()),file=fs.realpathSync(db.name);
 if(!path.basename(home).startsWith('iatb-auth21-v3-') ||
    !home.startsWith(tmp+path.sep) || !file.startsWith(home+path.sep) ||
    path.extname(file)!=='.sqlite')throw Error('AUTH21_FIXTURE_ONLY');
 return {home,file};
}
function assertHealthy(db){
 if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('AUTH21_DB_INTEGRITY_FAILED');
 if(db.pragma('foreign_key_check').length)throw Error('AUTH21_FOREIGN_KEY_FAILED');
}
function schemaStatus(db){
 const names=db.prepare('SELECT version,name FROM client_schema_migrations ORDER BY version').all();
 if(!names.some(x=>x.version===1)||!names.some(x=>x.version===2)||
    names.some(x=>x.version>3)||names.some(x=>x.version===3&&x.name!==V3_NAME))throw Error('AUTH21_SCHEMA_VERSION_UNEXPECTED');
 if(names.some(x=>x.version===3)){
  for(const name of ['client_sessions','client_preferences','client_security_audit']){
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))throw Error('AUTH21_SCHEMA_PARTIAL');
  }
  for(const name of ['password_algo','password_params_json']){
   if(!db.pragma('table_info(client_accounts)').some(x=>x.name===name))throw Error('AUTH21_SCHEMA_PARTIAL');
  }
  for(const name of ['auth21_last_admin_account_update','auth21_last_admin_account_delete',
    'auth21_last_admin_client_update','auth21_last_admin_client_delete',
    'auth21_last_admin_account_replace','auth21_last_admin_client_replace',
    'auth21_account_security_invalidation','auth21_client_status_invalidation']){
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name))throw Error('AUTH21_SCHEMA_PARTIAL');
  }
  return 3;
 }
 if(db.pragma('table_info(client_accounts)').some(x=>x.name==='password_algo'))throw Error('AUTH21_SCHEMA_PARTIAL');
 return 2;
}
/** Trial migration with an online consistent SQLite backup of an explicit fixture.
 * Failure *inside* the SQL transaction rolls back the original fixture.
 * Backup is available for separate manual recovery from post-COMMIT failure.
 * A runtime execution path is intentionally not exported.
 */
async function migrateFixture(db,options){
 const {home}=insistFixture(db,options&&options.fixtureRoot);
 db.pragma('foreign_keys = ON');
 assertHealthy(db);
 const version=schemaStatus(db);
 if(version===3)return {applied:false,version:3,backupFile:null};
 const backupFile=path.join(home,'pre-v3-snapshot.sqlite');
 if(fs.existsSync(backupFile))throw Error('AUTH21_BACKUP_ALREADY_EXISTS');
 await db.backup(backupFile);
 let backup;
 try{
  const Database=require('better-sqlite3');
  backup=new Database(backupFile,{readonly:true,fileMustExist:true});
  assertHealthy(backup);
  if(schemaStatus(backup)!==2)throw Error('AUTH21_BACKUP_BAD_VERSION');
 }finally{if(backup)backup.close();}
 const sql=(options&&options.sqlOverride)||fs.readFileSync(SQL_FILE,'utf8');
 try{
  db.exec(sql); // Script explicitly includes BEGIN IMMEDIATE and COMMIT.
  assertHealthy(db);
  if(schemaStatus(db)!==3)throw Error('AUTH21_MIGRATION_VERSION_FAILED');
 }catch(e){
  if(db.inTransaction)db.exec('ROLLBACK');
  throw e;
 }
 return {applied:true,version:3,backupFile};
}
module.exports={migrateFixture,assertFixture:insistFixture};
