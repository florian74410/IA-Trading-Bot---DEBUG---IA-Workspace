'use strict';
/* Auth 2.1 OFFLINE migration / compare-and-swap tests. Every database, WAL
 * and backup is born in a dedicated throwaway system-temp fixture directory.
 * No Core service, production DB, secret, real wallet or network invoked.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
const Kdf=require('../../Core/Clients/password_hasher_v2');
const {migrateFixture}=require('../CI/auth21_v3_migration_trial');
const {upgradeLegacyFixture}=require('../CI/auth21_credential_upgrade_trial');
const {LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');

const legacyDir=path.resolve(__dirname,'../../Core/Clients/migrations');
const PASSWORD='FICTIONAL_password_only_234$';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-v3-'));
 const file=path.join(root,'clients-fixture.sqlite');
 const db=new Database(file);
 db.pragma('foreign_keys=ON');
 for(const sql of ['001_clients_v1.sql','002_client_accounts_v1.sql']){
  db.exec(fs.readFileSync(path.join(legacyDir,sql),'utf8'));
 }
 t.after(()=>{if(db.open)db.close();fs.rmSync(root,{recursive:true,force:true});});
 return {root,file,db};
}
function seed(f,id='CL000001',role='USER'){
 const now='2026-10-14T00:00:00Z';
 const salt='11223344556677889900aabbccddeeff';
 const hash=crypto.pbkdf2Sync(PASSWORD,salt,180000,32,'sha256').toString('hex');
 f.db.prepare('INSERT INTO clients(client_id,external_ref_hash,email_enc,status,security_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
  .run(id,'EXTERNAL_'+id,'ENCRYPTED_FIXTURE_ONLY','ACTIVE',1,now,now);
 f.db.prepare('INSERT INTO client_accounts(client_id,username_enc,username_hash,password_salt,password_hash,password_iterations,role,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run(id,'NAME_ENC','NAMEHASH_'+id,salt,hash,180000,role,1,now,now);
 return {salt,hash};
}
function account(db,id='CL000001'){
 return db.prepare('SELECT * FROM client_accounts WHERE client_id=?').get(id);
}
function audit(db){
 return db.prepare("SELECT * FROM client_security_audit ORDER BY id").all();
}
test('v3 migration creates consistent original backup and is idempotent',async t=>{
 const f=fixture(t);seed(f);
 const old=account(f.db);
 const r=await migrateFixture(f.db,{fixtureRoot:f.root});
 assert.deepEqual({applied:r.applied,version:r.version},{applied:true,version:3});
 assert.equal(fs.existsSync(r.backupFile),true);
 assert.equal(f.db.pragma('integrity_check',{simple:true}),'ok');
 assert.equal(f.db.pragma('foreign_key_check').length,0);
 assert.equal(account(f.db).password_hash,old.password_hash);
 assert.equal(account(f.db).password_algo,'PBKDF2_SHA256');
 assert.equal((await migrateFixture(f.db,{fixtureRoot:f.root})).applied,false);
 const prev=new Database(r.backupFile,{readonly:true,fileMustExist:true});
 try{
  assert.equal(prev.pragma('integrity_check',{simple:true}),'ok');
  assert.equal(prev.pragma('table_info(client_accounts)').some(x=>x.name==='password_algo'),false);
  assert.equal(prev.prepare('SELECT password_hash FROM client_accounts WHERE client_id=?').get('CL000001').password_hash,old.password_hash);
 }finally{prev.close();}
});

test('v3 migration preserves fake identity, client wallet link, audit and credential',async t=>{
 const f=fixture(t);const original=seed(f);
 f.db.prepare('INSERT INTO client_wallets(client_id,wallet_id,created_at) VALUES(?,?,?)').run('CL000001','PUBLIC_WALLET_FIXTURE','2026-10-14');
 f.db.prepare('INSERT INTO client_audit(client_id,action,created_at) VALUES(?,?,?)').run('CL000001','BEFORE_V3_FIXTURE','2026-10-14');
 await migrateFixture(f.db,{fixtureRoot:f.root});
 assert.equal(f.db.prepare('SELECT email_enc FROM clients WHERE client_id=?').get('CL000001').email_enc,'ENCRYPTED_FIXTURE_ONLY');
 assert.equal(f.db.prepare('SELECT wallet_id FROM client_wallets WHERE client_id=?').get('CL000001').wallet_id,'PUBLIC_WALLET_FIXTURE');
 assert.equal(f.db.prepare('SELECT action FROM client_audit WHERE client_id=?').get('CL000001').action,'BEFORE_V3_FIXTURE');
 assert.equal(account(f.db).password_hash,original.hash);
});

test('mid-script SQL fault rolls back schema and leaves recoverable original backup',async t=>{
 const f=fixture(t);seed(f);
 const injected="BEGIN IMMEDIATE; ALTER TABLE client_accounts ADD COLUMN password_algo TEXT; THIS IS INVALID SQL; COMMIT;";
 await assert.rejects(()=>migrateFixture(f.db,{fixtureRoot:f.root,sqlOverride:injected}),/syntax|near/i);
 assert.equal(f.db.inTransaction,false);
 assert.equal(f.db.pragma('table_info(client_accounts)').some(x=>x.name==='password_algo'),false);
 assert.equal(f.db.prepare('SELECT MAX(version) AS v FROM client_schema_migrations').get().v,2);
 assert.equal(f.db.pragma('integrity_check',{simple:true}),'ok');
 const backup=new Database(path.join(f.root,'pre-v3-snapshot.sqlite'),{readonly:true,fileMustExist:true});
 try{assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM clients').get().n,1);}finally{backup.close();}
});

test('unknown future schema refuses migration before creating backup',async t=>{
 const f=fixture(t);
 f.db.prepare('INSERT INTO client_schema_migrations(version,name,applied_at) VALUES(9,?,?)').run('FUTURE','2026');
 await assert.rejects(()=>migrateFixture(f.db,{fixtureRoot:f.root}),/AUTH21_SCHEMA_VERSION_UNEXPECTED/);
 assert.equal(fs.existsSync(path.join(f.root,'pre-v3-snapshot.sqlite')),false);
});

test('partial v3 marker/columns without version rejects migration',async t=>{
 const f=fixture(t);
 f.db.exec('ALTER TABLE client_accounts ADD COLUMN password_algo TEXT;');
 await assert.rejects(()=>migrateFixture(f.db,{fixtureRoot:f.root}),/AUTH21_SCHEMA_PARTIAL/);
});

test('migration refuses non-fixture DB even when caller submits fake root',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'non-iatb-fixture-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'db.sqlite');
 const db=new Database(file);
 t.after(()=>{if(db.open)db.close();});
 await assert.rejects(()=>migrateFixture(db,{fixtureRoot:dir}),/AUTH21_FIXTURE_ONLY/);
});

test('valid PBKDF2 login migrates atomically to Argon2id and writes metadata-only audit',async t=>{
 const f=fixture(t);seed(f);
 await migrateFixture(f.db,{fixtureRoot:f.root});
 const result=await upgradeLegacyFixture(f.db,{fixtureRoot:f.root,clientId:'CL000001',password:PASSWORD});
 assert.deepEqual(result,{verified:true,upgraded:true,algorithm:'ARGON2ID'});
 const updated=account(f.db);
 assert.equal(updated.password_algo,'ARGON2ID');
 assert.equal(updated.password_salt,'');
 assert.equal(updated.password_iterations,0);
 assert.equal(Kdf.parseArgon2Cost(updated.password_hash).memoryCost,65536);
 assert.equal((await Kdf.verifyAccountPassword({...updated,passwordHash:updated.password_hash,passwordAlgo:'ARGON2ID'},PASSWORD)).verified,true);
 assert.equal(audit(f.db).length,1);
 assert.equal(audit(f.db)[0].action,'CREDENTIAL_KDF_UPGRADED');
 assert.equal(audit(f.db)[0].detail_enc,'');
 assert.equal(JSON.stringify(audit(f.db)).includes(updated.password_hash),false);
});

test('invalid password fails without rehash or audit',async t=>{
 const f=fixture(t);const original=seed(f);
 await migrateFixture(f.db,{fixtureRoot:f.root});
 const result=await upgradeLegacyFixture(f.db,{fixtureRoot:f.root,clientId:'CL000001',password:'WRONG_PASSWORD'});
 assert.equal(result.verified,false);
 assert.equal(account(f.db).password_hash,original.hash);
 assert.equal(audit(f.db).length,0);
});

test('disabled account fails before rehash',async t=>{
 const f=fixture(t);const original=seed(f);
 await migrateFixture(f.db,{fixtureRoot:f.root});
 f.db.prepare('UPDATE client_accounts SET enabled=0 WHERE client_id=?').run('CL000001');
 assert.equal((await upgradeLegacyFixture(f.db,{fixtureRoot:f.root,clientId:'CL000001',password:PASSWORD})).verified,false);
 assert.equal(account(f.db).password_hash,original.hash);
});

test('concurrent password reset stops CAS, leaving reset hash untouched',async t=>{
 const f=fixture(t);seed(f);
 await migrateFixture(f.db,{fixtureRoot:f.root});
 const result=await upgradeLegacyFixture(f.db,{
  fixtureRoot:f.root,clientId:'CL000001',password:PASSWORD,
  hooks:{beforeCAS(db){db.prepare('UPDATE client_accounts SET password_hash=?,updated_at=? WHERE client_id=?').run('RESET_HASH_FIXTURE','AFTER_PASSWORD_RESET','CL000001');}}
 });
 assert.equal(result.reason,'AUTH21_STALE_ACCOUNT');
 assert.equal(result.verified,false);
 assert.equal(account(f.db).password_hash,'RESET_HASH_FIXTURE');
 assert.equal(audit(f.db).length,0);
});

test('concurrent role modification blocks stale PBKDF2 migration',async t=>{
 const f=fixture(t);seed(f);
 await migrateFixture(f.db,{fixtureRoot:f.root});
 const r=await upgradeLegacyFixture(f.db,{
  fixtureRoot:f.root,clientId:'CL000001',password:PASSWORD,
  hooks:{beforeCAS(db){db.prepare("UPDATE client_accounts SET role='GUEST' WHERE client_id=?").run('CL000001');}}
 });
 assert.equal(r.reason,'AUTH21_STALE_ACCOUNT');
 assert.equal(account(f.db).password_algo,'PBKDF2_SHA256');
});

test('concurrent client security version increment stops stale migration',async t=>{
 const f=fixture(t);seed(f);await migrateFixture(f.db,{fixtureRoot:f.root});
 const result=await upgradeLegacyFixture(f.db,{
  fixtureRoot:f.root,clientId:'CL000001',password:PASSWORD,
  hooks:{beforeCAS(db){db.prepare('UPDATE clients SET security_version=2 WHERE client_id=?').run('CL000001');}}
 });
 assert.equal(result.reason,'AUTH21_STALE_ACCOUNT');
 assert.equal(account(f.db).password_algo,'PBKDF2_SHA256');
});

test('audit SQL failure atomically rolls back the credential conversion',async t=>{
 const f=fixture(t);const original=seed(f);await migrateFixture(f.db,{fixtureRoot:f.root});
 f.db.exec("CREATE TRIGGER auth21_fail_audit BEFORE INSERT ON client_security_audit BEGIN SELECT RAISE(ABORT,'FICTIONAL_AUDIT_FAILURE'); END;");
 await assert.rejects(()=>upgradeLegacyFixture(f.db,{
  fixtureRoot:f.root,clientId:'CL000001',password:PASSWORD
 }),/FICTIONAL_AUDIT_FAILURE/);
 assert.equal(account(f.db).password_hash,original.hash);
 assert.equal(account(f.db).password_algo,'PBKDF2_SHA256');
 assert.equal(audit(f.db).length,0);
});

test('held snapshot between hash and CAS fails closed with no file changes',async t=>{
 const f=fixture(t);const original=seed(f);await migrateFixture(f.db,{fixtureRoot:f.root});
 const gate=new LocalSnapshotWriter('clients');
 await assert.rejects(()=>upgradeLegacyFixture(f.db,{
  fixtureRoot:f.root,clientId:'CL000001',password:PASSWORD,snapshotGate:gate,
  hooks:{beforeCAS(){gate.prepare(1);}}
 }),/SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(account(f.db).password_hash,original.hash);
 assert.equal(audit(f.db).length,0);
 gate.abort(1);
});

test('already-migrated Argon2id is authenticated without duplicate writes',async t=>{
 const f=fixture(t);seed(f);await migrateFixture(f.db,{fixtureRoot:f.root});
 await upgradeLegacyFixture(f.db,{fixtureRoot:f.root,clientId:'CL000001',password:PASSWORD});
 const hash=account(f.db).password_hash;
 const result=await upgradeLegacyFixture(f.db,{fixtureRoot:f.root,clientId:'CL000001',password:PASSWORD});
 assert.deepEqual(result,{verified:true,upgraded:false});
 assert.equal(account(f.db).password_hash,hash);
 assert.equal(audit(f.db).length,1);
});

test('unknown client and unversioned DB cannot perform conversion',async t=>{
 const f=fixture(t);seed(f);
 await assert.rejects(()=>upgradeLegacyFixture(f.db,{fixtureRoot:f.root,clientId:'CL000001',password:PASSWORD}),/AUTH21_SCHEMA_V3_REQUIRED/);
 await migrateFixture(f.db,{fixtureRoot:f.root});
 const result=await upgradeLegacyFixture(f.db,{fixtureRoot:f.root,clientId:'CL_DOES_NOT_EXIST',password:PASSWORD});
 assert.equal(result.verified,false);
 assert.equal(audit(f.db).length,0);
});
