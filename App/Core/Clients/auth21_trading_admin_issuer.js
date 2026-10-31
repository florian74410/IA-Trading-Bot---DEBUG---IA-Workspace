'use strict';
// Core-side issuer. Call ONLY with a verified Auth21 session store and its server-held token.
// This module does not expose a browser endpoint or accept a browser-provided role.
const {issueAuthorizedProof}=require('./auth21_rbac_guard');
const {hashData}=require('../Communication/communication_protocol_v1');
const COMMANDS=new Set(['STATUS','START','RESTART','DRAINING_STOP','EMERGENCY_STOP','RECOVER']);
function issueTradingAdminProof({sessions,token,codec,payload}={}){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;
 if(!COMMANDS.has(payload.command))return null;
 if(payload.params!==undefined){
  if(payload.command!=='DRAINING_STOP'||!payload.params||typeof payload.params!=='object'||Array.isArray(payload.params))return null;
  if(Object.keys(payload.params).some(k=>!['stage','mode','run_id','plan_digest','close_confirmed'].includes(k)))return null;
  if(JSON.stringify(payload.params).length>1024)return null;
 }
 if(!/^[A-Za-z0-9_-]{16,128}$/.test(String(payload.command_id||'')))return null;
 if(payload.confirmed!==true||!Number.isSafeInteger(payload.timestamp)||Math.abs(Date.now()-payload.timestamp)>30000)return null;
 if(!codec||typeof codec.issue!=='function'||!sessions||typeof sessions.verifySession!=='function')return null;
 return issueAuthorizedProof({sessions,token,codec,audience:'trading',operation:'admin.write',method:'POST',ownerClientId:null,action:'trading.admin.command',bodyDigest:hashData(payload)});
}
module.exports={issueTradingAdminProof};
