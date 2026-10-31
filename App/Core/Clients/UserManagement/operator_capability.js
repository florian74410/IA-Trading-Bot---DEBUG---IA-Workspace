'use strict';
const crypto=require('node:crypto'),CP=require('../../Communication/communication_protocol_v1'),{proofCodec}=require('../auth21_ipc_proof');
function envelope({root,engine,action,args,principal,token,authorized=false}){
 const operation=require('./operator_policy').permission(engine,action);if(!operation||!principal||principal.role!=='ADMIN'||typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||operation==='admin.write'&&!authorized)throw Error('ADMIN_CAPABILITY_REQUIRED');
 const payload={clientId:principal.clientId,sessionHash:crypto.createHash('sha256').update(Buffer.from(token,'base64url')).digest('hex'),action,args},proof=proofCodec({secret:Buffer.from(CP.ensureSecret(root),'hex')}).issue({principal,audience:engine,operation,method:'POST',ownerClientId:principal.clientId,action:engine+'.operator.request',bodyDigest:CP.hashData(payload)});return {payload,proof};
}
module.exports={envelope};
