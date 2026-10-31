'use strict';
/* Actual Router HTTP ingress adapter for a signed, Router-scoped read.
 * Explicit DEBUG isolation and secret preflight. No business dispatch.
 */
const {loadTrialSecret}=require('./auth21_ipc_keyfile');
const {proofCodec}=require('./auth21_ipc_proof');
const {createEngineGuard}=require('./auth21_engine_guard');
function createRouterRead({env,root}={}){
 if(!env||env.IATB_AUTH21_IPC_PROBE_TRIAL!=='1')throw Error('AUTH21_ROUTER_READ_DISABLED');
 const codec=proofCodec({secret:loadTrialSecret({env,root})});
 const guard=createEngineGuard({env,codec,engine:'router'});
 return (req,res)=>{
  const decision=guard({proof:req.headers['x-iatb-auth21-proof'],action:'router.read',method:req.method});
  res.writeHead(decision.allowed?200:403,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(decision.allowed?{ok:true,router:true,mode:'AUTH21_READ_ONLY'}:{error:'FORBIDDEN'}));
 };
}
module.exports={createRouterRead};
