'use strict';
/* Fundamental P2.2 fixtures: no SQLite files, wallet, GEN-1 or real secrets. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const Module=require('node:module');
const {SnapshotCoordinator,LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');

const modulePath=require.resolve('../../Fundamental/Engine/database_core');
let currentFixture=null;
let sqliteOpens=0;
class FakeDb {
  constructor(file){sqliteOpens++;this.file=file;this.calls=[];this.closed=false;}
  pragma(sql){
    this.calls.push('pragma:'+sql);
    if(String(sql).startsWith('table_info('))return [];
    if(sql==='quick_check')return 'ok';
    return [];
  }
  exec(sql){this.calls.push('exec:'+String(sql).slice(0,35));}
  prepare(sql){
    this.calls.push('prepare:'+String(sql).slice(0,35));
    const self=this;
    return {
      run(){self.calls.push('run');return{changes:1,lastInsertRowid:3};},
      get(){self.calls.push('get');return null;},
      all(){self.calls.push('all');return[];}
    };
  }
  transaction(action){
    this.calls.push('transaction');
    return function(...args){return action(...args);};
  }
  close(){this.calls.push('close');this.closed=true;}
}
function withMockedModuleLoad(callback) {
  const old=Module._load;
  Module._load=function(request,parent,isMain){
    if(parent && parent.filename===modulePath){
      if(request==='../../Core/Shared/paths')return{
        PersistentData:{
          fundamental:currentFixture.dataDir,
          fundamentalDb:path.join(currentFixture.dataDir,'fundamental.db')
        }
      };
      if(request==='better-sqlite3')return FakeDb;
    }
    return old.apply(this,arguments);
  };
  try{return callback();}finally{Module._load=old;}
}
function environment(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-fundamental-p22-'));
  const dataDir=path.join(root,'persistent','Fundamental');
  t.after(()=>{delete require.cache[modulePath];fs.rmSync(root,{recursive:true,force:true});});
  currentFixture={root,dataDir};
  delete require.cache[modulePath];
  sqliteOpens=0;
  const Storage=withMockedModuleLoad(()=>require(modulePath));
  return {root,dataDir,Storage};
}

test('Fundamental without gate retains existing storage initialization',t=>{
  const {dataDir,Storage}=environment(t);
  assert.equal(fs.existsSync(dataDir),false);
  const store=new Storage();
  assert.equal(sqliteOpens,1);
  assert.ok(fs.existsSync(dataDir));
  assert.equal(store.snapshotGate,null);
  assert.ok(store.db.calls.some(x=>x.startsWith('exec:')));
  store.close();
  assert.equal(store.db.closed,true);
});

test('Invalid guard fails before directory or SQLite creation',t=>{
  const {dataDir,Storage}=environment(t);
  assert.throws(()=>new Storage({snapshotGate:{}}),/SNAPSHOT_GATE_INVALID/);
  assert.equal(fs.existsSync(dataDir),false);
  assert.equal(sqliteOpens,0);
});

test('Frozen Fundamental guard prevents bootstrap migrations and all filesystem writes',t=>{
  const {dataDir,Storage}=environment(t);
  const gate=new LocalSnapshotWriter('fundamental');
  gate.prepare(7);
  assert.throws(()=>new Storage({snapshotGate:gate}),/SNAPSHOT_WRITE_QUIESCED/);
  assert.equal(sqliteOpens,0);
  assert.equal(fs.existsSync(dataDir),false);
  gate.abort(7);
  const store=new Storage({snapshotGate:gate});
  assert.equal(sqliteOpens,1);
  store.close();
});

test('Every Fundamental Storage method rejects calls while quiesced',t=>{
  const {Storage}=environment(t);
  const gate=new LocalSnapshotWriter('fundamental');
  const store=new Storage({snapshotGate:gate});
  const methods=Object.keys(Storage.prototype).filter(x=>typeof store[x]==='function').sort();
  // If new public storage methods appear, include them automatically.
  assert.ok(methods.length>=54, 'all current storage methods must be checked');
  const before=store.db.calls.length;
  gate.prepare(1);
  for(const name of methods){
    assert.throws(()=>store[name](),/SNAPSHOT_WRITE_QUIESCED/,'unguarded storage method '+name);
  }
  assert.equal(store.db.calls.length,before,'no SQL access should be started');
  assert.equal(store.db.closed,false);
  gate.release(1);
  store.health();
  assert.ok(store.db.calls.length>before);
  store.close();
});

test('Fundamental gate integrates with coordinator only on isolated fixtures',async t=>{
  const {Storage}=environment(t);
  const gate=new LocalSnapshotWriter('fundamental');
  const store=new Storage({snapshotGate:gate});
  const coord=new SnapshotCoordinator({writerIds:['fundamental']});
  coord.register('fundamental',gate);
  assert.equal(await coord.execute(({epoch})=>{
    assert.equal(epoch,1);
    assert.throws(()=>store.getSetting('engine_mode'),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>store.insertItems(),/SNAPSHOT_WRITE_QUIESCED/);
    return 'fake-snapshot';
  }),'fake-snapshot');
  assert.equal(coord.state,'IDLE');
  store.getSetting('engine_mode');
  store.close();
});

test('Fundamental gate ABORT resumes work after capture error',async t=>{
  const {Storage}=environment(t);
  const gate=new LocalSnapshotWriter('fundamental');
  const store=new Storage({snapshotGate:gate});
  const coord=new SnapshotCoordinator({writerIds:['fundamental']});
  coord.register('fundamental',gate);
  await assert.rejects(()=>coord.execute(()=>{
    assert.throws(()=>store.saveSynthesis(),/SNAPSHOT_WRITE_QUIESCED/);
    throw Error('FAKE_DISK_FULL');
  }),/FAKE_DISK_FULL/);
  assert.equal(gate.heldEpoch,null);
  assert.equal(coord.state,'IDLE');
  store.health();
  store.close();
});
