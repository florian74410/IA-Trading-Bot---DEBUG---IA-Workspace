'use strict';
function ProviderContract(id){this.id=String(id||'UNKNOWN');}
ProviderContract.prototype.health=function(){return Promise.resolve({ok:false,provider:this.id,error:'NOT_IMPLEMENTED'});};
ProviderContract.prototype.reason=function(){return Promise.reject(new Error('NOT_IMPLEMENTED'));};
function normalizeRequest(x){x=x||{};return{system:String(x.system||''),prompt:String(x.prompt||''),model:String(x.model||''),temperature:x.temperature==null?null:Number(x.temperature),maxTokens:Math.max(1,Math.min(32768,Number(x.maxTokens)||2048)),metadata:x.metadata&&typeof x.metadata==='object'?x.metadata:{}};}
function normalizeResponse(provider,model,text,raw,latencyMs){return{ok:true,provider:String(provider),model:String(model||''),text:String(text||''),latencyMs:Number(latencyMs)||0,raw:raw||null};}
module.exports={ProviderContract:ProviderContract,normalizeRequest:normalizeRequest,normalizeResponse:normalizeResponse};