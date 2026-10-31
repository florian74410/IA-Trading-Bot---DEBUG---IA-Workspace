'use strict';
/* P2.2 Mosaics: write/delete atomicity on temporary files; no active Annexes. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const MosaicStore=require('../../Core/Mosaics/mosaic_store_v1.0');
const {SnapshotCoordinator,LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');

function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-p22-mosaics-'));
 const old=process.env.IATB_ANNEX_ROOT;
 // Force the module's configurable Annex root to disposable temporary files.
 process.env.IATB_ANNEX_ROOT=path.join(root,'annex-root');
 t.after(()=>{
  if(old===undefined)delete process.env.IATB_ANNEX_ROOT;
  else process.env.IATB_ANNEX_ROOT=old;
  fs.rmSync(root,{recursive:true,force:true});
 });
 return {root,dir:path.join(root,'annex-root','Mosaiques')};
}
function definition(id,value) {
 return {id,title:'Unit '+id,items:[{source:'literal.text',label:'Fixture',value}]};
}
function snapshotDir(dir) {
 if(!fs.existsSync(dir))return [];
 return fs.readdirSync(dir).sort().map(name=>({name,bytes:fs.readFileSync(path.join(dir,name),'utf8')}));
}

test('default MosaicStore retains normal atomic write/list/get/delete flow',t=>{
 const {root,dir}=fixture(t);
 const store=new MosaicStore(root);
 assert.equal(store.snapshotGate,null);
 const result=store.write(definition('fixture-one','first'));
 assert.equal(result.filename,'fixture-one.moz.json');
 assert.equal(store.list().length,1);
 assert.equal(store.getByModuleId('moz:fixture-one').definition.items[0].value,'first');
 assert.equal(store.moduleCatalog().length,1);
 assert.deepEqual(fs.readdirSync(dir),['fixture-one.moz.json']);
 assert.equal(store.remove('moz:fixture-one').ok,true);
 assert.deepEqual(fs.readdirSync(dir),[]);
});

test('invalid Mosaic gate rejected before making Annex directories',t=>{
 const {root,dir}=fixture(t);
 assert.throws(()=>new MosaicStore(root,{snapshotGate:{}}),/SNAPSHOT_GATE_INVALID/);
 assert.equal(fs.existsSync(dir),false);
});

test('Mosaic constructor checks held epoch before directory creation',t=>{
 const {root,dir}=fixture(t),gate=new LocalSnapshotWriter('mosaics');
 gate.prepare(1);
 assert.throws(()=>new MosaicStore(root,{snapshotGate:gate}),/SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(fs.existsSync(dir),false);
 gate.abort(1);
 const store=new MosaicStore(root,{snapshotGate:gate});
 assert.ok(fs.existsSync(store.dir));
});

test('Mosaic write refuses under freeze without temporary files or in-memory side effects',t=>{
 const {root,dir}=fixture(t),gate=new LocalSnapshotWriter('mosaics');
 const store=new MosaicStore(root,{snapshotGate:gate});
 store.write(definition('fixture-one','original'));
 const before=snapshotDir(dir);
 gate.prepare(1);
 assert.throws(()=>store.write(definition('fixture-two','blocked')),/SNAPSHOT_WRITE_QUIESCED/);
 assert.throws(()=>store.write(definition('fixture-one','replace')),/SNAPSHOT_WRITE_QUIESCED/);
 assert.deepEqual(snapshotDir(dir),before);
 assert.equal(store.list().length,1);
 gate.release(1);
 store.write(definition('fixture-one','replace'));
 assert.equal(store.list()[0].definition.items[0].value,'replace');
 assert.equal(fs.readdirSync(dir).some(x=>x.endsWith('.tmp')),false);
});

test('Mosaic delete cannot bypass held snapshot; existing file survives',t=>{
 const {root,dir}=fixture(t),gate=new LocalSnapshotWriter('mosaics');
 const store=new MosaicStore(root,{snapshotGate:gate});
 store.write(definition('fixture-one','retain'));
 const before=snapshotDir(dir);
 gate.prepare(7);
 assert.throws(()=>store.remove('moz:fixture-one'),/SNAPSHOT_WRITE_QUIESCED/);
 assert.deepEqual(snapshotDir(dir),before);
 gate.release(7);
 assert.equal(store.remove('moz:fixture-one').ok,true);
 assert.equal(store.list().length,0);
});

test('Mosaic coordinator confirms freeze before capture and resumes on RELEASE',async t=>{
 const {root,dir}=fixture(t),gate=new LocalSnapshotWriter('mosaics');
 const store=new MosaicStore(root,{snapshotGate:gate});
 store.write(definition('fixture-one','original'));
 const before=snapshotDir(dir);
 const coordinator=new SnapshotCoordinator({writerIds:['mosaics']});
 coordinator.register('mosaics',gate);
 const out=await coordinator.execute(({epoch})=>{
  assert.equal(epoch,1);
  assert.throws(()=>store.remove('moz:fixture-one'),/SNAPSHOT_WRITE_QUIESCED/);
  assert.throws(()=>store.write(definition('fixture-two','blocked')),/SNAPSHOT_WRITE_QUIESCED/);
  assert.deepEqual(snapshotDir(dir),before);
  return 'fixture-only';
 });
 assert.equal(out,'fixture-only');
 assert.equal(coordinator.state,'IDLE');
 store.write(definition('fixture-two','after'));
 assert.equal(store.list().length,2);
});

test('Mosaic abort preserves all existing files and resumes mutations',async t=>{
 const {root,dir}=fixture(t),gate=new LocalSnapshotWriter('mosaics');
 const store=new MosaicStore(root,{snapshotGate:gate});
 store.write(definition('fixture-one','original'));
 const before=snapshotDir(dir);
 const coordinator=new SnapshotCoordinator({writerIds:['mosaics']});
 coordinator.register('mosaics',gate);
 await assert.rejects(()=>coordinator.execute(()=>{
  assert.throws(()=>store.write(definition('fixture-two','blocked')),/SNAPSHOT_WRITE_QUIESCED/);
  assert.deepEqual(snapshotDir(dir),before);
  throw new Error('FIXTURE_COPY_FAILED');
 }),/FIXTURE_COPY_FAILED/);
 assert.equal(coordinator.state,'IDLE');
 assert.equal(gate.heldEpoch,null);
 store.remove('moz:fixture-one');
 assert.equal(store.list().length,0);
});

test('Mosaic fixture coordinator with missing writer rejects capture',async t=>{
 const {root}=fixture(t);
 const gate=new LocalSnapshotWriter('mosaics');
 const store=new MosaicStore(root,{snapshotGate:gate});
 const coordinator=new SnapshotCoordinator({writerIds:['mosaics','settings']});
 coordinator.register('mosaics',gate);
 await assert.rejects(()=>coordinator.execute(()=>assert.fail('must not capture')),/SNAPSHOT_WRITER_MISSING/);
 assert.equal(coordinator.state,'IDLE');
 store.write(definition('fixture-one','unchanged'));
 assert.equal(store.list().length,1);
});
