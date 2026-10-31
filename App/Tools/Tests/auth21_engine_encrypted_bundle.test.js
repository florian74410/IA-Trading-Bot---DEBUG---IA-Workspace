'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const Database=require('better-sqlite3');
const {SnapshotCoordinator,LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');
const {capture,restore}=require('../CI/auth21_engine_encrypted_bundle');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));fs.chmodSync(root,0o700);
 fs.writeFileSync(path.join(root,'.iatb-auth21-core-local-trial'),'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n',{mode:0o600});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',
  IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',IATB_AUTH21_LOCAL_TRIAL_ROOT:root,
  IATB_RUNTIME_ROOT:path.join(root,'runtime'),IATB_DATA_ROOT:path.join(root,'userdata'),
  IATB_ANNEX_ROOT:path.join(root,'annexes'),IATB_UPDATES_ROOT:path.join(root,'updates'),
  IATB_STATE_ROOT:path.join(root,'legacy')};
 const resources=['userdata/User Data/test/portfolio.db',
  'userdata/Shared Data/MarketData/market_registry.db',
  'userdata/Shared Data/MarketData/financial_snapshots.jsonl'];
 const opened=[];
 for(const rel of resources.filter(x=>x.endsWith('.db'))){
  const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const db=new Database(file);db.pragma('journal_mode=WAL');db.pragma('wal_autocheckpoint=0');
  db.exec('CREATE TABLE events(value TEXT NOT NULL); INSERT INTO events(value) VALUES(\'accepted\');');
  opened.push(db);
 }
 const json=path.join(root,resources[2]);fs.mkdirSync(path.dirname(json),{recursive:true});
 fs.writeFileSync(json,'{"type":"accepted"}\n',{mode:0o600});
 t.after(()=>opened.forEach(db=>{if(db.open)db.close()}));
 const coordinator=new SnapshotCoordinator({writerIds:['portfolio','marketdata']});
 const gates={};
 for(const engine of ['portfolio','marketdata']){
  const gate=new LocalSnapshotWriter(engine);gates[engine]=gate;
  coordinator.register(engine,{prepare:e=>gate.prepare(e),release:e=>gate.release(e),abort:e=>gate.abort(e)});
 }
 return {env,root,resources,coordinator,gates,key:crypto.randomBytes(32)};
}
test('real WAL SQLite and JSONL are encrypted and recoverable after synchronized barrier',async t=>{
 const f=fixture(t);
 assert.throws(()=>capture({env:f.env,root:f.root,resources:f.resources,transportKey:f.key,
  coordinator:f.coordinator,epoch:1}),/P22_QUIESCENCE_PROOF_REQUIRED/);
 const archive=await f.coordinator.execute(({epoch})=>{
  assert.throws(()=>f.gates.marketdata.assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
  return capture({...f,transportKey:f.key,coordinator:f.coordinator,epoch});
 });
 assert.equal(f.coordinator.state,'IDLE');
 assert.doesNotThrow(()=>f.gates.portfolio.assertWritable());
 const dest=path.join(os.tmpdir(),'iatb-auth21-restore-'+crypto.randomBytes(7).toString('hex'));
 t.after(()=>fs.rmSync(dest,{recursive:true,force:true}));
 const result=restore({archive,transportKey:f.key,outputDir:dest});
 assert.equal(result.restored,true);
 assert.equal(result.files.length,3);
 for(const rel of f.resources.filter(x=>x.endsWith('.db'))){
  const db=new Database(path.join(dest,rel),{readonly:true});
  assert.equal(db.prepare('SELECT value FROM events').get().value,'accepted');
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  db.close();
 }
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dest,f.resources[2]),'utf8')),{type:'accepted'});
});
test('tampered or wrongly keyed encrypted archive cannot leave partial restore',async t=>{
 const f=fixture(t);
 const archive=await f.coordinator.execute(({epoch})=>capture({...f,transportKey:f.key,epoch}));
 for(const [payload,key] of [[archive,crypto.randomBytes(32)],
   [Buffer.from(archive.toString().replace(/.{6}$/,'BADXX}')),f.key]]){
  const dest=path.join(os.tmpdir(),'iatb-auth21-restore-'+crypto.randomBytes(8).toString('hex'));
  assert.throws(()=>restore({archive:payload,transportKey:key,outputDir:dest}),/P22_ARCHIVE_AUTH_FAILED/);
  assert.equal(fs.existsSync(dest),false);
 }
});
test('incomplete quorum cannot capture an Engine store',async t=>{
 const f=fixture(t);
 const incomplete=new SnapshotCoordinator({writerIds:['portfolio']});
 const gate=new LocalSnapshotWriter('portfolio');
 incomplete.register('portfolio',{prepare:e=>gate.prepare(e),release:e=>gate.release(e),abort:e=>gate.abort(e)});
 await assert.rejects(incomplete.execute(({epoch})=>capture({...f,transportKey:f.key,coordinator:incomplete,epoch})),/P22_WRITER_ACK_MISSING/);
 assert.equal(incomplete.state,'IDLE');
});

