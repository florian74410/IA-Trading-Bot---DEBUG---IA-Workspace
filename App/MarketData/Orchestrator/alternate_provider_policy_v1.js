'use strict';

var CHAINS={
 SPOT_PRICE:{mode:'FALLBACK',providers:['BINANCE','OKX','KRAKEN','BYBIT']},
 SPOT_TICKER:{mode:'FALLBACK',providers:['BINANCE','OKX','KRAKEN','BYBIT']},
 SPOT_CANDLES:{mode:'FALLBACK',providers:['BINANCE','OKX','KRAKEN','BYBIT']},
 SPOT_ORDERBOOK:{mode:'FALLBACK',providers:['BINANCE','OKX','KRAKEN','BYBIT']},
 PERP_PRICE:{mode:'FALLBACK',providers:['BINANCE','BYBIT','OKX','HYPERLIQUID','GMX']},
 PERP_TICKER:{mode:'FALLBACK',providers:['BINANCE','BYBIT','OKX','HYPERLIQUID','GMX']},
 MARK_PRICE:{mode:'FALLBACK',providers:['BINANCE','BYBIT','OKX','HYPERLIQUID','GMX']},
 PERP_CANDLES:{mode:'FALLBACK',providers:['BINANCE','BYBIT','OKX','HYPERLIQUID','GMX']},
 PERP_ORDERBOOK:{mode:'FALLBACK',providers:['BINANCE','BYBIT','OKX','HYPERLIQUID']},
 DEX_PAIR_LIQUIDITY:{mode:'SINGLE',providers:['DEXSCREENER']},
 GLOBAL_MARKET:{mode:'SINGLE',providers:['COINGECKO']},
 OPEN_INTEREST_AGGREGATE:{mode:'AGGREGATE',providers:['BINANCE','OKX','BYBIT','HYPERLIQUID','GMX']}
};

var FALLBACKABLE={
 RATE_LIMIT:1,PROVIDER_ERROR:1,NETWORK_ERROR:1,TIMEOUT:1,UNHEALTHY:1,
 GEO_RESTRICTED:1,ACCESS_DENIED:1,DATA_FIREWALL_REJECT:1,EMPTY_RESPONSE:1,
 PROVIDER_DISABLED:1
};
var NON_FALLBACKABLE={
 AUTH_ERROR:1,REQUEST_INVALID:1,SYMBOL_INVALID:1,TIMEFRAME_INVALID:1,
 CONFIG_ERROR:1,CAPABILITY_MISSING:1,INTERNAL_ERROR:1
};

function id(x){return String(x||'').toUpperCase();}
function canonicalDataset(dataset){
 dataset=id(dataset);
 if(dataset==='OPEN_INTEREST'||dataset==='OPEN_INTEREST_CONTEXT'||dataset==='OPEN_INTEREST_OVERVIEW')return'OPEN_INTEREST_AGGREGATE';
 return dataset;
}
function get(dataset){
 var key=canonicalDataset(dataset),x=CHAINS[key];
 return x?{dataset:key,mode:x.mode,providers:x.providers.slice()}:null;
}
function rank(dataset,provider){
 var x=get(dataset);if(!x)return null;
 var i=x.providers.indexOf(id(provider));return i<0?null:i+1;
}
function next(dataset,provider,unhealthy){
 var x=get(dataset);if(!x||x.mode!=='FALLBACK')return null;
 var i=x.providers.indexOf(id(provider));if(i<0)return null;
 unhealthy=unhealthy||{};
 for(var n=i+1;n<x.providers.length;n++)if(!unhealthy[x.providers[n]])return{provider:x.providers[n],rank:n+1};
 return null;
}
function classifyError(err){
 var msg=id(err&&err.category||err&&err.code||err&&err.message||err||'');
 if(!msg)return{category:'UNKNOWN',fallbackable:false};
 var category='UNKNOWN';
 if(/RATE.?LIMIT|HTTP_429|50011|10006/.test(msg))category='RATE_LIMIT';
 else if(/TIMEOUT/.test(msg))category='TIMEOUT';
 else if(/ECONN|ENOTFOUND|EAI_AGAIN|NETWORK|SOCKET/.test(msg))category='NETWORK_ERROR';
 else if(/HTTP_5\d\d|PROVIDER_ERROR|UNAVAILABLE|EMPTY/.test(msg))category=/EMPTY/.test(msg)?'EMPTY_RESPONSE':'PROVIDER_ERROR';
 else if(/GEO|HTTP_451|REGION/.test(msg))category='GEO_RESTRICTED';
 else if(/ACCESS_DENIED|HTTP_403/.test(msg))category='ACCESS_DENIED';
 else if(/DATA_FIREWALL_REJECT|FIREWALL_REJECT/.test(msg))category='DATA_FIREWALL_REJECT';
 else if(/PROVIDER_DISABLED/.test(msg))category='PROVIDER_DISABLED';
 else if(/AUTH|HTTP_401/.test(msg))category='AUTH_ERROR';
 else if(/CAPABILITY_MISSING/.test(msg))category='CAPABILITY_MISSING';
 else if(/TIMEFRAME_MISMATCH|TIMEFRAME_INVALID/.test(msg))category='TIMEFRAME_INVALID';
 else if(/SYMBOL_INVALID|INVALID_SYMBOL/.test(msg))category='SYMBOL_INVALID';
 else if(/CONFIG/.test(msg))category='CONFIG_ERROR';
 else if(/INVALID|BAD_REQUEST|HTTP_400/.test(msg))category='REQUEST_INVALID';
 return{category:category,fallbackable:!!FALLBACKABLE[category],terminal:!!NON_FALLBACKABLE[category]};
}
function decision(dataset,provider,err,unhealthy){
 var chain=get(dataset),current=id(provider),r=rank(dataset,current),c=classifyError(err);
 if(!chain)return{action:'NO_ALTERNATE_POLICY',dataset:canonicalDataset(dataset),provider:current,rank:r,error:c};
 if(chain.mode==='AGGREGATE')return{action:'AGGREGATE_PARTIAL',dataset:chain.dataset,provider:current,rank:r,error:c,contributors:chain.providers};
 if(chain.mode==='SINGLE')return{action:err?'NO_PROVIDER_AVAILABLE':'USE_PROVIDER',dataset:chain.dataset,provider:current,rank:r,error:c};
 if(!err)return{action:'USE_PROVIDER',dataset:chain.dataset,provider:current,rank:r};
 if(!c.fallbackable)return{action:'STOP_NON_FALLBACKABLE_ERROR',dataset:chain.dataset,provider:current,rank:r,error:c};
 var n=next(chain.dataset,current,unhealthy);
 if(n)return{action:'TRY_NEXT_PROVIDER',dataset:chain.dataset,provider:current,rank:r,error:c,nextProvider:n.provider,nextRank:n.rank};
 return{action:'NO_PROVIDER_AVAILABLE',dataset:chain.dataset,provider:current,rank:r,error:c};
}
function list(){return Object.keys(CHAINS).sort().map(get);}
module.exports={get:get,list:list,rank:rank,next:next,classifyError:classifyError,decision:decision,canonicalDataset:canonicalDataset};
