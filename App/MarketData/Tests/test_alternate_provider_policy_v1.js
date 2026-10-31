'use strict';

var assert=require('assert');
var Alt=require('../Orchestrator/alternate_provider_policy_v1');
var Decision=require('../Orchestrator/shadow_decision_engine_v1');

assert.deepEqual(Alt.get('SPOT_CANDLES').providers,['BINANCE','OKX','KRAKEN','BYBIT']);
assert.equal(Alt.rank('SPOT_CANDLES','BINANCE'),1);
assert.equal(Alt.rank('SPOT_CANDLES','OKX'),2);
assert.equal(Alt.rank('SPOT_CANDLES','KRAKEN'),3);
assert.equal(Alt.rank('SPOT_CANDLES','BYBIT'),4);

var a=Alt.decision('SPOT_CANDLES','BINANCE',new Error('HTTP_429'));
assert.equal(a.action,'TRY_NEXT_PROVIDER');
assert.equal(a.nextProvider,'OKX');
assert.equal(a.nextRank,2);

var b=Alt.next('SPOT_CANDLES','BINANCE',{OKX:true});
assert.equal(b.provider,'KRAKEN');
assert.equal(b.rank,3);

var c=Alt.decision('SPOT_CANDLES','BYBIT',new Error('PROVIDER_ERROR'));
assert.equal(c.action,'NO_PROVIDER_AVAILABLE');

var d=Alt.decision('SPOT_CANDLES','BINANCE',new Error('AUTH_ERROR'));
assert.equal(d.action,'STOP_NON_FALLBACKABLE_ERROR');

assert.equal(Alt.get('ORDERBOOK'),null,'generic ORDERBOOK must not guess SPOT vs PERP');
assert.deepEqual(Alt.get('SPOT_ORDERBOOK').providers,['BINANCE','OKX','KRAKEN','BYBIT']);
assert.deepEqual(Alt.get('PERP_ORDERBOOK').providers,['BINANCE','BYBIT','OKX','HYPERLIQUID']);

var oi=Alt.decision('OPEN_INTEREST','OKX',new Error('TIMEOUT'));
assert.equal(oi.action,'AGGREGATE_PARTIAL');
assert.deepEqual(oi.contributors,['BINANCE','OKX','BYBIT','HYPERLIQUID','GMX']);

var single=Alt.decision('GLOBAL_MARKET','COINGECKO',new Error('TIMEOUT'));
assert.equal(single.action,'NO_PROVIDER_AVAILABLE');

var p={provider:'BINANCE',dataset:'SPOT_CANDLES',priority:'P1',criticality:'HIGH',alternates:[]};
var sd=Decision.end({provider:'BINANCE',dataset:'SPOT_CANDLES',policy:p,error:new Error('TIMEOUT')});
assert.equal(sd.action,'FALLBACK_CANDIDATE');
assert.equal(sd.providerRank,1);
assert.equal(sd.nextProvider,'OKX');
assert.equal(sd.nextRank,2);
assert.equal(sd.executable,false);
assert.equal(sd.blocking,false);

var terminal=Decision.end({provider:'BYBIT',dataset:'SPOT_CANDLES',policy:{provider:'BYBIT',dataset:'SPOT_CANDLES'},error:new Error('TIMEOUT')});
assert.equal(terminal.action,'NO_PROVIDER_AVAILABLE');
assert(terminal.userMessage&&terminal.userMessage.length>0);

console.log('PASS Alternate Provider Policy v1 ranked fallback contract');
