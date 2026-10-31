'use strict';
/* MarketData P2.2 fixtures: no actual SQLite, providers, network, wallets or VPS. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const { SnapshotCoordinator, LocalSnapshotWriter }=require('../../Core/Backup/snapshot_coordinator');

// Import the three stores only with a stub SQLite compatibility adapter.
const adapterPath=require.resolve('../../Core/Shared/sqlite_compat');
const operations=[];
class FakeSqliteCompat {
  constructor(file) {this.file=file;this.closed=false;operations.push({kind:'open',file});}
  run(sql,read) {operations.push({kind:'sql',sql,read});return '';}
  close() {this.closed=true;operations.push({kind:'close'});}
}
require.cache[adapterPath]={id:adapterPath,filename:adapterPath,loaded:true,exports:FakeSqliteCompat};
const Registry=require('../../MarketData/Registry/market_registry');
const Telemetry=require('../../MarketData/Storage/api_telemetry_store');
const Microstructure=require('../../MarketData/Storage/microstructure_store');

const cases=[
  {id:'registry',Class:Registry,fileKey:'dbPath',writeName:'upsertAssets',writeArgs:[[{id:'fictional',symbol:'TEST',name:'Fixture'}]],methods:['init','upsertAssets','upsertDetail','get','search','list','query','status','close','run']},
  {id:'telemetry',Class:Telemetry,fileKey:'file',writeName:'save',writeArgs:[{requestId:'fixture',provider:'SIMULATED',timestamp:Date.now()}],methods:['coingeckoUsage','init','save','saveStream','prune','streamHistory','streamSummary','history','summary','purgeManual','status','close','run']},
  {id:'microstructure',Class:Microstructure,fileKey:'file',writeName:'saveSnapshot',writeArgs:[{source:'SIMULATED',symbol:'TEST',depth:1,observedAt:Date.now()}],methods:['hasLiquidation','liquidationStats','init','saveSnapshot','save','saveLiquidation','saveOpenInterest','saveDexLiquidity','prune','openInterestHistory','dexLiquidityHistory','history','liquidations','status','close','run']}
];

function environment(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-marketdata-p22-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 operations.length=0;
 return root;
}
function options(spec,root,gate){
 return { [spec.fileKey]:path.join(root,spec.id,spec.id+'.sqlite'), ...(gate?{snapshotGate:gate}:{}) };
}
for(const spec of cases){
 test(spec.id+': backward-compatible startup and SQL writes without snapshot gate',t=>{
  const root=environment(t),store=new spec.Class(options(spec,root));
  assert.equal(store.snapshotGate,null);
  assert.equal(store.ready,true);
  const result=store[spec.writeName](...spec.writeArgs);
  if(spec.id==='registry')assert.equal(result,1);
  else assert.equal(result,true);
  assert.ok(operations.some(op=>op.kind==='sql'&&/INSERT/.test(op.sql)));
  store.close();
 });
 test(spec.id+': held epoch forbids startup before opening SQLite or creating folders',t=>{
  const root=environment(t),gate=new LocalSnapshotWriter(spec.id),opt=options(spec,root,gate);
  gate.prepare(1);
  assert.throws(()=>new spec.Class(opt),/SNAPSHOT_WRITE_QUIESCED/);
  assert.deepEqual(operations,[]);
  assert.equal(fs.existsSync(path.dirname(opt[spec.fileKey])),false);
  gate.abort(1);
  const store=new spec.Class(opt);
  assert.equal(store.ready,true);
  store.close();
 });
 test(spec.id+': freeze covers every direct store entry point, including maintenance and reads',t=>{
  const root=environment(t),gate=new LocalSnapshotWriter(spec.id);
  const store=new spec.Class(options(spec,root,gate));
  const methods=Object.keys(spec.Class.prototype).filter(name=>typeof store[name]==='function');
  assert.deepEqual(methods.sort(),spec.methods.slice().sort(),'new store methods must be audited');
  const sqlBefore=operations.length;
  gate.prepare(1);
  for(const name of methods)assert.throws(()=>store[name](),/SNAPSHOT_WRITE_QUIESCED/,'unguarded '+spec.id+'.'+name);
  assert.equal(operations.length,sqlBefore,'no SQLite calls while frozen');
  gate.release(1);
  store[spec.writeName](...spec.writeArgs);
  assert.ok(operations.length>sqlBefore);
  store.close();
 });
}

test('all three MarketData fixture writers ACK and refuse writes until coordinator RELEASE',async t=>{
 const root=environment(t),c=new SnapshotCoordinator({writerIds:cases.map(x=>x.id)});
 const stores=cases.map(spec=>{
  const gate=new LocalSnapshotWriter(spec.id);
  const store=new spec.Class(options(spec,root,gate));
  c.register(spec.id,gate);
  return {spec,store,gate};
 });
 const result=await c.execute(({epoch})=>{
  assert.equal(epoch,1);
  for(const {spec,store} of stores){
   assert.throws(()=>store[spec.writeName](...spec.writeArgs),/SNAPSHOT_WRITE_QUIESCED/);
  }
  return 'fake-capture-only';
 });
 assert.equal(result,'fake-capture-only');
 assert.equal(c.state,'IDLE');
 for(const {spec,store,gate} of stores){
  assert.equal(gate.heldEpoch,null);
  store[spec.writeName](...spec.writeArgs);
  store.close();
 }
});

test('all three MarketData fixture writers recover after simulated capture ABORT',async t=>{
 const root=environment(t),c=new SnapshotCoordinator({writerIds:cases.map(x=>x.id)});
 const stores=cases.map(spec=>{
  const gate=new LocalSnapshotWriter(spec.id);
  const store=new spec.Class(options(spec,root,gate));
  c.register(spec.id,gate);
  return {spec,store,gate};
 });
 await assert.rejects(()=>c.execute(()=>{
  for(const {spec,store} of stores)assert.throws(()=>store[spec.writeName](...spec.writeArgs),/SNAPSHOT_WRITE_QUIESCED/);
  throw Error('FAKE_CAPTURE_FAILURE');
 }),/FAKE_CAPTURE_FAILURE/);
 assert.equal(c.state,'IDLE');
 for(const {spec,store,gate} of stores){
  assert.equal(gate.heldEpoch,null);
  store[spec.writeName](...spec.writeArgs);
  store.close();
 }
});

test('invalid gates fail before any MarketData persistent access',t=>{
 const root=environment(t);
 for(const spec of cases){
  const opts=options(spec,root);
  opts.snapshotGate={};
  assert.throws(()=>new spec.Class(opts),/SNAPSHOT_GATE_INVALID/);
  assert.equal(fs.existsSync(path.dirname(opts[spec.fileKey])),false);
 }
 assert.deepEqual(operations,[]);
});
