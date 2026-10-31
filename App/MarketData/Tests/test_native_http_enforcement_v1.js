"use strict";
const assert = require("assert");
const http = require("http");
const Bridge = require("../Orchestrator/transport_orchestrator_bridge");
const Orchestrator = require("../Orchestrator/api_request_orchestrator");
const request = require("../Provider/http_json");

async function main(){
 const native = new Orchestrator({mode:"NATIVE"});
 native.configureProvider("TEST",{
  shortLimit:2,
  shortWindowMs:60000,
  longLimit:10,
  longWindowMs:60000
 });
 Bridge.set(native);

 let received=0;
 const server=http.createServer((req,res)=>{
  received++;
  res.writeHead(200,{"Content-Type":"application/json"});
  res.end(JSON.stringify({ok:true}));
 });

 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));

 const url="http://127.0.0.1:"+server.address().port+"/test";

 function send(){
  return new Promise(resolve=>{
   request(url,{telemetryProvider:"TEST",telemetryDataset:"TEST"},
    (error,data)=>resolve({error,data}));
  });
 }

 try{
  const first=await send();
  const second=await send();
  const third=await send();

  assert.ifError(first.error);
  assert.ifError(second.error);
  assert.strictEqual(first.data.ok,true);
  assert.strictEqual(second.data.ok,true);
  assert(third.error);
  assert.strictEqual(third.error.message,"DISPATCHER_WAIT_TIMEOUT");
  assert.strictEqual(received,2);
  assert.strictEqual(native.budget.status().providers.TEST.shortUsed,2);

  console.log("PASS NATIVE HTTP: 2 requetes transmises, 1 bloquee");
 }finally{
  Bridge.set(null);
  await new Promise(resolve=>server.close(resolve));
 }
}

main().catch(e=>{console.error(e);process.exitCode=1;});
