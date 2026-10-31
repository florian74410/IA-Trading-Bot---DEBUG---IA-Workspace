'use strict';
var assert=require('assert'),DF=require('../Protection/market_data_firewall');
function base(extra){return Object.assign({provider:'KRAKEN_PUBLIC_REFERENCE',source:'KRAKEN_PUBLIC_REFERENCE',provenance:'KRAKEN_PUBLIC_REFERENCE',type:'PRICE',symbol:'BTC/EUR',timestamp:Date.now(),price:100},extra||{});}
var fw=new DF({maxPriceJumpPct:20,maxSpreadPct:10,duplicateWindowMs:0});
assert.equal(fw.inspect(base()).decision,'PASS');
var jump=fw.inspect(base({price:150,timestamp:Date.now()+1}));assert.equal(jump.decision,'WARN');assert.equal(jump.issues.length,0);assert(jump.warnings.some(function(x){return x.code==='VOLATILITY_SPIKE'&&x.severity==='WARNING_ONLY';}));
var spreadFw=new DF({maxPriceJumpPct:1000,maxSpreadPct:2,duplicateWindowMs:0});
var spread=spreadFw.inspect(base({price:100,bid:95,ask:105}));assert.equal(spread.decision,'REJECT');assert(spread.issues.some(function(x){return x.code==='SPREAD_EXCEEDED';}));
var invFw=new DF({maxPriceJumpPct:1000,maxSpreadPct:100,duplicateWindowMs:0});
var inverted=invFw.inspect(base({bid:101,ask:99}));assert.equal(inverted.decision,'REJECT');assert(inverted.issues.some(function(x){return x.code==='BID_ASK_INVERTED';}));
var obs=new DF({mode:'OBSERVATION',maxPriceJumpPct:1,duplicateWindowMs:0});obs.inspect(base({price:100}));var warn=obs.inspect(base({price:120,timestamp:Date.now()+1}));assert.equal(warn.decision,'WARN');
var candleFw=new DF({maxPriceJumpPct:5,maxSpreadPct:100,duplicateWindowMs:0});candleFw.inspect(base({type:'CANDLES',price:100,data:{candles:[[Date.now()-60000,99,101,98,100,10]]}}));var spikeCandle=candleFw.inspect(base({type:'CANDLES',price:180,timestamp:Date.now()+2,data:{candles:[[Date.now(),100,190,95,180,120]]}}));assert.equal(spikeCandle.decision,'WARN');assert(spikeCandle.warnings.some(function(x){return x.code==='VOLATILITY_SPIKE';}));assert.equal(spikeCandle.issues.length,0);
console.log('PASS Market Data Firewall volatility warning + OHLC + bid/ask + spread');
