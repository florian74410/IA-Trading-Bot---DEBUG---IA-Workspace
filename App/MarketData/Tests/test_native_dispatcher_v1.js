"use strict";
const assert=require("assert");
const Dispatcher=require("../Orchestrator/native_request_dispatcher");

async function main(){
 let attempts=0;
 let executed=0;

 const dispatcher=new Dispatcher({
  maxWaitMs:1000,
  admit:()=>{
   attempts++;
   return attempts===1
    ?{allowed:false,retryAfterMs:20}
    :{allowed:true};
  }
 });

 const result=await dispatcher.submit(
  {priority:10},
  ()=>{executed++;return "OK";}
 );

 assert.strictEqual(result,"OK");
 assert.strictEqual(executed,1);
 assert.strictEqual(attempts,2);
 dispatcher.close();

 const denied=new Dispatcher({
  admit:()=>({allowed:false,retryAfterMs:null})
 });

 await assert.rejects(
  denied.submit({},()=>{throw new Error("EXECUTED");}),
  /DISPATCHER_ADMISSION_DENIED/
 );
 denied.close();

 const timeout=new Dispatcher({
  maxWaitMs:50,
  admit:()=>({allowed:false,retryAfterMs:1000})
 });

 await assert.rejects(
  timeout.submit({},()=>{throw new Error("EXECUTED");}),
  /DISPATCHER_WAIT_TIMEOUT/
 );
 timeout.close();

 console.log("PASS NATIVE Dispatcher: retry, execution, fail-closed");
}

main().catch(e=>{console.error(e);process.exitCode=1;});
