'use strict';

function q(urlObj,key){
 try{return urlObj.searchParams.get(key);}catch(e){return null;}
}
function bodyJson(opts){
 try{return opts&&opts.body?JSON.parse(String(opts.body)):null;}catch(e){return null;}
}
function intervalMs(v){
 v=String(v||'').toLowerCase();var m=/^(\d+)([mhdw])$/.exec(v);if(!m)return null;
 var n=+m[1],u=m[2],mul=u==='m'?60000:u==='h'?3600000:u==='d'?86400000:604800000;return n*mul;
}
function hyperCandleEstimate(body){
 var r=body&&body.req||{},start=+r.startTime,end=+r.endTime,step=intervalMs(r.interval);
 if(!isFinite(start)||!isFinite(end)||!step||end<=start)return 21;
 var items=Math.max(1,Math.ceil((end-start)/step));
 return 20+Math.ceil(items/60);
}
function binanceDepthCost(limit){
 limit=+limit||20;
 if(limit<=50)return 2;
 if(limit<=100)return 5;
 if(limit<=500)return 10;
 return 20;
}
function resolve(urlObj,opts,provider){
 provider=String(provider||'').toUpperCase();var host=String(urlObj.hostname||'').toLowerCase(),path=String(urlObj.pathname||''),body=bodyJson(opts),type=body&&body.type;
 if(provider==='BINANCE'){
  if(host==='api.binance.com'&&path==='/api/v3/klines')return{provider:'BINANCE',dataset:'SPOT_CANDLES',scope:'BINANCE_SPOT_WEIGHT',cost:2,costMode:'DOCUMENTED_FIXED'};
  if(host==='fapi.binance.com'&&path==='/fapi/v1/depth')return{provider:'BINANCE',dataset:'PERP_ORDERBOOK',scope:'BINANCE_USDM_WEIGHT',cost:binanceDepthCost(q(urlObj,'limit')),costMode:'DOCUMENTED_PARAMETERIZED'};
  if(host==='fapi.binance.com'&&path==='/fapi/v1/openInterest')return{provider:'BINANCE',dataset:'OPEN_INTEREST',scope:'BINANCE_USDM_WEIGHT',cost:1,costMode:'DOCUMENTED_FIXED'};
  if(host==='fapi.binance.com'&&path==='/fapi/v1/premiumIndex')return{provider:'BINANCE',dataset:'MARK_PRICE',scope:'BINANCE_USDM_WEIGHT',cost:q(urlObj,'symbol')?1:10,costMode:'DOCUMENTED_PARAMETERIZED'};
  return null;
 }
 if(provider==='HYPERLIQUID'&&path==='/info'&&body){
  if(type==='l2Book')return{provider:'HYPERLIQUID',dataset:'PERP_ORDERBOOK',scope:'HYPERLIQUID_REST_WEIGHT',cost:2,costMode:'DOCUMENTED_FIXED'};
  if(type==='candleSnapshot')return{provider:'HYPERLIQUID',dataset:'PERP_CANDLES',scope:'HYPERLIQUID_REST_WEIGHT',cost:hyperCandleEstimate(body),costMode:'DOCUMENTED_BASE_PLUS_ESTIMATED_RESPONSE_WEIGHT'};
  if(type==='metaAndAssetCtxs')return{provider:'HYPERLIQUID',dataset:'OPEN_INTEREST_CONTEXT',scope:'HYPERLIQUID_REST_WEIGHT',cost:20,costMode:'DOCUMENTED_DEFAULT_INFO'};
  return{provider:'HYPERLIQUID',dataset:String(type||'INFO').toUpperCase(),scope:'HYPERLIQUID_REST_WEIGHT',cost:20,costMode:'DOCUMENTED_DEFAULT_INFO'};
 }
 return null;
}
function budgetProfiles(){
 return{
  BINANCE:{
   limitModel:'WEIGHTED',shortLimit:null,longLimit:null,costDefault:1,
   weightedScopes:{
    BINANCE_SPOT_WEIGHT:{windowMs:60000,limit:6000,reserve:0,unit:'REQUEST_WEIGHT',source:'BINANCE_SPOT_DOCUMENTED_CURRENT'},
    BINANCE_USDM_WEIGHT:{windowMs:60000,limit:2400,reserve:0,unit:'REQUEST_WEIGHT',source:'BINANCE_USDM_EXCHANGEINFO'}
   }
  },
  HYPERLIQUID:{
   limitModel:'WEIGHTED',shortLimit:null,longLimit:null,costDefault:20,
   weightedScopes:{
    HYPERLIQUID_REST_WEIGHT:{windowMs:60000,limit:1200,reserve:0,unit:'REQUEST_WEIGHT',source:'HYPERLIQUID_OFFICIAL'}
   }
  }
 };
}
module.exports={resolve:resolve,budgetProfiles:budgetProfiles};
