'use strict';
// Auth21 P2.2: independent maintenance tools must not bypass a held global snapshot.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')throw Error('AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT');

// Offline smoke for the REAL Firewall service with both protection workers enabled.
// Run in disposable Docker: --network none, --read-only, --tmpfs /tmp.
const assert=require('node:assert/strict');
const http=require('node:http');
const cp=require('node:child_process');
const path=require('node:path');
const root='/tmp/iatb-firewall-smoke',port=18017;
const env={...process.env,
 IATB_RUNTIME_ROOT:root+'/runtime',IATB_DATA_ROOT:root+'/data',
 IATB_STATE_ROOT:root+'/state',IATB_ANNEX_ROOT:root+'/annexes',
 IATB_UPDATES_ROOT:root+'/updates',
 IATB_FIREWALL_PORT:String(port),
 IATB_FIREWALL_ENABLED:'1',
 IATB_TRADING_LIVE:'0',IATB_DEBUG_BOOTSTRAP:'0',IATB_DEBUG_MODE:'0'
};
let logs='';
const child=cp.spawn(process.execPath,['Core/Firewall/firewall_service.js'],{
 cwd:path.resolve(__dirname,'..'),env,stdio:['ignore','pipe','pipe']
});
child.stdout.on('data',x=>logs+=x.toString());
child.stderr.on('data',x=>logs+=x.toString());
function fetchHealth(){return new Promise((resolve,reject)=>{
 const req=http.get('http://127.0.0.1:'+port+'/health',{timeout:850},res=>{
  let text='';res.on('data',x=>text+=x.toString());res.on('end',()=>{
   try{resolve({code:res.statusCode,data:JSON.parse(text)});}catch(e){reject(e);}
  });
 });req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('HTTP_TIMEOUT')));
});}
function request(method,uri,data){return new Promise((resolve,reject)=>{
 const raw=data===undefined?'':JSON.stringify(data);
 const req=http.request({host:'127.0.0.1',port,path:uri,method,timeout:1500,
  headers:raw?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw)}:{}},res=>{
  let body='';res.on('data',c=>body+=c.toString());res.on('end',()=>{
   try{resolve({code:res.statusCode,data:JSON.parse(body)});}catch(e){reject(e);}
  });
 });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TIMEOUT')));
 if(raw)req.write(raw);req.end();
});}
(async()=>{
 try{
  let health;
  for(let i=0;i<50;i++){
   if(child.exitCode!==null||child.signalCode!==null)throw Error('Firewall exited early');
   try{const h=await fetchHealth();if(h.code===200&&h.data.threads&&h.data.threads.filter(x=>x.online).length===3){health=h;break;}}
   catch(e){}
   await new Promise(r=>setTimeout(r,160));
  }
  assert(health,'Firewall workers failed to initialize');
  assert.equal(health.data.ok,true);
  assert.equal(health.data.firewallEnabled,true);
  assert.equal(health.data.bypassMode,false);
  assert.equal(health.data.workerCount,2);
  assert.equal(health.data.healthLevel,'HEALTHY');
  assert.equal(health.data.metrics.received,0);
  console.log('FIREWALL HEALTH TELEMETRY: OK');
  assert(health.data.threads.some(x=>x.id==='trading'&&x.online));
  assert(health.data.threads.some(x=>x.id==='data'&&x.online));
  console.log('FIREWALL COORDINATOR: OK');
  console.log('TRADING PROTECTION WORKER: OK (no Trading Engine started)');
  console.log('MARKET DATA PROTECTION WORKER: OK');
  console.log('FIREWALL BYPASS: OFF');
  // Tests de configuration externe, sans toucher a la configuration image.
  const fs=require('node:fs'),config=path.join(root,'data/firewall/MarketData/rules.json');
  const changed=await request('POST','/api/thread/config',{thread:'data',patch:{maxPayloadBytes:500000}});
  assert.equal(changed.code,200,'Config HTTP '+changed.code+' '+JSON.stringify(changed.data));
  assert.equal(JSON.parse(fs.readFileSync(config,'utf8')).maxPayloadBytes,500000);
  assert.equal(fs.existsSync(path.resolve(__dirname,'../Core/Firewall/Config/MarketData/rules.json')),true);
  console.log('FIREWALL EXTERNAL CONFIG WRITE: OK');
  const restart=await request('POST','/api/thread/restart',{thread:'data'});
  assert.equal(restart.code,200,'Restart HTTP '+restart.code);
  const restored=await request('GET','/api/thread/config?thread=data');
  assert.equal(restored.code,200);
  assert.equal(restored.data.config.maxPayloadBytes,500000);
  console.log('FIREWALL CONFIG RESTORE AFTER WORKER RESTART: OK');
  const stopped=await request('POST','/api/thread/stop',{thread:'data'});
  assert.equal(stopped.code,200);
  const degraded=await fetchHealth();
  assert.equal(degraded.data.healthLevel,'CRITICAL');
  const inspection=await request('POST','/api/data/inspect',{message:{provider:'BINANCE',type:'PRICE',symbol:'BTC/USDT'},meta:{}});
  assert.equal(inspection.code,503,'Offline worker inspection must refuse');
  console.log('FIREWALL WORKER FAILURE FAIL-CLOSED: OK');
  const recover=await request('POST','/api/thread/restart',{thread:'data'});
  assert.equal(recover.code,200);
  const healthy=await fetchHealth();
  assert.equal(healthy.data.healthLevel,'HEALTHY');
  console.log('FIREWALL WORKER RECOVERY: OK');
  console.log('FIREWALL SMOKE: SUCCESS');
 }catch(e){process.exitCode=1;console.error('FIREWALL SMOKE FAILED: '+e.message);console.error('FIREWALL LOGS:\n'+logs.slice(-8000));}
 finally{
  if(child.exitCode===null&&child.signalCode===null){
   child.kill('SIGTERM');
   await new Promise(resolve=>{
    const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1500);
    child.once('exit',()=>{clearTimeout(timer);resolve();});
   });
  }
 }
})();
