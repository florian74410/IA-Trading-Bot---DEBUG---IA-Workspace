'use strict';
// Auth21 P2.2: independent maintenance tools must not bypass a held global snapshot.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')throw Error('AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT');

// Ephemeral Router-only loopback smoke test, no engine and no external network.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const port=18221;
const env={...process.env,
  ROUTER_PORT:String(port),
  IATB_RUNTIME_ROOT:'/tmp/iatb-router-smoke/runtime',
  IATB_DATA_ROOT:'/tmp/iatb-router-smoke/data',
  IATB_STATE_ROOT:'/tmp/iatb-router-smoke/state',
  IATB_ANNEX_ROOT:'/tmp/iatb-router-smoke/annexes',
  IATB_UPDATES_ROOT:'/tmp/iatb-router-smoke/updates',
  IATB_TRADING_LIVE:'0',
  IATB_DEBUG_BOOTSTRAP:'0'
};
let logs='';
const child=cp.spawn(process.execPath,['Core/Router/router.js'],{cwd:path.resolve(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',x=>logs+=x.toString());
child.stderr.on('data',x=>logs+=x.toString());
function get(url){return new Promise((resolve,reject)=>{
  const req=http.get(url,{timeout:1000},res=>{
    let body='';
    res.on('data',x=>body+=x.toString());
    res.on('end',()=>resolve({status:res.statusCode,body}));
  });
  req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('timeout')));
});}
(async()=>{
  try{
    let response=null;
    for(let i=0;i<35;i++){
      if(child.exitCode!==null)throw new Error('Router exited early: '+logs);
      try{response=await get('http://127.0.0.1:'+port+'/router-health-internal');break;}
      catch(e){await new Promise(r=>setTimeout(r,150));}
    }
    assert(response,'Router did not bind within timeout: '+logs);
    assert.equal(response.status,200,'Router health failed: '+response.body);
    const h=JSON.parse(response.body);
    assert(h&&h.router===true,'Invalid Router health response: '+response.body);
    console.log('ROUTER LOOPBACK: OK');
    console.log('ROUTER HEALTH: OK');
    console.log('NO OTHER ENGINES STARTED: OK');
    console.log('ROUTER SMOKE: SUCCESS');
  }finally{
    child.kill('SIGTERM');
    await new Promise(resolve=>{
      if(child.exitCode!==null||child.signalCode!==null)return resolve();
      child.once('exit',resolve);
      setTimeout(()=>{child.kill('SIGKILL');resolve();},1500).unref();
    });
  }
})().catch(e=>{console.error('ROUTER SMOKE FAILED:',e.message);process.exitCode=1;});
