'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openEngineSnapshotTrial}=require('../../Core/Backup/auth21_engine_snapshot_trial');
const src=fs.readFileSync(path.resolve(__dirname,'../../MarketData/market_data_service.js'),'utf8');
test('actual MarketData service passes snapshot gate to every reviewed store',()=>{
 assert.match(src,/new ApiTelemetryStore\(\{retentionDays:[^}]+snapshotGate:AUTH21_MARKETDATA_SNAPSHOT\}\)/);
 assert.match(src,/registry=new Registry\(\{snapshotGate:AUTH21_MARKETDATA_SNAPSHOT\}\)/);
 assert.match(src,/new FinancialStore\(\{snapshotGate:AUTH21_MARKETDATA_SNAPSHOT,/);
 assert.match(src,/new MicrostructureStore\(\{snapshotGate:AUTH21_MARKETDATA_SNAPSHOT,/);
});
test('MarketData fixture freezes all four writers through one gate',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);
 fs.writeFileSync(path.join(root,'.iatb-auth21-core-local-trial'),'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n',{mode:0o600});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',
  IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',IATB_AUTH21_LOCAL_TRIAL_ROOT:root,
  IATB_RUNTIME_ROOT:path.join(root,'runtime'),IATB_DATA_ROOT:path.join(root,'userdata'),
  IATB_ANNEX_ROOT:path.join(root,'annexes'),IATB_UPDATES_ROOT:path.join(root,'updates'),
  IATB_STATE_ROOT:path.join(root,'legacy')};
 const {gate}=openEngineSnapshotTrial({env,engine:'marketdata'});
 const ack=gate.prepare(1);assert.equal(ack.pending,0);
 assert.throws(()=>gate.assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
 gate.abort(1);
 assert.doesNotThrow(()=>gate.assertWritable());
 assert.throws(()=>openEngineSnapshotTrial({env:{...env,IATB_FINANCIAL_STORE:'/tmp/outside.jsonl'},engine:'marketdata'}),/OUTSIDE_FIXTURE/);
 assert.throws(()=>openEngineSnapshotTrial({env:{...env,IATB_MARKET_MICROSTRUCTURE_DB:'/tmp/outside.db'},engine:'marketdata'}),/OUTSIDE_FIXTURE/);
});
