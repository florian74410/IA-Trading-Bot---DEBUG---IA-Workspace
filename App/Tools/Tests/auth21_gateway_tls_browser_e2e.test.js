'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const https=require('node:https'),http=require('node:http');
const {spawn,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const {setTimeout:delay}=require('node:timers/promises');
const {createIsolatedCoreGate}=require('../../Core/Clients/auth21_core_route_gate');
const {createBrowserSession}=require('../../Core/Clients/auth21_browser_cookie');
const {createCoreBusinessHttp}=require('../../Core/Clients/auth21_core_business_http');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const business=require('../../Core/Clients/auth21_business_capability');
const {createServer:netServer}=require('node:net');
const APP=path.resolve(__dirname,'../..');
async function port(){const s=netServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(ok=>s.close(ok));return p;}
test('real Gateway HTTPS proxies secure cookie login and CSRF through pinned HTTPS Core without HTTP downgrade',
 {timeout:30000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'.iatb-auth21-core-local-trial'),'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n',{mode:0o600});
 const dir=path.join(root,'userdata','Security');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const key=path.join(dir,'auth21_browser_tls.key'),crt=path.join(dir,'auth21_browser_tls.crt');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
 '-subj','/CN=localhost','-keyout',key,'-out',crt],{stdio:'ignore'});
 fs.chmodSync(key,0o600);fs.chmodSync(crt,0o600);
 const corePort=await port(),uiPort=await port(),origin='https://localhost:'+uiPort;
 const sessToken=crypto.randomBytes(32).toString('base64url');let loggedOut=false,updated=0;
 const sessions={
  loginWithPassword:async(clientId,password)=>clientId==='CLAlice'&&password==='test'?{
   token:sessToken,role:'ADMIN',clientId,expiresAt:1999999999}:null,
  verifySession:token=>token===sessToken&&!loggedOut?{clientId:'CLAlice',role:'ADMIN',expiresAt:1999999999}:null,
  revokeSession:token=>{if(token!==sessToken)return false;loggedOut=true;return true;},
  getPreference:()=>null,setPreference:()=>{updated++},
  deletePreference:()=>{},recordUserActivity:()=>true
 };
 const browser=createBrowserSession({secret:crypto.randomBytes(32),origin});
 const secret=crypto.randomBytes(32),codec=proofCodec({secret});
 const routerPort=await port();
 const router=http.createServer((req,res)=>{
  let parts=[];req.on('data',x=>parts.push(x));req.on('end',()=>{
   const raw=Buffer.concat(parts);
   const proof=req.headers['x-iatb-auth21-proof'];
   const result=business.verify({codec:proofCodec({secret}),proof,
    action:'indicator.settings.set',
    bodyDigest:crypto.createHash('sha256').update(raw).digest('hex')});
   res.writeHead(result.allowed?200:403,{'Content-Type':'application/json'});
   res.end(JSON.stringify(result.allowed?{ok:true}:{error:'DENIED'}));
  });
 });
 router.listen(routerPort,'127.0.0.1');await once(router,'listening');
 t.after(()=>new Promise(resolve=>router.close(resolve)));
 const businessHttp=createCoreBusinessHttp({sessions,codec,routerPort,
  env:{IATB_AUTH21_BUSINESS_TRIAL:'1',IATB_AUTH21_IPC_PROBE_TRIAL:'1',IATB_TRADING_LIVE:'0',
   IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_DEBUG_MODE:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1'},
  browserSessions:browser});
 const handler=createIsolatedCoreGate({sessions,
  browserSessions:browser,allowedBrowserOrigin:origin,coreBusiness:businessHttp});
 const core=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(crt)},handler);
 core.listen(corePort,'127.0.0.1');await once(core,'listening');
 t.after(()=>new Promise(resolve=>core.close(resolve)));
 const env={...process.env,IATB_UI_PORT:String(uiPort),CORE_PUBLIC_PORT:String(corePort),
  IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',
  IATB_AUTH21_BROWSER_TRIAL:'1',IATB_AUTH21_BUSINESS_TRIAL:'1',
  IATB_AUTH21_IPC_PROBE_TRIAL:'1',IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',
  IATB_AUTH21_LOCAL_TRIAL_ROOT:root,IATB_TRADING_LIVE:'0'};
 for(const [k,sub] of [['RUNTIME','runtime'],['DATA','userdata'],
 ['ANNEX','annexes'],['UPDATES','updates'],['STATE','legacy']])
 env['IATB_'+k+'_ROOT']=path.join(root,sub);
 delete env.IATB_USER_DB;
 const gateway=spawn(process.execPath,[path.join(APP,'UI/Gateway/ui_service.js')],
  {cwd:APP,env,stdio:['ignore','pipe','pipe']});
 let logs='';gateway.stdout.on('data',x=>logs+=x);gateway.stderr.on('data',x=>logs+=x);
 t.after(async()=>{if(gateway.exitCode===null&&gateway.signalCode===null){
  gateway.kill('SIGKILL');await once(gateway,'exit');}});
 const get=async(route,method,body=null,extra={})=>new Promise((resolve,reject)=>{
  const raw=body===null?'':JSON.stringify(body);
  const q=https.request({host:'127.0.0.1',port:uiPort,path:route,method,
   rejectUnauthorized:false,headers:{Origin:origin,'Content-Length':Buffer.byteLength(raw),
   ...(body===null?{}:{'Content-Type':'application/json'}),...extra}},r=>{
    let data='';r.on('data',x=>data+=x);r.on('end',()=>resolve({
      status:r.statusCode,json:(()=>{try{return JSON.parse(data)}catch(_){return null}})(),
      text:data,headers:r.headers,cookies:r.headers['set-cookie']||[]}));
  });q.on('error',reject);q.end(raw);
 });
 let ready=false;
 for(let i=0;i<100;i++){
  if(gateway.exitCode!==null)assert.fail('GATEWAY_EXIT: '+logs);
  try{ready=(await get('/auth21/me','GET')).status===401;}catch(_){}
  if(ready)break;await delay(50);
 }
 assert.ok(ready,'Gateway not ready: '+logs);
 const page=await get('/','GET');
 assert.equal(page.status,200);assert.match(page.text,/Centre de session/);
 assert.match(page.headers['content-security-policy'],/script-src 'self'/);
 assert.equal((await get('/auth21/ui.js','GET')).status,200);
 const login=await get('/auth21/login','POST',{clientId:'CLAlice',password:'test'});
 assert.equal(login.status,200,JSON.stringify(login.json));
 assert.equal(login.json.token,undefined);
 const cookie=login.cookies[0].split(';')[0],csrf=login.json.csrfToken;
 const refreshed=await get('/auth21/csrf','GET',null,{Cookie:cookie});
 assert.equal(refreshed.status,200);assert.equal(refreshed.json.csrfToken,csrf);
 assert.match(login.cookies[0],/Secure; HttpOnly; SameSite=Strict/);
 assert.equal((await get('/auth21/preferences?scope=ui&key=theme','PUT',
  {value:'dark'},{Cookie:cookie})).status,403);
 assert.equal((await get('/auth21/preferences?scope=ui&key=theme','PUT',
  {value:'dark'},{Cookie:cookie,'X-IATB-CSRF':csrf})).status,200);
 assert.equal(updated,1);
 const mutation='/auth21/business/indicator/settings';
 assert.equal((await get(mutation,'POST',{enabled:true,refreshMs:5000},
  {Cookie:cookie})).status,403);
 assert.equal((await get(mutation,'POST',{enabled:true,refreshMs:5000},
  {Cookie:cookie,'X-IATB-CSRF':csrf})).status,200);

 assert.equal((await get('/api/setup','POST',{})).status,404);
 assert.equal((await get('/auth21/logout','POST',{},{
  Cookie:cookie,'X-IATB-CSRF':csrf})).status,200);
 assert.equal((await get('/auth21/me','GET',null,{Cookie:cookie})).status,401);
});
