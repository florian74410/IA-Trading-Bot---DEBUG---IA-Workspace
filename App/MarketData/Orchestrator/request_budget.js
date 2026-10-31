'use strict';

function finitePositive(v){v=+v;return isFinite(v)&&v>0?v:null;}
function asInt(v){v=+v;return isFinite(v)?Math.round(v):null;}
function upper(v,d){return String(v==null?(d||''):v).toUpperCase();}
function makeScope(id,cfg){
 cfg=cfg||{};return{
  id:upper(id,'DEFAULT'),
  kind:upper(cfg.kind,'WEIGHTED'),
  windowMs:Math.max(1,+cfg.windowMs||60000),
  limit:finitePositive(cfg.limit),
  reserve:Math.max(0,+cfg.reserve||0),
  minIntervalMs:Math.max(0,+cfg.minIntervalMs||0),
  unit:upper(cfg.unit,'REQUEST'),
  source:upper(cfg.source,'CONFIG'),
  dynamicHeaders:cfg.dynamicHeaders||null,
  events:[],
  lastObservedAt:0,
  cooldownUntil:0,
  lastRateLimitAt:0,
  observedLimit:null,
  observedRemaining:null,
  observedResetAt:null
 };
}
function Budget(o){
 o=o||{};
 this.mode=upper(o.mode,'SHADOW');
 this.providers=Object.create(null);
 this.events=[];
 this.maxEvents=Math.max(50,+o.maxEvents||500);
}
Budget.prototype.configure=function(provider,cfg){
 provider=upper(provider);cfg=cfg||{};
 var shortLimit=finitePositive(cfg.shortLimit),longLimit=finitePositive(cfg.longLimit),scopes=Object.create(null);
 Object.keys(cfg.weightedScopes||{}).forEach(function(id){var x=Object.assign({kind:'WEIGHTED'},cfg.weightedScopes[id]);scopes[upper(id)]=makeScope(id,x);});
 Object.keys(cfg.limitScopes||{}).forEach(function(id){scopes[upper(id)]=makeScope(id,cfg.limitScopes[id]);});
 var limitModel=upper(cfg.limitModel,(Object.keys(scopes).length?'SCOPED':(shortLimit||longLimit)?'KNOWN':'UNKNOWN'));
 var enforcementPolicy=upper(cfg.enforcementPolicy,limitModel==='UNKNOWN'?'OBSERVE_ONLY_NON_BLOCKING':'SHADOW_ELIGIBLE');
 this.providers[provider]={
  limitModel:limitModel,
  enforcementPolicy:enforcementPolicy,
  shortWindowMs:Math.max(1000,+cfg.shortWindowMs||60000),
  shortLimit:shortLimit,
  longWindowMs:Math.max(60000,+cfg.longWindowMs||2592000000),
  longLimit:longLimit,
  reserve:longLimit?Math.max(0,Math.min(longLimit,+cfg.reserve||0)):0,
  costDefault:Math.max(0.0001,+cfg.costDefault||1),
  cooldownUntil:0,
  cooldownReason:'',
  short:[],long:[],limitScopes:scopes
 };
 return this.providers[provider];
};
Budget.prototype._state=function(provider){
 provider=upper(provider);
 return this.providers[provider]||this.configure(provider,{limitModel:'UNKNOWN'});
};
Budget.prototype._ensureScope=function(p,item){
 var spec=typeof item==='string'?{id:item}:(item||{}),id=upper(spec.id||spec.scope);
 if(!id)return null;
 if(!p.limitScopes[id]){
  if(!spec.kind&&!spec.limit&&!spec.minIntervalMs&&!spec.dynamicHeaders)return null;
  p.limitScopes[id]=makeScope(id,spec);
 }
 return p.limitScopes[id];
};
Budget.prototype.observe=function(req){
 req=req||{};var now=Date.now(),p=this._state(req.provider),cost=Math.max(0.0001,+req.cost||p.costDefault);
 p.short=p.short.filter(function(x){return now-x.at<p.shortWindowMs;});
 p.long=p.long.filter(function(x){return now-x.at<p.longWindowMs;});
 var shortUsed=p.short.reduce(function(z,x){return z+x.cost;},0),longUsed=p.long.reduce(function(z,x){return z+x.cost;},0);
 var shortKnown=p.shortLimit!=null,longKnown=p.longLimit!=null,usableLong=longKnown?Math.max(0,p.longLimit-p.reserve):null;
 var requested=Array.isArray(req.scopes)?req.scopes.slice():(req.scope?[{id:req.scope}]:[]),scopeDecisions=[],weighted=null;
 requested.forEach(function(item){
  var s=this._ensureScope(p,item);if(!s)return;
  s.events=s.events.filter(function(x){return now-x.at<s.windowMs;});
  var used=s.events.reduce(function(z,x){return z+x.cost;},0),usable=s.limit==null?null:Math.max(0,s.limit-s.reserve);
  var windowAllow=s.limit==null?null:used+cost<=usable;
  var paceAllow=s.minIntervalMs>0?(s.lastObservedAt===0||now-s.lastObservedAt>=s.minIntervalMs):null;
  var cooldownActive=(p.cooldownUntil>now)||(s.cooldownUntil>now);
  var d={known:s.limit!=null||s.minIntervalMs>0,scope:s.id,kind:s.kind,unit:s.unit,source:s.source,cost:cost,used:used,limit:s.limit,reserve:s.reserve,usable:usable,wouldAllowWindow:windowAllow,minIntervalMs:s.minIntervalMs,lastObservedAt:s.lastObservedAt||null,wouldAllowPace:paceAllow,cooldownActive:cooldownActive,cooldownUntil:Math.max(p.cooldownUntil||0,s.cooldownUntil||0)||null,observedLimit:s.observedLimit,observedRemaining:s.observedRemaining,observedResetAt:s.observedResetAt};
  d.blockingEligible=s.kind!=='OBSERVE_ONLY'&&d.known;
  d.wouldAllow=(windowAllow!==false)&&(paceAllow!==false)&&!cooldownActive;
  scopeDecisions.push(d);
  if(!weighted&&s.kind==='WEIGHTED')weighted=d;
  s.events.push({at:now,cost:cost});s.lastObservedAt=now;
 },this);
 var decision={
  mode:this.mode,provider:upper(req.provider),dataset:req.dataset,priority:req.priority||'P2',cost:cost,limitModel:p.limitModel,enforcementPolicy:p.enforcementPolicy,
  scope:requested.length===1?upper(requested[0].id||requested[0].scope):null,
  short:{known:shortKnown,used:shortUsed,limit:p.shortLimit,wouldAllow:shortKnown?shortUsed+cost<=p.shortLimit:null},
  long:{known:longKnown,used:longUsed,limit:p.longLimit,reserve:p.reserve,usable:usableLong,wouldAllow:longKnown?longUsed+cost<=usableLong:null},
  scopes:scopeDecisions,weighted:weighted,
  providerCooldown:{active:p.cooldownUntil>now,until:p.cooldownUntil||null,reason:p.cooldownReason||''}
 };
 var providerObserveOnly=p.enforcementPolicy==='OBSERVE_ONLY_NON_BLOCKING'||p.limitModel==='UNKNOWN';
 decision.wouldAllow=(decision.short.wouldAllow!==false)&&(decision.long.wouldAllow!==false)&&scopeDecisions.every(function(x){return x.wouldAllow!==false;})&&!decision.providerCooldown.active;
 decision.blockingEligible=!providerObserveOnly&&(shortKnown||longKnown||scopeDecisions.some(function(x){return x.blockingEligible;})||decision.providerCooldown.active);
 decision.enforceable=decision.blockingEligible;
 p.short.push({at:now,cost:cost});p.long.push({at:now,cost:cost});
 this.events.push(Object.assign({at:now},decision));if(this.events.length>this.maxEvents)this.events.shift();
 return decision;
};
Budget.prototype.admit=function(req){
 req=req||{};
 var now=Date.now();
 var provider=upper(req.provider);
 var p=this._state(provider);
 var cost=req.cost==null?p.costDefault:Number(req.cost);

 if(!isFinite(cost)||cost<=0)
  return {allowed:false,provider:provider,reason:"INVALID_COST",at:now};

 var scopes=Array.isArray(req.scopes)?req.scopes:
  (req.scope?[{id:req.scope}]:[]);

 var known=p.shortLimit!=null||p.longLimit!=null;
 var checks=[];
 var allowed=p.cooldownUntil<=now;
 var retryAfterMs=Math.max(0,p.cooldownUntil-now);
 function waitWindow(events,windowMs,limit,reserve){
  if(limit==null)return 0;
  var usable=Math.max(0,limit-(reserve||0));
  var used=events.reduce(function(n,x){return n+x.cost;},0);
  if(cost>usable)return null;
  if(used+cost<=usable)return 0;
  var sorted=events.slice().sort(function(a,b){return a.at-b.at;});
  for(var i=0;i<sorted.length;i++){
   used-=sorted[i].cost;
   if(used+cost<=usable)
    return Math.max(1,sorted[i].at+windowMs-now);
  }
  return null;
 }
 function applyWait(value){
  if(value===null){retryAfterMs=null;return;}
  if(retryAfterMs!==null)retryAfterMs=Math.max(retryAfterMs,value);
 }

 var short=p.short.filter(function(x){return now-x.at<p.shortWindowMs;});
 var long=p.long.filter(function(x){return now-x.at<p.longWindowMs;});

 var shortUsed=short.reduce(function(n,x){return n+x.cost;},0);
 var longUsed=long.reduce(function(n,x){return n+x.cost;},0);

 if(p.shortLimit!=null&&shortUsed+cost>p.shortLimit){
  allowed=false;
  applyWait(waitWindow(short,p.shortWindowMs,p.shortLimit,0));
 }
 if(p.longLimit!=null&&longUsed+cost>Math.max(0,p.longLimit-p.reserve)){
  allowed=false;
  applyWait(waitWindow(long,p.longWindowMs,p.longLimit,p.reserve));
 }

 scopes.forEach(function(item){
  var scope=this._ensureScope(p,item);
  if(!scope)return;

  if(scope.limit!=null||scope.minIntervalMs>0)known=true;

  var events=scope.events.filter(function(x){
   return now-x.at<scope.windowMs;
  });
  var used=events.reduce(function(n,x){return n+x.cost;},0);

  if(scope.cooldownUntil>now){
   allowed=false;
   applyWait(scope.cooldownUntil-now);
  }
  if(scope.limit!=null&&used+cost>Math.max(0,scope.limit-scope.reserve)){
   allowed=false;
   applyWait(waitWindow(events,scope.windowMs,scope.limit,scope.reserve));
  }
  if(scope.minIntervalMs>0&&scope.lastObservedAt>0&&
     now-scope.lastObservedAt<scope.minIntervalMs){
   allowed=false;
   applyWait(scope.lastObservedAt+scope.minIntervalMs-now);
  }

  checks.push({scope:scope,events:events});
 },this);

 if(!known)
  return {allowed:false,provider:provider,reason:"UNKNOWN_QUOTA",at:now};

 if(allowed){
  p.short=short;
  p.long=long;
  p.short.push({at:now,cost:cost});
  p.long.push({at:now,cost:cost});

  checks.forEach(function(x){
   x.scope.events=x.events;
   x.scope.events.push({at:now,cost:cost});
   x.scope.lastObservedAt=now;
  });
 }

 return {
  allowed:allowed,
  provider:provider,
  cost:cost,
  at:now,
  reason:allowed?"ADMITTED":"QUOTA_OR_COOLDOWN",
  retryAfterMs:allowed?0:retryAfterMs
 };
};

