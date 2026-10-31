'use strict';
// P3.1: authenticated Core ADMIN -> signed proof -> local Firewall CP/1.
// Never accept role or proofs supplied by the browser. Commands remain disabled by Engine P3.
const http=require('node:http'),crypto=require('node:crypto');
const CP=require('../Communication/communication_protocol_v1');
const {proofCodec}=require('./auth21_ipc_proof');
const {loadTradingAdminKey}=require('./auth21_trading_key_provider');
const {issueTradingAdminProof}=require('./auth21_trading_admin_issuer');
const TOKEN=/^Bearer ([A-Za-z0-9_-]{43})$/;
function createTradingAdminBridge({sessions,env=process.env,browserSessions=null,port=8017}={}){
 if(!sessions||typeof sessions.verifySession!=='function'||env.IATB_AUTH21_TRADING_ADMIN_BRIDGE!=='1')return null;
 const codec=proofCodec({secret:loadTradingAdminKey({env})});
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('TRADING_ADMIN_FIREWALL_PORT_INVALID');
 const send=(res,status,body)=>{if(res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
 return function handler(req,res){
  if(req.method!=='POST'||new URL(req.url,'http://localhost').pathname!=='/auth21/admin/trading/command'||req.headers['x-iatb-auth21-proof'])
   return send(res,404,{error:'NOT_FOUND'});
  let token;
  if(browserSessions){
   if(!browserSessions.originAllowed(req)||req.headers.authorization)return send(res,403,{error:'ORIGIN_DENIED'});
   token=browserSessions.parse(req);
   if(!token||!browserSessions.validate(req,token))return send(res,403,{error:'CSRF_DENIED'});
  }else{
   if(req.headers.cookie||req.headers.origin)return send(res,403,{error:'CREDENTIALS_DENIED'});
   const match=TOKEN.exec(String(req.headers.authorization||''));token=match&&match[1];
  }
  if(!token)return send(res,401,{error:'UNAUTHORIZED'});
  const type=String(req.headers['content-type']||'');
  if(!/^application\/json(?:;|$)/i.test(type))return send(res,400,{error:'CONTENT_TYPE_INVALID'});
  let n=0,parts=[];
  req.on('data',chunk=>{n+=chunk.length;if(n>2048){req.destroy();return;}parts.push(chunk);});
  req.on('end',()=>{
   if(n===0||n>2048)return send(res,400,{error:'BODY_INVALID'});
   let payload;try{payload=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch(_){return send(res,400,{error:'JSON_INVALID'});}
   if(!payload||typeof payload!=='object'||Array.isArray(payload)||!['command,command_id,confirmed,timestamp','command,command_id,confirmed,params,timestamp'].includes(Object.keys(payload).sort().join(',')))
     return send(res,400,{error:'ARGUMENTS_INVALID'});
   const proof=issueTradingAdminProof({sessions,token,codec,payload});
   if(!proof)return send(res,403,{error:'ADMIN_PERMISSION_DENIED'});
   const msg=CP.makeRequest('trading','trading.admin.command',{...payload,proof},'summary');
   const raw=Buffer.from(JSON.stringify(msg));
   const machine=CP.ensureSecret('');
   const signature=crypto.createHmac('sha256',machine).update(raw).digest('hex');
   const request=http.request({hostname:'127.0.0.1',port,path:'/cp/v1',method:'POST',timeout:5000,agent:false,headers:{'Content-Type':'application/json','Content-Length':raw.length,'X-IATB-CP-Token':machine,'X-IATB-CP-Signature':signature,'X-IATB-FW-Signature':signature}},upstream=>{
     let bytes=0,arr=[];upstream.on('data',b=>{bytes+=b.length;if(bytes>32768){request.destroy();return;}arr.push(b);});
     upstream.on('end',()=>{let answer;try{answer=JSON.parse(Buffer.concat(arr).toString('utf8'));}catch(_){return send(res,502,{error:'FIREWALL_RESPONSE_INVALID'});}send(res,[200,400,403,409,503].includes(upstream.statusCode)?upstream.statusCode:502,answer);});
   });
   request.on('timeout',()=>request.destroy(Error('TIMEOUT')));
   request.on('error',()=>send(res,502,{error:'TRADING_ADMIN_FIREWALL_UNAVAILABLE'}));
   request.end(raw);
  });
 };
}

function createAuthenticatedDispatcher({sessions,env=process.env,port=8017}={}){
 if(!sessions||typeof sessions.verifySession!=='function')return null;
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('TRADING_ADMIN_FIREWALL_PORT_INVALID');
 const preflight=require('./auth21_trading_key_provider').preflightTradingAdminKey,attestation=require('./auth21_trading_attestation');
 function diagnostic(state,reason){return {state,reason,liveAuthorized:false,mutationsEnabled:false,p4p5Qualified:false,checkedAt:new Date().toISOString()};}
 return async function dispatch({token,payload}={}){
  const principal=token&&sessions.verifySession(token);
  if(!principal||principal.role!=='ADMIN')return {status:403,body:{error:'ADMIN_PERMISSION_DENIED'}};
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!['command,command_id,confirmed,timestamp','command,command_id,confirmed,params,timestamp'].includes(Object.keys(payload).sort().join(',')))return {status:400,body:{error:'ARGUMENTS_INVALID'}};
  const enabled=env.IATB_AUTH21_TRADING_ADMIN_BRIDGE==='1',localCheck=preflight({env});
  const check=enabled?localCheck:env.IATB_AUTH21_TRADING_ADMIN_REQUESTED==='1'&&!localCheck.ok?localCheck:{ok:false,state:'DISABLED',reason:'CONFIGURATION_NOT_ENABLED'};
  if(!check.ok)return {status:payload.command==='STATUS'?200:503,body:{ok:payload.command==='STATUS',bridge:diagnostic(check.state,check.reason),error:payload.command==='STATUS'?undefined:'P3_NOT_READY'}};
  let secret;try{secret=loadTradingAdminKey({env});}catch(_){return {status:503,body:{error:'P3_KEY_CHANGED',bridge:diagnostic('KEY_INVALID','KEY_CHANGED')}};}
  const codec=proofCodec({secret}),proof=issueTradingAdminProof({sessions,token,codec,payload});
  if(!proof)return {status:403,body:{error:'ADMIN_PERMISSION_DENIED'}};
  try{if(sessions.audit)sessions.audit(principal.clientId,'TRADING_ADMIN_REQUEST','OK');}catch(_){return {status:503,body:{error:'ADMIN_AUDIT_UNAVAILABLE'}};}
  const msg=CP.makeRequest('trading','trading.admin.command',{...payload,proof},'summary'),raw=Buffer.from(JSON.stringify(msg));
  let machine;try{machine=CP.ensureSecret('');}catch(_){return {status:503,body:{error:'CP_SECRET_UNAVAILABLE',bridge:diagnostic('AUTH_UNAVAILABLE','CP_SECRET_UNAVAILABLE')}};}
  const signature=crypto.createHmac('sha256',machine).update(raw).digest('hex');
  return await new Promise(resolve=>{
   const fail=(state,reason)=>resolve({status:503,body:{error:reason,bridge:diagnostic(state,reason)}});
   const q=http.request({hostname:'127.0.0.1',port,path:'/cp/v1',method:'POST',timeout:5000,agent:false,headers:{'Content-Type':'application/json','Content-Length':raw.length,'X-IATB-CP-Token':machine,'X-IATB-CP-Signature':signature,'X-IATB-FW-Signature':signature}},response=>{
    let n=0,parts=[];response.on('data',chunk=>{n+=chunk.length;if(n>32768){q.destroy();return;}parts.push(chunk)});
    response.on('error',()=>fail('FIREWALL_UNAVAILABLE','FIREWALL_RESPONSE_INTERRUPTED'));
    response.on('end',()=>{
     let out;try{out=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch(_){return fail('ERROR','FIREWALL_RESPONSE_INVALID');}
     if(!out.p3Attestation){const error=out.error||out.data&&out.data.error||out.data&&out.data.firewall&&out.data.firewall.code;return fail(error==='ADMIN_INTEGRATION_UNAVAILABLE'?'AUTH_UNAVAILABLE':'FIREWALL_UNAVAILABLE',typeof error==='string'&&/^[A-Z0-9_]{1,100}$/.test(error)?error:'P3_ATTESTATION_UNAVAILABLE');}
     if(!attestation.verify(secret,payload,out))return fail('KEY_INVALID','KEY_MISMATCH');
     const stage=out.p3Attestation.stage;delete out.p3Attestation;
     const ready=response.statusCode===200&&stage==='ENGINE'&&out.status==='OK'&&out.data&&out.data.ok===true&&out.data.security&&out.data.security.journalDurable===true;
     out.bridge=diagnostic(ready?'READY':'ERROR',ready?'AUTH21_IPC_FIREWALL_ENGINE_VALIDATED':out.error||out.data&&out.data.error||'P3_COMMAND_REJECTED');
     if(ready)out.bridge.mutationsEnabled=out.data.security.mutationsEnabled===true;
     resolve({status:ready?200:[400,403,409,503].includes(response.statusCode)?response.statusCode:503,body:out});
    });
   });
   q.on('timeout',()=>q.destroy(Error('TIMEOUT')));q.on('error',()=>fail('FIREWALL_UNAVAILABLE','TRADING_ADMIN_FIREWALL_UNAVAILABLE'));q.end(raw);
  });
 };
}

module.exports={createTradingAdminBridge,createAuthenticatedDispatcher};
