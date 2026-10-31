'use strict';
/* Engine-side local writer gate, DEBUG fixture sandbox ONLY.
 * This connects the real store to snapshot freeze semantics; it does not
 * imply cross-process coordination or authorize snapshot capture.
 */
const path=require('node:path');
const {preflightEnv}=require('./auth21_core_local_trial_wiring');
const {DurableSnapshotWriter}=require('./auth21_durable_snapshot_writer');
const ISSUED=new Map();
const ENGINES=new Set(['portfolio','marketdata','fundamental','trading','indicators','strategy']);
function openEngineSnapshotTrial({env=process.env,engine}={}){
 if(!ENGINES.has(engine)||env.IATB_AUTH21_CORE_AUTH_TRIAL!=='1')
  throw Error('AUTH21_ENGINE_SNAPSHOT_TRIAL_DISABLED');
 const {root}=preflightEnv(env);
 if(engine==='marketdata'){
  for(const key of ['IATB_MARKET_SETTINGS','IATB_MARKET_REGISTRY_DB','IATB_API_TELEMETRY_DB','IATB_MARKET_MICROSTRUCTURE_DB','IATB_FINANCIAL_STORE']){
   const configured=env[key];
   if(!configured)continue;
   const p=path.resolve(configured),data=path.join(root,'userdata');
   const runtime=path.join(root,'runtime');
   if((p===data||!p.startsWith(data+path.sep))&&
      !(key==='IATB_MARKET_SETTINGS'&&p.startsWith(path.join(runtime,'config')+path.sep)))
    throw Error('AUTH21_MARKETDATA_STORE_OUTSIDE_FIXTURE');
  }
 }
 if(engine==='trading'&&env.IATB_TRADING_HISTORY){
  const p=path.resolve(env.IATB_TRADING_HISTORY),data=path.join(root,'userdata');
  if(p===data||!p.startsWith(data+path.sep))throw Error('AUTH21_TRADING_HISTORY_OUTSIDE_FIXTURE');
 }
 if(engine==='portfolio'){
  const configured=env.IATB_PORTFOLIO_DB;
  if(configured){
   const p=path.resolve(configured),data=path.join(root,'userdata');
   if(p===data||!p.startsWith(data+path.sep))
    throw Error('AUTH21_PORTFOLIO_DB_OUTSIDE_FIXTURE');
  }
 }
 const key=engine+':'+root;
 if(ISSUED.has(key))return ISSUED.get(key);
 const gate=new DurableSnapshotWriter(engine,root);
 const trial=Object.freeze({engine,root,gate,
  // No remotely accessible coordinator. This module intentionally cannot
  // signal PREPARE/RELEASE without a future authenticated Core connection.
 });
 ISSUED.set(key,trial);
 return trial;
}
function currentEngineSnapshotTrial(){
 if(ISSUED.size!==1)return null;
 return [...ISSUED.values()][0];
}
module.exports={openEngineSnapshotTrial,currentEngineSnapshotTrial};
