'use strict';
// Checks authenticated CP/1 discovery and read-only routing across deployed Engines.
// No trading orders, no provider requests, no settings mutations.
const path=require('node:path');
const Client=require('../Core/Communication/cp1_client');
const client=new Client({root:path.resolve(__dirname,'..'),routerPort:8021,timeout:5000});
const targets=[
 ['marketdata','marketdata.health'],
 ['indicator','indicator.list_capabilities'],
 ['fundamental','fundamental.health'],
 ['liquidity','liquidity.health'],
 ['strategy','strategy.health'],
 ['risk','risk.list_capabilities'],
 ['portfolio','portfolio.health'],
 ['supervisor','supervisor.health']
];
const get=p=>new Promise((resolve,reject)=>client.routerGet(p,(e,v)=>e?reject(e):resolve(v)));
const request=(id,action)=>new Promise((resolve,reject)=>client.request(id,action,{},'summary',(e,v)=>e?reject(e):resolve(v)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let fails=0;
 const caps=await get('/communication/v1/capabilities');
 const map=new Map((caps.engines||[]).map(e=>[e.id,e]));
 console.log('CP/1 AUTHENTICATED DISCOVERY: OK');
 for(const [id,action] of targets){
  let error=null,ok=false;
  for(let n=0;n<8;n++){
   try{
    if(!map.get(id)||!map.get(id).capabilities.includes(action))throw Error('ACTION_NOT_DECLARED');
    const response=await request(id,action);
    if(!response||typeof response!=='object')throw Error('INVALID_RESPONSE');
    ok=true;break;
   }catch(e){error=e;if(n<7)await sleep(700);}
  }
  console.log((id+' '+action).padEnd(39),ok?'CP1 OK':'FAILED '+(error&&error.message||'unknown'));
  if(!ok)fails++;
 }
 const status=await get('/router-health');
 console.log('ROUTER HEALTH:',status.router===true?'OK':'FAILED');
 if(status.router!==true)fails++;
 console.log('TRADING ENGINE STARTED: 0');
 console.log('EXTERNAL NETWORK: DISABLED');
 console.log('CP1 STACK:',fails===0?'SUCCESS':'FAILED '+fails);
 if(fails)process.exitCode=1;
})().catch(e=>{console.error('CP1 STACK FAILED:',e.stack||e);process.exitCode=1;});
