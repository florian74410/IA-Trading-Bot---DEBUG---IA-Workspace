'use strict';
/* Fundamental P2.2 legacy migration bridge: fully mocked filesystem fixtures.
 * Never imports the real paths.js or database_core, and never manipulates data.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const {LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');
const bridgePath=require.resolve('../../Fundamental/Engine/database');
const legacyDb=path.resolve(__dirname,'../../Fundamental/Data/fundamental.db');
const targetDir='/fictional-iatb-data/Fundamental';
const targetDb=targetDir+'/fundamental.db';

function fakeBridge(t, files=[]) {
 const operations=[],present=new Set(files);
 const stubFs={
  existsSync(file){operations.push(['exists',file]);return present.has(file);},
  mkdirSync(dir){operations.push(['mkdir',dir]);present.add(dir);},
  renameSync(src,dst){operations.push(['rename',src,dst]);present.delete(src);present.add(dst);},
  copyFileSync(src,dst){operations.push(['copy',src,dst]);present.add(dst);},
  unlinkSync(src){operations.push(['unlink',src]);present.delete(src);}
 };
 class FakeCoreStorage {
  constructor(opts){operations.push(['open-core',opts&&!!opts.snapshotGate]);this.opts=opts;}
 }
 FakeCoreStorage.sha=()=> 'fake';
 delete require.cache[bridgePath];
 t.after(()=>delete require.cache[bridgePath]);
 const original=Module._load;
 Module._load=function(request,parent,isMain){
  if(parent && parent.filename===bridgePath){
   if(request==='fs')return stubFs;
   if(request==='../../Core/Shared/paths')return{PersistentData:{fundamental:targetDir,fundamentalDb:targetDb}};
   if(request==='./database_core')return FakeCoreStorage;
  }
  return original.apply(this,arguments);
 };
 let Bridge;
 try{Bridge=require(bridgePath);}finally{Module._load=original;}
 return {Bridge,operations,present};
}

test('import alone never starts a Fundamental legacy migration',t=>{
 const {Bridge,operations}=fakeBridge(t,[legacyDb]);
 assert.equal(typeof Bridge,'function');
 assert.equal(Bridge.sha(),'fake');
 assert.deepEqual(operations,[]);
});

test('quiesced gate blocks legacy migration before any filesystem access',t=>{
 const {Bridge,operations}=fakeBridge(t,[legacyDb,legacyDb+'-wal',legacyDb+'-shm']);
 const gate=new LocalSnapshotWriter('fundamental');
 gate.prepare(1);
 assert.throws(()=>new Bridge({snapshotGate:gate}),/SNAPSHOT_WRITE_QUIESCED/);
 assert.deepEqual(operations,[]);
 gate.abort(1);
 const instance=new Bridge({snapshotGate:gate});
 assert.equal(instance.opts.snapshotGate,gate);
 assert.deepEqual(operations.filter(x=>x[0]==='rename').map(x=>x[1]),[legacyDb,legacyDb+'-wal',legacyDb+'-shm']);
});

test('default startup retains the legacy migration sequence',t=>{
 const {Bridge,operations,present}=fakeBridge(t,[legacyDb,legacyDb+'-wal',legacyDb+'-shm']);
 new Bridge();
 assert.ok(operations.some(x=>x[0]==='mkdir'&&x[1]===targetDir));
 assert.deepEqual(operations.filter(x=>x[0]==='rename').map(x=>x[2]),[targetDb,targetDb+'-wal',targetDb+'-shm']);
 assert.equal(present.has(legacyDb),false);
 assert.equal(present.has(targetDb),true);
 assert.deepEqual(operations.at(-1),['open-core',false]);
});

test('existing target database is never overwritten or migrated',t=>{
 const {Bridge,operations}=fakeBridge(t,[legacyDb,targetDb]);
 new Bridge();
 assert.equal(operations.filter(x=>x[0]==='rename').length,0);
 assert.deepEqual(operations.at(-1),['open-core',false]);
});

test('invalid gate is rejected before any filesystem access',t=>{
 const {Bridge,operations}=fakeBridge(t,[legacyDb]);
 assert.throws(()=>new Bridge({snapshotGate:{}}),/SNAPSHOT_GATE_INVALID/);
 assert.deepEqual(operations,[]);
});
