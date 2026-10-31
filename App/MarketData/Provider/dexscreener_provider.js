'use strict';
var request=require('./http_json'),S=require('../Normalizer/symbols');
function num(v){if(v==null||v==='')return null;v=+v;return isFinite(v)?v:null;}
function uniq(a){var m={},o=[];a.forEach(function(x){x=String(x||'').toUpperCase();if(x&&!m[x]){m[x]=1;o.push(x);}});return o;}
function aliases(base){var a=[base];if(base==='BTC')a.push('WBTC');if(base==='ETH')a.push('WETH');return uniq(a);}
function quotes(q){q=String(q||'USD').toUpperCase();if(q==='USD')return['USDC','USDT','DAI','USD'];if(q==='USDC'||q==='USDT'||q==='DAI')return[q];return[q];}
function normalizePair(x,baseSet,quoteSet){
 if(!x||!x.baseToken||!x.quoteToken)return null;var b=String(x.baseToken.symbol||'').toUpperCase(),q=String(x.quoteToken.symbol||'').toUpperCase();
 var reversed=false;if(baseSet.indexOf(b)<0||quoteSet.indexOf(q)<0){if(baseSet.indexOf(q)>=0&&quoteSet.indexOf(b)>=0){reversed=true;var t=b;b=q;q=t;}else return null;}var l=num(x.liquidity&&x.liquidity.usd),v=num(x.volume&&x.volume.h24),p=num(x.priceUsd);
 if(l==null||l<0||v==null||v<0)return null;
 // priceUsd describes the API's base token, not the requested base when reversed.
 if(reversed)p=null;
 return{chainId:String(x.chainId||''),dexId:String(x.dexId||''),pairAddress:String(x.pairAddress||''),url:x.url||null,base:{symbol:b,address:(reversed?x.quoteToken:x.baseToken).address||null,name:(reversed?x.quoteToken:x.baseToken).name||null},quote:{symbol:q,address:(reversed?x.baseToken:x.quoteToken).address||null,name:(reversed?x.baseToken:x.quoteToken).name||null},priceUsd:p,liquidityUsd:l,volume24hUsd:v,txns24h:x.txns&&x.txns.h24||null,pairCreatedAt:+x.pairCreatedAt||null,labels:Array.isArray(x.labels)?x.labels:[]};
}
function P(o){o=o||{};this.base=String(o.base||process.env.IATB_DEXSCREENER_BASE||'https://api.dexscreener.com').replace(/\/$/,'');this.id='DEXSCREENER';}
P.prototype.pairLiquidity=function(symbol,cb){
 var p=S.split(symbol),bs=aliases(p.base),qs=quotes(p.quote),queries=[];bs.forEach(function(b){qs.forEach(function(q){queries.push(b+' '+q);});});
 var self=this,left=queries.length,all=[],errors=[],successes=0;if(!left)return cb(new Error('DEXSCREENER_QUERY_EMPTY'));
 queries.forEach(function(q){request(self.base+'/latest/dex/search?q='+encodeURIComponent(q),{timeout:10000,maxBytes:4*1024*1024},function(e,o){if(!e&&(!o||!Array.isArray(o.pairs)))e=new Error('DEXSCREENER_RESPONSE_INVALID');if(e)errors.push(q+':'+e.message);else{successes++;o.pairs.forEach(function(x){var n=normalizePair(x,bs,qs);if(n)all.push(n);});}if(--left)return;
  var seen={},rows=[];all.forEach(function(x){var k=x.chainId+'|'+x.pairAddress;if(!x.pairAddress||seen[k])return;seen[k]=1;rows.push(x);});
  rows.sort(function(a,b){return b.liquidityUsd-a.liquidityUsd});rows=rows.slice(0,50);
  if(!rows.length){var failure=new Error(successes?'DEXSCREENER_POOLS_EMPTY':'DEXSCREENER_PROVIDER_FAILED');failure.errors=errors.slice(0,12);return cb(failure);}
  var liq=0,vol=0,w=0,wp=0,chains={},dexes={};rows.forEach(function(x){liq+=x.liquidityUsd||0;vol+=x.volume24hUsd||0;chains[x.chainId]=1;dexes[x.dexId]=1;if(x.priceUsd!=null&&x.liquidityUsd>0){wp+=x.priceUsd*x.liquidityUsd;w+=x.liquidityUsd;}});
  cb(null,{ok:true,schema:'marketdata.dex.liquidity/1.0',provider:'DEXSCREENER',source:'DEXSCREENER',provenance:'DEXSCREENER:/latest/dex/search',symbol:p.base+'/'+p.quote,canonicalSymbol:p.base+'/'+p.quote,observedAt:Date.now(),metric:'POOL_LIQUIDITY_USD',executionDepth:false,liquidityUsd:liq,volume24hUsd:vol,weightedPriceUsd:w?wp/w:null,poolCount:rows.length,chains:Object.keys(chains),dexes:Object.keys(dexes),bestPool:rows[0]||null,pools:rows,partial:errors.length>0,errors:errors.slice(0,12),note:'Pool liquidity is not equivalent to executable order-book depth.'});
 });});
};
module.exports=P;
