'use strict';
// Auth21 P2.2: independent maintenance tools must not bypass a held global snapshot.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')throw Error('AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT');

// Ephemeral Core + Router diagnostic. Run ONLY inside Docker --network none,
// with read-only image and tmpfs /tmp. No trading engines, no persistent mounts.
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const cp=require('node:child_process');

const root='/tmp/iatb-core-router-smoke';
const routerPort=18221,corePort=18001;
const env={...process.env,
 ROUTER_PORT:String(routerPort),CORE_PUBLIC_PORT:String(corePort),IATB_PORT:String(corePort),
 IATB_RUNTIME_ROOT:root+'/runtime',IATB_DATA_ROOT:root+'/data',
 IATB_STATE_ROOT:root+'/state',IATB_ANNEX_ROOT:root+'/annexes',
 IATB_UPDATES_ROOT:root+'/updates',
 IATB_TRADING_LIVE:'0',IATB_DEBUG_BOOTSTRAP:'0',
 IATB_DEBUG_MODE:'0'
};
const children=[];
function spawn(name,file){
 let logs='';
 const child=cp.spawn(process.execPath,[file],{cwd:path.resolve(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>logs+=b.toString());
 child.stderr.on('data',b=>logs+=b.toString());
 children.push({name,child,get logs(){return logs.slice(-5500)}});
 return child;
}
function get(url){return new Promise((resolve,reject)=>{
 const q=http.get(url,{timeout:700},res=>{let body='';res.on('data',b=>body+=b.toString());res.on('end',()=>resolve({code:res.statusCode,body}));});
 q.on('error',reject);q.on('timeout',()=>q.destroy(new Error('HTTP_TIMEOUT')));
});}
async function poll(url,owner){
 let lastErr='';
 for(let i=0;i<65;i++){
   if(owner.exitCode!==null||owner.signalCode!==null)break;
   try{return await get(url);}catch(e){lastErr=e.message;await new Promise(r=>setTimeout(r,150));}
 }
 throw new Error('No health response '+url+' '+lastErr);
}
async function cleanup(){
 for(const {child} of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
 await Promise.all(children.map(({child})=>new Promise(resolve=>{
  if(child.exitCode!==null||child.signalCode!==null)return resolve();
  const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1500);
  child.once('exit',()=>{clearTimeout(timer);resolve();});
 })));
}
(async()=>{
 try{
  const router=spawn('Router','Core/Router/router.js');
  const rh=await poll('http://127.0.0.1:'+routerPort+'/router-health-internal',router);
  assert.equal(rh.code,200,'Router HTTP '+rh.code);
  assert.equal(JSON.parse(rh.body).router,true);
  console.log('ROUTER START: OK');
  const core=spawn('Core','Core/Server/server.js');
  const ch=await poll('http://127.0.0.1:'+corePort+'/api/health',core);
  assert.equal(ch.code,200,'Core HTTP '+ch.code+' '+ch.body);
  const coreStatus=JSON.parse(ch.body);
  assert.equal(coreStatus.ok,true,'Core health not OK');
  console.log('CORE START: OK');
  console.log('CORE CLIENT DATABASE READY: '+String(coreStatus.clientDb&&coreStatus.clientDb.ready));
  // This route proxies to Core; thus it confirms communication over the same loopback namespace.
  const viaRouter=await get('http://127.0.0.1:'+routerPort+'/api/health');
  assert.equal(viaRouter.code,200,'Router->Core HTTP '+viaRouter.code);
  assert.equal(JSON.parse(viaRouter.body).ok,true);
  console.log('ROUTER -> CORE PROXY: OK');
  console.log('EXTERNAL NETWORK: DISABLED BY DOCKER');
  console.log('TRADING ENGINES: NOT STARTED');
  console.log('CORE + ROUTER SMOKE: SUCCESS');
 }catch(e){
  console.error('CORE + ROUTER SMOKE FAILED: '+e.message);
  for(const x of children)console.error('--- '+x.name+' LOGS ---\n'+x.logs);
  process.exitCode=1;
 }finally{await cleanup();}
})();
