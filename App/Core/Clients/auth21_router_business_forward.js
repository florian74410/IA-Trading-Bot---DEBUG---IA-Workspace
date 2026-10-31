'use strict';
/* Router transports one fixed signed capability; Engine is final RBAC verifier.
 * Never forwards cookies, bearer tokens, client IDs or arbitrary paths.
 */
const http=require('node:http');
const {preflightEnv}=require('../Backup/auth21_core_local_trial_wiring');
const {contract}=require('./auth21_business_actions');
function createForward({env,ports}={}){
 if(!env||env.IATB_AUTH21_BUSINESS_TRIAL!=='1'||
    env.IATB_AUTH21_IPC_PROBE_TRIAL!=='1'||env.IATB_TRADING_LIVE==='1')
  throw Error('AUTH21_BUSINESS_TRIAL_DISABLED');
 preflightEnv(env);
 if(!ports||typeof ports!=='object'||Object.values(ports).some(p=>
   !Number.isSafeInteger(p)||p<1024||p>65535))
  throw Error('AUTH21_BUSINESS_ENGINE_PORT_INVALID');
 const send=(res,code,obj)=>{if(res.writableEnded)return;res.writeHead(code,{
  'Content-Type':'application/json','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
 return function forward(req,res){
  const peer=req.socket&&req.socket.remoteAddress;
  const proof=req.headers['x-iatb-auth21-proof'];
  const length=Number(req.headers['content-length']);
  const rule=contract(req.url),port=rule&&ports[rule.engine];
  if(!rule||req.method!==(rule.method||'POST')||!Number.isSafeInteger(port)||
     !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)||
     req.headers.authorization||req.headers.cookie||req.headers.origin||
     typeof proof!=='string'||proof.length>4096||
     !Number.isSafeInteger(length)||length<0||length>2048||
     (rule.method==='GET'?length!==0:length===0))
   return send(res,403,{error:'AUTH21_ROUTER_BUSINESS_DENIED'});
  let count=0,parts=[];
  req.on('data',chunk=>{count+=chunk.length;if(count>2048){req.destroy();return;}parts.push(chunk);});
  req.on('end',()=>{
   if(count!==length)return send(res,400,{error:'INVALID_BODY'});
   const raw=Buffer.concat(parts);
   const downstream=http.request({hostname:'127.0.0.1',port,
    path:req.url,method:rule.method||'POST',timeout:2500,agent:false,headers:{
     'Content-Type':'application/json','Content-Length':raw.length,
     'X-IATB-Auth21-Proof':proof
    }},upstream=>{
    let size=0,data=[];
    upstream.on('data',part=>{size+=part.length;if(size>4096){downstream.destroy();return;}data.push(part);});
    upstream.on('end',()=>{
     try{const body=JSON.parse(Buffer.concat(data).toString('utf8'));
      return send(res,[200,400,403,409,503].includes(upstream.statusCode)?upstream.statusCode:502,body);}
     catch(_){return send(res,502,{error:'AUTH21_ENGINE_INVALID_RESPONSE'});}
    });
   });
   downstream.on('timeout',()=>downstream.destroy(Error('AUTH21_ENGINE_TIMEOUT')));
   downstream.on('error',()=>send(res,502,{error:'AUTH21_ENGINE_UNAVAILABLE'}));
   downstream.end(raw);
  });
  req.on('error',()=>send(res,400,{error:'INVALID_BODY'}));
 };
}
module.exports={createForward};
