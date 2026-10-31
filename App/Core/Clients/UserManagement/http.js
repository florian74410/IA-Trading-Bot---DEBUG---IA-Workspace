'use strict';
const crypto=require('node:crypto');
const {ADMIN_ONLY}=require('./admin_routes');
const {createBrowserSession}=require('../auth21_browser_cookie'),Context=require('./context');
function reply(res,status,data,headers={}){if(res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
function read(req){return new Promise((resolve,reject)=>{let size=0,parts=[];req.on('data',b=>{size+=b.length;if(size<=524288)parts.push(b);});req.once('error',reject);req.once('end',()=>{try{if(size>524288||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw Error();const b=JSON.parse(Buffer.concat(parts).toString());if(!b||typeof b!=='object'||Array.isArray(b))throw Error();resolve(b);}catch(_){reject(Error('INVALID_REQUEST'));}});});}
const LEGACY_SELF_READ=new Set(['/api/bank/vaults','/api/transfers/status','/api/transfers/assets','/api/onchain/status','/api/onchain/identity','/api/onchain/wallet','/api/onchain/history','/api/onchain/tx','/api/swap-bridge/status','/api/mosaics','/api/mosaics/runtime','/api/chart-viewer/status','/api/credits/usage','/api/token-usage','/api/status','/api/settings','/api/settings/app-profiles','/api/security/wallets','/api/security/wallets/networks','/api/security/wallets/next-id','/api/security/wallets/export','/api/notifications','/api/notifications/settings','/api/transfers/history','/api/swap-bridge/history']);
const LEGACY_SELF_WRITE=new Set(['/api/settings/supervisor/brains','/api/settings/test-x','/api/settings/test-openai','/api/transfers/preview','/api/swap-bridge/quote','/api/swap-bridge/prepare','/api/settings/test-zerox','/api/chat','/api/companion/chat','/api/chart-viewer/chat','/api/credits/pricing','/api/mosaics/create','/api/mosaics/delete','/api/settings/modulation','/api/app-settings/select','/api/notifications/test','/api/security/wallets/remove','/api/security/wallets/remove-key','/api/settings/language','/api/settings/general','/api/settings/profile/select','/api/settings/profile/save','/api/settings/power','/api/settings/ai','/api/settings/portfolio','/api/notifications/settings','/api/notifications/read','/api/security/wallets/create','/api/security/wallets/import','/api/security/wallets/reveal','/api/security/wallets/archive','/api/security/wallets/remove-secret']);
function createHandler({sessions,origin,secret,bridge=null,aiTransport=null,personalSettings=null,tradingAdmin=null,tradingVault=null,readiness=()=>true}={}){
 const cookies=createBrowserSession({secret,origin}),verifyVault=require('./trading_vault_auth').verifier();
 return async function handle(req,res,next){
  const u=new URL(req.url,'https://localhost'),p=u.pathname,token=cookies.parse(req);
  try{
   if(!readiness())return reply(res,503,{error:'AUTH_UNAVAILABLE'});
   if(p==='/auth21/internal/trading-access'&&req.method==='POST'&&tradingVault){
    if(req.socket.encrypted!==true||!require('../../Communication/communication_protocol_v1').verifyToken('',String(req.headers['x-iatb-cp-token']||'')))return reply(res,403,{error:'FORBIDDEN'});
    const input=await read(req);if(!verifyVault(input,req.headers))return reply(res,403,{error:'FORBIDDEN'});
    return reply(res,200,await tradingVault.access(input));
   }
   if(p==='/auth21/internal/ai-responses'&&req.method==='POST'&&bridge&&aiTransport){
    if(req.socket.encrypted!==true||!require('../../Communication/communication_protocol_v1').verifyToken('',String(req.headers['x-iatb-cp-token']||'')))return reply(res,403,{error:'FORBIDDEN'});
    const b=await read(req),gateway=b.delegation?.gateway,grant=gateway&&bridge.codec.verify(b.delegation.proof,{audience:'ai_gateway',operation:'self.write',method:'POST',ownerClientId:gateway.clientId,action:'ai_gateway.owner.responses',bodyDigest:require('../../Communication/communication_protocol_v1').hashData(gateway)}),active=gateway&&sessions.verifyHashedSession(gateway.sessionHash);
    if(!grant||!active||grant.clientId!==active.clientId||grant.role!==active.role||active.role==='GUEST')return reply(res,403,{error:'FORBIDDEN'});
    return reply(res,200,await aiTransport(gateway,b.payload));
   }
   if(p==='/auth21/internal/authorize-admin'&&req.method==='POST'&&bridge){
    const CP=require('../../Communication/communication_protocol_v1');if(req.socket.encrypted!==true||!CP.verifyToken('',String(req.headers['x-iatb-cp-token']||'')))return reply(res,403,{error:'FORBIDDEN'});const b=await read(req),grant=b.grant;if(!grant||!require('./admin_capability').PATHS.has(grant.route))return reply(res,403,{error:'FORBIDDEN'});const verified=bridge.codec.verify(b.proof,{audience:'firewall',operation:'admin.write',method:'POST',ownerClientId:grant.clientId,action:'firewall.admin.'+grant.route.split('/').pop(),bodyDigest:CP.hashData(grant)}),active=sessions.verifyHashedSession(grant.sessionHash);return reply(res,verified&&active&&verified.role==='ADMIN'&&active.role==='ADMIN'&&verified.clientId===active.clientId?200:403,{ok:!!verified&&!!active});
   }
   if(['/auth21/internal/authorize-owner','/auth21/internal/authorize-operator'].includes(p)&&req.method==='POST'&&bridge){
    if(req.socket.encrypted!==true||!require('../../Communication/communication_protocol_v1').verifyToken('',String(req.headers['x-iatb-cp-token']||'')))return reply(res,403,{error:'FORBIDDEN'});
    const b=await read(req),data=b.payload||{},operator=p.endsWith('authorize-operator'),operation=require(operator?'./operator_policy':'./owner_policy').permission(b.engine,data.action);
    if(!operation)return reply(res,403,{error:'FORBIDDEN'});
    const grant=bridge.codec.verify(b.proof,{audience:b.engine,operation,method:'POST',ownerClientId:data.clientId,action:b.engine+(operator?'.operator.request':'.user.request'),bodyDigest:require('../../Communication/communication_protocol_v1').hashData(data)}),active=sessions.verifyHashedSession(data.sessionHash);
    const ok=!!(grant&&active&&grant.clientId===active.clientId&&grant.role===active.role&&(operator&&operation!=='shared.write'?['ADMIN']:['ADMIN','USER']).includes(active.role));return reply(res,ok?200:403,{ok});
   }
   if(p==='/auth21/internal/authorize-compute'&&req.method==='POST'&&bridge){
    if(req.socket.encrypted!==true||!require('../../Communication/communication_protocol_v1').verifyToken(require('../../Shared/paths').ROOT,String(req.headers['x-iatb-cp-token']||'')))return reply(res,403,{error:'FORBIDDEN'});
    const b=await read(req),data=b.payload||{},expect={audience:'indicators',operation:'self.read',method:'POST',ownerClientId:data.clientId,action:'indicator.user.compute',bodyDigest:require('../../Communication/communication_protocol_v1').hashData(data)};
    const grant=bridge.codec.verify(b.proof,expect),active=sessions.verifyHashedSession(data.sessionHash);
    return reply(res,grant&&active&&grant.clientId===active.clientId&&grant.role===active.role?200:403,{ok:!!grant&&!!active});
   }
   if(!cookies.originAllowed(req))return reply(res,403,{error:'ORIGIN_FORBIDDEN'});
   if(p==='/api/health'&&req.method==='GET')return reply(res,200,{ok:true,authentication:'Auth21',version:require('../../Shared/build_info').version});
   if(['/auth21/login','/api/login'].includes(p)&&req.method==='POST'){
    const b=await read(req);if(u.search||Object.keys(b).sort().join(',')!=='email,password'||typeof b.password!=='string'||b.password.length>1024)return reply(res,400,{error:'INVALID_REQUEST'});
    const login=await sessions.loginEmail(b.email,b.password,req.socket.remoteAddress||'local');
    if(login?.throttled)return reply(res,429,{error:'AUTH_THROTTLED'},{'Retry-After':'300'});
    if(login?.busy)return reply(res,503,{error:'AUTH_BUSY'},{'Retry-After':'2'});
    if(!login)return reply(res,401,{error:'INVALID_CREDENTIALS'});
    return reply(res,200,{ok:true,role:login.role,clientId:login.clientId,csrfToken:cookies.csrf(login.token),expiresAt:login.expiresAt},{'Set-Cookie':cookies.cookie(login.token)});
   }
   const principal=token&&sessions.verifySession(token);
   if(!principal){if(p==='/api/bootstrap')return reply(res,200,{authenticated:false,localBypass:false});return reply(res,401,{error:'AUTH_REQUIRED'});}
   sessions.touch(token);
   if(require('../../../Bank/Core/feature_policy_v2_4_1').blockedPath(p))return reply(res,403,{error:'BANK_FEATURE_SUSPENDED'});
   if(p==='/auth21/admin/trading/command'){
    if(req.method!=='POST')return reply(res,405,{error:'METHOD_NOT_ALLOWED'});
    if(!tradingAdmin)return reply(res,404,{error:'NOT_FOUND'});
    if(principal.role!=='ADMIN')return reply(res,403,{error:'ACCESS_DENIED'});
    // The existing cookie-origin and CSRF checks below are reproduced here before dispatch.
    if(!cookies.validate(req,token))return reply(res,403,{error:'CSRF_FORBIDDEN'});
    const input=await read(req);
    const result=await tradingAdmin({token,payload:input});
    return reply(res,result.status,result.body);
   }
   if(p==='/auth21/capabilities'&&req.method==='GET')return reply(res,200,require('./capabilities').describe(principal.role));
   if(!['GET','HEAD'].includes(req.method)&&!cookies.validate(req,token)){sessions.audit(principal.clientId,'CSRF_REJECTED','DENIED');return reply(res,403,{error:'CSRF_FORBIDDEN'});}
   if(u.search&&!['/auth21/preferences'].includes(p)&&[...u.searchParams.keys()].some(k=>/client|owner|role|user/i.test(k)))return reply(res,400,{error:'IDENTITY_INPUT_FORBIDDEN'});
   if(p==='/auth21/trading/accounts'&&tradingVault){
    if(principal.role==='GUEST')throw Error('FORBIDDEN');
    if(req.method==='GET')return reply(res,200,{accounts:tradingVault.list(token)});
    if(req.method!=='PUT')return reply(res,405,{error:'METHOD_NOT_ALLOWED'});
    const b=await read(req);if(typeof b.password!=='string')return reply(res,428,{error:'REAUTH_REQUIRED'});
    await sessions.reauthenticate(token,b.password);delete b.password;return reply(res,200,{account:await tradingVault.save(token,b)});
   }
   if(p==='/auth21/trading/sign-typed-data'&&req.method==='POST'&&tradingVault){
    if(principal.role==='GUEST')throw Error('FORBIDDEN');
    const b=await read(req);if(typeof b.password!=='string')return reply(res,428,{error:'REAUTH_REQUIRED'});
    await sessions.reauthenticate(token,b.password);delete b.password;return reply(res,200,await tradingVault.sign(token,b));
   }
   if(p==='/communication/v1/client/ack'&&req.method==='POST')return reply(res,200,{ok:true,ack:sessions.acknowledgeBrowserAction(token,await read(req))});
   if(['/communication/v1/ui/read','/communication/v1/ui/write'].includes(p)&&req.method==='POST'&&bridge){const input=await read(req),operation=require('./operator_policy').permission(input.target,input.action);let operatorAuthorized=false;if(operation){if(principal.role==='GUEST'||(operation!=='shared.write'&&principal.role!=='ADMIN'))throw Error('FORBIDDEN');if(operation==='admin.write'){if(typeof input.password!=='string')return reply(res,428,{error:'REAUTH_REQUIRED',action:require('./operator_policy').label(input.action),confirmationRequired:true});await sessions.reauthenticate(token,input.password);if(input.confirmed!==true)throw Error('FORBIDDEN');operatorAuthorized=true;}if(operation==='shared.write')operatorAuthorized=true;delete input.password;delete input.confirmed;}const data=await bridge.bridge(token,input,{operatorAuthorized});return reply(res,200,{protocol:'CP/1',status:'OK',data});}
   if(p==='/ui-data/market/candles'&&req.method==='GET'&&bridge){if(principal.role==='GUEST')throw Error('FORBIDDEN');if(!sessions.attempt(crypto.createHash('sha256').update('candles:'+principal.clientId).digest('hex'),300))throw Error('AUTH_THROTTLED');const data=await bridge.rpc('marketdata','marketdata.candles',{symbol:u.searchParams.get('symbol'),timeframe:u.searchParams.get('interval')||'1m',source:u.searchParams.get('exchange'),limit:Math.min(1200,+u.searchParams.get('limit')||300),force:false});return reply(res,200,data);}
   if(['/auth21/me','/api/client/me','/api/profile','/ui-api/session'].includes(p)&&req.method==='GET')return reply(res,200,{ok:true,authenticated:true,authMode:'authenticated',role:principal.role,client:sessions.profile(token),permissions:{read:true,userWrite:principal.role!=='GUEST',adminWrite:principal.role==='ADMIN'}});
   if(principal.role==='GUEST'&&p==='/api/settings'&&req.method==='GET'){const client=sessions.profile(token);return reply(res,200,{ok:true,client,sessionUsername:client.username,sessionEmail:client.email,language:'fr',localAuthBypass:false,openaiConfigured:false,xConfigured:false,zeroxConfigured:false});}
   if(p==='/api/bootstrap'&&req.method==='GET')return reply(res,200,{authenticated:true,role:principal.role,clientId:principal.clientId,localBypass:false});
   if(p==='/auth21/csrf'&&req.method==='GET')return reply(res,200,{csrfToken:cookies.csrf(token)});
   if(['/auth21/sessions','/auth21/audit','/auth21/sessions/revoke'].includes(p)&&principal.role!=='ADMIN')return reply(res,403,{error:'ACCESS_DENIED'});
   if(p==='/auth21/sessions'&&req.method==='GET')return reply(res,200,{items:sessions.sessionsFor(token)});
   if(p==='/auth21/audit'&&req.method==='GET')return reply(res,200,{items:sessions.recent(token)});
   if(['/auth21/logout','/api/logout'].includes(p)&&req.method==='POST'){sessions.revokeSession(token);sessions.audit(principal.clientId,'LOGOUT');return reply(res,200,{ok:true},{'Set-Cookie':cookies.expire});}
   if(p==='/auth21/sessions/revoke'&&req.method==='POST'){const b=await read(req);if(Object.keys(b).join(',')!=='id')throw Error('INVALID_REQUEST');return reply(res,200,{ok:true,revoked:sessions.revokeOwn(token,b.id)});}
   if(['/auth21/profile','/api/profile','/api/client/me'].includes(p)&&['POST','PUT'].includes(req.method)){return reply(res,200,await sessions.updateProfile(token,await read(req)));}
   if(p==='/api/session/change-password'&&req.method==='POST'){const b=await read(req);if(Object.keys(b).some(k=>!['currentPassword','newPassword'].includes(k)))throw Error('INVALID_REQUEST');return reply(res,200,await sessions.changePassword(token,{password:b.currentPassword,newPassword:b.newPassword}),{'Set-Cookie':cookies.expire});}
   if(p==='/api/session/change-email'&&req.method==='POST'){const b=await read(req);if(Object.keys(b).some(k=>!['password','currentPassword','email'].includes(k)))throw Error('INVALID_REQUEST');return reply(res,200,await sessions.updateProfile(token,{email:b.email,password:b.currentPassword||b.password}));}
   if(p==='/auth21/password'&&req.method==='POST'){return reply(res,200,await sessions.changePassword(token,await read(req)),{'Set-Cookie':cookies.expire});}
   if(p==='/auth21/browser-state'&&req.method==='GET')return reply(res,200,{state:sessions.browserState(token)});
   if(p==='/auth21/browser-state'&&req.method==='PUT'){const b=await read(req);if(Object.keys(b).join(',')!=='state'||!b.state||typeof b.state!=='object'||Array.isArray(b.state))throw Error('INVALID_REQUEST');sessions.setBrowserState(token,b.state);return reply(res,200,{ok:true});}
   if(p==='/auth21/preferences'){
    if(principal.role==='GUEST')throw Error('FORBIDDEN');
    if(req.method==='GET'){if(!['ui','chart','preferences'].includes(u.searchParams.get('scope')))throw Error('FORBIDDEN');return reply(res,200,{value:sessions.getPreference(token,u.searchParams.get('scope'),u.searchParams.get('key'))});}
    const b=await read(req);if(Object.keys(b).some(k=>!['scope','key','value'].includes(k)))throw Error('INVALID_REQUEST');if(!['ui','chart','preferences'].includes(b.scope))throw Error('FORBIDDEN');
    if(req.method==='PUT'){sessions.setPreference(token,b.scope,b.key,b.value);return reply(res,200,{ok:true});}
    if(req.method==='DELETE')return reply(res,200,{ok:true,deleted:sessions.deletePreference(token,b.scope,b.key)});
   }
   if(p==='/api/settings/apis/clear'&&req.method==='POST'){
    if(principal.role==='GUEST')throw Error('FORBIDDEN');
    const b=await read(req);if(Object.keys(b).some(k=>!['name','password'].includes(k))||!['OPENAI_API_KEY','ANTHROPIC_API_KEY','X_BEARER_TOKEN','ZEROX_API_KEY'].includes(b.name))throw Error('INVALID_REQUEST');if(b.name==='ZEROX_API_KEY'&&principal.role!=='ADMIN')return reply(res,403,{error:'ACCESS_DENIED'});if(typeof b.password!=='string')return reply(res,428,{error:'REAUTH_REQUIRED'});await sessions.reauthenticate(token,b.password);sessions.setSecrets(token,{[b.name]:'__CLEAR__'});return reply(res,200,{ok:true});
   }
   if(p==='/api/settings/apis'&&req.method==='POST'){
    if(principal.role==='GUEST')throw Error('FORBIDDEN');
    const b=await read(req);if(principal.role!=='ADMIN'&&['zeroxApiKey','iatbFeeRecipient','swapBridgeRpc'].some(k=>Object.hasOwn(b,k)))return reply(res,403,{error:'ACCESS_DENIED'});if(typeof b.password!=='string')return reply(res,428,{error:'REAUTH_REQUIRED'});await sessions.reauthenticate(token,b.password);const validated=require('./settings_policy').validate(b);if(Object.keys(validated.settings).length&&!personalSettings)throw Error('INVALID_REQUEST');sessions.setSecrets(token,validated.secrets);if(personalSettings)personalSettings(token,validated.settings);return reply(res,200,{ok:true});
   }
   if(p==='/api/settings/test-zerox'&&req.method==='POST'&&principal.role!=='ADMIN')return reply(res,403,{error:'ACCESS_DENIED'});
   const adminRoute=ADMIN_ONLY.has(req.method+' '+p);
   if(adminRoute&&principal.role!=='ADMIN'){sessions.audit(principal.clientId,'ADMIN_ACCESS_DENIED','DENIED');return reply(res,403,{error:'ACCESS_DENIED'});}
   if(!adminRoute&&((principal.role==='GUEST'&&!(req.method==='GET'&&['/api/status','/api/settings'].includes(p)))||!((req.method==='GET'&&LEGACY_SELF_READ.has(p))||(req.method==='POST'&&LEGACY_SELF_WRITE.has(p))))){sessions.audit(principal.clientId,'ACCESS_DENIED','DENIED');return reply(res,403,{error:'ACCESS_DENIED'});}
   if(/^\/api\/(onchain|transfers|swap-bridge)\//.test(p)&&!sessions.attempt(crypto.createHash('sha256').update('bank-read:'+principal.clientId).digest('hex'),100))throw Error('AUTH_THROTTLED');
   if(!next)return reply(res,404,{error:'NOT_FOUND'});
   let credentialClientId=null;
   if(req.method==='POST'){
    req.umBody=await read(req);
    function forged(x){return x&&typeof x==='object'&&Object.entries(x).some(([k,v])=>/^(clientId|ownerClientId|userId|role|securityVersion)$/i.test(k)||forged(v));}
    if(forged(req.umBody))throw Error('IDENTITY_INPUT_FORBIDDEN');
    if(adminRoute){if(typeof req.umBody.password!=='string')return reply(res,428,{error:'REAUTH_REQUIRED'});await sessions.reauthenticate(token,req.umBody.password);if(req.umBody.confirmed!==true)return reply(res,400,{error:'CONFIRMATION_REQUIRED'});sessions.audit(principal.clientId,'ADMIN_OPERATION_REQUESTED');}
    if(p.startsWith('/api/security/wallets/')){if(typeof req.umBody.password!=='string')return reply(res,428,{error:'REAUTH_REQUIRED'});await sessions.reauthenticate(token,req.umBody.password);credentialClientId=principal.clientId;}
   }
   req.umPrincipal={...principal,auth21:true,localBypass:false};
   return Context.run({...req.umPrincipal,token,credentialClientId,operatorReauthenticated:adminRoute&&req.method==='POST'},()=>next());
  }catch(e){
   const code=['UNAUTHORIZED','INVALID_CREDENTIALS'].includes(e.message)?401:e.message==='AUTH_THROTTLED'?429:e.message==='NOT_FOUND'?404:e.code==='SQLITE_CONSTRAINT_UNIQUE'?409:/^AUTH21_PREFERENCE/.test(e.message)||['INVALID_REQUEST','IDENTITY_INPUT_FORBIDDEN'].includes(e.message)?400:403;
   return reply(res,code,{error:code===409?'IDENTITY_ALREADY_USED':code===403?'ACCESS_DENIED':e.message});
  }
 };
}
module.exports={createHandler,read,reply,LEGACY_SELF_READ,LEGACY_SELF_WRITE};
