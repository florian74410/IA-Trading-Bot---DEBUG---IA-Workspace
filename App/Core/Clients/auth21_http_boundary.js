'use strict';
/* Auth 2.1 isolated HTTP boundary. NOT mounted in Core server or Gateway.
 * Passes all authentication to Auth21SessionStore; no clientId/cookie bypass.
 * Deliberately exposes no ADMIN, recovery, registration, or Wallet functions.
 */
const {URL}=require('node:url');
const MAX_BYTES=4096;
const TOKEN=/^Bearer ([A-Za-z0-9_-]{43})$/;
function reply(res,status,data,extraHeaders={}){
 if(res.headersSent||res.writableEnded)return;
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...extraHeaders});
 res.end(JSON.stringify(data));
}
function readJSON(req,maxBytes=MAX_BYTES){
 return new Promise((resolve,reject)=>{
  let length=0,parts=[],done=false;
  const fail=err=>{if(done)return;done=true;reject(err);req.resume()};
  const header=req.headers['content-length'];
  if(header!==undefined&&(!/^\d+$/.test(String(header))||Number(header)>maxBytes)){
   fail(Error('AUTH21_BODY_TOO_LARGE'));return;
  }
  req.on('data',chunk=>{
   if(done)return;
   length+=chunk.length;
   if(length>maxBytes){fail(Error('AUTH21_BODY_TOO_LARGE'));return}
   parts.push(chunk);
  });
  req.once('aborted',()=>fail(Error('AUTH21_BODY_ABORTED')));
  req.once('error',fail);
  req.once('end',()=>{
   if(done)return;
   done=true;
   try{
    if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw Error('AUTH21_CONTENT_TYPE');
    const obj=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('AUTH21_BODY_INVALID');
    resolve(obj);
   }catch(_){reject(Error('AUTH21_BODY_INVALID'))}
  });
 });
}
function bearer(req){
 const h=req.headers.authorization;
 if(typeof h!=='string')return null;
 const match=TOKEN.exec(h);
 return match?match[1]:null;
}
function createAuth21HttpHandler({sessions,nowMilliseconds=Date.now,allowedBrowserOrigin=null,browserSessions=null,ipcCodec=null}={}){
 if(browserSessions&&(!browserSessions.parse||!browserSessions.csrf||!browserSessions.originAllowed||!browserSessions.validate))throw Error('AUTH21_COOKIE_CONFIG_INVALID');
 if(browserSessions&&allowedBrowserOrigin!==browserSessions.origin)throw Error('AUTH21_COOKIE_ORIGIN_MISMATCH');
 if(allowedBrowserOrigin!==null&&(!/^https?:\/\/[^/]+$/.test(allowedBrowserOrigin)||
    allowedBrowserOrigin.includes('@')))throw Error('AUTH21_BROWSER_ORIGIN_INVALID');
 const attempts=new Map();
 const WINDOW_MS=300000,MAX_FAILURES=5,MAX_TRACKED=2048;
 function failureDelay(clientId){
  const now=nowMilliseconds(),record=attempts.get(clientId);
  if(!record||now-record.started>=WINDOW_MS){attempts.delete(clientId);return false}
  return record.failures>=MAX_FAILURES;
 }
 function failedLogin(clientId){
  const now=nowMilliseconds(),record=attempts.get(clientId);
  if(!record||now-record.started>=WINDOW_MS){
   if(attempts.size>=MAX_TRACKED)attempts.delete(attempts.keys().next().value);
   attempts.set(clientId,{started:now,failures:1});return;
  }
  record.failures++;
 }

 if(!sessions||typeof sessions.loginWithPassword!=='function'||
    typeof sessions.verifySession!=='function'||typeof sessions.revokeSession!=='function')
  throw Error('AUTH21_SESSIONS_REQUIRED');
 return async function auth21Http(req,res){
  try{
   let uri;
   try{uri=new URL(req.url||'', 'http://localhost');}catch(_){reply(res,404,{error:'NOT_FOUND'});return}
   if((uri.search&&uri.pathname!=='/auth21/preferences')||uri.hash||!['/auth21/login','/auth21/me','/auth21/state','/auth21/lock','/auth21/csrf','/auth21/logout','/auth21/preferences','/auth21/activity','/auth21/unlock','/auth21/ipc/probe-proof'].includes(uri.pathname)){
    reply(res,404,{error:'NOT_FOUND'});return;
   }
   // Strict Origin guard on browser requests. No cookie authorization is accepted.
   // An Origin header is rejected unless the operator explicitly set its exact value.
   if(req.headers.origin!==undefined &&
      (typeof req.headers.origin!=='string'||req.headers.origin!==allowedBrowserOrigin)){
    reply(res,403,{error:'ORIGIN_FORBIDDEN'});return;
   }
   if(browserSessions&&(!browserSessions.originAllowed(req))){
    reply(res,403,{error:'ORIGIN_FORBIDDEN'});return;
   }
   const cookieToken=browserSessions?browserSessions.parse(req):null;
   const tokenFor=()=>browserSessions?cookieToken:bearer(req);
   if(browserSessions&&cookieToken&&req.method!=='GET'&&uri.pathname!=='/auth21/login'&&
      !browserSessions.validate(req,cookieToken)){
    reply(res,403,{error:'CSRF_FORBIDDEN'});return;
   }
   // Only the Core-local DEBUG fixture may supply ipcCodec. Never a business grant.
   if(uri.pathname==='/auth21/ipc/probe-proof'){
    if(!ipcCodec||browserSessions||req.method!=='POST'){
     reply(res,404,{error:'NOT_FOUND'});return;
    }
    const token=tokenFor();
    const proof=require('./auth21_rbac_guard').issueAuthorizedProof({
     sessions,token,codec:ipcCodec,audience:'router',operation:'shared.read',method:'GET'
    });
    if(!proof){reply(res,401,{error:'UNAUTHORIZED'});return}
    reply(res,200,{proof});return;
   }
   if(req.method==='POST'&&uri.pathname==='/auth21/login'){
    const input=await readJSON(req);
    if(Object.keys(input).sort().join(',')!=='clientId,password' ||
      typeof input.clientId!=='string'||!/^(?:CL)[A-Za-z0-9_-]{1,64}$/.test(input.clientId)||
      typeof input.password!=='string'||input.password.length>1024){
     reply(res,400,{error:'INVALID_REQUEST'});return;
    }
    if(failureDelay(input.clientId)){reply(res,429,{error:'AUTH_THROTTLED'});return}
    let result;
    try{result=await sessions.loginWithPassword(input.clientId,input.password)}catch(e){
     if(e.message==='SNAPSHOT_WRITE_QUIESCED'){reply(res,503,{error:'AUTH_UNAVAILABLE'});return}
     throw e;
    }
    if(!result){failedLogin(input.clientId);reply(res,401,{error:'INVALID_CREDENTIALS'});return}
    attempts.delete(input.clientId);
    if(browserSessions){reply(res,200,{role:result.role,clientId:result.clientId,expiresAt:result.expiresAt,csrfToken:browserSessions.csrf(result.token)}, {'Set-Cookie':browserSessions.cookie(result.token)});return}
    reply(res,200,{token:result.token,role:result.role,clientId:result.clientId,expiresAt:result.expiresAt});
    return;
   }
   if(req.method==='POST'&&uri.pathname==='/auth21/unlock'){
    const token=tokenFor();
    if(!token){reply(res,401,{error:'UNAUTHORIZED'});return}
    const input=await readJSON(req);
    if(Object.keys(input).length!==1||typeof input.password!=='string'||input.password.length>1024){
     reply(res,400,{error:'INVALID_REQUEST'});return;
    }
    const throttleKey='unlock:'+token;
    if(failureDelay(throttleKey)){reply(res,429,{error:'AUTH_THROTTLED'});return}
    const ok=await sessions.unlockWithPassword(token,input.password);
    if(!ok)failedLogin(throttleKey);else attempts.delete(throttleKey);
    reply(res,ok?200:401,ok?{ok:true}:{error:'UNAUTHORIZED'});return;
   }
   if(req.method==='GET'&&uri.pathname==='/auth21/state'){
    const token=tokenFor(),state=token&&sessions.sessionState(token);
    if(!state){reply(res,401,{error:'UNAUTHORIZED'});return}
    reply(res,200,{...state,...(browserSessions?{csrfToken:browserSessions.csrf(token)}:{})});return;
   }
   if(req.method==='POST'&&uri.pathname==='/auth21/lock'){
    const token=tokenFor();
    if(!token||!sessions.lockSession(token)){reply(res,401,{error:'UNAUTHORIZED'});return}
    reply(res,200,{ok:true});return;
   }
   if(req.method==='POST'&&uri.pathname==='/auth21/activity'){
    const token=tokenFor();
    if(!token||!sessions.recordUserActivity(token)){
     reply(res,401,{error:'UNAUTHORIZED'});return;
    }
    reply(res,200,{ok:true});return;
   }
   // Client-scoped preference API: identity always resolved from the live token,
   // never from clientId, role, cookie, URL or request body. GUEST is read-only.
   if(uri.pathname==='/auth21/preferences'){
    const token=tokenFor(),principal=token&&sessions.verifySession(token);
    if(!principal){reply(res,401,{error:'UNAUTHORIZED'});return}
    if(!['GET','PUT','DELETE'].includes(req.method)){
     reply(res,405,{error:'METHOD_NOT_ALLOWED'});return;
    }
    const keys=[...uri.searchParams.keys()];
    if(keys.length!==2||keys.some(k=>k!=='scope'&&k!=='key')||
       !uri.searchParams.has('scope')||!uri.searchParams.has('key')||
       !/^[a-z][a-z0-9_.:-]{0,63}$/i.test(uri.searchParams.get('scope'))||
       !/^[a-z][a-z0-9_.:-]{0,63}$/i.test(uri.searchParams.get('key'))){
     reply(res,400,{error:'INVALID_REQUEST'});return;
    }
    const scope=uri.searchParams.get('scope'),key=uri.searchParams.get('key');
    if(req.method==='GET'){
     reply(res,200,{value:sessions.getPreference(token,scope,key)});return;
    }
    const policy=require('./auth21_rbac_guard').authorize({sessions,token,operation:'self.write',ownerClientId:principal.clientId,method:req.method});
   if(!policy.allowed){reply(res,403,{error:'FORBIDDEN'});return}
    if(req.method==='PUT'){
     const input=await readJSON(req,100000);
     if(Object.keys(input).length!==1||typeof input.value!=='string'||
       Buffer.byteLength(input.value,'utf8')>16384){reply(res,400,{error:'INVALID_REQUEST'});return}
     sessions.setPreference(token,scope,key,input.value);
     reply(res,200,{ok:true});return;
    }
    sessions.deletePreference(token,scope,key);
    reply(res,200,{ok:true});return;
   }
   if(req.method==='GET'&&uri.pathname==='/auth21/csrf'){
    if(!browserSessions){reply(res,404,{error:'NOT_FOUND'});return}
    const token=browserSessions.parse(req),session=token&&sessions.verifySession(token);
    if(!session){reply(res,401,{error:'UNAUTHORIZED'});return}
    reply(res,200,{csrfToken:browserSessions.csrf(token)});return;
   }
   if(req.method==='GET'&&uri.pathname==='/auth21/me'){
    const token=tokenFor(),session=token&&sessions.verifySession(token);
    if(!session){reply(res,401,{error:'UNAUTHORIZED'});return}
    reply(res,200,{clientId:session.clientId,role:session.role,expiresAt:session.expiresAt});
    return;
   }
   if(req.method==='POST'&&uri.pathname==='/auth21/logout'){
    const token=tokenFor();
    if(!token){reply(res,401,{error:'UNAUTHORIZED'});return}
    if(sessions.revokeSession(token)!==true){reply(res,401,{error:'UNAUTHORIZED'});return}
    reply(res,200,{ok:true},browserSessions?{'Set-Cookie':browserSessions.expire}:{});return;
   }
   reply(res,405,{error:'METHOD_NOT_ALLOWED'});
  }catch(error){
   if(error&&/^AUTH21_BODY_/.test(error.message)){
    reply(res,400,{error:'INVALID_REQUEST'});return;
   }
   if(error&&error.message==='SNAPSHOT_WRITE_QUIESCED'){
    reply(res,503,{error:'AUTH_UNAVAILABLE'});return;
   }
   reply(res,503,{error:'AUTH_UNAVAILABLE'});
  }
 };
}
module.exports={createAuth21HttpHandler};
