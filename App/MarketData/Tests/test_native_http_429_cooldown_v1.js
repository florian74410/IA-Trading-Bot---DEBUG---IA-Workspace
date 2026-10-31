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
  shortLimit:100,
  shortWindowMs:60000,
  longLimit:1000,
  longWindowMs:60000
 });
 Bridge.set(orchestrator);

 let received=0;
 const server=http.createServer((req,res)=>{
  received++;
  if(received===1){
   res.writeHead(429,{
    "Content-Type":"application/json",
    "Retry-After":"1"
   });
   res.end(JSON.stringify({message:"rate limited"}));
  }else{
   res.writeHead(200,{"Content-Type":"application/json"});
   res.end(JSON.stringify({ok:true}));
  }
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
  const first=await send();
  assert(first.error,"Premiere requete doit recevoir 429");
  assert.strictEqual(first.error.statusCode,429);
  assert.strictEqual(received,1);

  const status=orchestrator.budget.status();
  const provider=status.providers.TEST;
  assert(provider,"Provider TEST absent");
  assert(
   provider.providerCooldownUntil>Date.now(),
   "HTTP 429 non transforme en cooldown"
  );

  const started=Date.now();
  const second=await send();
  const elapsed=Date.now()-started;

  assert.ifError(second.error);
  assert.strictEqual(second.data.ok,true);
  assert.strictEqual(received,2);
  assert(
   elapsed>=500,
   "La seconde requete a contourne le cooldown"
  );

  console.log("PASS HTTP 429: cooldown applique et requete differee");
  console.log("ATTENTE_MS="+elapsed);
 }finally{
  Bridge.set(null);
  delete process.env.IATB_HTTP_BUDGET_MODE;
  await new Promise(resolve=>server.close(resolve));
 }
}

main().catch(e=>{console.error(e);process.exitCode=1;});
