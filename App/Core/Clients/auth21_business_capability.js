'use strict';
/* Auth21 offline business capability contract. NO route dispatch and NO LIVE trading.
 * Core issues proofs only after a verified session; the receiving engine independently verifies.
 * Unsupported actions fail closed. This module does not mount HTTP endpoints.
 */
const {issueAuthorizedProof,authorizeInterprocess}=require('./auth21_rbac_guard');
const ACTIONS=Object.freeze({
 'marketdata.metadata.get':Object.freeze({audience:'marketdata',permission:'shared.read',method:'GET'}),
 'indicator.settings.set':Object.freeze({audience:'indicator',permission:'admin.write'}),
 'marketdata.settings.set':Object.freeze({audience:'marketdata',permission:'admin.write'}),
 'fundamental.feed.create':Object.freeze({audience:'fundamental',permission:'admin.write'}),
 'portfolio.preference.set':Object.freeze({audience:'portfolio',permission:'self.write'}),
 'strategy.preference.set':Object.freeze({audience:'strategy',permission:'self.write'})
});
function contract(action){
 if(typeof action!=='string'||!Object.hasOwn(ACTIONS,action))return null;
 return ACTIONS[action];
}
function issue({sessions,token,codec,action,ownerClientId,bodyDigest}={}){
 const spec=contract(action);
 if(!spec)return null;
 if(spec.permission==='self.write'&&!ownerClientId)return null;
 return issueAuthorizedProof({sessions,token,codec,audience:spec.audience,
  operation:spec.permission,method:spec.method||'POST',ownerClientId:spec.permission==='self.write'?ownerClientId:null,action,bodyDigest});
}
function verify({codec,proof,action,ownerClientId,bodyDigest}={}){
 const spec=contract(action);
 if(!spec)return {allowed:false,reason:'UNKNOWN_ACTION'};
 if(spec.permission==='self.write'&&!ownerClientId)return {allowed:false,reason:'OWNER_REQUIRED'};
 return authorizeInterprocess({codec,proof,audience:spec.audience,
  operation:spec.permission,method:spec.method||'POST',ownerClientId:spec.permission==='self.write'?ownerClientId:null,action,bodyDigest});
}
module.exports={contract,issue,verify};
