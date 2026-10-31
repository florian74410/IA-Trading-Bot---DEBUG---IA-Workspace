'use strict';
var assert=require('assert'),URL=require('url').URL;
var Budget=require('../Orchestrator/request_budget');
var Policy=require('../Orchestrator/data_source_policy');
var ApplyPhase2=require('../Orchestrator/phase2_provider_policy_v1');
var Weighted=require('../Orchestrator/weighted_request_profile_v1');

function r(url,opts,provider){return Weighted.resolve(new URL(url),opts||{},provider);}

var x=r('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=500',{},'BINANCE');
assert.equal(x.scope,'BINANCE_SPOT_WEIGHT');assert.equal(x.cost,2);assert.equal(x.dataset,'SPOT_CANDLES');

x=r('https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=20',{},'BINANCE');
assert.equal(x.scope,'BINANCE_USDM_WEIGHT');assert.equal(x.cost,2);assert.equal(x.dataset,'PERP_ORDERBOOK');

x=r('https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=100',{},'BINANCE');
assert.equal(x.cost,5);

x=r('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT',{},'BINANCE');
assert.equal(x.cost,1);assert.equal(x.dataset,'OPEN_INTEREST');

x=r('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',{},'BINANCE');
assert.equal(x.cost,1);assert.equal(x.dataset,'MARK_PRICE');

x=r('https://api.hyperliquid.xyz/info',{body:JSON.stringify({type:'l2Book',coin:'BTC'})},'HYPERLIQUID');
assert.equal(x.scope,'HYPERLIQUID_REST_WEIGHT');assert.equal(x.cost,2);assert.equal(x.dataset,'PERP_ORDERBOOK');

x=r('https://api.hyperliquid.xyz/info',{body:JSON.stringify({type:'metaAndAssetCtxs'})},'HYPERLIQUID');
assert.equal(x.cost,20);assert.equal(x.dataset,'OPEN_INTEREST_CONTEXT');

var end=60000*520;
x=r('https://api.hyperliquid.xyz/info',{body:JSON.stringify({type:'candleSnapshot',req:{coin:'BTC',interval:'1m',startTime:0,endTime:end}})},'HYPERLIQUID');
assert.equal(x.cost,29);assert.equal(x.costMode,'DOCUMENTED_BASE_PLUS_ESTIMATED_RESPONSE_WEIGHT');

var policy=ApplyPhase2(new Policy()),budget=new Budget({mode:'SHADOW'}),profiles=ApplyPhase2.budgetProfiles();
Object.keys(profiles).forEach(function(id){budget.configure(id,profiles[id]);});
var b=budget.observe({provider:'BINANCE',dataset:'PERP_ORDERBOOK',priority:'P0',scope:'BINANCE_USDM_WEIGHT',cost:5});
assert.equal(b.weighted.scope,'BINANCE_USDM_WEIGHT');assert.equal(b.weighted.limit,2400);assert.equal(b.weighted.used,0);assert.equal(b.weighted.wouldAllow,true);
var h=budget.observe({provider:'HYPERLIQUID',dataset:'PERP_CANDLES',priority:'P1',scope:'HYPERLIQUID_REST_WEIGHT',cost:29});
assert.equal(h.weighted.limit,1200);assert.equal(h.weighted.wouldAllow,true);
assert.equal(policy.resolve('BINANCE','SPOT_ORDERBOOK').criticality,'CRITICAL');
assert.equal(policy.resolve('BINANCE','PERP_ORDERBOOK').criticality,'CRITICAL');
assert.equal(policy.resolve('HYPERLIQUID','PERP_ORDERBOOK').priority,'P0');
assert.equal(policy.snapshot().rules.filter(function(x){return x.dataset==='ORDERBOOK';}).length,0,'generic ORDERBOOK policy must not exist');
assert.equal(profiles.COINGECKO.longLimit,10000,'Phase 1 profile must remain intact');
assert.equal(profiles.DEFILLAMA.limitModel,'UNKNOWN','Phase 1 unknown profile must remain intact');

console.log('PASS Phase 2 weighted budget: Binance + Hyperliquid');
