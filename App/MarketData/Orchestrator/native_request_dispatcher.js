"use strict";

class NativeRequestDispatcher {
 constructor(options){
  options=options||{};
  if(typeof options.admit!=="function")throw new Error("ADMISSION_REQUIRED");
  this.admit=options.admit;
  this.maxQueue=options.maxQueue||500;
  this.maxWaitMs=options.maxWaitMs||30000;
  this.queue=[];
  this.sequence=0;
  this.timer=null;
  this.closed=false;
  this.scheduled=false;
 }

 submit(request,execute){
  if(this.closed)return Promise.reject(new Error("DISPATCHER_CLOSED"));
  if(typeof execute!=="function")
   return Promise.reject(new Error("EXECUTOR_REQUIRED"));
  if(this.queue.length>=this.maxQueue)
   return Promise.reject(new Error("DISPATCHER_QUEUE_FULL"));

  return new Promise((resolve,reject)=>{
   this.queue.push({
    request:request||{},
    execute:execute,
    resolve:resolve,
    reject:reject,
    sequence:++this.sequence,
    createdAt:Date.now()
   });
   this.schedulePump();
  });
 }

 schedulePump(){
  if(this.scheduled||this.closed)return;
  this.scheduled=true;
  queueMicrotask(()=>{
   this.scheduled=false;
   if(!this.closed)this.pump();
  });
 }

 pump(){
  if(this.closed)return;
  if(this.timer){clearTimeout(this.timer);this.timer=null;}

  this.queue.sort((a,b)=>{
   const pa=Number(a.request.priority)||0;
   const pb=Number(b.request.priority)||0;
   return pb-pa||a.sequence-b.sequence;
  });

  const pending=[];
  let nextDelay=null;

  for(const item of this.queue){
   const elapsed=Date.now()-item.createdAt;
   if(elapsed>=this.maxWaitMs){
    item.reject(new Error("DISPATCHER_WAIT_TIMEOUT"));
    continue;
   }

   let result;
   try{result=this.admit(item.request);}
   catch(e){item.reject(e);continue;}

   if(result&&result.allowed===true){
    Promise.resolve().then(item.execute).then(item.resolve,item.reject);
    continue;
   }

   const delay=result&&result.retryAfterMs;
   if(!Number.isFinite(delay)||delay===null||delay<=0){
    item.reject(new Error("DISPATCHER_ADMISSION_DENIED"));
    continue;
   }

   pending.push(item);
   const remaining=this.maxWaitMs-elapsed;
   const wait=Math.max(1,Math.min(delay,remaining));
   nextDelay=nextDelay===null?wait:Math.min(nextDelay,wait);
  }

  this.queue=pending;
  if(nextDelay!==null){
   this.timer=setTimeout(()=>this.pump(),nextDelay);

  }
 }

 close(){
  this.closed=true;
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  for(const item of this.queue)
   item.reject(new Error("DISPATCHER_CLOSED"));
  this.queue=[];
 }
}

module.exports=NativeRequestDispatcher;
