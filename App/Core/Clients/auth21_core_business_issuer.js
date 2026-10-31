'use strict';
/* Core-only business proof issuer for later service integration.
 * No HTTP endpoint; never returns an HMAC proof to a browser.
 * Sessions must be the real Auth21SessionStore in production; tests use fakes.
 */
const business=require('./auth21_business_capability');
function createCoreBusinessIssuer({sessions,codec,env}={}){
 if(!env||env.IATB_AUTH21_CORE_AUTH_TRIAL!=='1'||env.IATB_DEBUG_MODE!=='1'||
    env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL!=='1')
  throw Error('AUTH21_CORE_ISSUER_ISOLATION_REQUIRED');
 if(!sessions||typeof sessions.verifySession!=='function'||!codec||
    typeof codec.issue!=='function')throw Error('AUTH21_CORE_ISSUER_DEPENDENCIES_REQUIRED');
 return Object.freeze({
  issueForService({token,action,ownerClientId,bodyDigest}={}){
   if(!business.contract(action))return null;
   return business.issue({sessions,token,codec,action,ownerClientId,bodyDigest});
  }
 });
}
module.exports={createCoreBusinessIssuer};
