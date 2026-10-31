'use strict';
/* Opt-in crash-safe writer freeze record on synthetic DEBUG roots only.
 * Persist PREPARE before ACK, refuse writes after a restart, release only on
 * same epoch. Does not imply other writers are covered.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {LocalSnapshotWriter}=require('./snapshot_coordinator');
class DurableSnapshotWriter extends LocalSnapshotWriter{
 constructor(writerId,root){
  super(writerId);
  if(typeof root!=='string'||!path.isAbsolute(root))throw Error('SNAPSHOT_DURABLE_ROOT_REQUIRED');
  this.file=path.join(root,'runtime','auth21-snapshot-'+writerId+'.json');
  const dir=path.dirname(this.file);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  if(fs.existsSync(this.file)){
   const st=fs.lstatSync(this.file);
   if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)
    throw Error('SNAPSHOT_DURABLE_UNSAFE_STATE');
   const value=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(!value||value.writerId!==writerId||!Number.isSafeInteger(value.lastEpoch)||
      value.lastEpoch<0||!(value.heldEpoch===null||
      (Number.isSafeInteger(value.heldEpoch)&&value.heldEpoch===value.lastEpoch)))
    throw Error('SNAPSHOT_DURABLE_INVALID_STATE');
   this.lastEpoch=value.lastEpoch;
   this.heldEpoch=value.heldEpoch;
  }else this._save();
 }
 _save(){
  const tmp=this.file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
  const raw=JSON.stringify({writerId:this.writerId,lastEpoch:this.lastEpoch,heldEpoch:this.heldEpoch});
  try{
   const fd=fs.openSync(tmp,'wx',0o600);
   try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   fs.renameSync(tmp,this.file);
   const dirFd=fs.openSync(path.dirname(this.file),'r');
   try{fs.fsyncSync(dirFd);}finally{fs.closeSync(dirFd);}
  }finally{try{fs.unlinkSync(tmp);}catch(_){}}
 }
 prepare(epoch){
  const previous=this.lastEpoch,held=this.heldEpoch;
  const ack=super.prepare(epoch);
  try{this._save();return ack;}
  catch(e){this.lastEpoch=previous;this.heldEpoch=held;throw e;}
 }
 release(epoch){
  if(this.heldEpoch===null&&this.lastEpoch===epoch)return;
  if(this.heldEpoch!==epoch)throw Error('SNAPSHOT_EPOCH_MISMATCH');
  this._saveRelease(epoch);
 }
 _saveRelease(epoch){
  const held=this.heldEpoch;
  this.heldEpoch=null;
  try{this._save();}catch(e){this.heldEpoch=held;throw e;}
 }
 abort(epoch){
  if(this.heldEpoch===epoch)return this._saveRelease(epoch);
  return super.abort(epoch);
 }
}
module.exports={DurableSnapshotWriter};
