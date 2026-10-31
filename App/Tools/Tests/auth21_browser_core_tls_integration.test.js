'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const https=require('node:https'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {once}=require('node:events'),crypto=require('node:crypto');
const {createIsolatedCoreGate}=require('../../Core/Clients/auth21_core_route_gate');
const {createBrowserSession}=require('../../Core/Clients/auth21_browser_cookie');
test('real TLS Core cookie authenticates and CSRF-gates mutations; HTTP never authenticates',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-browser-tls-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const key=path.join(root,'tls.key'),crt=path.join(root,'tls.crt');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
  '-subj','/CN=localhost','-keyout',key,'-out',crt],{stdio:'ignore'});
 const token=crypto.randomBytes(32).toString('base64url');
 let revoked=false,preferences=0;
 const sessions={
  loginWithPassword:async(id,password)=>id==='CLAlice'&&password==='synthetic'?{
   token,clientId:id,role:'ADMIN',expiresAt:1900000000}:null,
  verifySession:value=>value===token&&!revoked?{clientId:'CLAlice',role:'ADMIN',expiresAt:1900000000}:null,
  revokeSession:value=>{if(value!==token)return false;revoked=true;return true;},
  getPreference:()=>null,setPreference:()=>{preferences++},
  deletePreference:()=>{},recordUserActivity:()=>true
 };
 const origin='https://localhost:34567';
 const browser=createBrowserSession({origin,secret:crypto.randomBytes(32)});
 const handler=createIsolatedCoreGate({sessions,browserSessions:browser,allowedBrowserOrigin:origin});
 const secure=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(crt)},handler);
 secure.listen(0,'127.0.0.1');await once(secure,'listening');
 t.after(()=>new Promise(resolve=>secure.close(resolve)));
 const plain=http.createServer(handler);plain.listen(0,'127.0.0.1');await once(plain,'listening');
 t.after(()=>new Promise(resolve=>plain.close(resolve)));
 async function call(server,secureTransport,route,method,body,headers={}){
  const raw=body===null?'':JSON.stringify(body);
  return new Promise((resolve,reject)=>{
   const request=(secureTransport?https:http).request({host:'127.0.0.1',
    port:server.address().port,path:route,method,rejectUnauthorized:false,
    headers:{Origin:origin,...(body===null?{}:{'Content-Type':'application/json'}),
     'Content-Length':Buffer.byteLength(raw),...headers}},res=>{
     let data='';res.on('data',x=>data+=x);res.on('end',()=>resolve({
      status:res.statusCode,body:JSON.parse(data),cookies:res.headers['set-cookie']||[]}));
    });request.on('error',reject);request.end(raw);
  });
 }
 const login=await call(secure,true,'/auth21/login','POST',{clientId:'CLAlice',password:'synthetic'});
 assert.equal(login.status,200);
 assert.equal(login.body.token,undefined);
 assert.match(login.cookies[0],/__Host-iatb21=.*Secure; HttpOnly; SameSite=Strict/);
 const cookie=login.cookies[0].split(';')[0],csrf=login.body.csrfToken;
 assert.equal((await call(plain,false,'/auth21/me','GET',null,{Cookie:cookie})).status,403);
 assert.equal((await call(secure,true,'/auth21/preferences?scope=ui&key=theme','PUT',
  {value:'dark'},{Cookie:cookie})).status,403);
 assert.equal((await call(secure,true,'/auth21/preferences?scope=ui&key=theme','PUT',
  {value:'dark'},{Cookie:cookie,'X-IATB-CSRF':csrf})).status,200);
 assert.equal(preferences,1);
 assert.equal((await call(secure,true,'/auth21/logout','POST',{},
  {Cookie:cookie,'X-IATB-CSRF':csrf})).status,200);
 assert.equal((await call(secure,true,'/auth21/me','GET',null,{Cookie:cookie})).status,401);
});
