'use strict';
/* Auth 2.1 — 4 synthetic writers, 3 native SQLite DBs, 2 allowlisted annexes.
 * No real credentials or connected services; all paths under throwaway /tmp.
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
const {MARKER,MARKER_CONTENT}=require('../CI/auth21_encrypted_snapshot_trial');
const {captureMultiFixture,restoreMultiFixture,WRITERS,ANNEXES}=require('../CI/auth21_multi_resource_snapshot_trial');

const migrations=path.resolve(__dirname,'../../Core/Clients/migrations');
function fixture(t,{wal=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-v3-'));
 fs.chmodSync(root,0o700);
 fs.writeFileSync(path.join(root,MARKER),MARKER_CONTENT,{mode:0o600});
 const file=path.join(root,'clients-fixture.sqlite');
 const keyFile=path.join(root,'Security','client_master.key');
 const key=new ClientCrypto(keyFile,{clientDbPath:file});
 const clients=new Database(file);clients.pragma('foreign_keys=ON');
 for(const migration of ['001_clients_v1.sql','002_client_accounts_v1.sql'])
  clients.exec(fs.readFileSync(path.join(migrations,migration),'utf8'));
 const settings=new Database(path.join(root,'settings-fixture.sqlite'));
 settings.pragma('foreign_keys=ON');
 settings.exec('CREATE TABLE settings(id TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at INTEGER NOT NULL);');
 const portfolio=new Database(path.join(root,'portfolio-fixture.sqlite'));
 portfolio.pragma('foreign_keys=ON');
 portfolio.exec('CREATE TABLE positions(client_id TEXT NOT NULL,trade_id TEXT PRIMARY KEY,value_json TEXT NOT NULL);');
 if(wal)for(const db of [clients,settings,portfolio]){
  db.pragma('journal_mode=WAL');db.pragma('wal_autocheckpoint=0');
 }
 const data={
  root,file,keyFile,key,dbs:{clients,settings,portfolio},
  transport:crypto.randomBytes(32),gates:{},coordinator:null
 };
 for(const id of WRITERS)data.gates[id]=new LocalSnapshotWriter(id);
 data.coordinator=new SnapshotCoordinator({writerIds:[...WRITERS],timeoutMs:1000});
 for(const id of WRITERS)data.coordinator.register(id,{
  prepare:epoch=>data.gates[id].prepare(epoch),
  release:epoch=>data.gates[id].release(epoch),
  abort:epoch=>data.gates[id].abort(epoch)
 });
 const annex=path.join(root,'annexes'),notes=path.join(annex,'notes');
 fs.mkdirSync(notes,{mode:0o700,recursive:true});
 fs.writeFileSync(path.join(annex,'preferences.jsonl'), '{"clientId":"CL000001","theme":"dark"}\n',{mode:0o600});
 fs.writeFileSync(path.join(notes,'export.json'), '{"clientId":"CL000001","type":"export"}\n',{mode:0o600});
 t.after(()=>{
  for(const db of Object.values(data.dbs))if(db.open)db.close();
  fs.rmSync(root,{recursive:true,force:true});
 });
 return data;
}
function seed(f){
 const now='2026-10-14T00:00:00Z',id='CL000001',salt='FIXTURE_SALT';
 f.dbs.clients.prepare([
  'INSERT INTO clients(client_id,external_ref_hash,first_name_enc,last_name_enc,',
  'email_enc,email_hash,status,security_version,created_at,updated_at)',
  "VALUES(?,?,?,?,?,?,'ACTIVE',1,?,?)"
 ].join(' ')).run(id,f.key.externalHash('fixture:'+id),
  f.key.seal('SYNTHETIC_CLIENT'),f.key.seal('SYNTHETIC_LAST'),
  f.key.seal('synthetic@example.invalid'),f.key.lookupHash('synthetic@example.invalid'),now,now);
 f.dbs.clients.prepare([
  'INSERT INTO client_accounts(client_id,username_enc,username_hash,password_salt,',
  'password_hash,password_iterations,role,enabled,created_at,updated_at)',
  "VALUES(?,?,?,?,?,180000,'USER',1,?,?)"
 ].join(' ')).run(id,f.key.seal('SYNTHETIC_USER'),f.key.lookupHash('username:SYNTHETIC_USER'),
  salt,'f'.repeat(64),now,now);
 f.dbs.clients.prepare('INSERT INTO client_wallets(client_id,wallet_id,created_at) VALUES(?,?,?)')
  .run(id,'PUBLIC_WALLET_REFERENCE_ONLY',now);
 f.dbs.settings.prepare('INSERT INTO settings VALUES(?,?,?)')
  .run('ui.layout',JSON.stringify({theme:'dark'}),1900000000);
 f.dbs.portfolio.prepare('INSERT INTO positions VALUES(?,?,?)')
  .run(id,'TRADE_FIXTURE_ONLY',JSON.stringify({asset:'BTC',quantity:0.01}));
}
function capture(f,additional={}){return captureMultiFixture({
 root:f.root,dbs:f.dbs,keyFile:f.keyFile,archiveKey:f.transport,
 coordinator:f.coordinator,...additional
});}
function restore(f,archiveFile,additional={}){return restoreMultiFixture({
 root:f.root,archiveFile,archiveKey:f.transport,...additional
});}
const archive=f=>path.join(f.root,'auth21-multi.fixture.enc.json');
const restored=f=>path.join(f.root,'auth21-multi-restored');
function readEnvelope(f){return JSON.parse(fs.readFileSync(archive(f),'utf8'));}
function replaceEnvelope(f,body){fs.writeFileSync(archive(f),JSON.stringify(body)+'\n',{mode:0o600});}

test('four-participant snapshot restores three DBs, client key and two annexes',async t=>{
 const f=fixture(t);seed(f);
 const beforeKey=fs.readFileSync(f.keyFile,'utf8');
 const c=await capture(f);
 assert.equal(c.encrypted,true);assert.equal(f.coordinator.state,'IDLE');
 const protectedText=fs.readFileSync(c.archiveFile,'utf8');
 for(const secret of [beforeKey,'SYNTHETIC_CLIENT','TRADE_FIXTURE_ONLY','PUBLIC_WALLET_REFERENCE_ONLY','"theme":"dark"'])
  assert.equal(protectedText.includes(secret),false,'archive must not expose '+secret.slice(0,8));
 const r=restore(f,c.archiveFile);
 assert.equal(r.verified,true);assert.equal(r.databases,3);
 assert.equal(r.annexes,2);assert.equal(r.walletLinks,1);assert.equal(r.indexChecks,2);
 assert.equal(fs.readFileSync(path.join(r.restoredDir,'Security','client_master.key'),'utf8'),beforeKey);
 const cs=new Database(path.join(r.restoredDir,'clients-fixture.sqlite'),{readonly:true});
 const ss=new Database(path.join(r.restoredDir,'settings-fixture.sqlite'),{readonly:true});
 const ps=new Database(path.join(r.restoredDir,'portfolio-fixture.sqlite'),{readonly:true});
 try{
  assert.equal(cs.prepare('SELECT COUNT(*) AS n FROM client_wallets').get().n,1);
  assert.equal(JSON.parse(ss.prepare('SELECT value_json FROM settings').get().value_json).theme,'dark');
  assert.equal(ps.prepare('SELECT trade_id FROM positions').get().trade_id,'TRADE_FIXTURE_ONLY');
 }finally{cs.close();ss.close();ps.close();}
 for(const item of ANNEXES)assert.equal(
  fs.readFileSync(path.join(f.root,item),'utf8'),
  fs.readFileSync(path.join(r.restoredDir,item),'utf8'));
});
test('WAL commits in all three databases are included without copying WAL sidecars',async t=>{
 const f=fixture(t,{wal:true});seed(f);
 for(const db of Object.values(f.dbs))assert.equal(db.pragma('journal_mode',{simple:true}),'wal');
 const a=await capture(f),r=restore(f,a.archiveFile);
 assert.equal(r.databases,3);
 for(const name of ['clients','settings','portfolio']){
  // Opening a restored SQLite database itself may create -wal/-shm.
  // Assert the archive restored a self-contained main DB BEFORE opening it.
  assert.equal(fs.existsSync(path.join(r.restoredDir,name+'-fixture.sqlite-wal')),false);
  const db=new Database(path.join(r.restoredDir,name+'-fixture.sqlite'),{readonly:true});
  try{assert.equal(db.pragma('integrity_check',{simple:true}),'ok');}finally{db.close()}
 }
});
test('missing or invalid writers prevent capture before an archive appears',async t=>{
 const f=fixture(t);seed(f);
 const none=new SnapshotCoordinator({writerIds:WRITERS});
 await assert.rejects(()=>capture(f,{coordinator:none}),/SNAPSHOT_WRITER_MISSING/);
 const missing=new SnapshotCoordinator({writerIds:['clients','settings','portfolio']});
 await assert.rejects(()=>capture(f,{coordinator:missing}),/AUTH21_MULTI_WRITER_ALLOWLIST_REQUIRED/);
 assert.equal(fs.existsSync(archive(f)),false);
});
test('all ACKs precede the capture, and each writer resumes after success',async t=>{
 const f=fixture(t);seed(f);
 const reports=[];
 const c=new SnapshotCoordinator({writerIds:WRITERS});
 const held={};
 for(const id of WRITERS){
  held[id]=new LocalSnapshotWriter(id);
  c.register(id,{
   prepare:e=>{reports.push('prepare:'+id);return held[id].prepare(e)},
   release:e=>{reports.push('release:'+id);held[id].release(e)},
   abort:e=>{reports.push('abort:'+id);held[id].abort(e)}
  });
 }
 const r=await capture(f,{coordinator:c});
 assert.ok(r.archiveFile);
 assert.deepEqual(reports.slice(0,4),WRITERS.map(x=>'prepare:'+x));
 assert.deepEqual(reports.slice(4),[...WRITERS].reverse().map(x=>'release:'+x));
 for(const w of Object.values(held))assert.equal(w.heldEpoch,null);
});
test('one refusing writer aborts earlier writers and prevents any archive',async t=>{
 const f=fixture(t);seed(f);
 const c=new SnapshotCoordinator({writerIds:WRITERS});
 const held=new LocalSnapshotWriter('clients');
 let aborted=0;
 c.register('clients',{prepare:e=>held.prepare(e),release:e=>held.release(e),abort:e=>{held.abort(e);aborted++}});
 for(const id of WRITERS.slice(1)){
  c.register(id,{prepare:e=>({epoch:e,writerId:id,pending:id==='portfolio'?1:0}),
   release:()=>{},abort:()=>{aborted++}});
 }
 await assert.rejects(()=>capture(f,{coordinator:c}),/SNAPSHOT_INVALID_ACK/);
 assert.equal(held.heldEpoch,null);assert.ok(aborted>=1);
 assert.equal(fs.existsSync(archive(f)),false);
});
test('wrong transport key and modified ciphertext both fail without restored files',async t=>{
 const f=fixture(t);seed(f);await capture(f);
 assert.throws(()=>restore(f,archive(f),{archiveKey:crypto.randomBytes(32)}),/AUTH21_MULTI_AEAD_FAILED/);
 assert.equal(fs.existsSync(restored(f)),false);
 const e=readEnvelope(f);e.tag=crypto.randomBytes(16).toString('base64');replaceEnvelope(f,e);
 assert.throws(()=>restore(f,archive(f)),/AUTH21_MULTI_AEAD_FAILED/);
 assert.equal(fs.existsSync(restored(f)),false);
});
test('wrong client key before capture causes abort with no published archive',async t=>{
 const f=fixture(t);seed(f);
 fs.writeFileSync(f.keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 await assert.rejects(()=>capture(f),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
 assert.equal(fs.existsSync(archive(f)),false);
 assert.equal(f.coordinator.state,'IDLE');
});
test('missing annex and malformed permissions abort snapshot without partial archive',async t=>{
 const f=fixture(t);seed(f);
 fs.unlinkSync(path.join(f.root,ANNEXES[1]));
 await assert.rejects(()=>capture(f),/ENOENT/);
 assert.equal(fs.existsSync(archive(f)),false);
 assert.equal(f.coordinator.state,'IDLE');
 fs.writeFileSync(path.join(f.root,ANNEXES[1]),'FICTIONAL',{mode:0o600});
 fs.chmodSync(path.join(f.root,ANNEXES[0]),0o644);
 await assert.rejects(()=>capture(f),/AUTH21_MULTI_PRIVATE_FILE_REQUIRED/);
 assert.equal(fs.existsSync(archive(f)),false);
});
test('symlinked annex is forbidden and cannot leak an unrelated private file',async t=>{
 const f=fixture(t);seed(f);
 const name=path.join(f.root,ANNEXES[0]),other=path.join(f.root,'private-file');
 fs.writeFileSync(other,'PRIVATE_NOT_FOR_BACKUP',{mode:0o600});
 fs.unlinkSync(name);fs.symlinkSync(other,name);
 await assert.rejects(()=>capture(f),/AUTH21_MULTI_SYMLINK_REFUSED/);
 assert.equal(fs.existsSync(archive(f)),false);
});
test('snapshot refuses additional participant or swapped SQLite resource path',async t=>{
 const f=fixture(t);seed(f);
 const many=new SnapshotCoordinator({writerIds:[...WRITERS,'rogue']});
 await assert.rejects(()=>capture(f,{coordinator:many}),/AUTH21_MULTI_WRITER_ALLOWLIST_REQUIRED/);
 await assert.rejects(()=>capture(f,{dbs:{...f.dbs,settings:f.dbs.portfolio}}),/AUTH21_MULTI_DB_PATH_INVALID/);
 assert.equal(fs.existsSync(archive(f)),false);
});
test('a second snapshot or restoration never overwrites a previous output',async t=>{
 const f=fixture(t);seed(f);await capture(f);
 await assert.rejects(()=>capture(f),/AUTH21_MULTI_ARCHIVE_EXISTS/);
 restore(f,archive(f));
 assert.throws(()=>restore(f,archive(f)),/AUTH21_MULTI_RESTORE_EXISTS/);
});
test('archive transport key cannot match the identity encryption key',async t=>{
 const f=fixture(t);seed(f);
 await assert.rejects(()=>capture(f,{archiveKey:Buffer.from(fs.readFileSync(f.keyFile,'utf8'),'hex')}),
  /AUTH21_MULTI_SEPARATE_KEYS_REQUIRED/);
 assert.equal(fs.existsSync(archive(f)),false);
});
test('envelope with wrong algorithm or extra key fails closed',async t=>{
 const f=fixture(t);seed(f);await capture(f);
 const e=readEnvelope(f);
 replaceEnvelope(f,{...e,alg:'AES-128-GCM'});
 assert.throws(()=>restore(f,archive(f)),/AUTH21_MULTI_ENVELOPE_INVALID/);
 replaceEnvelope(f,{...e,injected:'bad'});
 assert.throws(()=>restore(f,archive(f)),/AUTH21_MULTI_ENVELOPE_INVALID/);
 assert.equal(fs.existsSync(restored(f)),false);
});
test('archive with disallowed permissions or symlink is rejected',async t=>{
 const f=fixture(t);seed(f);await capture(f);
 fs.chmodSync(archive(f),0o644);
 assert.throws(()=>restore(f,archive(f)),/AUTH21_MULTI_PRIVATE_FILE_REQUIRED/);
 fs.chmodSync(archive(f),0o600);
 const other=path.join(f.root,'renamed.enc');fs.renameSync(archive(f),other);
 fs.symlinkSync(other,archive(f));
 assert.throws(()=>restore(f,archive(f)),/AUTH21_MULTI_SYMLINK_REFUSED/);
});
test('corrupt payload inside a correctly authenticated envelope is rejected',async t=>{
 const f=fixture(t);seed(f);await capture(f);
 const e=readEnvelope(f);
 const d=crypto.createDecipheriv('aes-256-gcm',f.transport,Buffer.from(e.iv,'base64'));
 d.setAAD(Buffer.from(e.type));d.setAuthTag(Buffer.from(e.tag,'base64'));
 const obj=JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString('utf8'));
 obj.manifest['sqlite/settings'].sha256='0'.repeat(64);
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',f.transport,iv);
 c.setAAD(Buffer.from(e.type));
 const enc=Buffer.concat([c.update(Buffer.from(JSON.stringify(obj))),c.final()]);
 e.iv=iv.toString('base64');e.tag=c.getAuthTag().toString('base64');e.data=enc.toString('base64');
 replaceEnvelope(f,e);
 assert.throws(()=>restore(f,archive(f)),/AUTH21_MULTI_CHECKSUM_FAILED/);
 assert.equal(fs.existsSync(restored(f)),false);
});
test('authenticated bundle holding an unrelated valid client key fails restore and cleans scratch',async t=>{
 const f=fixture(t);seed(f);await capture(f);
 const e=readEnvelope(f);
 const d=crypto.createDecipheriv('aes-256-gcm',f.transport,Buffer.from(e.iv,'base64'));
 d.setAAD(Buffer.from(e.type));d.setAuthTag(Buffer.from(e.tag,'base64'));
 const obj=JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString('utf8'));
 obj.masterKey=crypto.randomBytes(32).toString('hex');
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',f.transport,iv);
 c.setAAD(Buffer.from(e.type));
 const enc=Buffer.concat([c.update(Buffer.from(JSON.stringify(obj))),c.final()]);
 e.iv=iv.toString('base64');e.tag=c.getAuthTag().toString('base64');e.data=enc.toString('base64');
 replaceEnvelope(f,e);
 assert.throws(()=>restore(f,archive(f)),/AUTH21_RESTORE_KEY_NOT_COMPATIBLE/);
 assert.equal(fs.existsSync(restored(f)),false);
});
test('encrypted archive already present is never silently replaced',async t=>{
 const f=fixture(t);seed(f);
 fs.writeFileSync(archive(f),'SENTINEL_NOT_A_VALID_ARCHIVE',{mode:0o600});
 await assert.rejects(()=>capture(f),/AUTH21_MULTI_ARCHIVE_EXISTS/);
 assert.equal(fs.readFileSync(archive(f),'utf8'),'SENTINEL_NOT_A_VALID_ARCHIVE');
});

test('fake coordinator object cannot impersonate the approved snapshot protocol',async t=>{
 const f=fixture(t);seed(f);
 const impostor={writerIds:[...WRITERS],execute:async fn=>fn({epoch:1})};
 await assert.rejects(()=>capture(f,{coordinator:impostor}),/AUTH21_MULTI_WRITER_ALLOWLIST_REQUIRED/);
 assert.equal(fs.existsSync(archive(f)),false);
});
test('oversized annex aborts all participating writers without publishing an archive',async t=>{
 const f=fixture(t);seed(f);
 fs.writeFileSync(path.join(f.root,ANNEXES[0]),Buffer.alloc(1024*1024+1),{mode:0o600});
 await assert.rejects(()=>capture(f),/AUTH21_MULTI_ANNEX_SIZE_INVALID/);
 assert.equal(fs.existsSync(archive(f)),false);
 assert.equal(f.coordinator.state,'IDLE');
 for(const id of WRITERS)assert.equal(f.gates[id].heldEpoch,null);
});
test('even a correctly authenticated archive with corrupt Settings SQLite is rejected and rolled back',async t=>{
 const f=fixture(t);seed(f);await capture(f);
 const e=readEnvelope(f);
 const d=crypto.createDecipheriv('aes-256-gcm',f.transport,Buffer.from(e.iv,'base64'));
 d.setAAD(Buffer.from(e.type));d.setAuthTag(Buffer.from(e.tag,'base64'));
 const payload=JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString('utf8'));
 const invalid=Buffer.alloc(512);
 payload.databases.settings=invalid.toString('base64');
 payload.manifest['sqlite/settings']={
  bytes:invalid.length,sha256:crypto.createHash('sha256').update(invalid).digest('hex')
 };
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',f.transport,iv);
 c.setAAD(Buffer.from(e.type));
 const bytes=Buffer.concat([c.update(Buffer.from(JSON.stringify(payload))),c.final()]);
 e.iv=iv.toString('base64');e.tag=c.getAuthTag().toString('base64');
 e.data=bytes.toString('base64');
 replaceEnvelope(f,e);
 assert.throws(()=>restore(f,archive(f)));
 assert.equal(fs.existsSync(restored(f)),false);
 assert.equal(f.dbs.settings.prepare('SELECT COUNT(*) AS n FROM settings').get().n,1);
});
