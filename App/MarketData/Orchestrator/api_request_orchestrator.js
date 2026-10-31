'use strict';

var Policy=require('./data_source_policy');
var Broker=require('./request_broker');
var Budget=require('./request_budget');
var Telemetry=require('./api_telemetry');
var Decision=require('./shadow_decision_engine_v1');

function Orchestrator(o){
 o=o||{};
 this.mode=String(o.mode||'SHADOW').toUpperCase();
 this.execution={cacheFirst:o.cacheFirst===true,dedup:o.dedup===true,providerRawCache:false,cacheBoundary:'POST_FIREWALL_ONLY'};
 this.policy=o.policy||new Policy();
 this.broker=o.broker||new Broker({mode:this.mode,maxCacheEntries:o.maxCacheEntries,maxCacheBytes:o.maxCacheBytes});
 this.budget=o.budget||new Budget({mode:this.mode});
 this.events=[];this.maxEvents=Math.max(50,+o.maxEvents||500);
}
Orchestrator.prototype.configureProvider=function(provider,cfg){return this.budget.configure(provider,cfg||{});};
Orchestrator.prototype.observeStart=function(req){
 req=req||{};var policy=this.policy.resolve(req.provider,req.dataset),broker=this.broker.before(req,policy),budget={accounting:'TRANSPORT_ONLY',short:{known:false,wouldAllow:null},long:{known:false,wouldAllow:null},weighted:null,scopes:[]};
 var provider=String(req.provider||'').toUpperCase(),dataset=String(req.dataset||'').toUpperCase();
 var decision=Decision.start({provider:provider,dataset:dataset,policy:policy,broker:broker});
 var event={at:Date.now(),mode:this.mode,phase:'START',provider:provider,dataset:dataset,signature:String(req.signature||''),policy:policy,broker:broker,budget:budget,decision:decision};
 this.events.push(event);if(this.events.length>this.maxEvents)this.events.shift();
 Telemetry.emit({requestId:event.broker.key+'|'+event.at,timestamp:event.at,provider:event.provider,dataset:event.dataset,phase:'ORCHESTRATOR_START',cost:req.cost||1,priority:policy.priority,freshness:policy.freshness,criticality:policy.criticality,cacheOpportunity:broker.wouldCacheHit,dedupOpportunity:broker.inflightDuplicate,budgetShortAllow:budget.short&&budget.short.wouldAllow,budgetLongAllow:budget.long&&budget.long.wouldAllow,meta:{mode:this.mode,signature:event.signature,cacheTtlMs:policy.cacheTtlMs,requestMode:policy.mode,retention:policy.retention,distribution:policy.distribution,shadowDecision:decision}});
 return event;
};
Orchestrator.prototype.observeEnd=function(event,err){
 if(!event||!event.broker)return;
 this.broker.after(event.broker.key,!err);
 var endDecision=Decision.end({provider:event.provider,dataset:event.dataset,policy:event.policy,error:err||null});
 var e={at:Date.now(),mode:this.mode,phase:'END',provider:event.provider,dataset:event.dataset,key:event.broker.key,ok:!err,error:err&&err.message||null,decision:endDecision};
 this.events.push(e);if(this.events.length>this.maxEvents)this.events.shift();
 Telemetry.emit({requestId:event.broker.key+'|'+event.at,timestamp:event.at,completedAt:e.at,provider:event.provider,dataset:event.dataset,phase:'ORCHESTRATOR_END',ok:!err,latencyMs:e.at-event.at,errorCode:e.error||'',priority:event.policy&&event.policy.priority||'',freshness:event.policy&&event.policy.freshness||'',criticality:event.policy&&event.policy.criticality||'',cacheOpportunity:event.broker&&event.broker.wouldCacheHit,dedupOpportunity:event.broker&&event.broker.inflightDuplicate,budgetShortAllow:event.budget&&event.budget.short&&event.budget.short.wouldAllow,budgetLongAllow:event.budget&&event.budget.long&&event.budget.long.wouldAllow,meta:{mode:this.mode,shadowDecision:endDecision}});
};
Orchestrator.prototype.observeTransport=function(req){
 req=req||{};
 var policy=this.policy.resolve(req.provider,req.dataset);
 var budget=this.budget.observe({provider:req.provider,dataset:req.dataset,priority:policy.priority,cost:req.cost||1,scope:req.scope||null,scopes:req.scopes||null});
 var provider=String(req.provider||'').toUpperCase(),dataset=String(req.dataset||'').toUpperCase();
 var decision=Decision.transport({provider:provider,dataset:dataset,policy:policy,budget:budget});
 var event={at:Date.now(),mode:this.mode,phase:'TRANSPORT',provider:provider,dataset:dataset,scopes:req.scopes||null,cost:req.cost||1,policy:policy,budget:budget,decision:decision};
 this.events.push(event);if(this.events.length>this.maxEvents)this.events.shift();
 return event;
};
Orchestrator.prototype.resolveTransportPriority=function(req){
 req=req||{};
 var policy=this.policy.resolve(req.provider,req.dataset);
 var weights={P0:400,P1:300,P2:200,P3:100};
 return weights[String(policy.priority||"P2").toUpperCase()]||200;
};

Orchestrator.prototype.admitTransport=function(req){
 req=req||{};
 if(this.mode!=='NATIVE')
  return {allowed:false,reason:'NATIVE_MODE_REQUIRED'};
 var provider=String(req.provider||'').toUpperCase();
 var dataset=String(req.dataset||'').toUpperCase();
 var policy=this.policy.resolve(provider,dataset);
 var admission=this.budget.admit({
  provider:provider,dataset:dataset,priority:policy.priority,
  cost:req.cost,scope:req.scope,scopes:req.scopes
 });
 return Object.assign({mode:this.mode,priority:policy.priority},admission);
};

Orchestrator.prototype.feedbackTransport=function(provider,feedback){
 var e=this.budget.feedback(provider,feedback||{});
 this.events.push(e);if(this.events.length>this.maxEvents)this.events.shift();
 return e;
};
Orchestrator.prototype.status=function(){return{ok:true,version:'1.6',mode:this.mode,shadow:this.mode==='SHADOW',execution:{cacheFirst:this.execution.cacheFirst,dedup:this.execution.dedup,providerRawCache:false,cacheBoundary:'POST_FIREWALL_ONLY',budgetEnforcement:false,priorityEnforcement:false,cooldownEnforcement:false,decisionEnforcement:false},policy:this.policy.snapshot(),broker:this.broker.status(),budget:this.budget.status(),recentEvents:this.events.slice(-25)};};

module.exports=Orchestrator;
