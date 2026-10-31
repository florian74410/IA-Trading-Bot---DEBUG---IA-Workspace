'use strict';
/* Auth 2.1 Phase 2 — OFFLINE, SYNTHETIC fixture-only key/SQLite restore trial.
 * Not a production backup facility, command line interface or live service.
 * The SQLite backup and copied raw key are UNENCRYPTED and MUST NEVER be
 * used outside isolated fictional fixtures with no real customer data.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
const ClientCrypto=require('../../Core/Clients/client_crypto');
const {assertFixture}=require('./auth21_v3_migration_trial');

const FIELDS=[
 ['clients',['first_name_enc','last_name_enc','email_enc']],
 ['client_accounts',['username_enc']],
 ['client_preferences',['value_enc']],
 ['client_audit',['details_enc']],
 ['client_security_audit',['detail_enc']]
];
const DATA_TABLES=[
 'client_schema_migrations','clients','client_accounts','client_wallets',
 'client_audit','client_sessions','client_preferences','client_security_audit'
];
function requireFixtureKey(root,keyFile){
 const home=fs.realpathSync(root);
 if(typeof keyFile!=='string'||!path.isAbsolute(keyFile))throw Error('AUTH21_KEY_PATH_INVALID');
 const candidate=path.resolve(keyFile);
 if(!candidate.startsWith(home+path.sep))throw Error('AUTH21_KEY_OUTSIDE_FIXTURE');
 // Check canonical path as well: a symlink in a parent directory could
 // otherwise route the apparent fixture key to an unrelated secret outside.
 const canonical=fs.realpathSync(candidate);
 if(!canonical.startsWith(home+path.sep))throw Error('AUTH21_KEY_OUTSIDE_FIXTURE');
 const item=fs.lstatSync(candidate);
 if(!item.isFile()||item.isSymbolicLink())throw Error('AUTH21_KEY_FILE_INVALID');
 if((item.mode&0o077)!==0)throw Error('AUTH21_KEY_PERMISSIONS_UNSAFE');
 const text=fs.readFileSync(candidate,'utf8').trim();
 if(!/^[0-9a-fA-F]{64}$/.test(text))throw Error('AUTH21_KEY_FORMAT_INVALID');
 return {path:candidate,bytes:Buffer.from(text,'hex')};
}
function exists(db,table){
 return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}
function inspection(db,keyFile){
 if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)
  throw Error('AUTH21_RESTORE_DB_INTEGRITY_FAILED');
 const cipher=new ClientCrypto(keyFile,{clientDbPath:db.name});
 let encryptedFields=0,indexChecks=0,walletLinks=0;
 try{
  for(const [table,columns] of FIELDS){
   if(!exists(db,table))continue;
   const rows=db.prepare('SELECT * FROM '+table).all();
   for(const row of rows){
    for(const column of columns){
     const enc=row[column];
     if(enc===null||enc===undefined||enc==='')continue;
     if(typeof enc!=='string')throw Error('AUTH21_ENCRYPTED_FIELD_INVALID');
     const value=cipher.open(enc);
     encryptedFields++;
     if(table==='clients'&&column==='email_enc'&&row.email_hash){
      if(cipher.lookupHash(value)!==row.email_hash)throw Error('AUTH21_IDENTITY_INDEX_MISMATCH');
      indexChecks++;
     }
     if(table==='client_accounts'&&column==='username_enc'&&row.username_hash){
      if(cipher.lookupHash('username:'+value)!==row.username_hash)
       throw Error('AUTH21_IDENTITY_INDEX_MISMATCH');
      indexChecks++;
     }
    }
   }
  }
  if(exists(db,'client_wallets')){
   walletLinks=db.prepare('SELECT COUNT(*) AS n FROM client_wallets').get().n;
  }
 }catch(_){throw Error('AUTH21_RESTORE_KEY_NOT_COMPATIBLE');}
 if(encryptedFields===0||indexChecks===0)throw Error('AUTH21_RESTORE_KEY_UNPROVEN');
 const h=crypto.createHash('sha256');
 let tables=0;
 for(const table of DATA_TABLES){
  if(!exists(db,table))continue;
  tables++;
  const rows=db.prepare('SELECT * FROM '+table).all();
  // Sort by serialized content; compare physical data without leaking it.
  for(const text of rows.map(x=>JSON.stringify(x)).sort())h.update(text).update('\n');
  h.update('|'+table+'|');
 }
 return {encryptedFields,indexChecks,walletLinks,tables,checksum:h.digest('hex')};
}
async function backupRestoreFixture({db,fixtureRoot,keyFile}={}){
 assertFixture(db,fixtureRoot);
 const {path:masterKey,bytes:original}=requireFixtureKey(fixtureRoot,keyFile);
 if(db.pragma('foreign_keys',{simple:true})!==1)throw Error('AUTH21_FOREIGN_KEYS_REQUIRED');
 const home=fs.realpathSync(fixtureRoot),dest=path.join(home,'key-restore-check');
 if(fs.existsSync(dest))throw Error('AUTH21_RESTORE_ALREADY_EXISTS');
 // Validate the ORIGINAL identity-key combination before copying anything.
 const baseline=inspection(db,masterKey);
 fs.mkdirSync(dest,{mode:0o700});
 const copyDb=path.join(dest,'backup.sqlite'),copyKey=path.join(dest,'client_master.key');
 const restoredDb=path.join(dest,'restored.sqlite');
 await db.backup(copyDb); // SQLite online backup is WAL-aware, unlike cp.
 // Fail rather than silently proceed if the original key rotated meanwhile.
 const after=requireFixtureKey(fixtureRoot,masterKey);
 if(!original.equals(after.bytes))throw Error('AUTH21_KEY_CHANGED_DURING_BACKUP');
 // Key copies here are UNENCRYPTED, only allowed inside synthetic temp fixtures.
 fs.writeFileSync(copyKey,original.toString('hex'),{flag:'wx',mode:0o600});
 const archiveKey=requireFixtureKey(fixtureRoot,copyKey);
 if(!archiveKey.bytes.equals(original))throw Error('AUTH21_KEY_COPY_MISMATCH');
 // Separate restored DB file, isolated from original WAL/-shm.
 fs.copyFileSync(copyDb,restoredDb,fs.constants.COPYFILE_EXCL);
 fs.chmodSync(restoredDb,0o600);
 const savedDb=new Database(copyDb,{readonly:true,fileMustExist:true});
 const recoveredDb=new Database(restoredDb,{readonly:true,fileMustExist:true});
 try{
  const saved=inspection(savedDb,copyKey);
  const recovered=inspection(recoveredDb,copyKey);
  // If concurrent writers got past the fixture-only scope, do not attest the
  // result because the original DB and its backup would diverge.
  const latest=inspection(db,masterKey);
  if(saved.checksum!==baseline.checksum||latest.checksum!==baseline.checksum||
     recovered.checksum!==baseline.checksum||
     recovered.encryptedFields!==baseline.encryptedFields||
     recovered.indexChecks!==baseline.indexChecks||
     recovered.walletLinks!==baseline.walletLinks||
     recovered.tables!==baseline.tables)throw Error('AUTH21_RESTORE_SNAPSHOT_MISMATCH');
  return {
   verified:true,clients:db.prepare('SELECT COUNT(*) AS n FROM clients').get().n,
   encryptedFields:recovered.encryptedFields,indexChecks:recovered.indexChecks,
   walletLinks:recovered.walletLinks,tables:recovered.tables
  };
 }finally{savedDb.close();recoveredDb.close();}
}
/** Independent read-only attestation of a separately restored SQLite/key pair.
 * Proves key can decrypt records and reproduce stable lookup indexes.
 * Does not claim that this pair is the latest version of the original DB.
 */
function attestRestoredPairFixture({dbFile,keyFile,fixtureRoot}={}){
 if(typeof fixtureRoot!=='string'||typeof dbFile!=='string')throw Error('AUTH21_FIXTURE_ONLY');
 const home=fs.realpathSync(fixtureRoot);
 const file=fs.realpathSync(dbFile);
 if(!file.startsWith(home+path.sep)||path.extname(file)!=='.sqlite')
  throw Error('AUTH21_FIXTURE_ONLY');
 requireFixtureKey(fixtureRoot,keyFile);
 const db=new Database(file,{readonly:true,fileMustExist:true});
 try{
  assertFixture(db,fixtureRoot);
  const report=inspection(db,keyFile);
  return {
   verified:true,
   encryptedFields:report.encryptedFields,
   indexChecks:report.indexChecks,
   walletLinks:report.walletLinks,
   tables:report.tables
  };
 }finally{db.close();}
}
module.exports={backupRestoreFixture,attestRestoredPairFixture};
