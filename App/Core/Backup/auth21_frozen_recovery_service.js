'use strict';
/* P2.2: DEBUG-only frozen Engine recovery ingress.
 * When an Engine crashes with its epoch held, DO NOT bootstrap mutable stores.
 * Bind its regular loopback port solely to the existing authenticated snapshot
 * control endpoint; on confirmed RELEASE/ABORT, exit so the normal Engine
 * can restart safely. Never install or deploy this on GEN-1.
 */
const {openEngineSnapshotTrial}=require('./auth21_engine_snapshot_trial');
const {preflightEnv}=require('./auth21_core_local_trial_wiring');
const {createServer}=require('../Clients/auth21_engine_ingress');
const PORTS=Object.freeze({
 portfolio:'IATB_PORTFOLIO_PORT',
 marketdata:'IATB_MARKET_DATA_PORT',
 fundamental:'IATB_FUNDAMENTAL_PORT',
 trading:'IATB_TRADING_ENGINE_PORT',
 indicators:'IATB_INDICATOR_PORT',
 strategy:'IATB_STRATEGY_PORT'
});
function start({env=process.env,engine=process.argv[2]}={}){
 if(!Object.hasOwn(PORTS,engine)||env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL!=='1')
  throw Error('AUTH21_FROZEN_RECOVERY_DISABLED');
 preflightEnv(env);
 const port=Number(env[PORTS[engine]]);
 if(!Number.isSafeInteger(port)||port<1024||port>65535)
  throw Error('AUTH21_FROZEN_RECOVERY_PORT_INVALID');
 const trial=openEngineSnapshotTrial({env,engine});
 if(trial.gate.heldEpoch===null)throw Error('AUTH21_RECOVERY_NO_FROZEN_EPOCH');
 const server=createServer((_req,res)=>{res.writeHead(403);res.end();},env);
 server.listen(port,'127.0.0.1');
 const timer=setInterval(()=>{
  if(trial.gate.heldEpoch!==null)return;
  clearInterval(timer);
  server.close(()=>{if(require.main===module)process.exit(0);});
 },30);
 return {server,timer,trial};
}
if(require.main===module)start();
module.exports={start};
