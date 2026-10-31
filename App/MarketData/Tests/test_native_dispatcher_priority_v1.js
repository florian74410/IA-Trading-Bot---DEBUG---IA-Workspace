"use strict";
const assert=require("assert");
const Dispatcher=require("../Orchestrator/native_request_dispatcher");

async function main(){
 let available=1;
 const order=[];

 const dispatcher=new Dispatcher({
  maxWaitMs:1000,
  admit:()=>{
   if(available>0){
    available--;
    return {allowed:true};
   }
   return {allowed:false,retryAfterMs:null};
  }
 });

 const low=dispatcher.submit(
  {priority:1},
  ()=>{order.push("LOW");return "LOW";}
 );

 const high=dispatcher.submit(
  {priority:100},
  ()=>{order.push("HIGH");return "HIGH";}
 );

 const results=await Promise.allSettled([low,high]);

 assert.strictEqual(results[0].status,"rejected");
 assert.strictEqual(results[1].status,"fulfilled");
 assert.strictEqual(results[1].value,"HIGH");
 assert.deepStrictEqual(order,["HIGH"]);

 dispatcher.close();
 console.log("PASS NATIVE Dispatcher priority: HIGH before LOW");
}

main().catch(e=>{console.error(e);process.exitCode=1;});
