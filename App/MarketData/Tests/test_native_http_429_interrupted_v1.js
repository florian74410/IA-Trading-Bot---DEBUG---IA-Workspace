"use strict";
const assert=require("assert");
const http=require("http");
const Orchestrator=require("../Orchestrator/api_request_orchestrator");
const Bridge=require("../Orchestrator/transport_orchestrator_bridge");
const request=require("../Provider/http_json");

async function main(){
 const o=new Orchestrator({mode:"NATIVE"});
 o.configureProvider("TEST",{
  shortLimit:20,shortWindowMs:60000,
  longLimit:100,longWindowMs:60000
 });
 Bridge.set(o);
 let calls=0;
 const server=http.createServer((req,res)=>{
  res.writeHead(429,{
   "Content-Type":"application/json",
   "Retry-After":"2"
  });
  res.write("{");
  setTimeout(()=>res.destroy(),30);
 });
 try{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const url="http://127.0.0.1:"+server.address().port+"/test";
  const error=await Promise.race([
   new Promise(resolve=>request(url,{
    telemetryProvider:"TEST",telemetryDataset:"TEST"
   },e=>{calls++;resolve(e);})),
   new Promise((_,reject)=>setTimeout(
    ()=>reject(new Error("CALLBACK_TIMEOUT")),4000))
  ]);
  await new Promise(resolve=>setTimeout(resolve,100));
  const remaining=(o.budget.status().providers.TEST.providerCooldownUntil||0)-Date.now();
  const feedback=o.events.filter(e=>e.phase==="FEEDBACK");
  assert(error,"EXPECTED_INTERRUPTION_ERROR");
  assert.strictEqual(calls,1,"CALLBACK_DUPLICATED");
  assert(remaining>1000,"COOLDOWN_NOT_APPLIED");
  assert.strictEqual(feedback.length,1,"FEEDBACK_DUPLICATED");
  console.log("PASS NATIVE HTTP 429 INTERRUPTED: cooldown, feedback unique, callback unique");
 }finally{
  Bridge.set(null);
  await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
