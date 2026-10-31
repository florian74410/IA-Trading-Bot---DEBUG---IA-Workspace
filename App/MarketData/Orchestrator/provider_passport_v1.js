'use strict';

var UNKNOWN_NON_BLOCKING='OBSERVE_ONLY_NON_BLOCKING';

var PASSPORTS={
 COINGECKO:{
  provider:'COINGECKO',status:'PARTIAL',transports:['REST'],
  quota:{model:'DEMO_KNOWN_ANONYMOUS_UNKNOWN',provenance:['DOCUMENTED','OBSERVED_429','UNKNOWN'],enforcementPolicy:'CONDITIONAL',nativeEnforcementReady:false},
  knownLimits:{demo:{short:{limit:100,windowMs:60000},monthly:{limit:10000,reserve:2000,windowMs:2592000000}},anonymous:'UNKNOWN'},
  policy:{defined:true,ttlDefined:true,priorityDefined:true,criticalityDefined:true},
  notes:['Demo profile documented; anonymous runtime limits remain UNKNOWN and non-blocking.']
 },
 DEFILLAMA:{
  provider:'DEFILLAMA',status:'PARTIAL',transports:['REST'],
  quota:{model:'UNKNOWN',provenance:['UNKNOWN'],enforcementPolicy:UNKNOWN_NON_BLOCKING,nativeEnforcementReady:false},
  knownLimits:'UNKNOWN',
  policy:{defined:true,ttlDefined:true,priorityDefined:true,criticalityDefined:true},
  notes:['Cache/policy available; hard provider quota is intentionally not invented.']
 },
 GMX:{
  provider:'GMX',status:'PARTIAL',transports:['REST'],
  quota:{model:'UNKNOWN',provenance:['UNKNOWN'],enforcementPolicy:UNKNOWN_NON_BLOCKING,nativeEnforcementReady:false},
  knownLimits:'UNKNOWN',
  policy:{defined:true,ttlDefined:true,priorityDefined:true,criticalityDefined:true},
  notes:['Provider policy exists; hard rate limit remains UNKNOWN and non-blocking.']
 },
 DEXSCREENER:{
  provider:'DEXSCREENER',status:'READY',transports:['REST'],
  quota:{model:'ROUTE_RPM',provenance:['DOCUMENTED'],enforcementPolicy:'SHADOW_ELIGIBLE',nativeEnforcementReady:false},
  knownLimits:{pairRoutes:{limit:300,windowMs:60000},profileBoostOrderRoutes:{limit:60,windowMs:60000}},
  policy:{defined:true,ttlDefined:true,priorityDefined:true,criticalityDefined:true},
  notes:['Current IA-TB pair-liquidity route belongs to the documented 300 requests/min family.']
 },
 BINANCE:{
  provider:'BINANCE',status:'READY',transports:['REST','STREAM'],
  quota:{model:'WEIGHTED_MULTI_SCOPE',provenance:['DOCUMENTED'],enforcementPolicy:'SHADOW_ELIGIBLE',nativeEnforcementReady:false},
  knownLimits:{
   spotRequestWeight:{limit:6000,windowMs:60000,unit:'REQUEST_WEIGHT'},
   usdMRequestWeight:{limit:2400,windowMs:60000,unit:'REQUEST_WEIGHT'},
   endpoints:{spotKlines:2,usdMDepth:'2/5/10/20 by depth',openInterest:1,premiumIndex:'1 symbol / 10 all'}
  },
  policy:{defined:true,ttlDefined:true,priorityDefined:true,criticalityDefined:true},
  notes:['Weighted REST scopes modeled; runtime enforcement remains disabled while Shadow is authoritative.']
 },
 HYPERLIQUID:{
  provider:'HYPERLIQUID',status:'READY',transports:['REST','STREAM'],
  quota:{model:'WEIGHTED',provenance:['DOCUMENTED'],enforcementPolicy:'SHADOW_ELIGIBLE',nativeEnforcementReady:false},
  knownLimits:{
   restWeight:{limit:1200,windowMs:60000,unit:'REQUEST_WEIGHT'},
   websocket:{connections:10,newConnectionsPerMinute:30,subscriptions:1000,messagesPerMinute:2000,inflightPosts:100},
   endpoints:{l2Book:2,metaAndAssetCtxs:20,candleSnapshot:'20 base + additional weight per 60 returned items'}
  },
  policy:{defined:true,ttlDefined:true,priorityDefined:true,criticalityDefined:true},
  notes:['REST weight model and main WebSocket ceilings are documented.']
 },
 KRAKEN:{
  provider:'KRAKEN',status:'PARTIAL',transports:['REST'],
  quota:{model:'SAFE_PACE',provenance:['SAFE_RECOMMENDATION'],enforcementPolicy:UNKNOWN_NON_BLOCKING,nativeEnforcementReady:false},
  knownLimits:{safePaceMs:1000,hardLimit:'UNKNOWN'},
  policy:{defined:true,ttlDefined:true,priorityDefined:true,criticalityDefined:true},
  notes:['Safe pacing remains advisory/observe-only until an exact applicable public hard limit is verified.']
 },
 OKX:{
  provider:'OKX',status:'PARTIAL',transports:['REST','STREAM'],
  quota:{model:'MIXED_ENDPOINT',provenance:['DOCUMENTED','UNKNOWN'],enforcementPolicy:'SCOPED',nativeEnforcementReady:false},
  knownLimits:{
   candles:{limit:40,windowMs:2000,scope:'IP'},
   books:{limit:40,windowMs:2000,scope:'IP'},
   openInterest:'UNKNOWN'
  },
  policy:{defined:true,ttlDefined:true,priorityDefined:true,criticalityDefined:true},
  notes:['Candles/books are documented and eligible in Shadow; open-interest remains observe-only/UNKNOWN.']
 },
 BYBIT:{
  provider:'BYBIT',status:'READY',transports:['REST','STREAM'],
  quota:{model:'MULTI_SCOPE_DYNAMIC',provenance:['DOCUMENTED','OBSERVED_HEADER'],enforcementPolicy:'SHADOW_ELIGIBLE',nativeEnforcementReady:false},
  knownLimits:{
   globalIp:{limit:600,windowMs:5000},
   endpointLimits:'DYNAMIC_FROM_X_BAPI_LIMIT_HEADERS',
   headers:['x-bapi-limit','x-bapi-limit-status','x-bapi-limit-reset-timestamp'],
   rateLimitCode:10006
  },
  policy:{defined:true,ttlDefined:true,priorityDefined:true,criticalityDefined:true},
  notes:['Global IP ceiling is documented; endpoint-specific limits are learned from authoritative response headers.']
 }
};

