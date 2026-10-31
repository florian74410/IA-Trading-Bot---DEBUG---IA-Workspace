'use strict';
var request=require('./http_json');

function num(v){if(v==null||typeof v==='boolean'||typeof v==='string'&&!v.trim())return null;v=+v;return isFinite(v)?v:null;}
function clean(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function baseCoin(s){s=clean(s);var q=['USDT','USDC','USD','EUR','BTC','ETH'];for(var i=0;i<q.length;i++)if(s.length>q[i].length&&s.slice(-q[i].length)===q[i])return s.slice(0,-q[i].length);return s;}
function binanceSymbol(s){s=clean(s);if(/USDT$/.test(s))return s;if(/USD$/.test(s))return s.slice(0,-3)+'USDT';return s;}
function krakenPair(s){s=clean(s);if(s.indexOf('BTC')===0)s='XBT'+s.slice(3);return s;}
function okxInst(s){var b=baseCoin(s);return b+'-USDT-SWAP';}
function bybitSymbol(s){return baseCoin(s)+'USDT';}
function usd30(v){var s=String(v==null?'':v).trim();if(!/^[-+]?\d+$/.test(s))return num(v);var neg=s[0]==='-';if(neg||s[0]==='+')s=s.slice(1);s=s.replace(/^0+(?=\d)/,'');while(s.length<=30)s='0'+s;var a=s.slice(0,-30)||'0',b=s.slice(-30,-24),n=Number(a+'.'+b);return neg?-n:n;}
function level(x){
 if(Array.isArray(x)){var p=num(x[0]),q=num(x[1]),n=num(x[2]);return p>0&&q>=0?{price:p,size:q,count:n}:null;}
 if(x&&typeof x==='object'){var px=num(x.price!=null?x.price:x.px),sz=num(x.size!=null?x.size:x.sz),ct=num(x.count!=null?x.count:x.n);return px>0&&sz>=0?{price:px,size:sz,count:ct}:null;}
 return null;
}
function book(bids,asks,depth){
 depth=Math.max(5,Math.min(100,+depth||20));
 bids=(bids||[]).map(level).filter(Boolean).sort(function(a,b){return b.price-a.price}).slice(0,depth);
 asks=(asks||[]).map(level).filter(Boolean).sort(function(a,b){return a.price-b.price}).slice(0,depth);
 return{bids:bids,asks:asks};
}
function snapshot(source,symbol,canonical,depth,b,oi,mark,errors){
 var bestBid=b&&b.bids&&b.bids[0]||null,bestAsk=b&&b.asks&&b.asks[0]||null,mid=bestBid&&bestAsk?(bestBid.price+bestAsk.price)/2:null;
 mark=num(mark);if(mark==null)mark=mid;
 oi=num(oi);
 return{ok:true,schema:'marketdata.liquidity.raw/1.0',source:source,provider:source,provenance:'MARKET_DATA_COLLECTOR:'+source,symbol:symbol,canonicalSymbol:canonical||symbol,depth:+depth||20,observedAt:Date.now(),orderBook:b||{bids:[],asks:[]},openInterest:oi==null?{available:false,value:null,unit:'BASE',markPrice:mark,notional:null}:{available:true,value:oi,unit:'BASE',markPrice:mark,notional:mark==null?null:oi*mark},liquidations:[],partial:Array.isArray(errors)&&errors.length>0,errors:(errors||[]).slice(0,16)};
}
function P(o){o=o||{};this.settings=o.settings||{};this.okxBase=String(o.okxBase||process.env.IATB_OKX_PUBLIC_BASE||'https://www.okx.com').replace(/\/$/,'');this.bybitBase=String(o.bybitBase||process.env.IATB_BYBIT_PUBLIC_BASE||'https://api.bybit.com').replace(/\/$/,'');this.name='MICROSTRUCTURE_PROVIDER_REGISTRY';}
P.prototype.instruments=function(cb){
 if(!this.enabled('OKX'))return cb(new Error('MARKET_PROVIDER_DISABLED: OKX'));
 request(this.okxBase+'/api/v5/public/instruments?instType=SWAP',{timeout:10000,maxBytes:4*1024*1024},function(e,o){
  if(e)return cb(e);if(!o||String(o.code)!=='0'||!Array.isArray(o.data))return cb(new Error('OKX_INSTRUMENTS_INVALID'));
  cb(null,o.data.map(function(x){return{instId:x.instId,ctVal:x.ctVal,ctValCcy:x.ctValCcy,ctMult:x.ctMult,ctType:x.ctType,settleCcy:x.settleCcy,uly:x.uly};}));
 });
};
P.prototype.enabled=function(source){
 source=String(source||'').toUpperCase();var id=source==='BINANCE_FUTURES'?'BINANCE':source,p=this.settings.providers&&this.settings.providers[id];return !p||p.enabled!==false;
};
P.prototype.binance=function(symbol,depth,cb){
 if(!this.enabled('BINANCE_FUTURES'))return cb(new Error('MARKET_PROVIDER_DISABLED: BINANCE'));
 var bs=binanceSymbol(symbol),left=2,b=null,oi=null,mark=null,errors=[],done=function(){if(--left)return;if(!b||!b.bids.length||!b.asks.length)return cb(new Error(errors.join('|')||'BINANCE_ORDERBOOK_UNAVAILABLE'));cb(null,snapshot('BINANCE_FUTURES',symbol,bs,depth,b,oi,mark,errors));};
 request('https://fapi.binance.com/fapi/v1/depth?symbol='+encodeURIComponent(bs)+'&limit='+Math.max(5,Math.min(100,+depth||20)),{timeout:10000},function(e,o){if(e)errors.push('ORDERBOOK:'+e.message);else b=book(o.bids,o.asks,depth);done();});
 request('https://fapi.binance.com/fapi/v1/openInterest?symbol='+encodeURIComponent(bs),{timeout:10000},function(e,o){if(e)errors.push('OPEN_INTEREST:'+e.message);else oi=o&&o.openInterest;done();});
};
P.prototype.hyperliquid=function(symbol,depth,cb){
 if(!this.enabled('HYPERLIQUID'))return cb(new Error('MARKET_PROVIDER_DISABLED: HYPERLIQUID'));
 var coin=baseCoin(symbol),left=2,b=null,oi=null,mark=null,errors=[],done=function(){if(--left)return;if(!b||!b.bids.length||!b.asks.length)return cb(new Error(errors.join('|')||'HYPERLIQUID_ORDERBOOK_UNAVAILABLE'));cb(null,snapshot('HYPERLIQUID',symbol,coin,depth,b,oi,mark,errors));};
 request('https://api.hyperliquid.xyz/info',{method:'POST',timeout:10000,headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'l2Book',coin:coin})},function(e,o){if(e)errors.push('ORDERBOOK:'+e.message);else if(o&&Array.isArray(o.levels))b=book(o.levels[0],o.levels[1],depth);else errors.push('ORDERBOOK:INVALID_RESPONSE');done();});
 request('https://api.hyperliquid.xyz/info',{method:'POST',timeout:10000,headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'metaAndAssetCtxs'})},function(e,o){if(e)errors.push('OPEN_INTEREST:'+e.message);else if(Array.isArray(o)&&o[0]&&Array.isArray(o[0].universe)&&Array.isArray(o[1])){for(var i=0;i<o[0].universe.length;i++)if(String(o[0].universe[i].name||'').toUpperCase()===coin){oi=o[1][i]&&o[1][i].openInterest;mark=o[1][i]&&(o[1][i].markPx||o[1][i].midPx);break;}}done();});
};
P.prototype.okx=function(symbol,depth,cb){
 if(!this.enabled('OKX'))return cb(new Error('MARKET_PROVIDER_DISABLED: OKX'));
 var inst=okxInst(symbol),base=this.okxBase,left=2,b=null,oi=null,mark=null,errors=[],done=function(){if(--left)return;if(!b||!b.bids.length||!b.asks.length)return cb(new Error(errors.join('|')||'OKX_ORDERBOOK_UNAVAILABLE'));var x=snapshot('OKX',symbol,inst,depth,b,null,mark,errors);if(oi!=null)x.openInterest=oi;cb(null,x);};
 request(base+'/api/v5/market/books?instId='+encodeURIComponent(inst)+'&sz='+Math.max(5,Math.min(100,+depth||20)),{timeout:10000},function(e,o){if(e)errors.push('ORDERBOOK:'+e.message);else{var d=o&&Array.isArray(o.data)&&o.data[0];if(d)b=book(d.bids,d.asks,depth);else errors.push('ORDERBOOK:INVALID_RESPONSE');}done();});
 request(base+'/api/v5/public/open-interest?instType=SWAP&instId='+encodeURIComponent(inst),{timeout:10000},function(e,o){if(e)errors.push('OPEN_INTEREST:'+e.message);else{var d=o&&Array.isArray(o.data)&&o.data[0];if(d){var n=num(d.oiUsd),v=num(d.oiCcy),px=v&&n?n/v:null;oi={available:n!=null,unit:'USD',value:v,markPrice:px,notional:n,oiContracts:num(d.oi),observedAt:+d.ts||Date.now()};mark=px;}}done();});
};
P.prototype.bybit=function(symbol,depth,cb){
 if(!this.enabled('BYBIT'))return cb(new Error('MARKET_PROVIDER_DISABLED: BYBIT'));
 var ps=bybitSymbol(symbol),base=this.bybitBase,left=2,b=null,oi=null,mark=null,errors=[],done=function(){if(--left)return;if(!b||!b.bids.length||!b.asks.length)return cb(new Error(errors.join('|')||'BYBIT_ORDERBOOK_UNAVAILABLE'));var x=snapshot('BYBIT',symbol,ps,depth,b,null,mark,errors);if(oi!=null)x.openInterest=oi;cb(null,x);};
 request(base+'/v5/market/orderbook?category=linear&symbol='+encodeURIComponent(ps)+'&limit='+Math.max(5,Math.min(100,+depth||20)),{timeout:10000},function(e,o){if(e)errors.push('ORDERBOOK:'+e.message);else if(!o||+o.retCode!==0)errors.push('ORDERBOOK:BYBIT_API_'+String(o&&o.retCode||'INVALID'));else{var d=o.result;if(d)b=book(d.b,d.a,depth);else errors.push('ORDERBOOK:INVALID_RESPONSE');}done();});
 request(base+'/v5/market/tickers?category=linear&symbol='+encodeURIComponent(ps),{timeout:10000},function(e,o){if(e)errors.push('OPEN_INTEREST:'+e.message);else if(!o||+o.retCode!==0)errors.push('OPEN_INTEREST:BYBIT_API_'+String(o&&o.retCode||'INVALID'));else{var d=o.result&&Array.isArray(o.result.list)&&o.result.list[0];if(d){var n=num(d.openInterestValue),v=num(d.openInterest),px=num(d.markPrice);oi={available:n!=null||v!=null,unit:'BASE',value:v,markPrice:px,notional:n!=null?n:(v!=null&&px!=null?v*px:null),observedAt:Date.now()};mark=px;}}done();});
};
P.prototype.kraken=function(symbol,depth,cb){
 if(!this.enabled('KRAKEN'))return cb(new Error('MARKET_PROVIDER_DISABLED: KRAKEN'));
 var kp=krakenPair(symbol);
 request('https://api.kraken.com/0/public/Depth?pair='+encodeURIComponent(kp)+'&count='+Math.max(5,Math.min(100,+depth||20)),{timeout:10000},function(e,o){
  if(e)return cb(e);var k=o&&o.result&&Object.keys(o.result)[0],x=k&&o.result[k];if(!x)return cb(new Error('KRAKEN_ORDERBOOK_UNAVAILABLE'));
  cb(null,snapshot('KRAKEN',symbol,kp,depth,book(x.bids,x.asks,depth),null,null,[]));
 });
};
P.prototype.gmxOpenInterest=function(symbol,cb){
 if(!this.enabled('GMX'))return cb(new Error('MARKET_PROVIDER_DISABLED: GMX'));
 var coin=baseCoin(symbol),urls=['https://arbitrum.gmxapi.io/v1/markets/tickers','https://avalanche.gmxapi.io/v1/markets/tickers'],left=urls.length,rows=[],errors=[];
 urls.forEach(function(url,idx){request(url,{timeout:12000,maxBytes:8*1024*1024},function(e,o){if(e)errors.push(e.message);else{var a=Array.isArray(o)?o:(o&&Array.isArray(o.data)?o.data:(o&&Array.isArray(o.markets)?o.markets:[]));a.forEach(function(x){var label=String(x&&x.symbol||'').toUpperCase();if(label.indexOf(coin+'/USD')!==0)return;var l=usd30(x.longInterestUsd),s=usd30(x.shortInterestUsd);if(l==null&&s==null)return;rows.push({chain:idx===0?'ARBITRUM':'AVALANCHE',symbol:x.symbol,marketTokenAddress:x.marketTokenAddress||x.address||null,longUsd:l||0,shortUsd:s||0,openInterestUsd:(l||0)+(s||0),updatedAt:+x.updatedAt||null});});}if(--left)return;if(!rows.length)return cb(new Error('GMX_OPEN_INTEREST_UNAVAILABLE'+(errors.length?':'+errors.join('|'):'')));var total=rows.reduce(function(z,x){return z+x.openInterestUsd;},0),longUsd=rows.reduce(function(z,x){return z+x.longUsd;},0),shortUsd=rows.reduce(function(z,x){return z+x.shortUsd;},0);cb(null,{source:'GMX',provider:'GMX',provenance:'GMX_API:/v1/markets/tickers',symbol:symbol,canonicalSymbol:coin+'USD',openInterestNotionalUsd:total,notionalSourceValue:total,notionalSourceUnit:'USD',settlementAsset:null,normalizationMethod:'DIRECT_USD',openInterestBase:null,markPrice:null,observedAt:Date.now(),marketType:'PERPETUAL',venueType:'DEX',longOpenInterestUsd:longUsd,shortOpenInterestUsd:shortUsd,markets:rows,chains:['ARBITRUM','AVALANCHE']});});});
};
P.prototype.openInterest=function(symbol,source,cb){
 var self=this,coin=baseCoin(symbol);source=String(source||'').toUpperCase();
 function row(src,canonical,notional,baseValue,mark,extra){extra=extra||{};var unit=String(extra.notionalSourceUnit||'USD').toUpperCase(),n=notional==null?null:+notional;return Object.assign({source:src,provider:src,provenance:'MARKET_DATA_COLLECTOR:'+src,symbol:symbol,canonicalSymbol:canonical||coin+'USD',openInterestNotionalUsd:unit==='USD'?n:null,notionalSourceValue:n,notionalSourceUnit:unit,settlementAsset:extra.settlementAsset||null,openInterestBase:baseValue==null?null:+baseValue,markPrice:mark==null?null:+mark,observedAt:Date.now()},extra);}
 if(source==='BINANCE'||source==='BINANCE_FUTURES'){
  if(!self.enabled('BINANCE_FUTURES'))return cb(new Error('MARKET_PROVIDER_DISABLED: BINANCE'));
  var bs=binanceSymbol(symbol),left=2,oi=null,mark=null,err=null,done=function(){if(--left)return;if(err&&!oi)return cb(err);var n=oi!=null&&mark!=null?oi*mark:null;cb(null,row('BINANCE_FUTURES',bs,n,oi,mark,{instrument:bs,marketType:'PERPETUAL',venueType:'CEX',notionalSourceUnit:'USDT',settlementAsset:'USDT',normalizationMethod:'STABLE_ASSET_TO_USD'}));};
  request('https://fapi.binance.com/fapi/v1/openInterest?symbol='+encodeURIComponent(bs),{timeout:10000},function(e,o){if(e)err=e;else oi=num(o&&o.openInterest);done();});
  request('https://fapi.binance.com/fapi/v1/premiumIndex?symbol='+encodeURIComponent(bs),{timeout:10000},function(e,o){if(e)err=err||e;else mark=num(o&&o.markPrice);done();});return;
 }
 if(source==='HYPERLIQUID'){
  if(!self.enabled('HYPERLIQUID'))return cb(new Error('MARKET_PROVIDER_DISABLED: HYPERLIQUID'));
  return request('https://api.hyperliquid.xyz/info',{method:'POST',timeout:10000,headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'metaAndAssetCtxs'})},function(e,o){if(e)return cb(e);var oi=null,mark=null;if(Array.isArray(o)&&o[0]&&Array.isArray(o[0].universe)&&Array.isArray(o[1]))for(var i=0;i<o[0].universe.length;i++)if(String(o[0].universe[i].name||'').toUpperCase()===coin){oi=num(o[1][i]&&o[1][i].openInterest);mark=num(o[1][i]&&(o[1][i].markPx||o[1][i].midPx));break;}if(oi==null)return cb(new Error('HYPERLIQUID_OPEN_INTEREST_UNAVAILABLE'));cb(null,row('HYPERLIQUID',coin,mark==null?null:oi*mark,oi,mark,{instrument:coin,marketType:'PERPETUAL',venueType:'DEX',notionalSourceUnit:'USD',normalizationMethod:'DIRECT_USD'}));});
 }
 if(source==='GMX')return self.gmxOpenInterest(symbol,cb);
 if(source==='BYBIT'){
  if(!self.enabled('BYBIT'))return cb(new Error('MARKET_PROVIDER_DISABLED: BYBIT'));
  var ps=bybitSymbol(symbol);return request(self.bybitBase+'/v5/market/tickers?category=linear&symbol='+encodeURIComponent(ps),{timeout:10000},function(e,o){if(e)return cb(e);if(!o||+o.retCode!==0)return cb(new Error('BYBIT_OPEN_INTEREST_API_'+String(o&&o.retCode||'INVALID')));var d=o.result&&Array.isArray(o.result.list)&&o.result.list[0];if(!d)return cb(new Error('BYBIT_OPEN_INTEREST_UNAVAILABLE'));var n=num(d.openInterestValue),v=num(d.openInterest),mark=num(d.markPrice);if(n==null&&v!=null&&mark!=null)n=v*mark;cb(null,row('BYBIT',ps,n,v,mark,{instrument:ps,marketType:'PERPETUAL',venueType:'CEX',notionalSourceUnit:'USDT',settlementAsset:'USDT',normalizationMethod:'STABLE_ASSET_TO_USD'}));});
 }
 if(source==='OKX'){
  if(!self.enabled('OKX'))return cb(new Error('MARKET_PROVIDER_DISABLED: OKX'));
  var inst=okxInst(symbol);return request(self.okxBase+'/api/v5/public/open-interest?instType=SWAP&instId='+encodeURIComponent(inst),{timeout:10000},function(e,o){if(e)return cb(e);var d=o&&Array.isArray(o.data)&&o.data[0];if(!d)return cb(new Error('OKX_OPEN_INTEREST_UNAVAILABLE'));var n=num(d.oiUsd),v=num(d.oiCcy),mark=v&&n?n/v:null;cb(null,row('OKX',inst,n,v,mark,{instrument:inst,oiContracts:num(d.oi),marketType:'PERPETUAL',venueType:'CEX',observedAt:+d.ts||Date.now(),notionalSourceUnit:'USD',normalizationMethod:'DIRECT_USD'}));});
 }
 cb(new Error('OPEN_INTEREST_PROVIDER_UNSUPPORTED: '+source));
};
P.prototype.aggregateOpenInterest=function(symbol,sources,cb){
 var self=this,list=Array.isArray(sources)&&sources.length?sources:['BINANCE_FUTURES','OKX','BYBIT','HYPERLIQUID','GMX'],left=list.length,rows=[],missing=[];
 if(!left)return cb(null,{ok:true,symbol:symbol,venues:[],coverage:{requested:[],received:[],missing:[]}});
 list.forEach(function(src){self.openInterest(symbol,src,function(e,o){if(e)missing.push({source:src,error:e.message});else if(o&&((o.openInterestNotionalUsd!=null&&isFinite(+o.openInterestNotionalUsd))||(o.notionalSourceValue!=null&&isFinite(+o.notionalSourceValue))))rows.push(o);else missing.push({source:src,error:'OI_NOTIONAL_UNAVAILABLE'});if(--left)return;cb(null,{ok:true,symbol:baseCoin(symbol)+'USD',venues:rows,coverage:{requested:list.slice(),received:rows.map(function(x){return x.source;}),missing:missing}});});});
};
P.prototype.getSnapshot=function(symbol,source,depth,cb){
 var self=this;source=String(source||'AUTO').toUpperCase();
 if(source==='BINANCE'||source==='BINANCE_FUTURES')return self.binance(symbol,depth,cb);
 if(source==='HYPERLIQUID')return self.hyperliquid(symbol,depth,cb);
 if(source==='OKX')return self.okx(symbol,depth,cb);
 if(source==='BYBIT')return self.bybit(symbol,depth,cb);
 if(source==='KRAKEN'||source==='REFERENCE')return self.kraken(symbol,depth,cb);
 if(source!=='AUTO')return cb(new Error('LIQUIDITY_PROVIDER_UNKNOWN: '+source));
 self.hyperliquid(symbol,depth,function(e,o){if(!e)return cb(null,o);self.binance(symbol,depth,function(e2,o2){if(!e2)return cb(null,o2);self.bybit(symbol,depth,function(e3,o3){if(!e3)return cb(null,o3);self.okx(symbol,depth,function(e4,o4){if(!e4)return cb(null,o4);self.kraken(symbol,depth,function(e5,o5){if(!e5)return cb(null,o5);cb(e2||e3||e4||e||e5||new Error('NO_LIQUIDITY_PROVIDER'));});});});});});
};
P.prototype.list=function(){var self=this;return[
 {id:'BINANCE_FUTURES',enabled:self.enabled('BINANCE_FUTURES'),capabilities:['ORDERBOOK','OPEN_INTEREST']},
 {id:'HYPERLIQUID',enabled:self.enabled('HYPERLIQUID'),capabilities:['ORDERBOOK','OPEN_INTEREST']},
 {id:'OKX',enabled:self.enabled('OKX'),capabilities:['ORDERBOOK','OPEN_INTEREST']},
 {id:'BYBIT',enabled:self.enabled('BYBIT'),capabilities:['ORDERBOOK','OPEN_INTEREST']},
 {id:'GMX',enabled:self.enabled('GMX'),capabilities:['OPEN_INTEREST']},
 {id:'KRAKEN',enabled:self.enabled('KRAKEN'),capabilities:['ORDERBOOK']}
];};
module.exports=P;
