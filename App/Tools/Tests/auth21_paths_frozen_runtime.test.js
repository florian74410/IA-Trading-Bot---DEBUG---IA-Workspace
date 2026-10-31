'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {DurableSnapshotWriter}=require('../../Core/Backup/auth21_durable_snapshot_writer');
test('Shared paths imports cannot initialize or migrate storage when any Engine holds a durable epoch',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const gate=new DurableSnapshotWriter('marketdata',root);gate.prepare(3);
 const env={...process.env,IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',
  IATB_AUTH21_SNAPSHOT_IPC_TRIAL:'1',IATB_AUTH21_LOCAL_TRIAL_ROOT:root,
  IATB_RUNTIME_ROOT:path.join(root,'runtime'),IATB_DATA_ROOT:path.join(root,'userdata'),
  IATB_ANNEX_ROOT:path.join(root,'annexes'),IATB_UPDATES_ROOT:path.join(root,'updates'),
  IATB_STATE_ROOT:path.join(root,'legacy')};
 const file=require.resolve('../../Core/Shared/paths');
 const code='const p=require('+JSON.stringify(file)+');try{p.ensureAppRuntimeDirs();process.exit(5)}catch(e){if(e.message!==\'AUTH21_FROZEN_STARTUP_READ_ONLY\')throw e}';
 const run=spawnSync(process.execPath,['-e',code],{env,encoding:'utf8',timeout:5000});
 assert.equal(run.status,0,run.stderr||run.stdout);
 for(const name of ['logs','config','database','state','updates']){
  assert.equal(fs.existsSync(path.join(root,'runtime',name)),false,'eager writes under '+name);
 }
 assert.throws(()=>new DurableSnapshotWriter('marketdata',root).assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
});
