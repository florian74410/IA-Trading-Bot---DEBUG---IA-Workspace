'use strict';
// Verified Auth21 principal from an operation-bound signed IPC proof.
// The IPC key loader is restricted to the authenticated local Auth21 trial.
// No browser-supplied role or CP/1 machine token is trusted as ADMIN.
const crypto=require('node:crypto');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const {authorizeInterprocess}=require('../../Core/Clients/auth21_rbac_guard');
function createVerifier({env=process.env,replayStore}={}){
 const {loadTradingAdminKey}=require('../../Core/Clients/auth21_trading_key_provider');
 if(!env.IATB_AUTH21_TRADING_IPC_KEY_FILE)return null;
 const secret=loadTradingAdminKey({env});
 const codec=proofCodec({secret,replayStore});
 const verifier=async function(context){
   const payload=context&&context.payload;
   const proof=context&&context.proof;
   if(!payload||typeof payload!=='object'||typeof proof!=='string')return null;
   const operation='admin.write'; // CP/1 maintenance route is POST, including STATUS.
   const action='trading.admin.command';
   const bodyDigest=require('../../Core/Communication/communication_protocol_v1').hashData(payload);
   const access=authorizeInterprocess({codec,proof,audience:'trading',operation,method:'POST',action,bodyDigest});
   return access.allowed?{verified:true,role:access.role,subject:access.clientId}:null;
 };
 verifier.attest=function(payload,body,stage){return require('../../Core/Clients/auth21_trading_attestation').sign(secret,stage||'ENGINE',payload,body)};
 return verifier;
}
module.exports={createVerifier};