function get(provider){
 var id=String(provider||'').toUpperCase(),x=PASSPORTS[id];
 return x?JSON.parse(JSON.stringify(x)):null;
}
function list(){return Object.keys(PASSPORTS).map(get);}
function summary(){
 var out={total:0,ready:0,partial:0,unknown:0,nativeEnforcementReady:0,observeOnlyNonBlocking:0};
 list().forEach(function(x){
  out.total++;
  if(x.status==='READY')out.ready++;else if(x.status==='PARTIAL')out.partial++;else out.unknown++;
  if(x.quota.nativeEnforcementReady)out.nativeEnforcementReady++;
  if(x.quota.enforcementPolicy===UNKNOWN_NON_BLOCKING)out.observeOnlyNonBlocking++;
 });
 return out;
}
function validate(p){
 var x=get(p);if(!x)return{ok:false,reason:'PROVIDER_PASSPORT_MISSING'};
 var required=['provider','status','transports','quota','policy','notes'];
 for(var i=0;i<required.length;i++)if(x[required[i]]==null)return{ok:false,reason:'PROVIDER_PASSPORT_FIELD_MISSING:'+required[i]};
 if(!x.quota.model||!Array.isArray(x.quota.provenance)||!x.quota.enforcementPolicy)return{ok:false,reason:'PROVIDER_PASSPORT_QUOTA_INCOMPLETE'};
 return{ok:true,passport:x};
}
function isBlockingEligible(provider){
 var x=get(provider);
 if(!x)return false;
 return x.quota.enforcementPolicy!=='OBSERVE_ONLY_NON_BLOCKING'&&x.quota.model!=='UNKNOWN';
}
module.exports={get:get,list:list,summary:summary,validate:validate,isBlockingEligible:isBlockingEligible,UNKNOWN_NON_BLOCKING:UNKNOWN_NON_BLOCKING};
