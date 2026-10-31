'use strict';
var get=require('./http_json'),S=require('../Normalizer/symbols'),T=require('../Normalizer/timeframes'),C=require('../Normalizer/candles');

function rows(o){
 var r=o&&o.result&&typeof o.result==='object'?o.result:{},k=Object.keys(r);
 for(var i=0;i<k.length;i++)if(k[i]!=='last'&&Array.isArray(r[k[i]]))return r[k[i]];
 return[];
}
function krakenError(o){
 var a=o&&Array.isArray(o.error)?o.error:[];
 return a.length?new Error(a.join(' · ')):null;
}
function P(o){
 o=o||{};
 this.base=String(o.base||'https://api.kraken.com').replace(/\/$/,'');
 this.id='KRAKEN';
 this.symbolMap=Object.create(null);this.symbolMeta=Object.create(null);
}
P.prototype.getCandles=function(symbol,tf,cb){
 var key=S.clean(symbol),pair=this.symbolMap[key]||S.krakenPair(symbol),meta=this.symbolMeta[key]||null,nt=T.normalize(tf),
     url=this.base+'/0/public/OHLC?pair='+encodeURIComponent(pair)+'&interval='+T.minutes(nt);
 get(url,{timeout:10000},function(e,o){
  if(e)return cb(e);
  var ke=krakenError(o);if(ke)return cb(ke);
  var n=C.fromKraken(rows(o));
  if(!n.candles.length)return cb(new Error('KRAKEN_OHLCV_EMPTY'));
  cb(null,{ok:true,provider:'KRAKEN_PUBLIC',exchange:'KRAKEN',canonicalSymbol:meta?(meta.baseAsset+'/'+meta.quoteAsset):S.canonical(symbol),providerPair:pair,timeframe:nt,candles:n.candles,volumeAvailable:n.volumeAvailable===true,positiveVolumeRows:n.positiveVolumeRows||0,volumeSource:n.volumeAvailable?'KRAKEN_NATIVE':'NONE',priceSource:'KRAKEN_PUBLIC',timestampUnit:'ms'});
 });
};
P.prototype.listSymbols=function(cb){var self=this,url=this.base+'/0/public/AssetPairs';get(url,{timeout:12000,maxBytes:16*1024*1024},function(e,o){if(e)return cb(e);var ke=krakenError(o);if(ke)return cb(ke);var data=o&&o.result&&typeof o.result==='object'?o.result:{},keys=Object.keys(data),out=[],seen=Object.create(null);function asset(v){v=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(v==='XBT')return'BTC';if(v==='XDG')return'DOGE';return v;}for(var i=0;i<keys.length;i++){var x=data[keys[i]]||{},status=String(x.status||'').toLowerCase();if(status&&status!=='online')continue;var ws=String(x.wsname||''),parts=ws.indexOf('/')>0?ws.split('/'):null,base=parts?asset(parts[0]):'',quote=parts?asset(parts[1]):'';if(!base||!quote){var p=S.split(x.altname||keys[i]);base=asset(p.base);quote=asset(p.quote);}var symbol=S.clean(base+quote),providerPair=String(x.altname||keys[i]);if(!base||!quote||!symbol||seen[symbol])continue;seen[symbol]=1;self.symbolMap[symbol]=providerPair;self.symbolMeta[symbol]={baseAsset:base,quoteAsset:quote,providerPair:providerPair};out.push({symbol:symbol,baseAsset:base,quoteAsset:quote,market:base+'/'+quote,marketType:'SPOT',status:status||'online',providerPair:providerPair});}out.sort(function(a,b){return a.symbol.localeCompare(b.symbol);});if(!out.length)return cb(new Error('KRAKEN_SYMBOLS_EMPTY'));cb(null,{ok:true,exchange:'KRAKEN',providerId:'KRAKEN',dynamic:true,endpoint:'/0/public/AssetPairs',symbols:out});});};
module.exports=P;
