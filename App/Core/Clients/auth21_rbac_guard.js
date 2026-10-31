'use strict';
/* Auth21 fail-closed server-side policy for future Gateway/Router/Engine adapters.
 * Never authorizes Wallet or Trading LIVE, and never trusts client IDs in input.
 * Call only after bearer/cookie has been verified by server-side session store.
 */
const PERMISSIONS=Object.freeze({
 'self.read':Object.freeze(['ADMIN','USER']),
 'self.write':Object.freeze(['ADMIN','USER']),
 'shared.read':Object.freeze(['ADMIN','USER','GUEST']),
 'admin.read':Object.freeze(['ADMIN']),
 'admin.write':Object.freeze(['ADMIN'])
});
function authorize({sessions,token,operation,ownerClientId,method}={}){
 if(!sessions||typeof sessions.verifySession!=='function')throw Error('AUTH21_RBAC_STORE_REQUIRED');
 if(typeof operation!=='string'||!Object.hasOwn(PERMISSIONS,operation))return {allowed:false,reason:'UNKNOWN_OPERATION'};
 const principal=sessions.verifySession(token);
 if(!principal||!['ADMIN','USER','GUEST'].includes(principal.role))return {allowed:false,reason:'UNAUTHENTICATED'};
 if(!PERMISSIONS[operation].includes(principal.role))return {allowed:false,reason:'FORBIDDEN'};
 if(operation.startsWith('self.')){
  if(typeof ownerClientId!=='string'||!/^CL[A-Za-z0-9_-]{1,64}$/.test(ownerClientId)||
      ownerClientId!==principal.clientId)return {allowed:false,reason:'OWNERSHIP_DENIED'};
 }
 if(operation.endsWith('.read')&&method!=='GET')return {allowed:false,reason:'METHOD_DENIED'};
 if(operation.endsWith('.write')&&!['POST','PUT','PATCH','DELETE'].includes(method))return {allowed:false,reason:'METHOD_DENIED'};
 return {allowed:true,clientId:principal.clientId,role:principal.role};
}
function authorizeInterprocess({codec,proof,audience,operation,method,ownerClientId,action,bodyDigest}={}){
 if(!codec||typeof codec.verify!=='function')throw Error('AUTH21_PROOF_CODEC_REQUIRED');
 if(typeof operation!=='string'||!Object.hasOwn(PERMISSIONS,operation))return {allowed:false,reason:'UNKNOWN_OPERATION'};
 const principal=codec.verify(proof,{audience,operation,method,ownerClientId,action,bodyDigest});
 if(!principal)return {allowed:false,reason:'INVALID_PROOF'};
 if(!PERMISSIONS[operation].includes(principal.role))return {allowed:false,reason:'FORBIDDEN'};
 if(operation.startsWith('self.')&&principal.clientId!==ownerClientId)return {allowed:false,reason:'OWNERSHIP_DENIED'};
 if(operation.endsWith('.read')&&method!=='GET')return {allowed:false,reason:'METHOD_DENIED'};
 if(operation.endsWith('.write')&&!['POST','PUT','PATCH','DELETE'].includes(method))return {allowed:false,reason:'METHOD_DENIED'};
 return {allowed:true,clientId:principal.clientId,role:principal.role};
}
function issueAuthorizedProof({sessions,token,codec,audience,operation,method,ownerClientId,action,bodyDigest}={}){
 if(!codec||typeof codec.issue!=='function')throw Error('AUTH21_PROOF_CODEC_REQUIRED');
 const access=authorize({sessions,token,operation,method,ownerClientId});
 if(!access.allowed)return null;
 return codec.issue({principal:{clientId:access.clientId,role:access.role},audience,operation,method,ownerClientId,action,bodyDigest});
}
module.exports={authorize,authorizeInterprocess,issueAuthorizedProof};
