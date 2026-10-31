'use strict';
/* Auth Phase 2 client key fail-closed fixtures. No production files.
 * Only disposable temporary client DB placeholders and throwaway crypto keys.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const ClientCrypto=require('../../Core/Clients/client_crypto');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth-key-fixture-'));
 const keyFile=path.join(root,'Security','client_master.key');
 const dbFile=path.join(root,'Database','clients.sqlite');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return {root,keyFile,dbFile};
}
function placeholder(file){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,'TEST-ONLY-DB-PLACEHOLDER','utf8');
}
test('empty fixture may explicitly initialize client key once',t=>{
 const x=fixture(t);
 const c=new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile});
 assert.equal(fs.existsSync(x.keyFile),true);
 assert.equal(c.master.length,32);
 assert.equal(fs.readFileSync(x.keyFile,'utf8').trim().length,64);
});
test('existing valid key survives restart and decrypts prior fixture data',t=>{
 const x=fixture(t);
 const first=new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile});
 const sealed=first.seal('FICTIONAL_CLIENT_ID');
 placeholder(x.dbFile);
 const before=fs.readFileSync(x.keyFile,'utf8');
 const reopened=new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile});
 assert.equal(reopened.open(sealed),'FICTIONAL_CLIENT_ID');
 assert.equal(fs.readFileSync(x.keyFile,'utf8'),before);
});
test('existing client DB blocks silent key regeneration',t=>{
 const x=fixture(t);
 placeholder(x.dbFile);
 assert.throws(()=>new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile}),/CLIENT_MASTER_KEY_MISSING_WITH_EXISTING_DB/);
 assert.equal(fs.existsSync(x.keyFile),false);
 assert.equal(fs.readFileSync(x.dbFile,'utf8'),'TEST-ONLY-DB-PLACEHOLDER');
});
test('client database sidecars also block silent regeneration',t=>{
 for(const suffix of ['-wal','-shm','-journal']){
  const x=fixture(t);
  placeholder(x.dbFile+suffix);
  assert.throws(()=>new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile}),/CLIENT_MASTER_KEY_MISSING_WITH_EXISTING_DB/);
  assert.equal(fs.existsSync(x.keyFile),false);
 }
});
test('existing damaged key fails closed rather than being replaced',t=>{
 const x=fixture(t);
 placeholder(x.keyFile);
 assert.throws(()=>new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile}),/CLIENT_MASTER_KEY_INVALID/);
 assert.equal(fs.readFileSync(x.keyFile,'utf8'),'TEST-ONLY-DB-PLACEHOLDER');
});
test('default inferred DB path protects key without explicit options',t=>{
 const x=fixture(t);
 placeholder(x.dbFile);
 assert.throws(()=>new ClientCrypto(x.keyFile),/CLIENT_MASTER_KEY_MISSING_WITH_EXISTING_DB/);
 assert.equal(fs.existsSync(x.keyFile),false);
});


test('held opt-in clients gate blocks secret directory and key generation before filesystem changes',t=>{
 const x=fixture(t);
 const {LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');
 const gate=new LocalSnapshotWriter('clients');
 gate.prepare(1);
 assert.throws(()=>new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile,snapshotGate:gate}),
  /SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(fs.existsSync(path.dirname(x.keyFile)),false);
 gate.abort(1);
 const c=new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile,snapshotGate:gate});
 assert.equal(c.master.length,32);
 assert.equal(fs.existsSync(x.keyFile),true);
});
test('held client gate does not chmod a pre-existing fixture master key',t=>{
 const x=fixture(t);
 const first=new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile});
 const bytes=fs.readFileSync(x.keyFile,'utf8');
 fs.chmodSync(path.dirname(x.keyFile),0o700);
 const {LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');
 const gate=new LocalSnapshotWriter('clients');
 gate.prepare(1);
 assert.throws(()=>new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile,snapshotGate:gate}),
  /SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(fs.readFileSync(x.keyFile,'utf8'),bytes);
 assert.equal(fs.statSync(path.dirname(x.keyFile)).mode&0o777,0o700);
 gate.abort(1);
 assert.equal(new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile,snapshotGate:gate}).master.length,32);
});
test('invalid opt-in master-key gate rejects constructor before creating key',t=>{
 const x=fixture(t);
 assert.throws(()=>new ClientCrypto(x.keyFile,{clientDbPath:x.dbFile,snapshotGate:{}}),
  /SNAPSHOT_GATE_INVALID/);
 assert.equal(fs.existsSync(path.dirname(x.keyFile)),false);
});
