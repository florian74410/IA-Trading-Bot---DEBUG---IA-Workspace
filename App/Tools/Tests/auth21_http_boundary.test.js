'use strict';
/* Pure in-process HTTP handler tests. Does not open a real port or DB.
 * Native SQLite end-to-end tests remain a separate Phase 6 gate.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {createAuth21HttpHandler}=require('../../Core/Clients/auth21_http_boundary');
const VALID_TOKEN='A'.repeat(43);
function fixture(){
 const events=[],state={revoked:false};
 const sessions={
  async loginWithPassword(id,pw){events.push('login');return id==='CL000001'&&pw==='correct-16-characters'
   ?{token:VALID_TOKEN,clientId:id,role:'USER',expiresAt:1900000000}:null},
  verifySession(token){events.push('verify');return token===VALID_TOKEN&&!state.revoked
   ?{clientId:'CL000001',role:'USER',expiresAt:1900000000}:null},
  revokeSession(token){events.push('revoke');if(token!==VALID_TOKEN||state.revoked)return false;state.revoked=true;return true;},
  getPreference(token,scope,key){events.push('read');return state[scope+':'+key]||null},
  setPreference(token,scope,key,value){events.push('write');state[scope+':'+key]=value;return true},
  deletePreference(token,scope,key){events.push('delete');delete state[scope+':'+key];return true}
 };
 return {events,state,sessions,handler:createAuth21HttpHandler({sessions})};
}
async function send(handler,{method='GET',url='/auth21/me',headers={},body}={}){
 const req=Readable.from(body===undefined?[]:[Buffer.from(typeof body==='string'?body:JSON.stringify(body))]);
 req.method=method;req.url=url;req.headers={...headers};
 const res={
  headersSent:false,writableEnded:false,
  writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;return this},
  end(data){this.body=JSON.parse(data);this.writableEnded=true}
 };
 await handler(req,res);
 return res;
}
test('login verifies provided password and returns bearer token without caching',async()=>{
 const x=fixture(),r=await send(x.handler,{method:'POST',url:'/auth21/login',
  headers:{'content-type':'application/json'},
  body:{clientId:'CL000001',password:'correct-16-characters'}});
 assert.equal(r.status,200);assert.equal(r.body.token,VALID_TOKEN);
 assert.equal(r.headers['Cache-Control'],'no-store');assert.deepEqual(x.events,['login']);
});
test('incorrect credentials use uniform 401, no token or account metadata',async()=>{
 const x=fixture(),r=await send(x.handler,{method:'POST',url:'/auth21/login',
  headers:{'content-type':'application/json'},
  body:{clientId:'CL000001',password:'WRONG_PASSWORD'}});
 assert.deepEqual(r.body,{error:'INVALID_CREDENTIALS'});assert.equal(r.status,401);
});
test('login rejects extra role assignment, overlong body and query strings',async()=>{
 const x=fixture();
 const cases=[
  {method:'POST',url:'/auth21/login',headers:{'content-type':'application/json'},body:{clientId:'CL000001',password:'hello',role:'ADMIN'}},
  {method:'POST',url:'/auth21/login',headers:{'content-type':'application/json'},body:'{"clientId":"CL000001","password":"'+('A'.repeat(4500))+'"}'},
  {method:'POST',url:'/auth21/login?debug=1',headers:{'content-type':'application/json'},body:{clientId:'CL000001',password:'hello'}},
  {method:'POST',url:'/auth21/login',headers:{'content-type':'text/plain'},body:'{}'}
 ];
 const out=await Promise.all(cases.map(c=>send(x.handler,c)));
 assert.deepEqual(out.map(r=>r.status),[400,400,404,400]);
 assert.deepEqual(x.events,[]);
});
test('me requires strict bearer header and returns a minimal principal',async()=>{
 const x=fixture();
 for(const auth of [undefined,VALID_TOKEN,'Basic '+VALID_TOKEN,'Bearer  '+VALID_TOKEN]){
  const r=await send(x.handler,{headers:auth?{authorization:auth}:{}});
  assert.equal(r.status,401);
 }
 const r=await send(x.handler,{headers:{authorization:'Bearer '+VALID_TOKEN}});
 assert.equal(r.status,200);
 assert.deepEqual(r.body,{clientId:'CL000001',role:'USER',expiresAt:1900000000});
});
test('logout invalidates token and immediately makes me unauthorized',async()=>{
 const x=fixture();
 const headers={authorization:'Bearer '+VALID_TOKEN};
 const out=await send(x.handler,{method:'POST',url:'/auth21/logout',headers});
 assert.equal(out.status,200);assert.equal(out.body.ok,true);
 const next=await send(x.handler,{headers});assert.equal(next.status,401);
 const again=await send(x.handler,{method:'POST',url:'/auth21/logout',headers});
 assert.equal(again.status,401);
});
test('role spoofing through URL, body or cookie cannot reach account management',async()=>{
 const x=fixture();
 for(const url of ['/api/admin/status','/auth21/admin','/auth21/me?role=ADMIN','/auth21/../../api/admin']){
  const res=await send(x.handler,{method:'GET',url,headers:{cookie:'role=ADMIN',authorization:'Bearer '+VALID_TOKEN}});
  assert.equal(res.status,404);
 }
 assert.deepEqual(x.events,[]);
});
test('unexpected session storage failure returns generic unavailable without stack or secret',async()=>{
 const x=fixture();
 x.sessions.loginWithPassword=async()=>{throw Error('LEAK-FICTIONAL-DB-SECRET')};
 const r=await send(x.handler,{method:'POST',url:'/auth21/login',
  headers:{'content-type':'application/json'},body:{clientId:'CL000001',password:'correct-16-characters'}});
 assert.equal(r.status,503);assert.deepEqual(r.body,{error:'AUTH_UNAVAILABLE'});
});
test('snapshot write-freeze maps to temporary failure without issuing session',async()=>{
 const x=fixture();
 x.sessions.loginWithPassword=async()=>{throw Error('SNAPSHOT_WRITE_QUIESCED')};
 const r=await send(x.handler,{method:'POST',url:'/auth21/login',
  headers:{'content-type':'application/json'},body:{clientId:'CL000001',password:'correct-16-characters'}});
 assert.equal(r.status,503);assert.equal(r.body.error,'AUTH_UNAVAILABLE');
});
test('non-allowed HTTP method refuses with 405 and no state changes',async()=>{
 const x=fixture();const r=await send(x.handler,{method:'PUT',url:'/auth21/login'});
 assert.equal(r.status,405);assert.deepEqual(x.events,[]);
});

const {createIsolatedCoreGate}=require('../../Core/Clients/auth21_core_route_gate');
test('isolated Core gate denies all legacy routes even with legacy sid cookie',async()=>{
 const x=fixture(),gate=createIsolatedCoreGate({sessions:x.sessions});
 for(const url of ['/api/bootstrap','/api/setup','/api/login','/api/admin/session',
   '/api/bank/vaults','/api/session/change-password','/api/updates',
   '/communication/v1/ui/read','/api/health','/']){
  const r=await send(gate,{method:'GET',url,headers:{
   cookie:'sid=FAKE_SUPERADMIN;role=ADMIN',authorization:'Bearer '+VALID_TOKEN
  }});
  assert.equal(r.status,404,url);
  assert.deepEqual(r.body,{error:'NOT_FOUND'});
 }
 assert.deepEqual(x.events,[]);
});
test('isolated Core gate delegates only explicit auth21 endpoints to actual boundary',async()=>{
 const x=fixture(),gate=createIsolatedCoreGate({sessions:x.sessions});
 const r=await send(gate,{method:'POST',url:'/auth21/login',
  headers:{'content-type':'application/json'},body:{clientId:'CL000001',password:'correct-16-characters'}});
 assert.equal(r.status,200);
 assert.equal((await send(gate,{method:'GET',url:'/auth21/me',
  headers:{authorization:'Bearer '+r.body.token}})).status,200);
 assert.equal((await send(gate,{method:'POST',url:'/auth21/logout',
  headers:{authorization:'Bearer '+r.body.token}})).status,200);
 assert.equal((await send(gate,{method:'GET',url:'/auth21/me',
  headers:{authorization:'Bearer '+r.body.token}})).status,401);
});
test('isolated Core gate ignores fake ADMIN cookies and request parameters',async()=>{
 const x=fixture(),gate=createIsolatedCoreGate({sessions:x.sessions});
 for(const url of ['/auth21/admin','/api/bootstrap?authenticated=true',
   '/auth21/me?clientId=CL000001','/auth21/%2e%2e/api/bootstrap']){
  const r=await send(gate,{method:'GET',url,headers:{cookie:'sid=ADMIN;role=ADMIN'}});
  assert.equal(r.status,404,url);
 }
 assert.deepEqual(x.events,[]);
});

test('authenticated preference API never uses user-supplied clientId or forged role',async()=>{
 const x=fixture(),gate=createIsolatedCoreGate({sessions:x.sessions});
 const url='/auth21/preferences?scope=ui&key=theme';
 const head={authorization:'Bearer '+VALID_TOKEN,'content-type':'application/json',cookie:'role=ADMIN;clientId=CL999999'};
 assert.equal((await send(gate,{method:'GET',url})).status,401);
 assert.equal((await send(gate,{method:'PUT',url,headers:head,body:{value:'dark',clientId:'CL999999'}})).status,400);
 assert.equal((await send(gate,{method:'PUT',url,headers:head,body:{value:'dark'}})).status,200);
 assert.equal((await send(gate,{method:'GET',url,headers:head})).body.value,'dark');
 assert.equal((await send(gate,{method:'GET',url:url+'&clientId=CL999999',headers:head})).status,400);
 assert.equal((await send(gate,{method:'DELETE',url,headers:head})).status,200);
 assert.equal((await send(gate,{method:'GET',url,headers:head})).body.value,null);
});
test('GUEST preference mutations rejected before calling underlying storage',async()=>{
 const x=fixture(),gate=createIsolatedCoreGate({sessions:x.sessions});
 x.sessions.verifySession=()=>({clientId:'CL000001',role:'GUEST'});
 const url='/auth21/preferences?scope=ui&key=theme';
 const headers={authorization:'Bearer '+VALID_TOKEN,'content-type':'application/json'};
 assert.equal((await send(gate,{method:'PUT',url,headers,body:{value:'red'}})).status,403);
 assert.equal((await send(gate,{method:'DELETE',url,headers})).status,403);
 assert.equal((await send(gate,{method:'GET',url,headers})).status,200);
 assert.deepEqual(x.events,['read']);
});

test('unlock requires existing bearer and password; idle refresh is explicit',async()=>{
 const x=fixture(),gate=createIsolatedCoreGate({sessions:x.sessions});
 let locked=true;
 x.sessions.verifySession=()=>locked?null:{clientId:'CL000001',role:'USER'};
 x.sessions.recordUserActivity=()=>!locked;
 x.sessions.unlockWithPassword=async(token,pw)=>{
  if(token!==VALID_TOKEN||pw!=='correct-16-characters')return false;
  locked=false;return true;
 };
 const headers={authorization:'Bearer '+VALID_TOKEN,'content-type':'application/json'};
 assert.equal((await send(gate,{method:'POST',url:'/auth21/activity',headers})).status,401);
 assert.equal((await send(gate,{method:'POST',url:'/auth21/unlock',headers,body:{password:'wrong'}})).status,401);
 assert.equal((await send(gate,{method:'POST',url:'/auth21/unlock',headers,body:{password:'correct-16-characters',role:'ADMIN'}})).status,400);
 assert.equal((await send(gate,{method:'POST',url:'/auth21/unlock',headers,body:{password:'correct-16-characters'}})).status,200);
 assert.equal((await send(gate,{method:'POST',url:'/auth21/activity',headers})).status,200);
 assert.equal((await send(gate,{method:'GET',url:'/auth21/me',headers})).status,200);
});

test('login throttle refuses attempts after fifth bad password',async()=>{
 const x=fixture();let now=1000;
 const handler=createAuth21HttpHandler({sessions:x.sessions,nowMilliseconds:()=>now});
 const sendBad=()=>send(handler,{method:'POST',url:'/auth21/login',headers:{'content-type':'application/json'},body:{clientId:'CL000001',password:'WRONG'}});
 for(let i=0;i<5;i++)assert.equal((await sendBad()).status,401);
 assert.equal((await sendBad()).status,429);
 assert.equal(x.events.length,5);
 now+=300001;
 assert.equal((await sendBad()).status,401);
});

test('unlock password throttling blocks repeated guesses',async()=>{
 const x=fixture(),gate=createIsolatedCoreGate({sessions:x.sessions});
 x.sessions.unlockWithPassword=async()=>false;
 const headers={authorization:'Bearer '+VALID_TOKEN,'content-type':'application/json'};
 const ask=()=>send(gate,{method:'POST',url:'/auth21/unlock',headers,body:{password:'wrong'}});
 for(let i=0;i<5;i++)assert.equal((await ask()).status,401);
 assert.equal((await ask()).status,429);
});

test('browser Origin policy rejects cross-site requests and adds hardening headers',async()=>{
 const x=fixture(),handler=createAuth21HttpHandler({sessions:x.sessions,allowedBrowserOrigin:'http://127.0.0.1:8001'});
 const login=(origin)=>send(handler,{method:'POST',url:'/auth21/login',
  headers:{'content-type':'application/json',origin},
  body:{clientId:'CL000001',password:'correct-16-characters'}});
 const forbidden=await login('https://evil.example');
 assert.equal(forbidden.status,403);
 assert.equal(forbidden.body.error,'ORIGIN_FORBIDDEN');
 assert.equal(forbidden.headers['X-Frame-Options'],'DENY');
 assert.equal(forbidden.headers['Referrer-Policy'],'no-referrer');
 assert.deepEqual(x.events,[]);
 const approved=await login('http://127.0.0.1:8001');
 assert.equal(approved.status,200);
 assert.equal(approved.body.token,VALID_TOKEN);
 const defaultHandler=createAuth21HttpHandler({sessions:x.sessions});
 assert.equal((await send(defaultHandler,{headers:{origin:'http://127.0.0.1:8001'}})).status,403);
 assert.throws(()=>createAuth21HttpHandler({sessions:x.sessions,allowedBrowserOrigin:'https://evil.example/path'}),/AUTH21_BROWSER_ORIGIN_INVALID/);
});

test('TLS cookie mode sets HttpOnly Secure SameSite and refuses CSRF-less mutation',async()=>{
 const {createBrowserSession}=require('../../Core/Clients/auth21_browser_cookie');
 const browser=createBrowserSession({secret:Buffer.alloc(32,7),origin:'https://localhost:8443'});
 const x=fixture(),handler=createAuth21HttpHandler({sessions:x.sessions,browserSessions:browser,allowedBrowserOrigin:browser.origin});
 const run=async(opts)=>{
  const req=Readable.from(opts.body===undefined?[]:[Buffer.from(JSON.stringify(opts.body))]);
  req.url=opts.url;req.method=opts.method;req.headers={origin:browser.origin,...opts.headers};
  req.socket={encrypted:true};
  const res={writableEnded:false,writeHead(status,headers){this.status=status;this.headers=headers;return this},
   end(data){this.body=JSON.parse(data);this.writableEnded=true}};
  await handler(req,res);return res;
 };
 const login=await run({method:'POST',url:'/auth21/login',headers:{'content-type':'application/json'},
  body:{clientId:'CL000001',password:'correct-16-characters'}});
 assert.equal(login.status,200);
 assert.equal(Object.hasOwn(login.body,'token'),false);
 assert.match(login.headers['Set-Cookie'],/Secure; HttpOnly; SameSite=Strict/);
 const headers={cookie:login.headers['Set-Cookie'].split(';')[0]};
 assert.equal((await run({method:'GET',url:'/auth21/me',headers})).status,200);
 assert.equal((await run({method:'POST',url:'/auth21/logout',headers})).status,403);
 assert.equal((await run({method:'POST',url:'/auth21/logout',headers:{...headers,'x-iatb-csrf':login.body.csrfToken}})).status,200);
});

test('browser helper rejects insecure transport, duplicate cookies and altered CSRF',()=>{
 const {createBrowserSession}=require('../../Core/Clients/auth21_browser_cookie');
 const browser=createBrowserSession({secret:Buffer.alloc(32,5),origin:'https://localhost:8443'});
 const token=VALID_TOKEN;
 const cookie=browser.cookie(token).split(';')[0];
 const req={headers:{origin:'https://localhost:8443',cookie,'x-iatb-csrf':browser.csrf(token)},socket:{encrypted:true}};
 assert.equal(browser.originAllowed(req),true);
 assert.equal(browser.parse(req),token);
 assert.equal(browser.validate(req,token),true);
 assert.equal(browser.originAllowed({...req,socket:{encrypted:false}}),false);
 assert.equal(browser.originAllowed({...req,headers:{...req.headers,origin:'https://evil.example'}}),false);
 assert.equal(browser.parse({...req,headers:{...req.headers,cookie:cookie+'; '+cookie}}),null);
 assert.equal(browser.validate({...req,headers:{...req.headers,'x-iatb-csrf':'A'.repeat(43)}},token),false);
 assert.throws(()=>createBrowserSession({secret:Buffer.alloc(16),origin:'https://localhost:8443'}),/AUTH21_COOKIE_CONFIG_INVALID/);
});

test('isolated Core gate accepts opt-in TLS browser mode, not arbitrary cookie bearer',async()=>{
 const {createBrowserSession}=require('../../Core/Clients/auth21_browser_cookie');
 const browser=createBrowserSession({secret:Buffer.alloc(32,9),origin:'https://localhost:8443'});
 const x=fixture(),gate=createIsolatedCoreGate({sessions:x.sessions,browserSessions:browser,allowedBrowserOrigin:browser.origin});
 const req=Readable.from([Buffer.from(JSON.stringify({clientId:'CL000001',password:'correct-16-characters'}))]);
 req.url='/auth21/login';req.method='POST';req.headers={origin:browser.origin,'content-type':'application/json'};req.socket={encrypted:true};
 const res={writableEnded:false,writeHead(status,headers){this.status=status;this.headers=headers;return this},end(data){this.body=JSON.parse(data);this.writableEnded=true}};
 await gate(req,res);
 assert.equal(res.status,200);
 assert.equal(Object.hasOwn(res.body,'token'),false);
 assert.match(res.headers['Set-Cookie'],/^__Host-iatb21=/);
});

test('Core issues Router handshake proof only with authenticated bearer in explicit IPC trial',async()=>{
 const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
 const codec=proofCodec({secret:Buffer.alloc(32,2)});
 const x=fixture(),handler=createAuth21HttpHandler({sessions:x.sessions,ipcCodec:codec});
 const req=(headers={})=>send(handler,{method:'POST',url:'/auth21/ipc/probe-proof',headers});
 assert.equal((await req()).status,401);
 const valid=await req({authorization:'Bearer '+VALID_TOKEN});
 assert.equal(valid.status,200);
 assert.equal(typeof valid.body.proof,'string');
 const decoded=codec.verify(valid.body.proof,{audience:'router',operation:'shared.read',method:'GET'});
 assert.equal(decoded.clientId,'CL000001');
 assert.equal(codec.verify(valid.body.proof,{audience:'router',operation:'shared.read',method:'GET'}),null);
 assert.equal((await send(x.handler,{method:'POST',url:'/auth21/ipc/probe-proof',headers:{authorization:'Bearer '+VALID_TOKEN}})).status,404);
});
