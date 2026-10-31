"use strict";
const assert = require("assert");
const http = require("http");
const Bridge = require("../Orchestrator/transport_orchestrator_bridge");
const request = require("../Provider/http_json");

async function main(){
 process.env.IATB_HTTP_BUDGET_MODE="NATIVE";
 Bridge.set(null);

 let received=0;
 const server=http.createServer((req,res)=>{
  received++;
  res.writeHead(200,{"Content-Type":"application/json"});
  res.end(JSON.stringify({ok:true}));
 });

 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));

 try{
  const url="http://127.0.0.1:"+server.address().port+"/test";

  const result=await new Promise(resolve=>{
   request(url,{telemetryProvider:"TEST"},(error,data)=>{
    resolve({error,data});
   });
  });

  assert(result.error,"La requete doit etre refusee");
  assert.strictEqual(result.error.message,"PROVIDER_BUDGET_DENIED");
  assert.strictEqual(received,0,"Aucune requete ne doit atteindre le serveur");

  console.log("PASS NATIVE FAIL-CLOSED: 0 requete emise");
 }finally{
  Bridge.set(null);
  delete process.env.IATB_HTTP_BUDGET_MODE;
  await new Promise(resolve=>server.close(resolve));
 }
}

main().catch(e=>{console.error(e);process.exitCode=1;});
