'use strict';
var assert=require('assert'),URL=require('url').URL;
var Budget=require('../Orchestrator/request_budget');
var Limits=require('../Orchestrator/request_limit_profile_v1');
var ApplyPhase3=require('../Orchestrator/phase3_provider_policy_v1');
var Policy=require('../Orchestrator/data_source_policy');

function resolve(url,provider){return Limits.resolve(new URL(url),{},provider);}
var profiles=ApplyPhase3.budgetProfiles(),budget=new Budget({mode:'SHADOW'});
Object.keys(profiles).forEach(function(id){budget.configure(id,profiles[id]);});

var k=resolve('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60','KRAKEN');
assert.equal(k.costMode,'SAFE_PACE');assert.equal(k.scopes[0].kind,'SAFE_PACE');assert.equal(k.scopes[0].minIntervalMs,1000);
var kd1=budget.observe({provider:'KRAKEN',dataset:k.dataset,cost:k.cost,scopes:k.scopes});
var kd2=budget.observe({provider:'KRAKEN',dataset:k.dataset,cost:k.cost,scopes:k.scopes});
assert.equal(kd1.wouldAllow,true);assert.equal(kd2.wouldAllow,false,'second immediate Kraken OHLC call should violate safe pace in Shadow');

var o=resolve('https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=300','OKX');
assert.equal(o.scopes[0].id,'OKX_CANDLES');
var od=null;for(var i=0;i<41;i++)od=budget.observe({provider:'OKX',dataset:o.dataset,cost:1,scopes:o.scopes});
assert.equal(od.scopes[0].limit,40);assert.equal(od.wouldAllow,false,'41st OKX candles call inside 2s window should exceed Shadow limit');

var krakenBook=resolve('https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=20','KRAKEN');
assert.equal(krakenBook.dataset,'SPOT_ORDERBOOK');

var okxSpotBook=resolve('https://www.okx.com/api/v5/market/books?instId=BTC-USDT&sz=20','OKX');
assert.equal(okxSpotBook.dataset,'SPOT_ORDERBOOK');
var okxPerpBook=resolve('https://www.okx.com/api/v5/market/books?instId=BTC-USDT-SWAP&sz=20','OKX');
assert.equal(okxPerpBook.dataset,'PERP_ORDERBOOK');

var oi=resolve('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP','OKX');
var oid=budget.observe({provider:'OKX',dataset:oi.dataset,cost:1,scopes:oi.scopes});
assert.equal(oid.scopes[0].kind,'OBSERVE_ONLY');assert.equal(oid.scopes[0].limit,null);assert.equal(oid.wouldAllow,true);

var bybitBook=resolve('https://api.bybit.com/v5/market/orderbook?category=linear&symbol=BTCUSDT&limit=20','BYBIT');
assert.equal(bybitBook.dataset,'PERP_ORDERBOOK');

var b=resolve('https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=60&limit=500','BYBIT');
assert.equal(b.scopes.length,2);assert.equal(b.scopes[0].id,'BYBIT_GLOBAL_IP');assert.equal(b.scopes[1].id,'BYBIT_KLINE');
var bd1=budget.observe({provider:'BYBIT',dataset:b.dataset,cost:1,scopes:b.scopes});
assert.equal(bd1.scopes[0].limit,600);assert.equal(bd1.scopes[1].limit,null);
budget.feedback('BYBIT',{scopes:b.scopes,headers:{'x-bapi-limit':'10','x-bapi-limit-status':'9','x-bapi-limit-reset-timestamp':'2000000000000'},statusCode:200});
var bd2=budget.observe({provider:'BYBIT',dataset:b.dataset,cost:1,scopes:b.scopes});
var endpoint=bd2.scopes.filter(function(x){return x.scope==='BYBIT_KLINE';})[0];
assert.equal(endpoint.limit,10);assert.equal(endpoint.source,'OBSERVED_HEADER');assert.equal(endpoint.observedRemaining,9);

var fb=Limits.feedback(b,403,{},null,'PROVIDER_HTTP_403');
assert.equal(fb.rateLimited,false);assert.equal(fb.providerCooldownMs,0);assert.equal(fb.category,'ACCESS_DENIED');assert.equal(fb.reason,'BYBIT_HTTP_403_ACCESS_OR_REGION');
budget.feedback('BYBIT',fb);
var bd3=budget.observe({provider:'BYBIT',dataset:b.dataset,cost:1,scopes:b.scopes});
assert.equal(bd3.providerCooldown.active,false);assert.equal(bd3.wouldAllow,true,'generic Bybit 403 must not create a fake rate-limit cooldown');

var rateFb=Limits.feedback(b,200,{}, {retCode:10006,retMsg:'Too many visits'},'');
assert.equal(rateFb.rateLimited,true);assert.equal(rateFb.category,'RATE_LIMIT');assert.equal(rateFb.providerCooldownMs,600000);
budget.feedback('BYBIT',rateFb);
var bd4=budget.observe({provider:'BYBIT',dataset:b.dataset,cost:1,scopes:b.scopes});
assert.equal(bd4.providerCooldown.active,true);assert.equal(bd4.wouldAllow,false,'explicit Bybit rate-limit signal must simulate cooldown');

var policy=ApplyPhase3(new Policy());
assert.equal(policy.resolve('KRAKEN','SPOT_ORDERBOOK').criticality,'CRITICAL');
assert.equal(policy.resolve('OKX','SPOT_CANDLES').priority,'P1');
assert.equal(policy.resolve('OKX','SPOT_ORDERBOOK').priority,'P0');
assert.equal(policy.resolve('OKX','PERP_ORDERBOOK').priority,'P0');
assert.equal(policy.resolve('BYBIT','PERP_ORDERBOOK').priority,'P0');
assert.equal(policy.snapshot().rules.filter(function(x){return x.dataset==='ORDERBOOK';}).length,0,'generic ORDERBOOK policy must not exist');
assert.equal(profiles.BINANCE.limitModel,'WEIGHTED','Phase 2 Binance profile must be preserved');
assert.equal(profiles.HYPERLIQUID.limitModel,'WEIGHTED','Phase 2 Hyperliquid profile must be preserved');

console.log('PASS Phase 3 special limits: Kraken + OKX + Bybit');
