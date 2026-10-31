'use strict';
var http=require('http'),https=require('https'),URL=require('url').URL,Telemetry=require('../Orchestrator/api_telemetry'),Limits=require('../Orchestrator/request_limit_profile_v1'),TransportBridge=require('../Orchestrator/transport_orchestrator_bridge');
var NativeDispatcher=require("../Orchestrator/native_request_dispatcher");
var nativeDispatcher=new NativeDispatcher({
 admit:function(req){return TransportBridge.admit(req);},
 maxQueue:500,
 maxWaitMs:30000
});
var REQ_SEQ=0;
function providerFromHost(host){host=String(host||'').toLowerCase();if(host.indexOf('coingecko')>=0)return'COINGECKO';if(host.indexOf('llama.fi')>=0||host.indexOf('defillama')>=0)return'DEFILLAMA';if(host.indexOf('binance')>=0)return'BINANCE';if(host.indexOf('okx')>=0)return'OKX';if(host.indexOf('kraken')>=0)return'KRAKEN';if(host.indexOf('bybit')>=0)return'BYBIT';if(host.indexOf('hyperliquid')>=0)return'HYPERLIQUID';if(host.indexOf('gmx')>=0)return'GMX';if(host.indexOf('dexscreener')>=0)return'DEXSCREENER';return host?host.toUpperCase():'UNKNOWN';}
function reqId(){REQ_SEQ=(REQ_SEQ+1)%1000000000;return process.pid+'-'+Date.now()+'-'+REQ_SEQ;}
function quotaHeaders(h){h=h||{};var allow=['retry-after','x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset','x-rate-limit-limit','x-rate-limit-remaining','x-rate-limit-reset','x-mbx-used-weight','x-mbx-used-weight-1m','x-mbx-order-count-10s','x-mbx-order-count-1m','x-bapi-limit','x-bapi-limit-status','x-bapi-limit-reset-timestamp'];var out={};allow.forEach(function(k){if(h[k]!=null)out[k]=String(h[k]);});return out;}
function err(code,status,contentType){var e=new Error(code);if(status)e.statusCode=status;if(contentType)e.contentType=contentType;return e;}
function request(url,opts,cb){opts=opts||{};var redirects=+opts._redirects||0,u=new URL(url),lib=u.protocol==='https:'?https:http,done=false,started=Date.now(),rid=reqId(),provider=String(opts.telemetryProvider||providerFromHost(u.hostname)).toUpperCase(),limitProfile=Limits.resolve(u,opts,provider),dataset=String(opts.telemetryDataset||(limitProfile&&limitProfile.dataset)||'').toUpperCase(),cost=opts.telemetryCost==null?(limitProfile&&limitProfile.cost||1):+opts.telemetryCost,scopes=limitProfile&&Array.isArray(limitProfile.scopes)?limitProfile.scopes:[],transport=((
 TransportBridge.status().mode==="NATIVE"||
 process.env.IATB_HTTP_BUDGET_MODE==="NATIVE"
)?null:TransportBridge.observe({
 provider:provider,dataset:dataset,cost:cost,scopes:scopes
})),policy=transport&&transport.policy||null,budget=transport&&transport.budget||null;
 Telemetry.emit({requestId:rid,timestamp:started,provider:provider,host:u.hostname,method:opts.method||'GET',path:u.pathname,dataset:dataset,phase:'HTTP_START',cost:cost,priority:policy&&policy.priority||'',freshness:policy&&policy.freshness||'',criticality:policy&&policy.criticality||'',budgetShortAllow:budget&&budget.short&&budget.short.wouldAllow,budgetLongAllow:budget&&budget.long&&budget.long.wouldAllow,meta:{redirectDepth:redirects,budgetScopes:scopes.map(function(x){return x.id||x.scope||String(x);}),costMode:limitProfile&&limitProfile.costMode||'DEFAULT',scopeBudgets:budget&&budget.scopes||[],weightedBudget:budget&&budget.weighted||null}});
 var headers=Object.assign({'Accept':'application/json','Accept-Encoding':'identity','User-Agent':'IA-TB-MarketData/2.0'},opts.headers||{});
 function finishTelemetry(ok,status,responseBytes,errorCode,responseHeaders){Telemetry.emit({requestId:rid,timestamp:started,completedAt:Date.now(),provider:provider,host:u.hostname,method:opts.method||'GET',path:u.pathname,dataset:dataset,phase:'HTTP_END',statusCode:status||null,ok:!!ok,latencyMs:Date.now()-started,responseBytes:responseBytes==null?null:responseBytes,cost:cost,priority:policy&&policy.priority||'',freshness:policy&&policy.freshness||'',criticality:policy&&policy.criticality||'',budgetShortAllow:budget&&budget.short&&budget.short.wouldAllow,budgetLongAllow:budget&&budget.long&&budget.long.wouldAllow,errorCode:errorCode||'',meta:{redirectDepth:redirects,quotaHeaders:quotaHeaders(responseHeaders),budgetScopes:scopes.map(function(x){return x.id||x.scope||String(x);}),costMode:limitProfile&&limitProfile.costMode||'DEFAULT',scopeBudgets:budget&&budget.scopes||[],weightedBudget:budget&&budget.weighted||null}});}
 function executeHttp(){
 var req=lib.request({method:opts.method||'GET',hostname:u.hostname,port:u.port||undefined,path:u.pathname+u.search,headers:headers,timeout:opts.timeout||12000},function(res){
  var status=+res.statusCode||0,location=res.headers&&res.headers.location;
 if(status===429){
  TransportBridge.feedback(provider,Limits.feedback(limitProfile,status,res.headers,null,null));
 }
  if(status>=300&&status<400&&location){
   res.resume();done=true;if(redirects>=3){finishTelemetry(false,status,0,'PROVIDER_TOO_MANY_REDIRECTS');return cb(err('PROVIDER_TOO_MANY_REDIRECTS',status));}
   var next;try{next=new URL(location,u).toString();}catch(x){finishTelemetry(false,status,0,'PROVIDER_REDIRECT_INVALID');return cb(err('PROVIDER_REDIRECT_INVALID',status));}
   finishTelemetry(true,status,0,'REDIRECT',res.headers);var no=Object.assign({},opts,{_redirects:redirects+1});return request(next,no,cb);
  }
  var a=[],n=0,max=opts.maxBytes||8*1024*1024;
  res.on('data',function(c){n+=c.length;if(n<=max)a.push(c);});
 res.on('error',function(e){
  if(done)return;
  done=true;
  var code=e&&e.message||'PROVIDER_RESPONSE_ERROR';
  finishTelemetry(false,status,n,code,res.headers);
  var re=err(code,status);re.retryAfterMs=Limits.feedback(limitProfile,status,res.headers,null,null).retryAfterMs||0;cb(re);
 });
 res.on('close',function(){
  if(done||res.complete)return;
  done=true;
  finishTelemetry(false,status,n,'PROVIDER_RESPONSE_INTERRUPTED',res.headers);
  var re=err('PROVIDER_RESPONSE_INTERRUPTED',status);re.retryAfterMs=Limits.feedback(limitProfile,status,res.headers,null,null).retryAfterMs||0;cb(re);
 });
  res.on('end',function(){if(done)return;done=true;if(n>max){finishTelemetry(false,status,n,'PROVIDER_RESPONSE_TOO_LARGE',res.headers);return cb(err('PROVIDER_RESPONSE_TOO_LARGE',status));}
   var txt=Buffer.concat(a).toString('utf8'),o=null,ct=String(res.headers&&res.headers['content-type']||'').toLowerCase(),jsonError=null;
   try{o=JSON.parse(txt||'{}');}catch(x){jsonError=x;}
   if(status!==429){var fb=Limits.feedback(limitProfile,status,res.headers,o,null);TransportBridge.feedback(provider,fb);}
   if(status>=400){var msg=o&&(o.error||o.message);var e=err(msg?String(msg):('PROVIDER_HTTP_'+status),status,ct);e.retryAfterMs=Limits.feedback(limitProfile,status,res.headers,o,null).retryAfterMs||0;e.quotaHeaders=quotaHeaders(res.headers);finishTelemetry(false,status,n,e.message,res.headers);return cb(e);}
   if(jsonError){var je=err(/^application\/json\b/.test(ct)||/\+json\b/.test(ct)?'PROVIDER_JSON_INVALID':'PROVIDER_NON_JSON_RESPONSE',status,ct);finishTelemetry(false,status,n,je.message,res.headers);return cb(je);}
   finishTelemetry(true,status,n,'',res.headers);cb(null,o,res);
  });
 });
 req.on('timeout',function(){req.destroy(err('PROVIDER_TIMEOUT'));});
 req.on('error',function(e){if(done)return;done=true;finishTelemetry(false,e&&e.statusCode||null,0,e&&e.message||'PROVIDER_REQUEST_ERROR');cb(e);});
 if(opts.body)req.write(opts.body);req.end();
 }

 var nativeRequired=process.env.IATB_HTTP_BUDGET_MODE==="NATIVE"||
  TransportBridge.status().mode==="NATIVE";

 if(nativeRequired){
  nativeDispatcher.submit({
   provider:provider,
   dataset:dataset,
   cost:cost,
   scopes:scopes,
   priority:TransportBridge.priority({provider:provider,dataset:dataset})
  },function(){
   executeHttp();
  }).catch(function(e){
   if(done)return;
   done=true;
   if(e&&e.message==="DISPATCHER_ADMISSION_DENIED"){
    e=err("PROVIDER_BUDGET_DENIED");
   }
   finishTelemetry(false,null,0,e.message);
   cb(e);
  });
 }else{
  executeHttp();
 }
}
module.exports=request;
