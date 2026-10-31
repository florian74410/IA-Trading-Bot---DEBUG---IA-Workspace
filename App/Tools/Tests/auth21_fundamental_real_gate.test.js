'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openEngineSnapshotTrial}=require('../../Core/Backup/auth21_engine_snapshot_trial');
const src=fs.readFileSync(path.resolve(__dirname,'../../Fundamental/Engine/fundamental_service.js'),'utf8');
test('actual Fundamental Engine injects gate before initializing real SQLite store',()=>{
 const gate=src.indexOf("openEngineSnapshotTrial({env:process.env,engine:'fundamental'}).gate");
 const boot=src.indexOf('bootstrapInfo=Bootstrap.ensureSync()',gate);
 const store=src.indexOf('storage=new Storage(snapshotGate?{snapshotGate:snapshotGate}:{})',boot);
 assert.ok(gate>=0&&boot>gate&&store>boot);
});
test('Fundamental snapshot gate honors prepare/abort on disposable fixture',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));fs.chmodSync(root,0o700);
 fs.writeFileSync(path.join(root,'.iatb-auth21-core-local-trial'),'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n',{mode:0o600});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_DEBUG_MODE:'1',
  IATB_DEBUG_BOOTSTRAP:'0',IATB_AUTH21_LOCAL_TRIAL_ROOT:root,IATB_RUNTIME_ROOT:path.join(root,'runtime'),
  IATB_DATA_ROOT:path.join(root,'userdata'),IATB_ANNEX_ROOT:path.join(root,'annexes'),
  IATB_UPDATES_ROOT:path.join(root,'updates'),IATB_STATE_ROOT:path.join(root,'legacy')};
 const {gate}=openEngineSnapshotTrial({env,engine:'fundamental'});
 gate.prepare(1);
 assert.throws(()=>gate.assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
 gate.abort(1);
 assert.doesNotThrow(()=>gate.assertWritable());
});
