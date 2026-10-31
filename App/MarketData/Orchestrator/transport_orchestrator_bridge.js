'use strict';
var orchestrator=null;
function set(x){orchestrator=x||null;}
function observe(req){
 if(!orchestrator||typeof orchestrator.observeTransport!=='function')return null;
 try{return orchestrator.observeTransport(req||{});}catch(e){return{ok:false,error:e.message};}
}
function admit(req){
 if(!orchestrator||typeof orchestrator.admitTransport!=='function')
  return {allowed:false,reason:'NATIVE_ORCHESTRATOR_UNAVAILABLE'};
 try{return orchestrator.admitTransport(req||{});}
 catch(e){return {allowed:false,reason:'NATIVE_ADMISSION_ERROR',error:e.message};}
}

function priority(req){
 if(!orchestrator||typeof orchestrator.resolveTransportPriority!=="function")return 0;
 try{return orchestrator.resolveTransportPriority(req||{});}
 catch(e){return 0;}
}

function feedback(provider,data){
 if(!orchestrator||typeof orchestrator.feedbackTransport!=='function')return null;
 try{return orchestrator.feedbackTransport(provider,data||{});}catch(e){return{ok:false,error:e.message};}
}
function status(){return{attached:!!orchestrator,mode:orchestrator&&orchestrator.mode||null,transportObserve:!!(orchestrator&&orchestrator.observeTransport),transportFeedback:!!(orchestrator&&orchestrator.feedbackTransport)};}
module.exports={set:set,observe:observe,admit:admit,priority:priority,feedback:feedback,status:status};
