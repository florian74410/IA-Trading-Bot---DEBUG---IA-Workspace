'use strict';
var Weighted=require('./weighted_request_profile_v1');

function q(u,k){try{return u.searchParams.get(k);}catch(e){return null;}}
function lowerHeaders(h){var o={};Object.keys(h||{}).forEach(function(k){o[String(k).toLowerCase()]=h[k];});return o;}
function retryAfterMs(h){h=lowerHeaders(h);var v=h['retry-after'];if(v==null)return 0;var n=+v;if(isFinite(n)&&n>=0)return Math.round(n*1000);var t=Date.parse(String(v));return isFinite(t)?Math.max(0,t-Date.now()):0;}
function krakenPair(u){return String(q(u,'pair')||'ALL').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function resolve(u,opts,provider){
 provider=String(provider||'').toUpperCase();
 var weighted=Weighted.resolve(u,opts,provider);if(weighted){weighted.scopes=[{id:weighted.scope}];return weighted;}
 var path=String(u.pathname||'');
 if(provider==='KRAKEN'){
  if(path==='/0/public/OHLC')return{provider:provider,dataset:'SPOT_CANDLES',cost:1,costMode:'SAFE_PACE',scopes:[{id:'KRAKEN_OHLC_'+krakenPair(u),kind:'SAFE_PACE',minIntervalMs:1000,unit:'REQUEST',source:'SAFE_RECOMMENDATION'}]};
  if(path==='/0/public/Depth')return{provider:provider,dataset:'SPOT_ORDERBOOK',cost:1,costMode:'SAFE_PACE',scopes:[{id:'KRAKEN_PUBLIC_IP',kind:'SAFE_PACE',minIntervalMs:1000,unit:'REQUEST',source:'SAFE_RECOMMENDATION'}]};
  return null;
 }
 if(provider==='OKX'){
  if(path==='/api/v5/market/candles')return{provider:provider,dataset:'SPOT_CANDLES',cost:1,costMode:'ENDPOINT_WINDOW',scopes:[{id:'OKX_CANDLES'}]};
  if(path==='/api/v5/market/books'){var inst=String(q(u,'instId')||'').toUpperCase();return{provider:provider,dataset:/\-SWAP$/.test(inst)?'PERP_ORDERBOOK':'SPOT_ORDERBOOK',cost:1,costMode:'ENDPOINT_WINDOW',scopes:[{id:'OKX_BOOKS'}]};}
  if(path==='/api/v5/public/open-interest')return{provider:provider,dataset:'OPEN_INTEREST',cost:1,costMode:'OBSERVE_ONLY',scopes:[{id:'OKX_OPEN_INTEREST'}]};
  return null;
 }
 if(provider==='BYBIT'){
  var endpoint=null,dataset='';
  if(path==='/v5/market/kline'){endpoint='BYBIT_KLINE';dataset='PERP_CANDLES';}
  else if(path==='/v5/market/orderbook'){endpoint='BYBIT_ORDERBOOK';dataset='PERP_ORDERBOOK';}
  else if(path==='/v5/market/tickers'){endpoint='BYBIT_TICKERS';dataset='OPEN_INTEREST_CONTEXT';}
  else return{provider:provider,dataset:'PUBLIC_API',cost:1,costMode:'GLOBAL_IP_WINDOW',scopes:[{id:'BYBIT_GLOBAL_IP'}]};
  return{provider:provider,dataset:dataset,cost:1,costMode:'HIERARCHICAL_DYNAMIC',scopes:[{id:'BYBIT_GLOBAL_IP'},{id:endpoint}]};
 }
 return null;
}
function budgetProfiles(){
 return{
  KRAKEN:{limitModel:'SAFE_PACE',enforcementPolicy:'OBSERVE_ONLY_NON_BLOCKING',shortLimit:null,longLimit:null,costDefault:1,limitScopes:{}},
  OKX:{limitModel:'ENDPOINT_WINDOW',shortLimit:null,longLimit:null,costDefault:1,limitScopes:{
   OKX_CANDLES:{kind:'ENDPOINT_WINDOW',windowMs:2000,limit:40,unit:'REQUEST',source:'DOCUMENTED'},
   OKX_BOOKS:{kind:'ENDPOINT_WINDOW',windowMs:2000,limit:40,unit:'REQUEST',source:'DOCUMENTED'},
   OKX_OPEN_INTEREST:{kind:'OBSERVE_ONLY',windowMs:2000,limit:null,unit:'REQUEST',source:'UNKNOWN'}
  }},
  BYBIT:{limitModel:'MULTI_SCOPE_DYNAMIC',shortLimit:null,longLimit:null,costDefault:1,limitScopes:{
   BYBIT_GLOBAL_IP:{kind:'ENDPOINT_WINDOW',windowMs:5000,limit:600,unit:'REQUEST',source:'DOCUMENTED'},
   BYBIT_KLINE:{kind:'DYNAMIC_WINDOW',windowMs:1000,limit:null,unit:'REQUEST',source:'OBSERVE_HEADER',dynamicHeaders:{limit:'x-bapi-limit',remaining:'x-bapi-limit-status',reset:'x-bapi-limit-reset-timestamp'}},
   BYBIT_ORDERBOOK:{kind:'DYNAMIC_WINDOW',windowMs:1000,limit:null,unit:'REQUEST',source:'OBSERVE_HEADER',dynamicHeaders:{limit:'x-bapi-limit',remaining:'x-bapi-limit-status',reset:'x-bapi-limit-reset-timestamp'}},
   BYBIT_TICKERS:{kind:'DYNAMIC_WINDOW',windowMs:1000,limit:null,unit:'REQUEST',source:'OBSERVE_HEADER',dynamicHeaders:{limit:'x-bapi-limit',remaining:'x-bapi-limit-status',reset:'x-bapi-limit-reset-timestamp'}}
  }}
 };
}
function feedback(profile,status,headers,body,errorCode){
 headers=lowerHeaders(headers);profile=profile||{};body=body||{};
 var provider=String(profile.provider||'').toUpperCase(),retry=retryAfterMs(headers),rateLimited=status===429,reason='',category='UNKNOWN',providerCooldownMs=0,msg=String(body.retMsg||body.ret_msg||body.message||body.msg||'');
 if(status===451){category='GEO_RESTRICTED';reason='HTTP_451_LEGAL_REGION';}
 else if(status===401){category='AUTH_ERROR';reason='HTTP_401';}
 else if(status===429){category='RATE_LIMIT';reason='HTTP_429';}
 else if(status===403){category='ACCESS_DENIED';reason='HTTP_403_ACCESS_OR_REGION';}
 else if(status>=500){category='PROVIDER_ERROR';reason='HTTP_'+status;}
 if(provider==='OKX'&&String(body.code||'')==='50011'){rateLimited=true;category='RATE_LIMIT';reason='OKX_50011';}
 if(provider==='BYBIT'){
  if(+body.retCode===10006){rateLimited=true;category='RATE_LIMIT';reason='BYBIT_10006';providerCooldownMs=retry||600000;}
  else if(status===403&&(/TOO\s*FREQUENT|RATE.?LIMIT/i.test(msg)||retry>0)){rateLimited=true;category='RATE_LIMIT';reason='BYBIT_HTTP_403_RATE_LIMIT';providerCooldownMs=retry||600000;}
  else if(status===403){rateLimited=false;category='ACCESS_DENIED';reason='BYBIT_HTTP_403_ACCESS_OR_REGION';providerCooldownMs=0;}
 }
 if(rateLimited&&retry>0&&!providerCooldownMs)providerCooldownMs=retry;
 return{provider:provider,scopes:profile.scopes||[],headers:headers,statusCode:status||null,rateLimited:rateLimited,retryAfterMs:retry,providerCooldownMs:providerCooldownMs,category:category,reason:reason||String(errorCode||'')};
}
module.exports={resolve:resolve,budgetProfiles:budgetProfiles,feedback:feedback};
