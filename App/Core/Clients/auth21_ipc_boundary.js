'use strict';
/* DEBUG-only verifier for a server-issued capability. Never enabled by HTTP headers.
 * It deliberately provides authorization only, not business dispatch.
 */
const {active}=require('./auth21_service_boundary');
const {authorizeInterprocess}=require('./auth21_rbac_guard');
function createIpcBoundary({env,codec,audience}={}){
 if(!active(env))throw Error('AUTH21_IPC_TRIAL_REQUIRED');
 if(!codec||typeof codec.verify!=='function'||typeof audience!=='string')
  throw Error('AUTH21_IPC_CONFIG_REQUIRED');
 return function verify(req,{operation,ownerClientId,method}={}){
  const proof=req&&req.headers&&req.headers['x-iatb-auth21-proof'];
  if(typeof proof!=='string')return {allowed:false,reason:'INVALID_PROOF'};
  return authorizeInterprocess({codec,proof,audience,operation,ownerClientId,method:method||req.method});
 };
}
module.exports={createIpcBoundary};
