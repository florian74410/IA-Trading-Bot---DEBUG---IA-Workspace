'use strict';
// P2: truthful, bounded health snapshot; no outbound network calls or secrets.
const fs=require('fs');
function errorCode(e){return String(e&&e.code||'UNAVAILABLE').replace(/[^A-Z0-9_]/g,'').slice(0,40);}
class TradingHealthMonitor {
 constructor(options={}){
   this.now=options.now||Date.now;
   this.startedAt=this.now();
   this.inFlight=0;this.lastError=null;this.lastExecution=null;
   this.lastLatencyMs=null;this.requestCount=0;
 }
 beginRequest(){
   const start=this.now();this.inFlight++;this.requestCount++;
   let ended=false;
   return ()=>{if(ended)return;ended=true;this.inFlight=Math.max(0,this.inFlight-1);this.lastLatencyMs=Math.max(0,this.now()-start);};
 }
 recordExecution(value){
   const r=value||{};
   this.lastExecution={timestamp:Number(r.timestamp)||this.now(),exchange:String(r.exchange||'').slice(0,32),symbol:String(r.symbol||'').slice(0,64),status:String(r.status||'UNKNOWN').slice(0,40),ok:r.ok===true};
   if(r.ok===false)this.recordError('EXECUTION_FAILED');
 }
 recordError(code){
   this.lastError={code:String(code||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,64),timestamp:this.now()};
 }
 storage(file){
   if(!file)return {status:'NOT_CONFIGURED'};
   try{let st=fs.statSync(file);return {status:st.isFile()?'AVAILABLE':'INVALID_TYPE'};}
   catch(e){return {status:e.code==='ENOENT'?'NOT_CREATED':'UNAVAILABLE',error:errorCode(e)};}
 }
 snapshot({lifecycle,exchanges=[],historyFile,dbFile,serviceEnabled,liveEnabled}={}){
   const runtime=lifecycle||{state:'UNKNOWN',execution_allowed:false};
   const brokerStatus={};
   for(const ex of exchanges)brokerStatus[String(ex).slice(0,40)]={registration:'REGISTERED',api_connection:'NOT_CHECKED',account_status:'UNKNOWN'};
   return {
     schema:'trading.health/2.3',timestamp:this.now(),state:runtime.state,
     executionAllowed:!!runtime.execution_allowed&&!!serviceEnabled,
     serviceEnabled:!!serviceEnabled,liveExecutionEnabled:!!liveEnabled,
     uptimeSec:Math.max(0,Math.floor((this.now()-this.startedAt)/1000)),
     inFlightRequests:this.inFlight,requestCount:this.requestCount,
     lastLatencyMs:this.lastLatencyMs,lastExecution:this.lastExecution,lastError:this.lastError,
     brokers:brokerStatus,brokerConnectivityMeasured:false,
     orders:{open:null,pendingReconciliation:null,status:'NOT_CONNECTED'},
     cp1:{transport:'CONFIGURED',remoteAvailability:'NOT_CHECKED'},
     storage:{jsonl:this.storage(historyFile),sqlite:dbFile?this.storage(dbFile):{status:'NOT_INTEGRATED'}},
     stop:{reason:runtime.reason||null,updatedAt:runtime.updated_at||null,actor:'NOT_EXPOSED'}
   };
 }
}
module.exports={TradingHealthMonitor};
