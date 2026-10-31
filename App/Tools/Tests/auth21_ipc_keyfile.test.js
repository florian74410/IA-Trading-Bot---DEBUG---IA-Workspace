'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {MARKER,CONTENT}=require('../../Core/Backup/auth21_core_local_trial_wiring');
const {loadTrialSecret}=require('../../Core/Clients/auth21_ipc_keyfile');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);
 fs.writeFileSync(path.join(root,MARKER),CONTENT,{mode:0o600});
 const folder=path.join(root,'userdata','Security');fs.mkdirSync(folder,{recursive:true});
 const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',
  IATB_AUTH21_LOCAL_TRIAL_ROOT:root,IATB_RUNTIME_ROOT:path.join(root,'runtime'),IATB_DATA_ROOT:path.join(root,'userdata'),
  IATB_ANNEX_ROOT:path.join(root,'annexes'),IATB_UPDATES_ROOT:path.join(root,'updates'),IATB_STATE_ROOT:path.join(root,'legacy')};
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return {root,env,keyfile:path.join(folder,'auth21_ipc.key')};
}
test('IPC key must be existing 32-byte private trial file',t=>{
 const f=fixture(t);
 assert.throws(()=>loadTrialSecret({env:f.env,root:f.root}));
 fs.writeFileSync(f.keyfile,Buffer.alloc(32,12),{mode:0o600});
 assert.deepEqual(loadTrialSecret({env:f.env,root:f.root}),Buffer.alloc(32,12));
 fs.chmodSync(f.keyfile,0o644);
 assert.throws(()=>loadTrialSecret({env:f.env,root:f.root}),/AUTH21_IPC_KEY_UNSAFE/);
});
test('IPC secret loader rejects non-trial, substituted roots and symbolic key',t=>{
 const f=fixture(t);
 fs.writeFileSync(f.keyfile,Buffer.alloc(32,4),{mode:0o600});
 assert.throws(()=>loadTrialSecret({env:{...f.env,IATB_DEBUG_MODE:'0'},root:f.root}),/AUTH21_IPC_TRIAL_REQUIRED/);
 assert.throws(()=>loadTrialSecret({env:f.env,root:'/tmp'}),/AUTH21_IPC_ROOT_MISMATCH/);
 fs.unlinkSync(f.keyfile);fs.symlinkSync(path.join(f.root,MARKER),f.keyfile);
 assert.throws(()=>loadTrialSecret({env:f.env,root:f.root}),/AUTH21_IPC_KEY_UNSAFE/);
});
