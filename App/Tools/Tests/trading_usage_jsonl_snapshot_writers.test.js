'use strict';
/* Auth P2.2 Trading History / Usage Ledger JSONL fixtures.
 * Test files live only in temporary folders. No engines, network, wallets or
 * persistent accounts are opened. No full inter-Engine integration claim.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const TradingHistory=require('../../services/trading-engine/history-store');
const UsageLedger=require('../../Core/Services/usage_ledger_v1');
const {SnapshotCoordinator,LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');

function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-p22-jsonl-writers-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const historyPath=path.join(root,'trades','trading_history.jsonl');
 const ledgerRoot=path.join(root,'usage');
 const ledgerPath=path.join(ledgerRoot,'.runtime','accounting','usage_ledger.jsonl');
 return {root,historyPath,ledgerRoot,ledgerPath};
}
function event(n){
 return {timestamp:Date.now()+n,kind:'FICTIONAL_TRADE',id:'fake-trade-'+n};
}
function usage(n){
 return {engine:'FICTIONAL',model:'TEST_MODEL',context:'UNIT_TEST',request_id:'fake-request-'+n,
  usage:{input_tokens:n+10,output_tokens:n+1,total_tokens:n+11},estimated_cost_eur:null};
}
function lines(filename){
 if(!fs.existsSync(filename))return[];
 return fs.readFileSync(filename,'utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
}

test('Trading History default constructor supports append, filtering and restart',t=>{
 const f=fixture(t);
 const history=new TradingHistory(f.root,{file:f.historyPath});
 assert.equal(history.snapshotGate,null);
 history.append(event(1));
 history.append(event(2));
 assert.equal(lines(f.historyPath).length,2);
 assert.deepEqual(history.list({limit:1}).map(x=>x.id),['fake-trade-2']);
 assert.equal(new TradingHistory(f.root,{file:f.historyPath}).list({limit:10}).length,2);
});

test('Trading History rejects invalid gate before mkdir',t=>{
 const f=fixture(t);
 assert.throws(()=>new TradingHistory(f.root,{file:f.historyPath,snapshotGate:{}}),/SNAPSHOT_GATE_INVALID/);
 assert.equal(fs.existsSync(path.dirname(f.historyPath)),false);
});

test('Trading History held epoch blocks directory creation on startup',t=>{
 const f=fixture(t);
 const gate=new LocalSnapshotWriter('trading');
 gate.prepare(5);
 assert.throws(()=>new TradingHistory(f.root,{file:f.historyPath,snapshotGate:gate}),/SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(fs.existsSync(path.dirname(f.historyPath)),false);
 gate.abort(5);
 const history=new TradingHistory(f.root,{file:f.historyPath,snapshotGate:gate});
 history.append(event(1));
 assert.equal(lines(f.historyPath).length,1);
});

test('Trading History append is forbidden during freeze; pure history reads remain possible',t=>{
 const f=fixture(t);
 const gate=new LocalSnapshotWriter('trading');
 const history=new TradingHistory(f.root,{file:f.historyPath,snapshotGate:gate});
 history.append(event(1));
 const before=fs.readFileSync(f.historyPath,'utf8');
 gate.prepare(1);
 assert.throws(()=>history.append(event(2)),/SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(history.list().length,1);
 assert.equal(fs.readFileSync(f.historyPath,'utf8'),before);
 gate.release(1);
 history.append(event(3));
 assert.deepEqual(lines(f.historyPath).map(x=>x.id),['fake-trade-1','fake-trade-3']);
});

test('Trading History write failure is reported and does not claim success',t=>{
 const f=fixture(t);
 const history=new TradingHistory(f.root,{file:f.historyPath});
 fs.mkdirSync(f.historyPath);
 assert.throws(()=>history.append(event(1)),/EISDIR|EPERM|EACCES/);
 assert.equal(fs.readdirSync(f.historyPath).length,0);
});

test('Usage Ledger original constructor supports accounting and summary',t=>{
 const f=fixture(t);
 const ledger=new UsageLedger(f.ledgerRoot);
 assert.equal(ledger.snapshotGate,null);
 assert.equal(ledger.recordAI(usage(1)).ok,true);
 assert.equal(ledger.recordAI(usage(2)).ok,true);
 assert.equal(lines(f.ledgerPath).length,2);
 assert.equal(ledger.query({engine:'fictional'}).length,2);
 const summary=ledger.summary({engine:'FICTIONAL'});
 assert.equal(summary.records,2);
 assert.equal(summary.priced_records,0);
 assert.equal(summary.unpriced_records,2);
});

test('Usage Ledger rejects invalid gate before mkdir',t=>{
 const f=fixture(t);
 assert.throws(()=>new UsageLedger(f.ledgerRoot,{snapshotGate:{}}),/SNAPSHOT_GATE_INVALID/);
 assert.equal(fs.existsSync(f.ledgerRoot),false);
});

test('Usage Ledger held epoch blocks constructor before directory creation',t=>{
 const f=fixture(t);
 const gate=new LocalSnapshotWriter('usage');
 gate.prepare(9);
 assert.throws(()=>new UsageLedger(f.ledgerRoot,{snapshotGate:gate}),/SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(fs.existsSync(f.ledgerRoot),false);
 gate.abort(9);
 // Root is just a new temporary fixture; the Ledger creates accounting subdirectories.
 const ledger=new UsageLedger(f.ledgerRoot,{snapshotGate:gate});
 assert.equal(ledger.recordAI(usage(1)).ok,true);
});

test('Usage Ledger freeze throws before swallowed I/O handling and remains readable',t=>{
 const f=fixture(t);
 const gate=new LocalSnapshotWriter('usage');
 const ledger=new UsageLedger(f.ledgerRoot,{snapshotGate:gate});
 assert.equal(ledger.recordAI(usage(1)).ok,true);
 const before=fs.readFileSync(f.ledgerPath,'utf8');
 gate.prepare(1);
 assert.throws(()=>ledger.recordAI(usage(2)),/SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(ledger.query().length,1);
 assert.equal(ledger.summary().records,1);
 assert.equal(fs.readFileSync(f.ledgerPath,'utf8'),before);
 gate.release(1);
 assert.equal(ledger.recordAI(usage(3)).ok,true);
 assert.equal(lines(f.ledgerPath).length,2);
});

test('Usage Ledger reports disk write failure instead of accepted accounting',t=>{
 const f=fixture(t);
 const ledger=new UsageLedger(f.ledgerRoot);
 fs.mkdirSync(f.ledgerPath);
 const result=ledger.recordAI(usage(1));
 assert.equal(result.ok,false);
 assert.ok(result.error);
 assert.equal(fs.readdirSync(f.ledgerPath).length,0);
});

test('Trading and Usage fixture writers hold their files unchanged through RELEASE',async t=>{
 const f=fixture(t);
 const tradeGate=new LocalSnapshotWriter('trading');
 const usageGate=new LocalSnapshotWriter('usage');
 const history=new TradingHistory(f.root,{file:f.historyPath,snapshotGate:tradeGate});
 const ledger=new UsageLedger(f.ledgerRoot,{snapshotGate:usageGate});
 history.append(event(1)); assert.equal(ledger.recordAI(usage(1)).ok,true);
 const beforeTrade=fs.readFileSync(f.historyPath,'utf8');
 const beforeUsage=fs.readFileSync(f.ledgerPath,'utf8');
 const coordinator=new SnapshotCoordinator({writerIds:['trading','usage']});
 coordinator.register('trading',tradeGate);
 coordinator.register('usage',usageGate);
 const captured=await coordinator.execute(({epoch})=>{
  assert.equal(epoch,1);
  assert.throws(()=>history.append(event(2)),/SNAPSHOT_WRITE_QUIESCED/);
  assert.throws(()=>ledger.recordAI(usage(2)),/SNAPSHOT_WRITE_QUIESCED/);
  assert.equal(fs.readFileSync(f.historyPath,'utf8'),beforeTrade);
  assert.equal(fs.readFileSync(f.ledgerPath,'utf8'),beforeUsage);
  return 'fictional-copy';
 });
 assert.equal(captured,'fictional-copy');
 assert.equal(coordinator.state,'IDLE');
 history.append(event(3));
 assert.equal(ledger.recordAI(usage(3)).ok,true);
 assert.equal(lines(f.historyPath).length,2);
 assert.equal(lines(f.ledgerPath).length,2);
});

test('Trading and Usage fixture writers resume after ABORT, without mutation during capture',async t=>{
 const f=fixture(t);
 const tradeGate=new LocalSnapshotWriter('trading');
 const usageGate=new LocalSnapshotWriter('usage');
 const history=new TradingHistory(f.root,{file:f.historyPath,snapshotGate:tradeGate});
 const ledger=new UsageLedger(f.ledgerRoot,{snapshotGate:usageGate});
 history.append(event(1));ledger.recordAI(usage(1));
 const beforeTrade=fs.readFileSync(f.historyPath,'utf8');
 const beforeUsage=fs.readFileSync(f.ledgerPath,'utf8');
 const coordinator=new SnapshotCoordinator({writerIds:['trading','usage']});
 coordinator.register('trading',tradeGate);coordinator.register('usage',usageGate);
 await assert.rejects(()=>coordinator.execute(()=>{
  assert.throws(()=>history.append(event(2)),/SNAPSHOT_WRITE_QUIESCED/);
  assert.throws(()=>ledger.recordAI(usage(2)),/SNAPSHOT_WRITE_QUIESCED/);
  assert.equal(fs.readFileSync(f.historyPath,'utf8'),beforeTrade);
  assert.equal(fs.readFileSync(f.ledgerPath,'utf8'),beforeUsage);
  throw new Error('FICTIONAL_CAPTURE_ABORT');
 }),/FICTIONAL_CAPTURE_ABORT/);
 assert.equal(coordinator.state,'IDLE');
 assert.equal(tradeGate.heldEpoch,null);
 assert.equal(usageGate.heldEpoch,null);
 history.append(event(3));ledger.recordAI(usage(3));
 assert.equal(lines(f.historyPath).length,2);
 assert.equal(lines(f.ledgerPath).length,2);
});

test('Missing Usage writer makes Trading/Usage fixture capture fail closed',async t=>{
 const f=fixture(t);
 const history=new TradingHistory(f.root,{file:f.historyPath,snapshotGate:new LocalSnapshotWriter('trading')});
 history.append(event(1));
 const before=fs.readFileSync(f.historyPath,'utf8');
 const coord=new SnapshotCoordinator({writerIds:['trading','usage']});
 coord.register('trading',history.snapshotGate);
 await assert.rejects(()=>coord.execute(()=>assert.fail('capture must not start')),/SNAPSHOT_WRITER_MISSING/);
 assert.equal(fs.readFileSync(f.historyPath,'utf8'),before);
 assert.equal(coord.state,'IDLE');
});
