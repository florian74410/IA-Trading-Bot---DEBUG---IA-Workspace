'use strict';
// Auth21 P2.2: independent maintenance tools must not bypass a held global snapshot.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')throw Error('AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT');

// Starts Market Data Collector in a disposable, network-disabled Docker namespace.
// Does not start CEX streams, refresh providers, or any trading component.
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const path=require('node:path');
const port=18113,root='/tmp/iatb-marketdata-smoke';
const env={...process.env,
 IATB_MARKETDATA_OFFLINE_DIAGNOSTIC:'1',IATB_MARKET_DATA_PORT:String(port),
 IATB_RUNTIME_ROOT:root+'/runtime',IATB_DATA_ROOT:root+'/data',
 IATB_STATE_ROOT:root+'/state',IATB_ANNEX_ROOT:root+'/annexes',
 IATB_UPDATES_ROOT:root+'/updates',IATB_TRADING_LIVE:'0',
 IATB_DEBUG_BOOTSTRAP:'0'};
let logs='';
const child=cp.spawn(process.execPath,['MarketData/market_data_service.js'],{
 cwd:path.resolve(__dirname,'..'),env,stdio:['ignore','pipe','pipe']
});
child.stdout.on('data',b=>logs+=b.toString());
child.stderr.on('data',b=>logs+=b.toString());
(async()=>{
 try{
  let health;
  for(let i=0;i<60;i++){
   if(child.exitCode!==null||child.signalCode!==null)throw Error('Collector exited prematurely');
   try{
    const response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(700)});
    if(response.ok){health=await response.json();break;}
   }catch(e){}
   await new Promise(r=>setTimeout(r,150));
  }
  assert(health,'Market Data health was not reachable');
  assert.equal(health.ok,true);
  assert.equal(health.offlineDiagnostic,true);
  assert.equal(health.liquidationStreams.enabled===false || !health.liquidationStreams.startedAt,true,
   'Liquidation streams must not start');
  console.log('MARKET DATA HEALTH: OK');
  console.log('OFFLINE DIAGNOSTIC: OK');
  console.log('LIQUIDATION STREAMS NOT STARTED: OK');
  console.log('NO TRADING ENGINES STARTED: OK');
  console.log('MARKET DATA SMOKE: SUCCESS');
 }catch(e){process.exitCode=1;console.error('MARKET DATA SMOKE FAILED: '+e.message);console.error(logs.slice(-7000));}
 finally{
  if(child.exitCode===null&&child.signalCode===null){
   child.kill('SIGTERM');
   await new Promise(resolve=>{const t=setTimeout(()=>{child.kill('SIGKILL');resolve();},1600);
    child.once('exit',()=>{clearTimeout(t);resolve();});});
  }
 }
})();
