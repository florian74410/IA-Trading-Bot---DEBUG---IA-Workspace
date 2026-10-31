'use strict';
/* Portfolio P2.2: isolated unit fixtures. No wallet, live Engine or DB is opened. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const PortfolioStore=require('../../Portfolio/Engine/portfolio_store');
const {SnapshotCoordinator,LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');

class FixtureDatabase {
  constructor(file){this.file=file;this.calls=[];this.closed=false;}
  pragma(sql){this.calls.push('pragma:'+sql);}
  exec(sql){this.calls.push('exec:'+sql);}
  prepare(sql){
    this.calls.push('prepare:'+sql);
    const self=this;
    return {
      run(...args){self.calls.push('run:'+sql);return {changes:1,lastInsertRowid:17};},
      all(){self.calls.push('all:'+sql);
        if(sql.includes('SELECT id,timestamp FROM snapshots WHERE timestamp<')){
          return [{id:1,timestamp:10},{id:2,timestamp:20}];
        }
        return [];},
      get(){self.calls.push('get:'+sql);return null;}
    };
  }
  transaction(fn){this.calls.push('transaction');return (...args)=>fn(...args);}
  close(){this.calls.push('close');this.closed=true;}
}
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-p22-portfolio-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return {root,dbPath:path.join(root,'portfolio','portfolio.db')};
}
function openFixture(root,dbPath,gate){
  // The production store uses better-sqlite3 normally. Only this test replaces
  // the module loader synchronously around the fixture constructor.
  const original=Module._load;
  Module._load=function(name,parent,isMain){
    if(name==='better-sqlite3' && parent && parent.filename.endsWith('portfolio_store.js'))return FixtureDatabase;
    return original.apply(this,arguments);
  };
  try{return new PortfolioStore(root,{dbPath,snapshotGate:gate});}
  finally{Module._load=original;}
}

test('Portfolio without a gate retains legacy constructor and write behavior',t=>{
  const {root,dbPath}=fixture(t);
  const store=openFixture(root,dbPath);
  assert.equal(store.snapshotGate,null);
  store.recordEvent({event_id:'fictional-event',dedup_key:'fictional-key'});
  store.upsertBalance({venue:'TEST',asset:'FOO',amount:1});
  assert.equal(store.addSnapshot({timestamp:1,state_json:'{}'}),17);
  assert.equal(store.setSetting('test',{ok:true}).ok,true);
  assert.equal(store.compactSnapshots(10*86400000),1);
  assert.ok(store.db.calls.some(x=>x.startsWith('run:DELETE FROM snapshots')));
  store.close();
  assert.equal(store.db.closed,true);
});

test('Portfolio validates gate before mkdir or DB access',t=>{
  const {root,dbPath}=fixture(t);
  assert.throws(()=>new PortfolioStore(root,{dbPath,snapshotGate:{}}),/SNAPSHOT_GATE_INVALID/);
  assert.equal(fs.existsSync(path.dirname(dbPath)),false);
});

test('Portfolio startup refuses to create directories when the gate is held',t=>{
  const {root,dbPath}=fixture(t);
  const gate=new LocalSnapshotWriter('portfolio');
  gate.prepare(11);
  assert.throws(()=>new PortfolioStore(root,{dbPath,snapshotGate:gate}),/SNAPSHOT_WRITE_QUIESCED/);
  assert.equal(fs.existsSync(path.dirname(dbPath)),false);
  gate.abort(11);
  const store=openFixture(root,dbPath,gate);
  assert.equal(store.status().ready,true);
  store.close();
});

test('Portfolio rejects every database-facing method during snapshot',t=>{
  const {root,dbPath}=fixture(t);
  const gate=new LocalSnapshotWriter('portfolio');
  const store=openFixture(root,dbPath,gate);
  gate.prepare(1);
  const methods=[
    ()=>store.init(),
    ()=>store.recordEvent({event_id:'fake'}),
    ()=>store.events(10,0),
    ()=>store.allEvents(),
    ()=>store.upsertBalance({asset:'FOO'}),
    ()=>store.balances(),
    ()=>store.addSnapshot({timestamp:1}),
    ()=>store.latestSnapshot(),
    ()=>store.snapshots(0,10),
    ()=>store.compactSnapshots(10*86400000),
    ()=>store.upsertClosedTrade({trade_id:'fake'}),
    ()=>store.closedTrades(10),
    ()=>store.closedTrade('fake'),
    ()=>store.getSetting('fake','default'),
    ()=>store.setSetting('fake',true),
    ()=>store.close()
  ];
  const before=store.db.calls.length;
  for(const operation of methods)assert.throws(operation,/SNAPSHOT_WRITE_QUIESCED/);
  assert.equal(store.db.calls.length,before,'frozen methods must not even prepare SQL');
  assert.equal(store.db.closed,false);
  gate.release(1);
  store.recordEvent({event_id:'after-release'});
  store.close();
  assert.equal(store.db.closed,true);
});

test('Portfolio resumes after ABORT on a failed isolated capture',async t=>{
  const {root,dbPath}=fixture(t);
  const gate=new LocalSnapshotWriter('portfolio');
  const store=openFixture(root,dbPath,gate);
  const coordinator=new SnapshotCoordinator({writerIds:['portfolio']});
  coordinator.register('portfolio',gate);
  await assert.rejects(()=>coordinator.execute(()=>{
    assert.throws(()=>store.recordEvent({event_id:'while-frozen'}),/SNAPSHOT_WRITE_QUIESCED/);
    throw new Error('FAKE_CAPTURE_FAILURE');
  }),/FAKE_CAPTURE_FAILURE/);
  assert.equal(coordinator.state,'IDLE');
  store.recordEvent({event_id:'post-abort'});
  assert.equal(gate.heldEpoch,null);
  store.close();
});

test('Portfolio opt-in keeps repeated generations isolated',async t=>{
  const {root,dbPath}=fixture(t);
  const gate=new LocalSnapshotWriter('portfolio');
  const store=openFixture(root,dbPath,gate);
  const coordinator=new SnapshotCoordinator({writerIds:['portfolio']});
  coordinator.register('portfolio',gate);
  for(let i=1;i<=2;i++){
    await coordinator.execute(({epoch})=>{
      assert.equal(epoch,i);
      assert.throws(()=>store.compactSnapshots(),/SNAPSHOT_WRITE_QUIESCED/);
      return 'fixture-'+epoch;
    });
    store.upsertBalance({asset:'TEST',amount:i});
  }
  assert.equal(coordinator.state,'IDLE');
  store.close();
});
