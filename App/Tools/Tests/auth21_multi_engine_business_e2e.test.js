'use strict';
/* Real Gateway, Router and four actual Engines; Core is an isolated session
 * fixture. No live account, wallet, external exchange or GEN-1 access.
 */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const http=require('node:http'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {setTimeout:delay}=require('node:timers/promises');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const {createCoreBusinessHttp}=require('../../Core/Clients/auth21_core_business_http');
const APP=path.resolve(__dirname,'../..');
const ENGINES=[
 ['marketdata','MarketData/market_data_service.js','IATB_MARKET_DATA_PORT'],
 ['fundamental','Fundamental/Engine/fundamental_service.js','IATB_FUNDAMENTAL_PORT'],
 ['portfolio','Portfolio/Engine/portfolio_service.js','IATB_PORTFOLIO_PORT'],
 ['strategy','Strategy/Engine/strategy_service.js','IATB_STRATEGY_PORT']
];
const allocatedPorts=new Set();
async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(ok=>s.close(ok));if(allocatedPorts.has(p))return freePort();allocatedPorts.add(p);return p;}
async function call(port,method,route,raw='',headers={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,path:route,method,timeout:1500,agent:false,
   headers:{'Content-Length':Buffer.byteLength(raw),...headers}},res=>{
    let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body}));
   });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TIMEOUT')));req.end(raw);
 });
}
test('real four Engine business actions honor roles, ownership and deny all old ingress',
 {timeout:70000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);
 const app=path.join(root,'App');
 fs.cpSync(APP,app,{recursive:true,filter:src=>!path.relative(APP,src).split(path.sep).some(x=>['node_modules','.runtime','Data','Logs'].includes(x))});
 fs.symlinkSync(path.join(APP,'node_modules'),path.join(app,'node_modules'),'dir');
 fs.writeFileSync(path.join(root,'.iatb-auth21-core-local-trial'),'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n',{mode:0o600});
 const security=path.join(root,'userdata','Security');fs.mkdirSync(security,{recursive:true,mode:0o700});
 const secret=crypto.randomBytes(32);
 fs.writeFileSync(path.join(security,'auth21_ipc.key'),secret,{mode:0o600});
 const ports={};for(const [engine] of ENGINES)ports[engine]=await freePort();
 const routerPort=await freePort(),corePort=await freePort(),uiPort=await freePort();
 const env={...process.env,IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',
  IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',
  IATB_AUTH21_BUSINESS_TRIAL:'1',IATB_AUTH21_IPC_PROBE_TRIAL:'1',
  IATB_AUTH21_SNAPSHOT_IPC_TRIAL:'1',IATB_AUTH21_LOCAL_TRIAL_ROOT:root,
  IATB_TRADING_LIVE:'0',IATB_MARKETDATA_OFFLINE_DIAGNOSTIC:'1',
  IATB_FUNDAMENTAL_STDOUT:'1',IATB_USERDATA_USER:'fixture',
  ROUTER_PORT:String(routerPort),CORE_PUBLIC_PORT:String(corePort),
  IATB_UI_PORT:String(uiPort),
  IATB_PORTFOLIO_DB:path.join(root,'userdata','User Data','fixture','portfolio.db'),
  IATB_MARKET_SETTINGS:path.join(root,'runtime','config','market_data_settings.json')};
 for(const [key,sub] of [['RUNTIME','runtime'],['DATA','userdata'],['ANNEX','annexes'],
  ['UPDATES','updates'],['STATE','legacy']])env['IATB_'+key+'_ROOT']=path.join(root,sub);
 for(const [engine,,key] of ENGINES)env[key]=String(ports[engine]);
 delete env.IATB_USER_DB;
 const children=[],outputs=new Map(),servers=[];
 t.after(async()=>{
  for(const child of children)if(child.exitCode===null&&child.signalCode===null){
   child.kill('SIGKILL');await once(child,'exit');
  }
  for(const server of servers)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(root,{recursive:true,force:true});
 });
 function run(name,script){
  const child=spawn(process.execPath,[path.join(app,script)],
   {cwd:app,env,stdio:['ignore','pipe','pipe']});
  children.push(child);outputs.set(name,'');
  child.stdout.on('data',x=>outputs.set(name,outputs.get(name)+x));
  child.stderr.on('data',x=>outputs.set(name,outputs.get(name)+x));
  return child;
 }
 async function ready(name,child,port,probe){
  let ok=false;
  for(let i=0;i<130;i++){
   if(child.exitCode!==null)assert.fail(name+' exited: '+outputs.get(name));
   try{ok=(await call(port,'GET',probe)).status===403||
    (await call(port,'GET',probe)).status===404;}catch(_){}
   if(ok)break;await delay(50);
  }
  assert.ok(ok,name+' not listening: '+outputs.get(name));
 }
 const sessions={verifySession:token=>
  token==='A'.repeat(43)?{clientId:'CLAlice',role:'ADMIN'}:
  token==='B'.repeat(43)?{clientId:'CLBob',role:'USER'}:
  token==='C'.repeat(43)?{clientId:'CLGuest',role:'GUEST'}:null};
 const core=http.createServer(createCoreBusinessHttp({sessions,codec:proofCodec({secret}),routerPort,env}));
 core.listen(corePort,'127.0.0.1');await once(core,'listening');servers.push(core);
 for(const [name,entry] of ENGINES)run(name,entry);
 for(const [name] of ENGINES)await ready(name,children[ENGINES.findIndex(x=>x[0]===name)],ports[name],'/health');
 const router=run('router','Core/Router/router.js');
 await ready('router',router,routerPort,'/router-health');
 const gateway=run('gateway','UI/Gateway/ui_service.js');
 await ready('gateway',gateway,uiPort,'/ui-health');
 const ADMIN={'Content-Type':'application/json',Authorization:'Bearer '+'A'.repeat(43)};
 const USER={'Content-Type':'application/json',Authorization:'Bearer '+'B'.repeat(43)};
 const GUEST={'Content-Type':'application/json',Authorization:'Bearer '+'C'.repeat(43)};
 const metadata=await call(uiPort,'GET','/auth21/business/marketdata/metadata','',
  {Authorization:'Bearer '+'C'.repeat(43)});
 assert.equal(metadata.status,200,metadata.body);
 assert.equal(JSON.parse(metadata.body).readOnly,true);
 assert.equal((await call(uiPort,'POST','/auth21/business/marketdata/metadata','{}',GUEST)).status,404);
 const steps=[
  ['/auth21/business/marketdata/settings',{refreshMs:15000},ADMIN,'marketdata-settings.fixture.json'],
  ['/auth21/business/fundamental/feed',{feedUrl:'https://example.org/rss.xml'},ADMIN,'fundamental-feed.fixture.json'],
  ['/auth21/business/portfolio/preference',{ownerClientId:'CLBob',key:'chart.zoom',value:'2'},USER,'portfolio-CLBob-chart.zoom.fixture.json'],
  ['/auth21/business/strategy/preference',{ownerClientId:'CLBob',key:'chart.zoom',value:'3'},USER,'strategy-CLBob-chart.zoom.fixture.json']
 ];
 for(const [route,data,headers,file] of steps){
  const body=JSON.stringify(data);
  const result=await call(uiPort,'POST',route,body,headers);
  assert.equal(result.status,200,route+': '+result.body);
  const saved=JSON.parse(fs.readFileSync(path.join(root,'runtime','auth21-business',file),'utf8'));
  assert.ok(['marketdata.settings.set','fundamental.feed.create','portfolio.preference.set','strategy.preference.set'].includes(saved.action));
  if(data.ownerClientId)assert.equal(saved.ownerClientId,'CLBob');
  if(route.includes('fundamental')){
   const Database=require('better-sqlite3');
   const dbFile=path.join(root,'userdata','Shared Data','Fundamental','fundamental.db');
   const actual=new Database(dbFile,{readonly:true,fileMustExist:true});
   try{
    const row=actual.prepare('SELECT endpoint,enabled,provider_type FROM feeds WHERE endpoint=?')
     .get('https://example.org/rss.xml');
    assert.equal(row.endpoint,'https://example.org/rss.xml');
    assert.equal(row.provider_type,'RSS');assert.equal(row.enabled,0);
   }finally{actual.close();}
  }
  if(route.includes('strategy')){
   const Database=require('better-sqlite3');
   const file=path.join(root,'userdata','User Data','fixture','user_data.db');
   const actual=new Database(file,{readonly:true,fileMustExist:true});
   try{
    const row=actual.prepare('SELECT value_b64 FROM iatb_settings_v2 WHERE scope=? AND key=?')
      .get('auth21.strategy.CLBob','chart.zoom');
    assert.equal(JSON.parse(Buffer.from(row.value_b64,'base64').toString('utf8')),'3');
    assert.equal(actual.prepare('SELECT COUNT(*) AS count FROM iatb_settings_v2 WHERE scope=?')
     .get('auth21.strategy.CLAlice').count,0);
   }finally{actual.close();}
  }
  if(route.includes('portfolio')){
   const Database=require('better-sqlite3');
   const actual=new Database(env.IATB_PORTFOLIO_DB,{readonly:true,fileMustExist:true});
   try{
    const row=actual.prepare('SELECT value_json FROM settings WHERE key=?')
     .get('auth21.preference.CLBob.chart.zoom');
    assert.equal(JSON.parse(row.value_json),'2');
    assert.equal(actual.prepare('SELECT COUNT(*) AS count FROM settings WHERE key=?')
     .get('auth21.preference.CLAlice.chart.zoom').count,0);
   }finally{actual.close();}
  }

  if(route.includes('marketdata')){
   const actual=JSON.parse(fs.readFileSync(env.IATB_MARKET_SETTINGS,'utf8'));
   assert.equal(actual.refreshMs,15000);
  }
  assert.equal((await call(uiPort,'POST',route,body,GUEST)).status,403);
 }
 for(const [route,data] of steps.slice(0,2)){
  assert.equal((await call(uiPort,'POST',route,JSON.stringify(data),USER)).status,403);
 }
 for(const route of ['/auth21/business/portfolio/preference','/auth21/business/strategy/preference']){
  const bad=JSON.stringify({ownerClientId:'CLAlice',key:'chart.zoom',value:'x'});
  assert.equal((await call(uiPort,'POST',route,bad,USER)).status,403);
  assert.equal(fs.existsSync(path.join(root,'runtime','auth21-business',
   route.includes('portfolio')?'portfolio-CLAlice-chart.zoom.fixture.json':'strategy-CLAlice-chart.zoom.fixture.json')),false);
 }
 assert.equal((await call(uiPort,'POST','/auth21/business/trading/order','{}',ADMIN)).status,404);
 assert.equal((await call(uiPort,'POST','/communication/v1/ui/write','{}',ADMIN)).status,404);
});
