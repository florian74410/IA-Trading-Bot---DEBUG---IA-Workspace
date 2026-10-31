'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {once}=require('node:events');
const wiring=require('../../Core/Backup/auth21_core_local_trial_wiring');
const lock=require('../../Core/Clients/auth21_local_owner_lock');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);fs.writeFileSync(path.join(root,wiring.MARKER),wiring.CONTENT,{mode:0o600});
 const env={...process.env,IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_AUTH21_LOCAL_TRIAL_ROOT:root};
 for(const [k,p] of [['IATB_RUNTIME_ROOT','runtime'],['IATB_DATA_ROOT','userdata'],['IATB_ANNEX_ROOT','annexes'],['IATB_UPDATES_ROOT','updates'],['IATB_STATE_ROOT','legacy']]){
  env[k]=path.join(root,p);fs.mkdirSync(env[k],{mode:0o700});
 }
 delete env.IATB_USER_DB;
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,env};
}
const modulePath=require.resolve('../../Core/Clients/auth21_local_owner_lock');
test('Core and CLI leases exclude other processes and release without deleting the inode',t=>{
 const {root,env}=fixture(t),lease=lock.acquire(env);t.after(()=>lease.close());
 const inode=fs.statSync(path.join(root,'.auth21-core-owner.lock')).ino;
 const attempt=()=>spawnSync(process.execPath,['-e',`const l=require(${JSON.stringify(modulePath)}).acquire(process.env);l.close()`],{env,encoding:'utf8'});
 assert.notEqual(attempt().status,0);lease.close();assert.equal(attempt().status,0);
 assert.equal(fs.statSync(path.join(root,'.auth21-core-owner.lock')).ino,inode);
});
test('SIGKILL automatically releases the Core lease',async t=>{
 const {env}=fixture(t);
 const child=spawn(process.execPath,['-e',`require(${JSON.stringify(modulePath)}).acquire(process.env);process.send('ready');setInterval(()=>{},1000)`],{env,stdio:['ignore','ignore','pipe','ipc']});
 t.after(()=>child.kill('SIGKILL'));
 await once(child,'message');assert.throws(()=>lock.acquire(env),/AUTH21_CORE_OR_CLI_BUSY/);
 const done=once(child,'exit');child.kill('SIGKILL');await done;
 const lease=lock.acquire(env);lease.close();
});
test('offline administration refuses frozen, corrupt and symlink snapshot records',t=>{
 const {root}=fixture(t),file=path.join(root,'runtime','auth21-snapshot-clients.json');
 lock.assertOfflineWritable(root);
 fs.writeFileSync(file,JSON.stringify({writerId:'clients',lastEpoch:2,heldEpoch:2}),{mode:0o600});
 assert.throws(()=>lock.assertOfflineWritable(root),/RECOVERY_REQUIRED/);
 fs.writeFileSync(file,JSON.stringify({writerId:'clients',lastEpoch:2,heldEpoch:null}));
 lock.assertOfflineWritable(root);
 fs.writeFileSync(file,'broken');assert.throws(()=>lock.assertOfflineWritable(root),/STATE_UNSAFE/);
 fs.unlinkSync(file);fs.symlinkSync(path.join(root,wiring.MARKER),file);
 assert.throws(()=>lock.assertOfflineWritable(root),/STATE_UNSAFE/);
});
