'use strict';
var get=require('./http_json'),S=require('../Normalizer/symbols'),T=require('../Normalizer/timeframes');
var MAP={'1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','4h':'4H','1d':'1D','1w':'1W'};
function P(o){o=o||{};this.base=String(o.base||'https://www.okx.com').replace(/\/$/,'');this.id='OKX';this.symbolMap=Object.create(null);this.symbolMeta=Object.create(null);}
P.prototype.getCandles=function(symbol,tf,cb){
 var nt=T.normalize(tf),key=S.clean(symbol),mapped=this.symbolMap[key]||'',meta=this.symbolMeta[key]||null,parts=S.split(symbol),baseAsset=meta&&meta.baseAsset||String(parts&&parts.base||''),quoteAsset=meta&&meta.quoteAsset||String(parts&&parts.quote||''),bar=MAP[nt]||'1H',self=this;
 if(!baseAsset||!quoteAsset)return cb(new Error('OKX_SYMBOL_INVALID'));
 function urlFor(inst){return self.base+'/api/v5/market/candles?instId='+encodeURIComponent(inst)+'&bar='+encodeURIComponent(bar)+'&limit=300';}
 function parse(data,pair){
  var a=data&&Array.isArray(data.data)?data.data:[],out=[];
  for(var i=0;i<a.length;i++){var x=a[i];if(!Array.isArray(x)||x.length<6)continue;var row=[+x[0],+x[1],+x[2],+x[3],+x[4],+x[5]];if(row.every(isFinite))out.push(row);}
  out.sort(function(a,b){return a[0]-b[0];});
  if(!out.length)return cb(new Error('OKX_OHLCV_EMPTY'));
  cb(null,{ok:true,provider:'OKX_PUBLIC',exchange:'OKX',canonicalSymbol:meta?(meta.baseAsset+'/'+meta.quoteAsset):S.canonical(symbol),providerPair:pair,timeframe:nt,candles:out,volumeAvailable:true,volumeSource:'OKX_NATIVE',priceSource:'OKX_PUBLIC',timestampUnit:'ms'});
 }
 var primary=mapped||baseAsset+'-'+quoteAsset;
 get(urlFor(primary),{timeout:10000},function(e,o){
  if(e)return cb(e);
  var rows=o&&Array.isArray(o.data)?o.data:[];
  if(rows.length||quoteAsset!=='USD')return parse(o,primary);
  var fallback=baseAsset+'-USDT';
  get(urlFor(fallback),{timeout:10000},function(e2,o2){if(e2)return cb(e2);parse(o2,fallback);});
 });
};
P.prototype.listSymbols=function(cb){var self=this,url=this.base+'/api/v5/public/instruments?instType=SPOT';get(url,{timeout:12000,maxBytes:16*1024*1024},function(e,o){if(e)return cb(e);if(!o||String(o.code||'0')!=='0')return cb(new Error('OKX_INSTRUMENTS_'+String(o&&o.code||'INVALID')+':'+String(o&&o.msg||'')));var rows=Array.isArray(o.data)?o.data:[],out=[],seen=Object.create(null);for(var i=0;i<rows.length;i++){var x=rows[i]||{},state=String(x.state||'').toLowerCase(),base=String(x.baseCcy||'').toUpperCase().replace(/[^A-Z0-9]/g,''),quote=String(x.quoteCcy||'').toUpperCase().replace(/[^A-Z0-9]/g,''),inst=String(x.instId||''),symbol=S.clean(base+quote);if(state&&state!=='live')continue;if(!base||!quote||!inst||!symbol||seen[symbol])continue;seen[symbol]=1;self.symbolMap[symbol]=inst;self.symbolMeta[symbol]={baseAsset:base,quoteAsset:quote,providerPair:inst};out.push({symbol:symbol,baseAsset:base,quoteAsset:quote,market:base+'/'+quote,marketType:'SPOT',status:state||'live',providerPair:inst});}out.sort(function(a,b){return a.symbol.localeCompare(b.symbol);});if(!out.length)return cb(new Error('OKX_SYMBOLS_EMPTY'));cb(null,{ok:true,exchange:'OKX',providerId:'OKX',dynamic:true,endpoint:'/api/v5/public/instruments?instType=SPOT',symbols:out});});};
module.exports=P;
