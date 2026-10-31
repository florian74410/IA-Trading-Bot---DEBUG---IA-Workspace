'use strict';
/* End-to-end isolated stack: real SQLite v3 account, Core TLS session,
 * actual HTTPS Gateway, real Router, real Indicator + SQLite settings.
 * No live database/exchange/network provider/GEN-1.
 */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const https=require('node:https'),crypto=require('node:crypto');
const {execFileSync,spawn}=require('node:child_process');
const {once}=require('node:events'),net=require('node:net');
const {setTimeout:delay}=require('node:timers/promises');
const Database=require('better-sqlite3');
const ClientCrypto=require('../../Core/Clients/client_crypto');
const {migrateFixture}=require('../CI/auth21_v3_migration_trial');
const {Auth21FirstAdminTrial}=require('../../Core/Clients/auth21_first_admin_trial');
const APP=path.resolve(__dirname,'../..');
async function freePort(){
 const server=net.createServer();server.listen(0,'127.0.0.1');
 await once(server,'listening');const port=server.address().port;
 await new Promise(resolve=>server.close(resolve));return port;
}
async function request(port,method,route,body=null,headers={}){
 const raw=body===null?'':JSON.stringify(body);
 return new Promise((resolve,reject)=>{
  const q=https.request({host:'127.0.0.1',port,method,path:route,
    rejectUnauthorized:false,timeout:2000,
    headers:{Origin:headers.Origin||'https://localhost:'+port,
     'Content-Length':Buffer.byteLength(raw),
     ...(body===null?{}:{'Content-Type':'application/json'}),...headers}},res=>{
   let text='';res.on('data',x=>text+=x);res.on('end',()=>{
    let obj=null;try{obj=JSON.parse(text)}catch(_){}
    resolve({status:res.statusCode,json:obj,body:text,cookies:res.headers['set-cookie']||[]});
   });
  });q.on('error',reject);q.on('timeout',()=>q.destroy(Error('AUTH21_REQUEST_TIMEOUT')));q.end(raw);
 });
}
test('full genuine HTTPS Gateway -> Core SQLite v3 ADMIN -> Router -> Indicator guarded SQLite',
 {timeout:80000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 const migration=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-v3-'));
 fs.chmodSync(root,0o700);fs.chmodSync(migration,0o700);
 const children=[];
 t.after(async()=>{
  for(const child of children){
   if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit');}
  }
  fs.rmSync(root,{recursive:true,force:true});
  fs.rmSync(migration,{recursive:true,force:true});
 });
 // Explicit fictitious ADMIN built through the production v3 KDF and schema.
 const tempDb=path.join(migration,'test.sqlite'),tempKey=path.join(migration,'client_master.key');
 const cipher=new ClientCrypto(tempKey,{clientDbPath:tempDb});
 const db=new Database(tempDb);
 db.pragma('foreign_keys=ON');
 for(const name of ['001_clients_v1.sql','002_client_accounts_v1.sql']){
  db.exec(fs.readFileSync(path.join(APP,'Core','Clients','migrations',name),'utf8'));
 }
 await migrateFixture(db,{fixtureRoot:migration});
 const manager=new Auth21FirstAdminTrial({db,fixtureRoot:migration,clientCrypto:cipher,
  authorizeLocalOperator:()=>true});
 const password='FICTIONAL_ONLY_TEST_PASSWORD_2026!';
 const created=await manager.createFirstAdmin({
  identity:{firstName:'Fixture',lastName:'Auth',email:'fixture@example.invalid'},
  username:'TEST_ADMIN',password,confirmation:'CREATE FIRST ADMIN ON FIXTURE'});
 assert.equal(created.role,'ADMIN');
 db.close();
 const app=path.join(root,'App');
 fs.cpSync(APP,app,{recursive:true,filter:src=>!path.relative(APP,src).split(path.sep).some(x=>
  ['node_modules','.runtime','Data','Logs'].includes(x))});
 fs.symlinkSync(path.join(APP,'node_modules'),path.join(app,'node_modules'),'dir');
 fs.writeFileSync(path.join(root,'.iatb-auth21-core-local-trial'),
  'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n',{mode:0o600});
 const security=path.join(root,'userdata','Security'),
  database=path.join(root,'userdata','Database');
 fs.mkdirSync(security,{recursive:true,mode:0o700});
 fs.mkdirSync(database,{recursive:true,mode:0o700});
 fs.copyFileSync(tempDb,path.join(database,'clients.sqlite'));
 fs.copyFileSync(tempKey,path.join(security,'client_master.key'));
 fs.chmodSync(path.join(database,'clients.sqlite'),0o600);
 fs.chmodSync(path.join(security,'client_master.key'),0o600);
 fs.writeFileSync(path.join(security,'auth21_ipc.key'),crypto.randomBytes(32),{mode:0o600});
 const cert=path.join(security,'auth21_browser_tls.crt'),key=path.join(security,'auth21_browser_tls.key');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
  '-subj','/CN=localhost','-keyout',key,'-out',cert],{stdio:'ignore'});
 fs.chmodSync(key,0o600);fs.chmodSync(cert,0o600);
 const corePort=await freePort(),uiPort=await freePort(),
  routerPort=await freePort(),indicatorPort=await freePort();
 const env={...process.env,
  IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',
  IATB_AUTH21_BROWSER_TRIAL:'1',IATB_AUTH21_BUSINESS_TRIAL:'1',
  IATB_AUTH21_IPC_PROBE_TRIAL:'1',IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',
  IATB_TRADING_LIVE:'0',IATB_AUTH21_LOCAL_TRIAL_ROOT:root,
  IATB_AUTH21_BROWSER_ORIGIN:'https://localhost:'+uiPort,
  IATB_PORT:String(corePort),CORE_PUBLIC_PORT:String(corePort),
  IATB_UI_PORT:String(uiPort),ROUTER_PORT:String(routerPort),
  IATB_INDICATOR_PORT:String(indicatorPort),IATB_USERDATA_USER:'fixture'};
 for(const [k,sub] of [['RUNTIME','runtime'],['DATA','userdata'],
 ['ANNEX','annexes'],['UPDATES','updates'],['STATE','legacy']])
  env['IATB_'+k+'_ROOT']=path.join(root,sub);
 delete env.IATB_USER_DB;
 const logs=new Map();
 function start(name,relative){
  const child=spawn(process.execPath,[path.join(app,relative)],
   {cwd:app,env,stdio:['ignore','pipe','pipe']});
  logs.set(name,'');child.stdout.on('data',x=>logs.set(name,logs.get(name)+x));
  child.stderr.on('data',x=>logs.set(name,logs.get(name)+x));
  children.push(child);return child;
 }
 async function ready(name,child,port,secure){
  let live=false;
  for(let i=0;i<150;i++){
   if(child.exitCode!==null)assert.fail(name+' died: '+logs.get(name));
   try{
    if(secure){const r=await request(port,'GET','/auth21/me');live=[401,403].includes(r.status);}
    else{
     live=await new Promise((resolve,reject)=>{
      const q=require('node:http').get({host:'127.0.0.1',port,path:'/health'},r=>{
       r.resume();resolve([403,404].includes(r.statusCode));
      });q.on('error',reject);});
    }
   }catch(_){}
   if(live)break;await delay(70);
  }
  assert.ok(live,name+' never listened: '+logs.get(name));
 }
 const core=start('core','Core/Server/server.js');
 await ready('core',core,corePort,true);
 const indicator=start('indicator','Indicators/Engine/indicator_service.js');
 await ready('indicator',indicator,indicatorPort,false);
 const router=start('router','Core/Router/router.js');
 await ready('router',router,routerPort,false);
 const gateway=start('gateway','UI/Gateway/ui_service.js');
 await ready('gateway',gateway,uiPort,true);
 const login=await request(uiPort,'POST','/auth21/login',
  {clientId:created.clientId,password},{Origin:'https://localhost:'+uiPort});
 assert.equal(login.status,200,login.body);
 assert.equal(login.json.role,'ADMIN');
 assert.equal(login.json.token,undefined);
 const cookie=login.cookies[0].split(';')[0],csrf=login.json.csrfToken;
 const operation='/auth21/business/indicator/settings',
  headers={Cookie:cookie,'X-IATB-CSRF':csrf,Origin:'https://localhost:'+uiPort};
 assert.equal((await request(uiPort,'POST',operation,{enabled:true,refreshMs:5000},
  {Cookie:cookie,Origin:headers.Origin})).status,403);
 const allowed=await request(uiPort,'POST',operation,{enabled:true,refreshMs:5000},headers);
 assert.equal(allowed.status,200,allowed.body);
 const stored=path.join(root,'userdata','User Data','fixture','user_data.db');
 const setting=new Database(stored,{readonly:true,fileMustExist:true});
 try{
  const row=setting.prepare("SELECT value_b64 FROM iatb_settings_v2 WHERE scope='indicator_engine' AND key='settings'").get();
  assert.equal(JSON.parse(Buffer.from(row.value_b64,'base64').toString('utf8')).refreshMs,5000);
 }finally{setting.close();}
 assert.equal((await request(uiPort,'POST','/auth21/business/trading/order',{},headers)).status,404);
 // Lock survives page reload, state yields no principal and no business grant.
 assert.equal((await request(uiPort,'POST','/auth21/lock',{}, {Cookie:cookie,Origin:headers.Origin})).status,403);
 assert.equal((await request(uiPort,'POST','/auth21/lock',{},headers)).status,200);
 assert.equal((await request(uiPort,'GET','/auth21/me',null,headers)).status,401);
 const locked=await request(uiPort,'GET','/auth21/state',null,headers);
 assert.equal(locked.status,200);assert.equal(locked.json.locked,true);
 assert.equal(locked.json.clientId,undefined);assert.equal(locked.json.token,undefined);
 assert.equal(locked.json.csrfToken,csrf);
 assert.equal((await request(uiPort,'POST',operation,{enabled:true,refreshMs:15000},headers)).status,403);
 assert.equal((await request(uiPort,'POST','/auth21/unlock',{password:'incorrect'},headers)).status,401);
 assert.equal((await request(uiPort,'POST','/auth21/unlock',{password},headers)).status,200);
 assert.equal((await request(uiPort,'GET','/auth21/me',null,headers)).status,200);
 assert.equal((await request(uiPort,'POST','/auth21/lock',{},headers)).status,200);
 assert.equal((await request(uiPort,'POST','/auth21/logout',{},headers)).status,200);
 assert.equal((await request(uiPort,'POST',operation,{enabled:true,refreshMs:5000},headers)).status,403);
});
