'use strict';
// Linux kernel lease shared by Core and offline administration. The descriptor
// stays open in its owner, so exit/SIGKILL releases it without stale PID files.
// Never unlink the lock inode: every competing process must lock the same file.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
function acquire(env){
 const {root}=require('../Backup/auth21_core_local_trial_wiring').preflightEnv(env);
 if(process.platform!=='linux')throw Error('AUTH21_LOCAL_LOCK_UNSUPPORTED');
 const file=path.join(root,'.auth21-core-owner.lock');
 const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_RDWR|fs.constants.O_NOFOLLOW,0o600);
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||(st.mode&0o777)!==0o600||st.uid!==process.getuid())
   throw Error('AUTH21_LOCAL_LOCK_UNSAFE');
  // Fixed system executable; no shell, caller-supplied paths or credentials.
  try{execFileSync('/usr/bin/flock',['-n','3'],{stdio:['ignore','ignore','pipe',fd]});}
  catch(_){throw Error('AUTH21_CORE_OR_CLI_BUSY');}
 }catch(e){fs.closeSync(fd);throw e;}
 let closed=false;
 return {close(){if(!closed){closed=true;fs.closeSync(fd);}}};
}
function assertOfflineWritable(root){
 const runtime=path.join(root,'runtime');
 // A pending snapshot must be recovered by the coordinator, never the CLI.
 for(const name of fs.readdirSync(runtime)){
  if(!/^auth21-snapshot-.*\.json$/.test(name))continue;
  const file=path.join(runtime,name),st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.uid!==process.getuid())
   throw Error('AUTH21_SNAPSHOT_STATE_UNSAFE');
  let record;
  try{record=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){throw Error('AUTH21_SNAPSHOT_STATE_UNSAFE');}
  if(!record||record.heldEpoch!==null||!Number.isSafeInteger(record.lastEpoch)||record.lastEpoch<0)
   throw Error('AUTH21_SNAPSHOT_RECOVERY_REQUIRED');
 }
}
module.exports={acquire,assertOfflineWritable};
