'use strict';
/* Auth P2.2 Financial JSONL: native filesystem tests on throwaway temp files.
 * Never loads active MarketData services, users, Wallet or a real deployment.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Store=require('../../MarketData/Financial/financial_store');
const {SnapshotCoordinator,LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');

function fixture(t,gate) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-p22-financial-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'nested','financial_snapshots.jsonl');
 const opts={file,retentionMs:86400000,maxHistory:24,persistIntervalMs:60000};
 if(gate)opts.snapshotGate=gate;
 return {root,file,opts};
}
function snapshot(i) {
 return {timestamp:Date.now()+i,expiresAt:Date.now()+120000,cefi:{id:'fictional-'+i},defi:null,meta:{fixture:true}};
}
function disk(file) {return fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;}
function rows(file) {return String(disk(file)||'').split('\n').filter(Boolean).map(x=>JSON.parse(x));}

test('Financial default remains compatible: JSONL append and restart rehydrate cache',t=>{
 const {file,opts}=fixture(t);
 const store=new Store(opts);
 assert.equal(store.snapshotGate,null);
 assert.equal(fs.existsSync(file),false);
 assert.equal(store.set(snapshot(1)).cefi.id,'fictional-1');
 assert.equal(rows(file).length,1);
 store.persist(snapshot(2));
 assert.equal(rows(file).length,2);
 const second=new Store(opts);
 assert.equal(second.current.cefi.id,'fictional-2');
 assert.equal(second.list(10).length,2);
});

test('Financial invalid snapshot gate rejected before filesystem access',t=>{
 const {file,opts}=fixture(t);
 assert.throws(()=>new Store({...opts,snapshotGate:{}}),/SNAPSHOT_GATE_INVALID/);
 assert.equal(fs.existsSync(path.dirname(file)),false);
 assert.equal(fs.existsSync(file),false);
});

test('Financial held epoch rejects constructor before loading an existing JSONL file',t=>{
 const {file,opts}=fixture(t);
 const plain=new Store(opts);
 plain.persist(snapshot(1));
 const before=disk(file);
 const gate=new LocalSnapshotWriter('financial');
 gate.prepare(1);
 assert.throws(()=>new Store({...opts,snapshotGate:gate}),/SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(disk(file),before);
 gate.abort(1);
 const reopened=new Store({...opts,snapshotGate:gate});
 assert.equal(reopened.list(10).length,1);
});

test('Financial freezes all file and memory mutations, but allows cached reads',t=>{
 const gate=new LocalSnapshotWriter('financial');
 const {file,opts}=fixture(t,gate);
 const store=new Store(opts);
 store.set(snapshot(1));
 const before=disk(file),cacheBefore=JSON.stringify({current:store.current,history:store.history,lastPersistAt:store.lastPersistAt});
 gate.prepare(1);
 const rejected=[
  ()=>store.set(snapshot(2)),
  ()=>store.persist(snapshot(3)),
  ()=>store._prune(),
  ()=>store.purge({confirm:'PURGE',mode:'ALL_HISTORY'}),
  ()=>store._load()
 ];
 for(const action of rejected)assert.throws(action,/SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(disk(file),before);
 assert.equal(JSON.stringify({current:store.current,history:store.history,lastPersistAt:store.lastPersistAt}),cacheBefore);
 assert.equal(store.get().cefi.id,'fictional-1');
 assert.equal(store.list().length,1);
 assert.equal(store.status().historyEntries,1);
 gate.release(1);
 store.persist(snapshot(2));
 assert.equal(rows(file).length,2);
});

test('Financial isolated coordinator freezes real temp file until RELEASE',async t=>{
 const gate=new LocalSnapshotWriter('financial'),{file,opts}=fixture(t,gate);
 const store=new Store(opts);
 store.persist(snapshot(1));
 const before=disk(file);
 const coordinator=new SnapshotCoordinator({writerIds:['financial']});
 coordinator.register('financial',gate);
 const result=await coordinator.execute(({epoch})=>{
  assert.equal(epoch,1);
  assert.equal(disk(file),before);
  assert.throws(()=>store.persist(snapshot(2)),/SNAPSHOT_WRITE_QUIESCED/);
  assert.throws(()=>store.purge({confirm:'PURGE',mode:'ALL_HISTORY'}),/SNAPSHOT_WRITE_QUIESCED/);
  assert.equal(disk(file),before);
  return 'fixture-copy-not-a-backup';
 });
 assert.equal(result,'fixture-copy-not-a-backup');
 assert.equal(coordinator.state,'IDLE');
 store.persist(snapshot(3));
 assert.equal(rows(file).length,2);
});

test('Financial coordinator ABORT resumes writes after simulated capture failure',async t=>{
 const gate=new LocalSnapshotWriter('financial'),{file,opts}=fixture(t,gate);
 const store=new Store(opts);
 store.persist(snapshot(1));
 const before=disk(file);
 const coordinator=new SnapshotCoordinator({writerIds:['financial']});
 coordinator.register('financial',gate);
 await assert.rejects(()=>coordinator.execute(()=>{
  assert.throws(()=>store.persist(snapshot(2)),/SNAPSHOT_WRITE_QUIESCED/);
  assert.equal(disk(file),before);
  throw new Error('FIXTURE_CAPTURE_INTERRUPTED');
 }),/FIXTURE_CAPTURE_INTERRUPTED/);
 assert.equal(coordinator.state,'IDLE');
 assert.equal(gate.heldEpoch,null);
 store.persist(snapshot(3));
 assert.equal(rows(file).length,2);
});

test('Financial JSONL rotation keeps bounded history and leaves no .tmp file',t=>{
 const {file,opts}=fixture(t);
 const store=new Store(opts);
 for(let i=1;i<=26;i++)store.persist(snapshot(i));
 const items=rows(file);
 assert.equal(items.length,24);
 assert.equal(items[0].cefi.id,'fictional-3');
 assert.equal(items.at(-1).cefi.id,'fictional-26');
 assert.equal(fs.existsSync(file+'.tmp'),false);
 assert.equal(store.list(100).length,24);
});

test('Financial explicit purge rewrites real temp JSONL while preserving existing semantics',t=>{
 const {file,opts}=fixture(t);
 const store=new Store(opts);
 store.persist(snapshot(1));
 store.persist(snapshot(2));
 assert.equal(store.purge({mode:'ALL_HISTORY'}).error,'PURGE_CONFIRMATION_REQUIRED');
 assert.equal(rows(file).length,2);
 const answer=store.purge({confirm:'PURGE',mode:'ALL_HISTORY'});
 assert.equal(answer.ok,true);
 assert.equal(answer.removed,2);
 assert.equal(store.history.length,0);
 assert.equal(disk(file),'');
 assert.equal(fs.existsSync(file+'.tmp'),false);
});

test('Financial repeated epochs reject stale reuse and preserve appended records',async t=>{
 const gate=new LocalSnapshotWriter('financial'),{file,opts}=fixture(t,gate);
 const store=new Store(opts);
 const coordinator=new SnapshotCoordinator({writerIds:['financial']});
 coordinator.register('financial',gate);
 for(let i=1;i<=2;i++){
  await coordinator.execute(({epoch})=>{
   assert.equal(epoch,i);
   assert.throws(()=>store.set(snapshot(i)),/SNAPSHOT_WRITE_QUIESCED/);
  });
  store.persist(snapshot(i));
 }
 assert.equal(rows(file).length,2);
 assert.equal(gate.heldEpoch,null);
 assert.throws(()=>gate.prepare(1),/SNAPSHOT_STALE_OR_BUSY_EPOCH/);
});
