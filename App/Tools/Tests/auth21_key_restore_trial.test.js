'use strict';
/* Native SQLite + actual AES-256-GCM/HMAC fixture-only recovery verification.
 * No production snapshots, secret material, or network access are used.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
const ClientCrypto=require('../../Core/Clients/client_crypto');
const {backupRestoreFixture,attestRestoredPairFixture}=require('../CI/auth21_key_restore_trial');

const DIR=path.resolve(__dirname,'../../Core/Clients/migrations');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-v3-'));
 const dbFile=path.join(root,'clients-fixture.sqlite');
 const keyFile=path.join(root,'Security','client_master.key');
 const key=new ClientCrypto(keyFile,{clientDbPath:dbFile});
 const db=new Database(dbFile);
 db.pragma('foreign_keys=ON');
 for(const name of ['001_clients_v1.sql','002_client_accounts_v1.sql'])
  db.exec(fs.readFileSync(path.join(DIR,name),'utf8'));
 const f={root,dbFile,keyFile,db,key};
 t.after(()=>{if(f.db.open)f.db.close();fs.rmSync(root,{recursive:true,force:true});});
 return f;
}
function insert(f,id='CL000001',username='TEST_ADMIN',email='one@example.invalid'){
 const now='2026-10-14T00:00:00.000Z';
 f.db.prepare([
  'INSERT INTO clients(client_id,external_ref_hash,first_name_enc,last_name_enc,',
  'email_enc,email_hash,status,security_version,created_at,updated_at)',
  "VALUES(?,?,?,?,?,?,'ACTIVE',1,?,?)"
 ].join(' ')).run(id,f.key.externalHash('test:'+id),
  f.key.seal('Given'+id),f.key.seal('Family'+id),
  f.key.seal(email),f.key.lookupHash(email),now,now);
 f.db.prepare([
  'INSERT INTO client_accounts(client_id,username_enc,username_hash,password_salt,',
  'password_hash,password_iterations,role,enabled,created_at,updated_at)',
  "VALUES(?,?,?,?,?,180000,'ADMIN',1,?,?)"
 ].join(' ')).run(id,f.key.seal(username),f.key.lookupHash('username:'+username),
  'DUMMY_SALT',crypto.randomBytes(32).toString('hex'),now,now);
 f.db.prepare('INSERT INTO client_wallets(client_id,wallet_id,created_at) VALUES(?,?,?)')
  .run(id,'PUBLIC_WALLET_REFERENCE_'+id,now);
 f.db.prepare("INSERT INTO client_audit(client_id,action,created_at,details_enc) VALUES(?,'FICTIONAL',?,?)")
  .run(id,now,f.key.seal('FICTIONAL_EVENT_PAYLOAD'));
}
function raw(db,table,column,id){
 return db.prepare('SELECT '+column+' AS value FROM '+table+' WHERE client_id=?').get(id).value;
}
test('original key reopens real encrypted SQLite identities and indexes after backup and restore',async t=>{
 const f=fixture(t);insert(f);
 const prior=fs.readFileSync(f.keyFile,'utf8');
 const res=await backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile});
 assert.equal(res.verified,true);
 assert.deepEqual({clients:res.clients,walletLinks:res.walletLinks,indexChecks:res.indexChecks},
  {clients:1,walletLinks:1,indexChecks:2});
 assert.ok(res.encryptedFields>=5);
 assert.equal(fs.readFileSync(f.keyFile,'utf8'),prior);
 const recovered=new Database(path.join(f.root,'key-restore-check','restored.sqlite'),{readonly:true,fileMustExist:true});
 try{
  const restoredKey=new ClientCrypto(path.join(f.root,'key-restore-check','client_master.key'),{
   clientDbPath:recovered.name
  });
  assert.equal(restoredKey.open(raw(recovered,'clients','first_name_enc','CL000001')),'GivenCL000001');
  assert.equal(restoredKey.open(raw(recovered,'client_accounts','username_enc','CL000001')),'TEST_ADMIN');
  assert.equal(recovered.prepare('SELECT COUNT(*) AS n FROM client_wallets').get().n,1);
 }finally{recovered.close();}
});
test('two clients retain distinct identities and wallet references across backup',async t=>{
 const f=fixture(t);insert(f,'CL000001','ALICE_2026','alice@example.invalid');
 insert(f,'CL000002','BOB_2026','bob@example.invalid');
 const result=await backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile});
 assert.equal(result.clients,2);assert.equal(result.indexChecks,4);assert.equal(result.walletLinks,2);
});
test('WAL-mode committed identities and wallet links are included in SQLite online backup',async t=>{
 const f=fixture(t);f.db.pragma('journal_mode=WAL');f.db.pragma('wal_autocheckpoint=0');
 insert(f,'CL000001');
 assert.equal(fs.existsSync(f.dbFile+'-wal'),true);
 const r=await backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile});
 assert.equal(r.verified,true);assert.equal(r.walletLinks,1);
});
test('valid but WRONG 32-byte master key cannot decrypt existing SQLite identities',async t=>{
 const f=fixture(t);insert(f);
 const before=fs.readFileSync(f.keyFile,'utf8');
 let different=crypto.randomBytes(32).toString('hex');
 if(different===before)different=crypto.randomBytes(32).toString('hex');
 fs.writeFileSync(f.keyFile,different,{mode:0o600});
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile}),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
 assert.equal(fs.existsSync(path.join(f.root,'key-restore-check')),false);
 assert.equal(raw(f.db,'clients','first_name_enc','CL000001').length>0,true);
});
test('missing key beside existing SQLite refuses replacement, no new key generated',async t=>{
 const f=fixture(t);insert(f);fs.unlinkSync(f.keyFile);
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile}),/ENOENT/);
 assert.throws(()=>new ClientCrypto(f.keyFile,{clientDbPath:f.dbFile}),/CLIENT_MASTER_KEY_MISSING_WITH_EXISTING_DB/);
 assert.equal(fs.existsSync(f.keyFile),false);
});
test('hex-key suffix junk is no longer silently ignored by ClientCrypto',t=>{
 const f=fixture(t);
 const before=fs.readFileSync(f.keyFile,'utf8');
 fs.writeFileSync(f.keyFile,before+'xx',{mode:0o600});
 assert.throws(()=>new ClientCrypto(f.keyFile,{clientDbPath:f.dbFile}),/CLIENT_MASTER_KEY_INVALID/);
 assert.equal(fs.readFileSync(f.keyFile,'utf8'),before+'xx');
});
test('odd-length, truncated or nonhex keys all fail closed without overwriting the bytes',t=>{
 for(const invalid of ['a'.repeat(63),'f'.repeat(65),'9'.repeat(62)+'GG','a'.repeat(64)+'JUNK']){
  const f=fixture(t);
  fs.writeFileSync(f.keyFile,invalid,{mode:0o600});
  assert.throws(()=>new ClientCrypto(f.keyFile,{clientDbPath:f.dbFile}),/CLIENT_MASTER_KEY_INVALID/);
  assert.equal(fs.readFileSync(f.keyFile,'utf8'),invalid);
 }
});
test('malformed ciphertext refuses valid original key instead of attesting corrupt restore',async t=>{
 const f=fixture(t);insert(f);
 f.db.prepare("UPDATE clients SET first_name_enc=? WHERE client_id='CL000001'").run('NOT_A_VALID_CIPHERTEXT');
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile}),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
 assert.equal(fs.existsSync(path.join(f.root,'key-restore-check')),false);
});
test('tampered email lookup index fails the cryptographic identity proof',async t=>{
 const f=fixture(t);insert(f);
 f.db.prepare("UPDATE clients SET email_hash=? WHERE client_id='CL000001'").run('BAD_INDEX_NOT_ORIGINAL');
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile}),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
});
test('tampered username lookup index fails the cryptographic identity proof',async t=>{
 const f=fixture(t);insert(f);
 f.db.prepare("UPDATE client_accounts SET username_hash=? WHERE client_id='CL000001'").run('BAD_INDEX');
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile}),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
});
test('empty database cannot prove encryption-key compatibility and is refused',async t=>{
 const f=fixture(t);
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile}),/AUTH21_RESTORE_KEY_UNPROVEN/);
});
test('snapshot refuses a duplicate backup workspace rather than overwriting it',async t=>{
 const f=fixture(t);insert(f);
 const a=await backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile});
 assert.equal(a.verified,true);
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile}),/AUTH21_RESTORE_ALREADY_EXISTS/);
});
test('original DB cannot reside outside guarded temporary directory',async t=>{
 const f=fixture(t);insert(f);
 const foreign=fs.mkdtempSync(path.join(os.tmpdir(),'not-auth21-fixture-'));
 t.after(()=>fs.rmSync(foreign,{recursive:true,force:true}));
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:foreign,keyFile:f.keyFile}),/AUTH21_FIXTURE_ONLY/);
 assert.equal(fs.existsSync(path.join(f.root,'key-restore-check')),false);
});
test('foreign key path is refused before any SQLite backup is written',async t=>{
 const f=fixture(t);insert(f);
 const foreign=fs.mkdtempSync(path.join(os.tmpdir(),'second-key-dir-'));
 t.after(()=>fs.rmSync(foreign,{recursive:true,force:true}));
 const other=path.join(foreign,'client_master.key');
 fs.writeFileSync(other,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:other}),/AUTH21_KEY_OUTSIDE_FIXTURE/);
});
test('key with unsafe world/group permissions is rejected',async t=>{
 const f=fixture(t);insert(f);
 fs.chmodSync(f.keyFile,0o644);
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile}),/AUTH21_KEY_PERMISSIONS_UNSAFE/);
});
test('symlink to key inside the temporary workspace is refused',async t=>{
 const f=fixture(t);insert(f);
 const alias=path.join(f.root,'shortcut.key');
 fs.symlinkSync(f.keyFile,alias);
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:alias}),/AUTH21_KEY_FILE_INVALID/);
});
test('tampered AES-GCM ciphertext is rejected, and existing DB remains unmodified',async t=>{
 const f=fixture(t);insert(f);
 const row=raw(f.db,'clients','first_name_enc','CL000001');
 const envelope=JSON.parse(Buffer.from(row,'base64').toString('utf8'));
 envelope.tag=crypto.randomBytes(16).toString('base64');
 const edited=Buffer.from(JSON.stringify(envelope)).toString('base64');
 f.db.prepare("UPDATE clients SET first_name_enc=? WHERE client_id='CL000001'").run(edited);
 await assert.rejects(()=>backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile}),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
 assert.equal(raw(f.db,'clients','first_name_enc','CL000001'),edited);
});

test('restored pair independently proves original key/identity compatibility',async t=>{
 const f=fixture(t);insert(f);
 await backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile});
 const dbFile=path.join(f.root,'key-restore-check','restored.sqlite');
 const keyFile=path.join(f.root,'key-restore-check','client_master.key');
 const r=attestRestoredPairFixture({dbFile,keyFile,fixtureRoot:f.root});
 assert.equal(r.verified,true);assert.equal(r.indexChecks,2);assert.equal(r.walletLinks,1);
});
test('restored valid-but-wrong key must be rejected without modifying original data',async t=>{
 const f=fixture(t);insert(f);
 await backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile});
 const dir=path.join(f.root,'key-restore-check');
 const copyKey=path.join(dir,'client_master.key'),before=raw(f.db,'clients','first_name_enc','CL000001');
 fs.writeFileSync(copyKey,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 assert.throws(()=>attestRestoredPairFixture({
  dbFile:path.join(dir,'restored.sqlite'),keyFile:copyKey,fixtureRoot:f.root
 }),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
 assert.equal(raw(f.db,'clients','first_name_enc','CL000001'),before);
});
test('restored DB without accompanying key is refused and no substitute is generated',async t=>{
 const f=fixture(t);insert(f);
 await backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile});
 const dir=path.join(f.root,'key-restore-check'),missing=path.join(dir,'client_master.key');
 fs.unlinkSync(missing);
 assert.throws(()=>attestRestoredPairFixture({
  dbFile:path.join(dir,'restored.sqlite'),keyFile:missing,fixtureRoot:f.root
 }),/ENOENT/);
 assert.equal(fs.existsSync(missing),false);
});
test('ciphertext altered after restoration is rejected by independent attestation',async t=>{
 const f=fixture(t);insert(f);
 await backupRestoreFixture({db:f.db,fixtureRoot:f.root,keyFile:f.keyFile});
 const dir=path.join(f.root,'key-restore-check');
 const copy=path.join(dir,'restored.sqlite');
 const other=new Database(copy);
 try{
  other.prepare("UPDATE clients SET first_name_enc='NOT_A_VALID_CIPHER' WHERE client_id='CL000001'").run();
 }finally{other.close();}
 assert.throws(()=>attestRestoredPairFixture({
  dbFile:copy,keyFile:path.join(dir,'client_master.key'),fixtureRoot:f.root
 }),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
 assert.equal(f.key.open(raw(f.db,'clients','first_name_enc','CL000001')),'GivenCL000001');
});

test('parent symlink cannot redirect master key lookup outside synthetic fixture root',async t=>{
 const f=fixture(t);insert(f);
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),'auth21-outside-'));
 t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 const keyFile=path.join(outside,'client_master.key');
 fs.writeFileSync(keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 fs.symlinkSync(outside,path.join(f.root,'indirect-key-dir'),'dir');
 await assert.rejects(()=>backupRestoreFixture({
  db:f.db,fixtureRoot:f.root,keyFile:path.join(f.root,'indirect-key-dir','client_master.key')
 }),/AUTH21_KEY_OUTSIDE_FIXTURE/);
 assert.equal(fs.existsSync(path.join(f.root,'key-restore-check')),false);
});
