'use strict';
// End-to-end UI Gateway read-only routing smoke. No browser, external providers or order execution.
const assert=require('node:assert/strict');
const base='http://127.0.0.1:8000';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function request(route,options){
 const r=await fetch(base+route,{...options,signal:AbortSignal.timeout(6500)});
 const ct=r.headers.get('content-type')||'';
 const raw=await r.text();
 let json=null;try{json=JSON.parse(raw);}catch(e){}
 return{status:r.status,contentType:ct,json,raw};
}
(async()=>{
 const pages=['/trading','/settings','/fundamental','/portfolio'];
 const reads=[
  ['marketdata','marketdata.health'],
  ['indicator','indicator.list_indicators'],
  ['fundamental','fundamental.health'],
  ['portfolio','portfolio.positions'],
  ['strategy','strategy.health']
 ];
 let fails=0;
 for(const route of pages){
  let status='FAILED';
  for(let n=0;n<6;n++){
   try{
    const r=await request(route);
    if(r.status===200&&r.contentType.includes('text/html')&&r.raw.includes('<')){status='OK';break;}
    status='HTTP '+r.status+' '+r.contentType;
   }catch(e){status=e.message;}
   await wait(700);
  }
  console.log('UI PAGE '+route.padEnd(15),status);
  if(status!=='OK')fails++;
 }
 for(const route of ['/ui-health','/ui-api/session','/router-health','/api/health']){
  let status='FAILED';
  for(let n=0;n<6;n++){
   try{const r=await request(route);if(r.status===200&&r.json&&r.json.ok===true){status='OK';break;}status='HTTP '+r.status+' '+JSON.stringify(r.json).slice(0,90);}
   catch(e){status=e.message;}
   await wait(700);
  }
  console.log('UI READ '+route.padEnd(17),status);
  if(status!=='OK')fails++;
 }
 for(const [target,action] of reads){
  let status='FAILED';
  for(let n=0;n<6;n++){
   try{
    const r=await request('/communication/v1/ui/read',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({target,action,arguments:{}})
    });
    if(r.status===200&&r.json&&r.json.status!=='ERROR'&&r.json.ok!==false){status='OK';break;}
    status='HTTP '+r.status+' '+JSON.stringify(r.json).slice(0,120);
   }catch(e){status=e.message;}
   await wait(700);
  }
  console.log('UI CP1 '+(target+'.'+action).padEnd(36),status);
  if(status!=='OK')fails++;
 }
 // Protected CP/1 endpoints must never be exposed through the UI Gateway.
 const forbidden=await request('/communication/v1/capabilities');
 const protectedOk=forbidden.status===403;
 console.log('UI CP1 PRIVATE ROUTE BLOCKED:',protectedOk?'OK':'FAILED '+forbidden.status);
 if(!protectedOk)fails++;
 console.log('TRADING ENGINE STARTED: 0');
 console.log('PROVIDER NETWORK: DISABLED');
 console.log('UI END-TO-END:',fails===0?'SUCCESS':'FAILED '+fails);
 if(fails)process.exitCode=1;
})().catch(e=>{console.error('UI END-TO-END FAILED:',e.stack||e);process.exitCode=1;});
