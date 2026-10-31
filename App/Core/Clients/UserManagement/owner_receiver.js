'use strict';
const https=require('node:https'),fs=require('node:fs'),CP=require('../../Communication/communication_protocol_v1'),{proofCodec}=require('../auth21_ipc_proof'),{permission}=require('./owner_policy');
function receiver({root,engine,dispatch,env=process.env,operator=false}){
 const codec=proofCodec({secret:Buffer.from(CP.ensureSecret(root),'hex')});
 return async function(envelope){
  const payload=envelope?.payload,operation=(operator?require('./operator_policy').permission:permission)(engine,payload?.action),action=engine+(operator?'.operator.request':'.user.request');
  if(!operation||!payload||typeof payload.args!=='object'||!payload.args||Array.isArray(payload.args))throw Error('OWNER_OPERATION_DENIED');
  const principal=codec.verify(envelope.proof,{audience:engine,operation,method:'POST',ownerClientId:payload.clientId,action,bodyDigest:CP.hashData(payload)});
  if(!principal||principal.clientId!==payload.clientId||!(operator&&operation!=='shared.write'?['ADMIN']:['ADMIN','USER']).includes(principal.role))throw Error('OWNER_PROOF_DENIED');
  const raw=JSON.stringify({engine,payload,proof:envelope.proof});
  await new Promise((resolve,reject)=>{const q=https.request({host:'127.0.0.1',port:+env.CORE_PUBLIC_PORT||8001,servername:'localhost',ca:fs.readFileSync(env.IATB_AUTH_TLS_CERT),rejectUnauthorized:true,path:operator?'/auth21/internal/authorize-operator':'/auth21/internal/authorize-owner',method:'POST',timeout:5000,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),'X-IATB-CP-Token':CP.ensureSecret(root)}},res=>{res.resume();res.on('end',()=>res.statusCode===200?resolve():reject(Error('OWNER_SESSION_REVOKED')));});q.on('error',reject);q.on('timeout',()=>q.destroy(Error('OWNER_CORE_UNAVAILABLE')));q.end(raw);});
  // The only identity reaching business code is from the verified capability.
  return dispatch(principal,payload.action,payload.args,payload);
 };
}
module.exports={receiver};
