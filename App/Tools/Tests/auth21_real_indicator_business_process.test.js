'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto'),http=require('node:http'),net=require('node:net');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {setTimeout:delay}=require('node:timers/promises');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const {createCoreBusinessIssuer}=require('../../Core/Clients/auth21_core_business_issuer');
const APP=path.resolve(__dirname,'../..');
async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(ok=>s.close(ok));return port;}
async function call(port,method,target,raw='',headers={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,method,path:target,timeout:1200,
   headers:{'Content-Length':Buffer.byteLength(raw),...headers},agent:false},res=>{
    let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}));
   });
  req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TIMEOUT')));req.end(raw);
 });
}
test('genuine Indicator Engine permits only Core-signed fixture settings write', {timeout:30000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);
 const app=path.join(root,'App');
 fs.cpSync(APP,app,{recursive:true,filter:src=>!path.relative(APP,src).split(path.sep).some(x=>['node_modules','.runtime','Data','Logs'].includes(x))});
 fs.symlinkSync(path.join(APP,'node_modules'),path.join(app,'node_modules'),'dir');
 fs.writeFileSync(path.join(root,'.iatb-auth21-core-local-trial'),'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n',{mode:0o600});
 const secure=path.join(root,'userdata','Security');fs.mkdirSync(secure,{recursive:true,mode:0o700});
 const secret=crypto.randomBytes(32);fs.writeFileSync(path.join(secure,'auth21_ipc.key'),secret,{mode:0o600});
 const port=await freePort(),routerPort=await freePort();
 const env={...process.env,IATB_AUTH21_CORE_AUTH_TRIAL:'1',
  IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_AUTH21_BUSINESS_TRIAL:'1',
  IATB_AUTH21_IPC_PROBE_TRIAL:'1',IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',
  IATB_AUTH21_LOCAL_TRIAL_ROOT:root,IATB_TRADING_LIVE:'0',
  IATB_INDICATOR_PORT:String(port),ROUTER_PORT:String(routerPort)};
 for(const [key,dir] of [['RUNTIME','runtime'],['DATA','userdata'],
  ['ANNEX','annexes'],['UPDATES','updates'],['STATE','legacy']])env['IATB_'+key+'_ROOT']=path.join(root,dir);
 delete env.IATB_USER_DB;
 const child=spawn(process.execPath,[path.join(app,'Indicators/Engine/indicator_service.js')],
  {cwd:app,env,stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 t.after(async()=>{
  if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit');}
  fs.rmSync(root,{recursive:true,force:true});
 });
 let ready=false;
 for(let i=0;i<120;i++){
  if(child.exitCode!==null)assert.fail('INDICATOR_EXIT: '+logs);
  try{ready=(await call(port,'GET','/health')).status===403;}catch(_){}
  if(ready)break;await delay(50);
 }
 assert.equal(ready,true,'INDICATOR_NOT_READY: '+logs);
 const sessions={verifySession:token=>token==='admin'?{clientId:'CLAlice',role:'ADMIN'}:
  token==='user'?{clientId:'CLBob',role:'USER'}:null};
 const issuer=createCoreBusinessIssuer({sessions,codec:proofCodec({secret}),env});
 const data=JSON.stringify({enabled:false,refreshMs:15000});
 const digest=crypto.createHash('sha256').update(data).digest('hex');
 const issue=token=>issuer.issueForService({token,action:'indicator.settings.set',bodyDigest:digest});
 const route='/auth21/business/indicator/settings';
 assert.equal(issue('user'),null);
 assert.equal((await call(port,'POST',route,data,{'X-Client-Id':'CLAlice','X-IATB-Role':'ADMIN'})).status,403);
 assert.equal((await call(port,'POST',route,data,{'X-IATB-Auth21-Proof':issue('admin'),Origin:'https://external.example'})).status,403);
 const proof=issue('admin');
 const accepted=await call(port,'POST',route,data,{'X-IATB-Auth21-Proof':proof});
 assert.equal(accepted.status,200,accepted.body);
 assert.equal((await call(port,'POST',route,data,{'X-IATB-Auth21-Proof':proof})).status,403);
 const indicatorDb=path.join(root,'userdata','User Data','fixture','user_data.db');
 function indicatorRefresh(){
  const Database=require('better-sqlite3');
  const db=new Database(indicatorDb,{readonly:true,fileMustExist:true});
  try{
   const row=db.prepare("SELECT value_b64 FROM iatb_settings_v2 WHERE scope='indicator_engine' AND key='settings'").get();
   return JSON.parse(Buffer.from(row.value_b64,'base64').toString('utf8')).refreshMs;
  }finally{db.close();}
 }
 assert.equal(indicatorRefresh(),15000);

 assert.equal((await call(port,'POST','/cp/v1',data,{'X-IATB-Auth21-Proof':issue('admin')})).status,403);
 assert.equal((await call(port,'GET','/health')).status,403);

 const {createCoreBusinessHttp}=require('../../Core/Clients/auth21_core_business_http');
 const businessRouterPort=await freePort();
 const routerEnv={...env,ROUTER_PORT:String(businessRouterPort),IATB_INDICATOR_PORT:String(port)};
 const router=spawn(process.execPath,[path.join(app,'Core/Router/router.js')],
  {cwd:app,env:routerEnv,stdio:['ignore','pipe','pipe']});
 let routerLog='';router.stdout.on('data',x=>routerLog+=x);
 router.stderr.on('data',x=>routerLog+=x);
 t.after(async()=>{if(router.exitCode===null&&router.signalCode===null){router.kill('SIGKILL');await once(router,'exit');}});
 let routerReady=false;
 for(let i=0;i<120;i++){
  if(router.exitCode!==null)assert.fail('ROUTER_EXIT: '+routerLog);
  try{routerReady=(await call(businessRouterPort,'GET','/router-health')).status===404;}catch(_){}
  if(routerReady)break;await delay(50);
 }
 assert.equal(routerReady,true,'ROUTER_NOT_READY: '+routerLog);
 const bearer='A'.repeat(43),userBearer='B'.repeat(43);
 const coreSessions={verifySession:t=>t===bearer?{clientId:'CLAlice',role:'ADMIN'}:
  t===userBearer?{clientId:'CLBob',role:'USER'}:null};
 const core=http.createServer(createCoreBusinessHttp({sessions:coreSessions,
  codec:proofCodec({secret}),routerPort:businessRouterPort,env}));
 core.listen(0,'127.0.0.1');await once(core,'listening');
 t.after(()=>new Promise(resolve=>core.close(resolve)));
 const corePort=core.address().port;
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+bearer};
 const userHeaders={'Content-Type':'application/json',Authorization:'Bearer '+userBearer};
 assert.equal((await call(corePort,'POST',route,data,userHeaders)).status,403);
 assert.equal((await call(corePort,'POST',route,data,{'Content-Type':'application/json'})).status,401);
 assert.equal((await call(corePort,'POST',route,data,{...headers,Origin:'https://attacker.example'})).status,403);
 const committed=await call(corePort,'POST',route,data,headers);
 assert.equal(committed.status,200,committed.body);
 assert.equal(indicatorRefresh(),15000);

 const uiPort=await freePort();
 const ui=spawn(process.execPath,[path.join(app,'UI/Gateway/ui_service.js')],
  {cwd:app,env:{...env,IATB_UI_PORT:String(uiPort),CORE_PUBLIC_PORT:String(corePort),
   ROUTER_PORT:String(businessRouterPort)},stdio:['ignore','pipe','pipe']});
 let uiLog='';ui.stdout.on('data',x=>uiLog+=x);ui.stderr.on('data',x=>uiLog+=x);
 t.after(async()=>{if(ui.exitCode===null&&ui.signalCode===null){ui.kill('SIGKILL');await once(ui,'exit');}});
 let uiReady=false;
 for(let i=0;i<120;i++){
  if(ui.exitCode!==null)assert.fail('GATEWAY_EXIT: '+uiLog);
  try{uiReady=(await call(uiPort,'GET','/ui-health')).status===404;}catch(_){}
  if(uiReady)break;await delay(50);
 }
 assert.equal(uiReady,true,'GATEWAY_NOT_READY: '+uiLog);
 assert.equal((await call(uiPort,'POST',route,data,userHeaders)).status,403);
 const uiAccepted=await call(uiPort,'POST',route,data,headers);
 assert.equal(uiAccepted.status,200,uiAccepted.body);
 assert.equal((await call(uiPort,'POST',route,data,{...headers,Origin:'https://evil.example'})).status,403);
 assert.equal((await call(uiPort,'POST','/communication/v1/ui/write',data,headers)).status,404);

});
