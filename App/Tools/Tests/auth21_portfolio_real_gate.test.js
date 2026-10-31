'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openEngineSnapshotTrial}=require('../../Core/Backup/auth21_engine_snapshot_trial');
const source=fs.readFileSync(path.resolve(__dirname,'../../Portfolio/Engine/portfolio_service.js'),'utf8');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);
 fs.writeFileSync(path.join(root,'.iatb-auth21-core-local-trial'),'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n',{mode:0o600});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return {IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',
  IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',
  IATB_AUTH21_LOCAL_TRIAL_ROOT:root,
  IATB_RUNTIME_ROOT:path.join(root,'runtime'),
  IATB_DATA_ROOT:path.join(root,'userdata'),
  IATB_ANNEX_ROOT:path.join(root,'annexes'),
  IATB_UPDATES_ROOT:path.join(root,'updates'),
  IATB_STATE_ROOT:path.join(root,'legacy')};
}
test('actual Portfolio service creates store with opt-in guarded snapshot adapter',()=>{
 assert.ok(source.includes('usageLedger=new UsageLedger(ROOT,AUTH21_PORTFOLIO_SNAPSHOT?'));
 assert.ok(source.includes('store=new Store(ROOT,AUTH21_PORTFOLIO_SNAPSHOT?'));
 assert.match(source,/openEngineSnapshotTrial\(\{env:process\.env,engine:'portfolio'\}\)\.gate/);
});
test('Portfolio fixture gate freezes and releases writes',t=>{
 const env=fixture(t);
 const w=openEngineSnapshotTrial({env,engine:'portfolio'});
 assert.doesNotThrow(()=>w.gate.assertWritable());
 const ack=w.gate.prepare(1);assert.equal(ack.pending,0);
 assert.throws(()=>w.gate.assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
 w.gate.release(1);
 assert.doesNotThrow(()=>w.gate.assertWritable());
});
test('disallow outside fixture DB, invalid mode, unknown engine',t=>{
 const env=fixture(t);
 assert.throws(()=>openEngineSnapshotTrial({env:{...env,IATB_PORTFOLIO_DB:'/var/lib/portfolio.db'},engine:'portfolio'}),/OUTSIDE_FIXTURE/);
 assert.throws(()=>openEngineSnapshotTrial({env:{...env,IATB_DEBUG_MODE:'0'},engine:'portfolio'}),/UNSAFE/);
 assert.throws(()=>openEngineSnapshotTrial({env,engine:'risk'}),/DISABLED/);
});
