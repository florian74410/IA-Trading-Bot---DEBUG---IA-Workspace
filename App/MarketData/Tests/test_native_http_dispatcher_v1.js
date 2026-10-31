"use strict";
const assert=require("assert");
const http=require("http");
const Bridge=require("../Orchestrator/transport_orchestrator_bridge");
const Orchestrator=require("../Orchestrator/api_request_orchestrator");
const request=require("../Provider/http_json");

async function main(){
 process.env.IATB_HTTP_BUDGET_MODE="NATIVE";

 const orchestrator=new Orchestrator({mode:"NATIVE"});
 orchestrator.configureProvider("TEST",{
  shortLimit:2,
  shortWindowMs:60000,
  longLimit:10,
  longWindowMs:60000
 });
 Bridge.set(orchestrator);

 let received=0;
 const server=http.createServer((req,res)=>{
  received++;
  res.writeHead(200,{"Content-Type":"application/json"});
  res.end(JSON.stringify({ok:true}));
 });

 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));

 function send(){
  return new Promise(resolve=>{
   request(
    "http://127.0.0.1:"+server.address().port+"/test",
    {telemetryProvider:"TEST",telemetryDataset:"TEST"},
    (error,data)=>resolve({error,data})
   );
  });
 }

 try{
  const results=await Promise.all([send(),send()]);

  for(const result of results){
   assert.ifError(result.error);
   assert.strictEqual(result.data.ok,true);
  }

  assert.strictEqual(received,2);
  assert.strictEqual(
   orchestrator.budget.status().providers.TEST.shortUsed,
   2,
   "Chaque HTTP doit consommer exactement une unite"
  );

  console.log("PASS NATIVE HTTP Dispatcher: 2 HTTP, quota consomme 2");
 }finally{
  Bridge.set(null);
  delete process.env.IATB_HTTP_BUDGET_MODE;
  await new Promise(resolve=>server.close(resolve));
 }
}

main().catch(e=>{console.error(e);process.exitCode=1;});
