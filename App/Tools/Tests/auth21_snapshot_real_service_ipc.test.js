'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const net=require('node:net'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {setTimeout:delay}=require('node:timers/promises');
const {createSnapshotCoreClient}=require('../../Core/Backup/auth21_snapshot_core_client');
const APP=path.resolve(__dirname,'../..');
const SPEC=[
 ['portfolio','Portfolio/Engine/portfolio_service.js','IATB_PORTFOLIO_PORT'],
 ['marketdata','MarketData/market_data_service.js','IATB_MARKET_DATA_PORT'],
 ['fundamental','Fundamental/Engine/fundamental_service.js','IATB_FUNDAMENTAL_PORT'],
 ['trading','services/trading-engine/trading_service.js','IATB_TRADING_ENGINE_PORT'],
 ['indicators','Indicators/Engine/indicator_service.js','IATB_INDICATOR_PORT'],
 ['strategy','Strategy/Engine/strategy_service.js','IATB_STRATEGY_PORT']
];
async function unusedPort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function request(port,method,target,headers={},body=''){return new Promise((resolve,reject)=>{
 const q=http.request({host:'127.0.0.1',port,method,path:target,timeout:1500,headers,agent:false},res=>{
  let out='';res.on('data',x=>out+=x);res.on('end',()=>resolve({status:res.statusCode,out}));
 });
 q.on('error',reject);q.on('timeout',()=>q.destroy(Error('TIMEOUT')));q.end(body);
});}
for(const [engine,entry,portVar] of SPEC){
 test(engine+' real Engine process accepts only signed Core snapshot commands',{timeout:30000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));fs.chmodSync(root,0o700);
  const app=path.join(root,'App');
  fs.cpSync(APP,app,{recursive:true,filter:src=>!path.relative(APP,src).split(path.sep).some(x=>['node_modules','.runtime','Data','Logs'].includes(x))});
  fs.symlinkSync(path.join(APP,'node_modules'),path.join(app,'node_modules'),'dir');
  fs.writeFileSync(path.join(root,'.iatb-auth21-core-local-trial'),'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n',{mode:0o600});
  const security=path.join(root,'userdata','Security');fs.mkdirSync(security,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(security,'auth21_ipc.key'),crypto.randomBytes(32),{mode:0o600});
  const port=await unusedPort(),routerPort=await unusedPort();
  const env={...process.env,IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',
   IATB_AUTH21_SNAPSHOT_IPC_TRIAL:'1',IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',
   IATB_AUTH21_LOCAL_TRIAL_ROOT:root,IATB_TRADING_LIVE:'0',
   IATB_MARKETDATA_OFFLINE_DIAGNOSTIC:'1',IATB_FUNDAMENTAL_STDOUT:'1',
   IATB_RUNTIME_ROOT:path.join(root,'runtime'),IATB_DATA_ROOT:path.join(root,'userdata'),
   IATB_ANNEX_ROOT:path.join(root,'annexes'),IATB_UPDATES_ROOT:path.join(root,'updates'),
   IATB_STATE_ROOT:path.join(root,'legacy'),ROUTER_PORT:String(routerPort),[portVar]:String(port)};
  delete env.IATB_USER_DB;delete env.IATB_AUTH21_IPC_PROBE_TRIAL;
  const child=spawn(process.execPath,[path.join(app,entry)],{cwd:app,env,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
  t.after(async()=>{
   if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit');}
   fs.rmSync(root,{recursive:true,force:true});
  });
  let up=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)assert.fail(engine+' failed to start: '+log);
   try{up=(await request(port,'GET','/health')).status===403;}catch(_){}
   if(up)break;await delay(60);
  }
  assert.equal(up,true,engine+' not ready: '+log);
  assert.equal((await request(port,'POST','/auth21/snapshot/control',{'Content-Type':'application/json'},JSON.stringify({command:'prepare',epoch:1,writerId:engine}))).status,403);
  const core=createSnapshotCoreClient({env,root});
  assert.deepEqual(await core.send({engine,port,command:'prepare',epoch:1}),{epoch:1,writerId:engine,pending:0});
  await assert.rejects(core.send({engine,port,command:'prepare',epoch:1}),/SNAPSHOT_REMOTE_REJECTED/);
  assert.equal((await request(port,'POST','/cp/v1',{},'{}')).status,403);
  await core.send({engine,port,command:'release',epoch:1});
  await core.send({engine,port,command:'prepare',epoch:2});
  await core.send({engine,port,command:'abort',epoch:2});
  assert.equal((await request(port,'GET','/health')).status,403);
 });
}
