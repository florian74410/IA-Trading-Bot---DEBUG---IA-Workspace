'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createTrial,MARKER,CONTENT}=require('../../Core/Backup/auth21_core_local_trial_wiring');
test('Core restart reloads held local epoch, blocks new capture, and resumes explicitly',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);fs.writeFileSync(path.join(root,MARKER),CONTENT,{mode:0o600});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sec=path.join(root,'userdata','Security');fs.mkdirSync(sec,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(sec,'auth21_ipc.key'),crypto.randomBytes(32),{mode:0o600});
 const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_AUTH21_SNAPSHOT_IPC_TRIAL:'1',
  IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',IATB_AUTH21_LOCAL_TRIAL_ROOT:root,
  IATB_RUNTIME_ROOT:path.join(root,'runtime'),IATB_DATA_ROOT:path.join(root,'userdata'),
  IATB_ANNEX_ROOT:path.join(root,'annexes'),IATB_UPDATES_ROOT:path.join(root,'updates'),
  IATB_STATE_ROOT:path.join(root,'legacy'),IATB_PORTFOLIO_PORT:'41001',
  IATB_MARKET_DATA_PORT:'41002',IATB_FUNDAMENTAL_PORT:'41003',
  IATB_TRADING_ENGINE_PORT:'41004',IATB_INDICATOR_PORT:'41005',IATB_STRATEGY_PORT:'41006'};
 const initial=createTrial(env);
 assert.equal(initial.coordinator.state,'IDLE');
 initial.gateFor('clients').prepare(4);
 const resumed=createTrial(env);
 assert.equal(resumed.coordinator.state,'BLOCKED');
 assert.equal(resumed.coordinator.epoch,4);
 assert.deepEqual(resumed.coordinator.pendingCleanup.failedIds,['clients']);
 await assert.rejects(resumed.coordinator.execute(()=>{}),/SNAPSHOT_COORDINATOR_BUSY/);
 assert.throws(()=>resumed.gateFor('clients').assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
 await resumed.coordinator.recoverBlocked();
 assert.equal(resumed.coordinator.state,'IDLE');
 resumed.gateFor('clients').prepare(5);
 resumed.gateFor('clients').release(5);
 const third=createTrial(env);
 assert.equal(third.coordinator.epoch,5);
 assert.equal(third.coordinator.state,'IDLE');
 assert.doesNotThrow(()=>third.gateFor('clients').assertWritable());
});