Budget.prototype.feedback=function(provider,feedback){
 feedback=feedback||{};var now=Date.now(),p=this._state(provider),headers=feedback.headers||{},requested=Array.isArray(feedback.scopes)?feedback.scopes:[],updated=[];
 requested.forEach(function(item){
  var s=this._ensureScope(p,item);if(!s)return;
  var map=s.dynamicHeaders||{},lk=String(map.limit||'').toLowerCase(),rk=String(map.remaining||'').toLowerCase(),tk=String(map.reset||'').toLowerCase();
  if(lk&&headers[lk]!=null){var lim=finitePositive(headers[lk]);if(lim!=null){s.limit=lim;s.observedLimit=lim;s.source='OBSERVED_HEADER';}}
  if(rk&&headers[rk]!=null){var rem=asInt(headers[rk]);if(rem!=null)s.observedRemaining=rem;}
  if(tk&&headers[tk]!=null){var reset=asInt(headers[tk]);if(reset!=null)s.observedResetAt=reset;}
  if(feedback.rateLimited){s.lastRateLimitAt=now;if(feedback.retryAfterMs>0)s.cooldownUntil=Math.max(s.cooldownUntil,now+feedback.retryAfterMs);}
  updated.push({scope:s.id,limit:s.limit,remaining:s.observedRemaining,resetAt:s.observedResetAt,cooldownUntil:s.cooldownUntil||null,source:s.source});
 },this);
 if(feedback.providerCooldownMs>0){p.cooldownUntil=Math.max(p.cooldownUntil,now+feedback.providerCooldownMs);p.cooldownReason=String(feedback.reason||'RATE_LIMIT');}
 else if(feedback.retryAfterMs>0&&feedback.rateLimited){p.cooldownUntil=Math.max(p.cooldownUntil,now+feedback.retryAfterMs);p.cooldownReason=String(feedback.reason||'RETRY_AFTER');}
 var event={at:now,mode:this.mode,phase:'FEEDBACK',provider:upper(provider),statusCode:feedback.statusCode||null,category:feedback.category||'UNKNOWN',rateLimited:!!feedback.rateLimited,retryAfterMs:feedback.retryAfterMs||null,providerCooldownUntil:p.cooldownUntil||null,reason:feedback.reason||'',updatedScopes:updated};
 this.events.push(event);if(this.events.length>this.maxEvents)this.events.shift();return event;
};
Budget.prototype.status=function(){
 var now=Date.now(),out={mode:this.mode,providers:{},recentEvents:this.events.slice(-25)};
 Object.keys(this.providers).forEach(function(id){
  var p=this.providers[id];p.short=p.short.filter(function(x){return now-x.at<p.shortWindowMs;});p.long=p.long.filter(function(x){return now-x.at<p.longWindowMs;});
  var scopes={};Object.keys(p.limitScopes).forEach(function(k){var s=p.limitScopes[k];s.events=s.events.filter(function(x){return now-x.at<s.windowMs;});scopes[k]={kind:s.kind,windowMs:s.windowMs,used:s.events.reduce(function(z,x){return z+x.cost;},0),limit:s.limit,reserve:s.reserve,minIntervalMs:s.minIntervalMs,unit:s.unit,source:s.source,lastObservedAt:s.lastObservedAt||null,cooldownUntil:s.cooldownUntil||null,observedLimit:s.observedLimit,observedRemaining:s.observedRemaining,observedResetAt:s.observedResetAt};});
  var weighted={};Object.keys(scopes).forEach(function(k){if(scopes[k].kind==='WEIGHTED')weighted[k]=scopes[k];});
  out.providers[id]={limitModel:p.limitModel,enforcementPolicy:p.enforcementPolicy,shortUsed:p.short.reduce(function(z,x){return z+x.cost;},0),shortLimit:p.shortLimit,longUsed:p.long.reduce(function(z,x){return z+x.cost;},0),longLimit:p.longLimit,reserve:p.reserve,costDefault:p.costDefault,providerCooldownUntil:p.cooldownUntil||null,providerCooldownReason:p.cooldownReason||'',limitScopes:scopes,weightedScopes:weighted};
 },this);
 return out;
};

module.exports=Budget;
