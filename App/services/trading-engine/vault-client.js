'use strict';
const https=require('node:https'),fs=require('node:fs'),CP=require('../../Core/Communication/communication_protocol_v1');
function createVaultClient({root,env=process.env,request=null}){
 const call=request||function(body){return new Promise((resolve,reject)=>{
  const raw=JSON.stringify(body);let settled=false;
  const q=https.request({host:'127.0.0.1',port:+env.CORE_PUBLIC_PORT||8001,servername:'localhost',ca:fs.readFileSync(env.IATB_AUTH_TLS_CERT),rejectUnauthorized:true,path:'/auth21/internal/trading-access',method:'POST',timeout:5000,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),'X-IATB-CP-Token':CP.ensureSecret(root),...require('../../Core/Clients/UserManagement/trading_vault_auth').headers(body,env)}},res=>{
   let bytes=0,chunks=[];res.on('data',c=>{bytes+=c.length;if(bytes>32768)q.destroy(Error('TRADING_VAULT_RESPONSE_TOO_LARGE'));else chunks.push(c);});
   res.on('error',reject);res.on('end',()=>{if(settled)return;settled=true;try{const o=JSON.parse(Buffer.concat(chunks).toString());if(res.statusCode!==200)throw Error('TRADING_VAULT_ACCESS_DENIED');resolve(o);}catch(e){reject(e);}});
  });q.on('error',()=>reject(Error('TRADING_VAULT_UNAVAILABLE')));q.on('timeout',()=>q.destroy(Error('TRADING_VAULT_TIMEOUT')));q.end(raw);
 });};
 return {async bind(intent,action){
  const ticket=intent.metadata?.account_ticket;if(typeof ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(ticket))throw Error('TRADING_ACCOUNT_TICKET_REQUIRED');
  const payload={ticket,intent:JSON.parse(JSON.stringify(intent)),action};
  const b=await call({...payload,operation:'bind'});
  if(!b.identity||b.identity.exchange!==intent.exchange||!b.account||!['CEX','DEX'].includes(b.kind))throw Error('TRADING_VAULT_RESPONSE_INVALID');
  if(b.kind==='DEX')throw Error('DEX_PREPARED_POLICY_REQUIRED');
  return {identity:b.identity,account:b.account,secretProvider:{get:async exchange=>{
   if(exchange!==b.identity.exchange)throw Error('TRADING_CREDENTIAL_SCOPE_MISMATCH');
   return (await call({...payload,operation:'credentials',exchange})).credentials;
  }}};
 }};
}
module.exports={createVaultClient};
