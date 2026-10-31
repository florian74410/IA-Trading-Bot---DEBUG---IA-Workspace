'use strict';
// Adapter only: existing Indicator Engine computes unchanged values/JSON V2.
const https=require('node:https'),fs=require('node:fs');
const CP=require('../../Core/Communication/communication_protocol_v1');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
function handler({root,registry,eng,regmod,env=process.env}){
 const codec=proofCodec({secret:Buffer.from(CP.ensureSecret(root),'hex')});
 return function(a,callback){
  let finished=false;const done=(e,result)=>{if(!finished){finished=true;callback(e,result);}};
  try{
  const p=a.payload||{},expect={audience:'indicators',operation:'self.read',method:'POST',ownerClientId:p.clientId,action:'indicator.user.compute',bodyDigest:CP.hashData(p)};
  let principal;try{principal=codec.verify(a.proof,expect);}catch(_){}
  if(!principal||principal.clientId!==p.clientId)return done(Error('AUTH21_COMPUTE_FORBIDDEN'));
  // Recheck the live session at Core before private data is used, including
  // changes of role/enable/password since the proof was issued.
  const raw=JSON.stringify({payload:p,proof:a.proof});
  const request=https.request({host:'127.0.0.1',port:+env.CORE_PUBLIC_PORT||8001,path:'/auth21/internal/authorize-compute',method:'POST',ca:fs.readFileSync(env.IATB_AUTH_TLS_CERT),servername:'localhost',rejectUnauthorized:true,timeout:5000,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),'X-IATB-CP-Token':CP.ensureSecret(root)}},res=>{let data='';res.on('data',b=>{if(data.length<65536)data+=b});res.on('end',()=>{if(res.statusCode!==200)return done(Error('AUTH21_COMPUTE_FORBIDDEN'));try{
   const definitions=p.definitions||{},rows=p.data?.candles,requests=p.data?.requests;
   if(!Array.isArray(rows)||!rows.length||rows.length>1200||!Array.isArray(requests)||!requests.length||requests.length>32||Object.keys(definitions).length>32)throw Error('INDICATOR_INPUT_INVALID');
   for(const d of Object.values(definitions))if(!regmod.validateDefinition(d,'Custom',null,true).ok)throw Error('INDICATOR_DEFINITION_INVALID');
   const view={safeNative:registry.safeNative,get(id){return definitions[id]||(registry.meta(id)?.kind==='BuiltIn'?registry.get(id):null)}};
   const results=eng.computeBatch(view,rows,requests);
   done(null,{schema:'indicator.compute.batch/1.0',symbol:p.data.symbol||null,timeframe:p.data.timeframe||null,source:p.data.source||null,results,provenance:{candleCount:rows.length}});
  }catch(e){done(e);}});});request.on('error',done);request.on('timeout',()=>request.destroy(Error('AUTH21_CORE_UNAVAILABLE')));request.end(raw);
  }catch(e){done(e);}
 };
}
module.exports={handler};
