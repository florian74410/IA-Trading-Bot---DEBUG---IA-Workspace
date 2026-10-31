'use strict';

var assert=require('assert');
var Collector=require('../Collectors/microstructure_collector');

function firewall(){
 return{inspect:function(msg,cb){cb(null,{decision:'PASS',reason:'VALID'});}};
}
function provider(){
 return{aggregateOpenInterest:function(symbol,sources,cb){
  cb(null,{
   ok:true,
   symbol:'BTCUSD',
   venues:[
    {source:'BINANCE_FUTURES',provider:'BINANCE_FUTURES',provenance:'TEST',canonicalSymbol:'BTCUSDT',observedAt:Date.now(),venueType:'CEX',marketType:'PERPETUAL',openInterestBase:1,markPrice:1000,openInterestNotionalUsd:null,notionalSourceValue:1000,notionalSourceUnit:'USDT',settlementAsset:'USDT'},
    {source:'OKX',provider:'OKX',provenance:'TEST',canonicalSymbol:'BTC-USDT-SWAP',observedAt:Date.now(),venueType:'CEX',marketType:'PERPETUAL',openInterestBase:0.5,markPrice:1000,openInterestNotionalUsd:500,notionalSourceValue:500,notionalSourceUnit:'USD'}
   ],
   coverage:{requested:['BINANCE_FUTURES','OKX'],received:['BINANCE_FUTURES','OKX'],missing:[]}
  });
 },list:function(){return[];}};
}

var c1=new Collector({
 provider:provider(),
 firewall:firewall(),
 currencyPriceResolver:function(symbol,cb){
  assert.equal(symbol,'USDT');
  cb(null,{ok:true,symbol:'USDT',currency:'usd',value:0.9998,source:'COINGECKO'});
 }
});

c1.openInterestAggregate('BTCUSD',undefined,function(e,o){
 assert.ifError(e);
 assert.equal(o.schema,'marketdata.open_interest.aggregate/1.1');
 assert(Math.abs(o.coveredOpenInterestUsd-1499.8)<1e-9);
 assert.equal(o.venueCount,2);
 assert.equal(o.coverage.complete,true);
 assert.equal(o.currencyNormalization.assumeStableEqualsFiat,false);
 var b=o.venues.filter(function(x){return x.source==='BINANCE_FUTURES';})[0];
 assert.equal(b.normalizationStatus,'NORMALIZED');
 assert.equal(b.normalizationReceipt.sourceAsset,'USDT');
 assert.equal(b.normalizationReceipt.referenceFiat,'USD');
 assert.equal(b.normalizationReceipt.observedAssetPriceUsd,0.9998);
 assert.equal(b.normalizationPriceSource,'COINGECKO');

 var c2=new Collector({
  provider:provider(),
  firewall:firewall(),
  currencyPriceResolver:function(symbol,cb){cb(new Error('RATE_UNAVAILABLE')); }
 });
 c2.openInterestAggregate('BTCUSD',undefined,function(e2,o2){
  assert.ifError(e2);
  assert.equal(o2.coveredOpenInterestUsd,500);
  assert.equal(o2.venueCount,1);
  assert.equal(o2.coverage.complete,false);
  assert(o2.coverage.missing.some(function(x){return x.source==='BINANCE_FUTURES'&&x.stage==='CURRENCY_NORMALIZATION';}));
  console.log('PASS OI Currency Registry normalization contract');
 });
});
