'use strict';
/* Auth 2.1 P2.2 encrypted bundle: SYNTHETIC SQLite and randomly generated keys.
 * No actual customer data, Wallet secrets, running app, services or GEN-1.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
const ClientCrypto=require('../../Core/Clients/client_crypto');
const {SnapshotCoordinator,LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');
const {
 captureEncryptedFixture,restoreEncryptedFixture,MARKER,MARKER_CONTENT
}=require('../CI/auth21_encrypted_snapshot_trial');

const SCHEMAS=path.resolve(__dirname,'../../Core/Clients/migrations');
function fixture(t,{wal=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-v3-'));
 fs.chmodSync(root,0o700);
 fs.writeFileSync(path.join(root,MARKER),MARKER_CONTENT,{mode:0o600});
 const file=path.join(root,'clients-fixture.sqlite'),keyFile=path.join(root,'Security','client_master.key');
 const cipher=new ClientCrypto(keyFile,{clientDbPath:file});
 const db=new Database(file);
 db.pragma('foreign_keys=ON');
 for(const name of ['001_clients_v1.sql','002_client_accounts_v1.sql'])
  db.exec(fs.readFileSync(path.join(SCHEMAS,name),'utf8'));
 if(wal){db.pragma('journal_mode=WAL');db.pragma('wal_autocheckpoint=0');}
 const gate=new LocalSnapshotWriter('clients');
 const coordinator=new SnapshotCoordinator({writerIds:['clients'],timeoutMs:1000});
 coordinator.register('clients',{
  prepare:epoch=>gate.prepare(epoch),
  release:epoch=>gate.release(epoch),
  abort:epoch=>gate.abort(epoch)
 });
 const transport=crypto.randomBytes(32);
 const f={root,file,keyFile,cipher,db,gate,coordinator,transport};
 t.after(()=>{if(f.db.open)f.db.close();fs.rmSync(root,{recursive:true,force:true});});
 return f;
}
function seed(f,id='CL000001',username='USER_FIXTURE',email='fiction@example.invalid'){
 const now='2026-10-14T00:00:00Z';
 f.db.prepare([
  'INSERT INTO clients(client_id,external_ref_hash,first_name_enc,last_name_enc,',
  'email_enc,email_hash,status,security_version,created_at,updated_at)',
  "VALUES(?,?,?,?,?,?,'ACTIVE',1,?,?)"
 ].join(' ')).run(id,f.cipher.externalHash('fixture:'+id),
  f.cipher.seal('FICTIONAL_FIRST_'+id),f.cipher.seal('FICTIONAL_LAST_'+id),
  f.cipher.seal(email),f.cipher.lookupHash(email),now,now);
 f.db.prepare([
  'INSERT INTO client_accounts(client_id,username_enc,username_hash,password_salt,',
  'password_hash,password_iterations,role,enabled,created_at,updated_at)',
  "VALUES(?,?,?,?,?,180000,'USER',1,?,?)"
 ].join(' ')).run(id,f.cipher.seal(username),f.cipher.lookupHash('username:'+username),
  'FIXTURE_SALT','a'.repeat(64),now,now);
 f.db.prepare('INSERT INTO client_wallets(client_id,wallet_id,created_at) VALUES(?,?,?)')
  .run(id,'PUBLIC_WALLET_FIXTURE_'+id,now);
}
function args(f){return {db:f.db,fixtureRoot:f.root,keyFile:f.keyFile,archiveKey:f.transport,coordinator:f.coordinator};}
function restoreArgs(f,archiveFile){return {archiveFile,fixtureRoot:f.root,archiveKey:f.transport};}
function archived(f){return path.join(f.root,'auth21-encrypted-clients.fixture.enc.json');}
function restored(f){return path.join(f.root,'auth21-encrypted-restore');}

test('AES-256-GCM bundle restores real encrypted client DB and original master key',async t=>{
 const f=fixture(t);seed(f);
 const before=fs.readFileSync(f.keyFile,'utf8');
 const c=await captureEncryptedFixture(args(f));
 assert.equal(c.encrypted,true);
 assert.equal(c.writerId,'clients');
 assert.equal(f.coordinator.state,'IDLE');
 const body=fs.readFileSync(c.archiveFile,'utf8');
 assert.equal(body.includes(before),false,'no raw master key in archive');
 assert.equal(body.includes('FICTIONAL_FIRST'),false);
 assert.equal(body.includes('WALLET_FIXTURE'),false);
 const r=restoreEncryptedFixture(restoreArgs(f,c.archiveFile));
 assert.equal(r.verified,true);
 assert.equal(r.walletLinks,1);assert.equal(r.indexChecks,2);
 assert.equal(fs.readFileSync(r.keyFile,'utf8'),before);
 const db=new Database(r.dbFile,{readonly:true,fileMustExist:true});
 try{
  const key=new ClientCrypto(r.keyFile,{clientDbPath:r.dbFile});
  const row=db.prepare('SELECT first_name_enc,email_enc FROM clients').get();
  assert.equal(key.open(row.first_name_enc),'FICTIONAL_FIRST_CL000001');
  assert.equal(key.open(row.email_enc),'fiction@example.invalid');
 }finally{db.close();}
});
test('backup uses SQLite snapshot in WAL mode including committed latest rows',async t=>{
 const f=fixture(t,{wal:true});seed(f,'CL000001','USER_ONE','one@example.invalid');
 seed(f,'CL000002','USER_TWO','two@example.invalid');
 assert.equal(fs.existsSync(f.file+'-wal'),true);
 const c=await captureEncryptedFixture(args(f)),r=restoreEncryptedFixture(restoreArgs(f,c.archiveFile));
 assert.equal(r.walletLinks,2);assert.equal(r.indexChecks,4);
 const db=new Database(r.dbFile,{readonly:true,fileMustExist:true});
 try{assert.equal(db.prepare('SELECT COUNT(*) AS n FROM clients').get().n,2);}
 finally{db.close();}
});
test('wrong archive key fails authenticated decryption before writing restored files',async t=>{
 const f=fixture(t);seed(f);const c=await captureEncryptedFixture(args(f));
 assert.throws(()=>restoreEncryptedFixture({...restoreArgs(f,c.archiveFile),archiveKey:crypto.randomBytes(32)}),
  /AUTH21_BUNDLE_AUTH_FAILED/);
 assert.equal(fs.existsSync(restored(f)),false);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM clients').get().n,1);
});
test('modifying the sealed ciphertext fails AEAD authentication and leaves no restore',async t=>{
 const f=fixture(t);seed(f);await captureEncryptedFixture(args(f));
 const file=archived(f),body=JSON.parse(fs.readFileSync(file,'utf8'));
 body.ciphertext=crypto.randomBytes(48).toString('base64');
 fs.writeFileSync(file,JSON.stringify(body),{mode:0o600});
 assert.throws(()=>restoreEncryptedFixture(restoreArgs(f,file)),/AUTH21_BUNDLE_AUTH_FAILED/);
 assert.equal(fs.existsSync(restored(f)),false);
});
test('tampering with AEAD tag fails authentication',async t=>{
 const f=fixture(t);seed(f);await captureEncryptedFixture(args(f));
 const file=archived(f),body=JSON.parse(fs.readFileSync(file,'utf8'));
 body.tag=crypto.randomBytes(16).toString('base64');
 fs.writeFileSync(file,JSON.stringify(body),{mode:0o600});
 assert.throws(()=>restoreEncryptedFixture(restoreArgs(f,file)),/AUTH21_BUNDLE_AUTH_FAILED/);
});
test('archive is not accidentally overwritten or restored into an existing workspace',async t=>{
 const f=fixture(t);seed(f);const c=await captureEncryptedFixture(args(f));
 await assert.rejects(()=>captureEncryptedFixture(args(f)),/AUTH21_BUNDLE_ALREADY_EXISTS/);
 restoreEncryptedFixture(restoreArgs(f,c.archiveFile));
 assert.throws(()=>restoreEncryptedFixture(restoreArgs(f,c.archiveFile)),/AUTH21_BUNDLE_RESTORE_EXISTS/);
});
test('archive key must not be the client identity master key',async t=>{
 const f=fixture(t);seed(f);
 const key=Buffer.from(fs.readFileSync(f.keyFile,'utf8').trim(),'hex');
 await assert.rejects(()=>captureEncryptedFixture({...args(f),archiveKey:key}),/AUTH21_BUNDLE_KEYS_MUST_DIFFER/);
 assert.equal(fs.existsSync(archived(f)),false);
});
test('missing coordinator refuses backup instead of guessing all writers have paused',async t=>{
 const f=fixture(t);seed(f);
 await assert.rejects(()=>captureEncryptedFixture({...args(f),coordinator:null}),/AUTH21_BUNDLE_COORDINATOR_REQUIRED/);
 assert.equal(fs.existsSync(archived(f)),false);
});
test('a missing declared writer prevents archive creation and keeps coordinator usable',async t=>{
 const f=fixture(t);seed(f);
 const noWriter=new SnapshotCoordinator({writerIds:['clients'],timeoutMs:1000});
 await assert.rejects(()=>captureEncryptedFixture({...args(f),coordinator:noWriter}),/SNAPSHOT_WRITER_MISSING/);
 assert.equal(noWriter.state,'IDLE');assert.equal(fs.existsSync(archived(f)),false);
 const c=await captureEncryptedFixture(args(f));
 assert.equal(fs.existsSync(c.archiveFile),true);
});
test('PREPARE without quiesced ACK refuses backup and aborts writer',async t=>{
 const f=fixture(t);seed(f);
 const coordinator=new SnapshotCoordinator({writerIds:['clients'],timeoutMs:1000});
 let aborts=0;
 coordinator.register('clients',{
  prepare:()=>({writerId:'clients',epoch:1,pending:1}),
  release:()=>{throw Error('SHOULD_NOT_RELEASE');},
  abort:()=>{aborts++;}
 });
 await assert.rejects(()=>captureEncryptedFixture({...args(f),coordinator}),/SNAPSHOT_INVALID_ACK/);
 assert.equal(aborts,1);assert.equal(fs.existsSync(archived(f)),false);
});
test('writer is released after normal capture so new fixture writes remain possible',async t=>{
 const f=fixture(t);seed(f);await captureEncryptedFixture(args(f));
 assert.equal(f.gate.heldEpoch,null);
 assert.doesNotThrow(()=>f.gate.assertWritable());
 seed(f,'CL000002','ANOTHER_USER','another@example.invalid');
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM clients').get().n,2);
});
test('archive requires a private fixture marker and never targets an arbitrary temp DB',async t=>{
 const f=fixture(t);seed(f);
 fs.unlinkSync(path.join(f.root,MARKER));
 await assert.rejects(()=>captureEncryptedFixture(args(f)),/ENOENT|AUTH21_BUNDLE_MARKER_INVALID/);
 assert.equal(fs.existsSync(archived(f)),false);
});
test('unsafe root permissions prevent capture of client master key',async t=>{
 const f=fixture(t);seed(f);
 fs.chmodSync(f.root,0o755);
 await assert.rejects(()=>captureEncryptedFixture(args(f)),/AUTH21_BUNDLE_ROOT_NOT_PRIVATE/);
 assert.equal(fs.existsSync(archived(f)),false);
});
test('master key with world permissions rejects snapshot instead of archiving it',async t=>{
 const f=fixture(t);seed(f);fs.chmodSync(f.keyFile,0o644);
 await assert.rejects(()=>captureEncryptedFixture(args(f)),/AUTH21_BUNDLE_MASTER_KEY_UNSAFE/);
 assert.equal(fs.existsSync(archived(f)),false);
});
test('symlinked client key cannot enter encrypted snapshot',async t=>{
 const f=fixture(t);seed(f);
 const backup=path.join(f.root,'saved-key');
 fs.copyFileSync(f.keyFile,backup);fs.unlinkSync(f.keyFile);
 fs.symlinkSync(backup,f.keyFile);
 await assert.rejects(()=>captureEncryptedFixture(args(f)),/AUTH21_BUNDLE_MASTER_KEY_UNSAFE/);
});
test('open rejects an archive with wrong file mode before decrypting',async t=>{
 const f=fixture(t);seed(f);await captureEncryptedFixture(args(f));
 fs.chmodSync(archived(f),0o644);
 assert.throws(()=>restoreEncryptedFixture(restoreArgs(f,archived(f))),/AUTH21_BUNDLE_ARCHIVE_UNSAFE/);
});
test('invalid transport key length fails closed',async t=>{
 const f=fixture(t);seed(f);
 await assert.rejects(()=>captureEncryptedFixture({...args(f),archiveKey:crypto.randomBytes(16)}),
  /AUTH21_BUNDLE_TRANSPORT_KEY_REQUIRED/);
});

test('already tampered source identity is refused before sealed archive creation',async t=>{
 const f=fixture(t);seed(f);
 f.db.prepare("UPDATE clients SET first_name_enc='BAD_AEAD_CIPHERTEXT' WHERE client_id='CL000001'").run();
 await assert.rejects(()=>captureEncryptedFixture(args(f)),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
 assert.equal(fs.existsSync(archived(f)),false);
 assert.equal(f.coordinator.state,'IDLE');
 assert.equal(f.gate.heldEpoch,null);
});
test('valid hex but wrong client master key cannot produce authenticated archive',async t=>{
 const f=fixture(t);seed(f);
 fs.writeFileSync(f.keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 await assert.rejects(()=>captureEncryptedFixture(args(f)),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
 assert.equal(fs.existsSync(archived(f)),false);
 assert.equal(f.gate.heldEpoch,null);
});

test('authenticated but internally inconsistent backup fails restored key attestation and cleans scratch files',async t=>{
 const f=fixture(t);seed(f);await captureEncryptedFixture(args(f));
 const file=archived(f),wrapped=JSON.parse(fs.readFileSync(file,'utf8'));
 const decrypt=crypto.createDecipheriv('aes-256-gcm',f.transport,Buffer.from(wrapped.iv,'base64'));
 decrypt.setAAD(Buffer.from(wrapped.type));decrypt.setAuthTag(Buffer.from(wrapped.tag,'base64'));
 const obj=JSON.parse(Buffer.concat([decrypt.update(Buffer.from(wrapped.ciphertext,'base64')),decrypt.final()]).toString('utf8'));
 // Simulate a defective backup process using a different valid master key but
 // recomputing its manifest hash and AEAD tag correctly. AEAD alone cannot
 // prove that the key belongs to the database; independent restore must.
 obj.masterKey=crypto.randomBytes(32).toString('hex');
 obj.keyHash=crypto.createHash('sha256').update(Buffer.from(obj.masterKey,'hex')).digest('hex');
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',f.transport,iv);
 c.setAAD(Buffer.from(wrapped.type));
 const cipher=Buffer.concat([c.update(Buffer.from(JSON.stringify(obj))),c.final()]);
 wrapped.iv=iv.toString('base64');
 wrapped.tag=c.getAuthTag().toString('base64');
 wrapped.ciphertext=cipher.toString('base64');
 fs.writeFileSync(file,JSON.stringify(wrapped),{mode:0o600});
 assert.throws(()=>restoreEncryptedFixture(restoreArgs(f,file)),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
 assert.equal(fs.existsSync(restored(f)),false);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM clients').get().n,1);
});