test('mid-restore integrity failure rolls back every already-written file',async t=>{
 const f=fixture(t);
 const archive=await f.coordinator.execute(({epoch})=>capture({...f,transportKey:f.key,epoch}));
 const envelope=JSON.parse(archive.toString('utf8'));
 const original=crypto.createDecipheriv('aes-256-gcm',f.key,Buffer.from(envelope.nonce,'base64'));
 original.setAAD(Buffer.from(envelope.magic));
 original.setAuthTag(Buffer.from(envelope.tag,'base64'));
 const payload=JSON.parse(Buffer.concat([original.update(Buffer.from(envelope.ciphertext,'base64')),original.final()]).toString('utf8'));
 assert.ok(payload.rows.length>=2);
 payload.rows[payload.rows.length-1].digest='0'.repeat(64);
 const nonce=crypto.randomBytes(12);
 const encoder=crypto.createCipheriv('aes-256-gcm',f.key,nonce);
 encoder.setAAD(Buffer.from(envelope.magic));
 const ciphertext=Buffer.concat([encoder.update(Buffer.from(JSON.stringify(payload))),encoder.final()]);
 envelope.nonce=nonce.toString('base64');
 envelope.tag=encoder.getAuthTag().toString('base64');
 envelope.ciphertext=ciphertext.toString('base64');
 const dest=path.join(os.tmpdir(),'iatb-auth21-restore-'+crypto.randomBytes(8).toString('hex'));
 assert.throws(()=>restore({archive:Buffer.from(JSON.stringify(envelope)),transportKey:f.key,outputDir:dest}),/P22_RESTORE_DIGEST_FAILED/);
 assert.equal(fs.existsSync(dest),false,'partial plaintext files must not survive a failed restore');
});

test('Portfolio usage accounting JSONL is included with SQLite bundle',async t=>{
 const f=fixture(t),relative='App/.runtime/accounting/usage_ledger.jsonl';
 const file=path.join(f.root,relative);
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 fs.writeFileSync(file,JSON.stringify({schema:'iatb.cost/1-alpha',total_tokens:7})+'\n',{mode:0o600});
 f.resources.push(relative);
 const archive=await f.coordinator.execute(({epoch})=>capture({...f,coordinator:f.coordinator,transportKey:f.key,epoch}));
 const out=path.join(os.tmpdir(),'iatb-auth21-restore-'+crypto.randomBytes(8).toString('hex'));
 t.after(()=>fs.rmSync(out,{recursive:true,force:true}));
 const result=restore({archive,transportKey:f.key,outputDir:out});
 assert.equal(result.files.length,4);
 assert.equal(JSON.parse(fs.readFileSync(path.join(out,relative),'utf8')).total_tokens,7);
});
