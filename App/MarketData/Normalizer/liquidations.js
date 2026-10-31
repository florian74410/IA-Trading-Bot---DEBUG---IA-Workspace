'use strict';
// Public stream quantities retain their units. USD conversion belongs to the Collector.
function n(v){return v==null||v===''||!isFinite(+v)?null:+v;}
function quote(symbol){var m=String(symbol||'').toUpperCase().replace(/-SWAP$/,'').replace(/-/g,'').match(/(USDT|USDC|USD)$/);return m?m[1]:null;}
function binance(x){
 x=x&&x.data?x.data:x;if(Array.isArray(x))return x.reduce(function(a,b){var z=binance(b);return a.concat(z||[]);},[]);
 if(!x||x.e!=='forceOrder'||!x.o)return null;
 var o=x.o,p=n(o.ap)>0?n(o.ap):n(o.p),last=n(o.l),q=last>0?last:0,ts=n(o.T||x.E),side=String(o.S||'').toUpperCase();
 if(!o.s||!(p>0)||!(ts>0)||['BUY','SELL'].indexOf(side)<0)return null;
 return{provider:'BINANCE_FUTURES',source:'BINANCE_FUTURES',provenance:'BINANCE_FUTURES:forceOrder',symbol:String(o.s).toUpperCase(),side:side==='SELL'?'LONG':'SHORT',price:p,quantity:q,quantityUnit:'BASE',quoteCurrency:quote(o.s),notionalUsd:null,timestamp:ts,providerEventId:[o.s,ts,o.S,p,n(o.z)!=null?n(o.z):q].join(':'),normalizationError:q>0?null:'EXECUTED_LAST_SIZE_UNAVAILABLE',priceBasis:n(o.ap)>0?'PUBLISHED_AVERAGE_FILL_PRICE':'ORDER_PRICE_ONLY',raw:{lastFilled:o.l,cumulativeFilled:o.z,originalSize:o.q,averagePrice:o.ap,orderPrice:o.p}};
}
function okx(o){
 var out=[];(o&&Array.isArray(o.data)?o.data:[]).forEach(function(row){if(!row)return;(Array.isArray(row.details)?row.details:[]).forEach(function(d){if(!d)return;
  var p=n(d.bkPx),q=n(d.sz),ts=n(d.ts),ps=String(d.posSide||'').toLowerCase(),side=ps==='long'?'LONG':ps==='short'?'SHORT':String(d.side).toLowerCase()==='sell'?'LONG':String(d.side).toLowerCase()==='buy'?'SHORT':null;
  if(!row.instId||!(p>0)||!(q>0)||!(ts>0)||!side)return;
  out.push({provider:'OKX',source:'OKX',provenance:'OKX:liquidation-orders',symbol:String(row.instId).toUpperCase(),side:side,price:p,quantity:q,quantityUnit:'CONTRACT',quoteCurrency:quote(row.instId),notionalUsd:null,timestamp:ts,providerEventId:[row.instId,ts,d.posSide,d.side,p,q].join(':'),instrumentId:row.instId,instrumentFamily:row.instFamily||null,priceBasis:'BANKRUPTCY_PRICE',raw:{sz:d.sz,bkPx:d.bkPx,posSide:d.posSide,side:d.side}});
 });});return out;
}
function bybit(o){
 var out=[];(o&&Array.isArray(o.data)?o.data:o&&o.data?[o.data]:[]).forEach(function(d){
  if(!d)return;var p=n(d.p),q=n(d.v),ts=n(d.T||o.ts),side=String(d.S||'').toUpperCase(),currency=quote(d.s);
  if(!d.s||!(p>0)||!(q>0)||!(ts>0)||['BUY','SELL'].indexOf(side)<0)return;
  out.push({provider:'BYBIT',source:'BYBIT',provenance:'BYBIT:allLiquidation',symbol:String(d.s).toUpperCase(),side:side==='BUY'?'LONG':'SHORT',price:p,quantity:q,quantityUnit:currency==='USDT'||currency==='USDC'?'BASE':'UNSUPPORTED',quoteCurrency:currency,notionalUsd:null,timestamp:ts,providerEventId:[d.s,ts,d.S,p,q].join(':'),priceBasis:'BANKRUPTCY_PRICE',raw:{v:d.v,p:d.p,S:d.S}});
 });return out;
}
module.exports={binance:binance,okx:okx,bybit:bybit,quote:quote};
