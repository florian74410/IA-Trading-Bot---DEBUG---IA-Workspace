'use strict';
/* Isolated, narrowly allowlisted Core business endpoint. The bearer credential
 * terminates at Core; only an action/body-bound proof travels to Router.
 */
const http=require('node:http'),crypto=require('node:crypto');
const {createCoreBusinessIssuer}=require('./auth21_core_business_issuer');
const {contract,validate}=require('./auth21_business_actions');
const TOKEN=/^Bearer ([A-Za-z0-9_-]{43})$/;
function createCoreBusinessHttp({sessions,codec,routerPort,env,browserSessions=null}={}){
 if(!env||env.IATB_AUTH21_BUSINESS_TRIAL!=='1'||
  env.IATB_AUTH21_IPC_PROBE_TRIAL!=='1'||env.IATB_TRADING_LIVE==='1')
  throw Error('AUTH21_BUSINESS_TRIAL_DISABLED');
 if(!Number.isSafeInteger(routerPort)||routerPort<1024||routerPort>65535)
  throw Error('AUTH21_BUSINESS_ROUTER_PORT_INVALID');
 const issuer=createCoreBusinessIssuer({sessions,codec,env});
 const send=(res,status,x)=>{if(res.writableEnded)return;
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',
   'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(x));};
 return function coreBusiness(req,res){
  const rule=contract(req.url);
  if(!rule||req.method!==(rule.method||'POST')||req.headers['x-iatb-auth21-proof'])
   return send(res,403,{error:'AUTH21_BUSINESS_DENIED'});
  let token=null;
  if(browserSessions){
   if(!browserSessions.originAllowed(req)||req.headers.authorization)
    return send(res,403,{error:'AUTH21_BROWSER_ORIGIN_DENIED'});
   token=browserSessions.parse(req);
   if(token&&rule.method!=='GET'&&!browserSessions.validate(req,token))
    return send(res,403,{error:'AUTH21_CSRF_DENIED'});
  }else{
   if(req.headers.origin||req.headers.cookie)return send(res,403,{error:'AUTH21_BUSINESS_DENIED'});
   const match=TOKEN.exec(String(req.headers.authorization||''));
   token=match&&match[1];
  }
  if(!token)return send(res,401,{error:'UNAUTHORIZED'});
  const forward=(raw,input)=>{
   let proof;
   try{proof=issuer.issueForService({token,action:rule.action,ownerClientId:rule.owner?input.ownerClientId:null,
     bodyDigest:crypto.createHash('sha256').update(raw).digest('hex')});}
   catch(_){return send(res,403,{error:'FORBIDDEN'});}
   if(!proof)return send(res,403,{error:'FORBIDDEN'});
   const relay=http.request({hostname:'127.0.0.1',port:routerPort,path:req.url,
    method:rule.method||'POST',timeout:2500,agent:false,headers:{
     'Content-Type':'application/json','Content-Length':raw.length,
     'X-IATB-Auth21-Proof':proof
    }},upstream=>{
    let n=0,segments=[];
    upstream.on('data',part=>{n+=part.length;if(n>4096){relay.destroy();return;}segments.push(part);});
    upstream.on('end',()=>{
     let result;
     try{result=JSON.parse(Buffer.concat(segments).toString('utf8'));}
     catch(_){return send(res,502,{error:'AUTH21_ROUTER_INVALID_RESPONSE'});}
     const allowed=[200,400,403,409,503];
     send(res,allowed.includes(upstream.statusCode)?upstream.statusCode:502,result);
    });
   });
   relay.on('timeout',()=>relay.destroy(Error('AUTH21_ROUTER_TIMEOUT')));
   relay.on('error',()=>send(res,502,{error:'AUTH21_ROUTER_UNAVAILABLE'}));
   relay.end(raw);
  };
  if(rule.method==='GET'){
   if(req.headers['transfer-encoding']||
      (req.headers['content-length']!==undefined&&String(req.headers['content-length'])!=='0'))
    return send(res,400,{error:'INVALID_REQUEST'});
   return forward(Buffer.alloc(0),null);
  }
  const length=req.headers['content-length']===undefined?null:Number(req.headers['content-length']);
  if((length!==null&&(!Number.isSafeInteger(length)||length<1||length>2048))||
   !/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))
   return send(res,400,{error:'INVALID_REQUEST'});
  let count=0,parts=[];
  req.on('data',chunk=>{count+=chunk.length;if(count>2048){req.destroy();return;}parts.push(chunk);});
  req.on('end',()=>{
   if(count<1||(length!==null&&count!==length))return send(res,400,{error:'INVALID_REQUEST'});
   const raw=Buffer.concat(parts);
   let input;
   try{input=JSON.parse(raw.toString('utf8'));}catch(_){return send(res,400,{error:'INVALID_REQUEST'});}
   if(!validate(rule,input))return send(res,400,{error:'INVALID_REQUEST'});
   return forward(raw,input);
  });
  req.on('error',()=>send(res,400,{error:'INVALID_REQUEST'}));
 };
}
module.exports={createCoreBusinessHttp};
