'use strict';
/* Auth 2.1 P2.2: Core-LOCAL trial injection for fixture-only Core owners.
 * No HTTP endpoints, no credentials, no trading, and NEVER GEN-1.
 * Interprocess coordination is enabled only on explicit isolated DEBUG trial.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {SnapshotCoordinator,LocalSnapshotWriter}=require('./snapshot_coordinator');
const {DurableSnapshotWriter}=require('./auth21_durable_snapshot_writer');
const MARKER='.iatb-auth21-core-local-trial';
const CONTENT='IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n';
const IDS=Object.freeze(['clients','settings','mosaics','annex-root']);
function forbid(){throw Error('AUTH21_CORE_LOCAL_TRIAL_UNSAFE');}
function within(root,dest){
 if(dest!==root && !dest.startsWith(root+path.sep))forbid();
 let part=root;
 const relative=path.relative(root,dest);
 for(const p of relative.split(path.sep).filter(Boolean)){
  part=path.join(part,p);
  if(fs.existsSync(part)&&fs.lstatSync(part).isSymbolicLink())forbid();
 }
}
function preflightEnv(env){
 if(!env||env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL!=='1'||env.IATB_DEBUG_MODE!=='1'||
    env.IATB_DEBUG_BOOTSTRAP==='1')forbid();
 const rootName=env.IATB_AUTH21_LOCAL_TRIAL_ROOT;
 if(!rootName||!path.isAbsolute(rootName))forbid();
 const root=path.resolve(rootName);
 const temp=fs.realpathSync(os.tmpdir());
 if(!root.startsWith(temp+path.sep)||!path.basename(root).startsWith('iatb-auth21-core-runtime-')||
    !fs.existsSync(root)||fs.realpathSync(root)!==root)forbid();
 const stat=fs.lstatSync(root);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o700||
    (process.getuid&&stat.uid!==process.getuid()))forbid();
 const marker=path.join(root,MARKER);
 const m=fs.lstatSync(marker);
 if(!m.isFile()||m.isSymbolicLink()||(m.mode&0o777)!==0o600||
    fs.readFileSync(marker,'utf8')!==CONTENT)forbid();
 for(const [key,sub] of [
  ['IATB_RUNTIME_ROOT','runtime'],['IATB_DATA_ROOT','userdata'],
  ['IATB_ANNEX_ROOT','annexes'],['IATB_UPDATES_ROOT','updates'],
  ['IATB_STATE_ROOT','legacy']
 ]){
  if(env[key]!==path.join(root,sub))forbid();
  within(root,env[key]);
 }
 if(env.IATB_USER_DB!==undefined){
  const userDb=path.resolve(env.IATB_USER_DB);
  within(root,userDb);
  if(!userDb.startsWith(path.join(root,'userdata')+path.sep))forbid();
 }
 return Object.freeze({root});
}
/** Must be instantiated only after preflightEnv has accepted the environment.
 * Existing constructors receive these exact gates; default startup unchanged.
 */
function createTrial(env){
 const validated=preflightEnv(env);
 const remoteEnabled=env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1';
 const remotes=remoteEnabled?['portfolio','marketdata','fundamental','trading','indicators','strategy']:[];
 const coordinator=new SnapshotCoordinator({writerIds:[...IDS,...remotes],timeoutMs:3000});
 const gates=Object.create(null);
 for(const id of IDS){
  const gate=remoteEnabled?new DurableSnapshotWriter(id,validated.root):new LocalSnapshotWriter(id);
  gates[id]=gate;
  coordinator.register(id,{
   prepare:epoch=>gate.prepare(epoch),
   release:epoch=>gate.release(epoch),
   abort:epoch=>gate.abort(epoch)
  });
 }
 if(remoteEnabled){
  const portKeys={portfolio:'IATB_PORTFOLIO_PORT',marketdata:'IATB_MARKET_DATA_PORT',
   fundamental:'IATB_FUNDAMENTAL_PORT',trading:'IATB_TRADING_ENGINE_PORT',
   indicators:'IATB_INDICATOR_PORT',strategy:'IATB_STRATEGY_PORT'};
  const client=require('./auth21_snapshot_core_client').createSnapshotCoreClient({env,root:validated.root});
  for(const id of remotes){
   const raw=env[portKeys[id]],port=Number(raw);
   if(!raw||!/^[0-9]{4,5}$/.test(raw)||!Number.isSafeInteger(port)||port<1024||port>65535)
    throw Error('AUTH21_REMOTE_WRITER_PORT_REQUIRED:'+id);
   coordinator.register(id,client.participant(id,port));
  }
 }
 if(remoteEnabled){
  // Core must never reuse an epoch after a restart. Reconstruct from the
  // durable acknowledgements of all local/remote writers, then require
  // explicit ABORT of every held generation before another snapshot.
  let maxEpoch=0;
  const held=[];
  for(const id of coordinator.writerIds){
   const file=path.join(validated.root,'runtime','auth21-snapshot-'+id+'.json');
   if(!fs.existsSync(file))continue;
   const stat=fs.lstatSync(file);
   if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
    throw Error('AUTH21_CORE_SNAPSHOT_JOURNAL_UNSAFE');
   let value;
   try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){
    throw Error('AUTH21_CORE_SNAPSHOT_JOURNAL_CORRUPT');
   }
   if(!value||value.writerId!==id||!Number.isSafeInteger(value.lastEpoch)||
      value.lastEpoch<0||!(value.heldEpoch===null||
       (Number.isSafeInteger(value.heldEpoch)&&value.heldEpoch===value.lastEpoch)))
    throw Error('AUTH21_CORE_SNAPSHOT_JOURNAL_CORRUPT');
   maxEpoch=Math.max(maxEpoch,value.lastEpoch);
   if(value.heldEpoch!==null)held.push({id,epoch:value.heldEpoch});
  }
  coordinator.epoch=maxEpoch;
  if(held.length){
   const epochs=new Set(held.map(x=>x.epoch));
   if(epochs.size!==1)throw Error('AUTH21_CORE_SNAPSHOT_INCONSISTENT_EPOCHS');
   coordinator.pendingCleanup={epoch:held[0].epoch,failedIds:held.map(x=>x.id),abort:true};
   coordinator.state='BLOCKED';
  }
 }
 return Object.freeze({
  root:validated.root,coordinator,gates:Object.freeze(gates),
  gateFor(id){
   if(!Object.hasOwn(gates,id))throw Error('AUTH21_CORE_LOCAL_UNKNOWN_WRITER');
   return gates[id];
  }
 });
}
module.exports={preflightEnv,createTrial,IDS,MARKER,CONTENT};
