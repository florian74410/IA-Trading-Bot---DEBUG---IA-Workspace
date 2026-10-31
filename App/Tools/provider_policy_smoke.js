'use strict';
// Provider-specific policies and HTTP feedback: offline fixtures only.
const assert=require('node:assert/strict');
const Limits=require('../MarketData/Orchestrator/request_limit_profile_v1');
const Phase3=require('../MarketData/Orchestrator/phase3_provider_policy_v1');
const Budget=require('../MarketData/Orchestrator/request_budget');
function profile(provider,url,opts){return Limits.resolve(new URL(url),opts||{},provider);}
try{
 const profiles=Phase3.budgetProfiles({coingeckoDemo:false});
 for(const id of ['BINANCE','KRAKEN','OKX','BYBIT']){
  assert(profiles[id],id+' budget profile missing');
 }
 console.log('BINANCE / KRAKEN / OKX / BYBIT PROFILES: OK');
 const bn=profile('BINANCE','https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=500');
 assert.equal(bn.cost,10);
 assert.equal(bn.scope,'BINANCE_USDM_WEIGHT');
 const binanceBudget=new Budget({mode:'SHADOW'});
 binanceBudget.configure('BINANCE',profiles.BINANCE);
 const weighted=binanceBudget.observe({provider:'BINANCE',dataset:bn.dataset,cost:bn.cost,scopes:bn.scopes});
 assert.equal(weighted.weighted.cost,10);
 console.log('BINANCE WEIGHTED REQUEST COST: OK');
 const kr=profile('KRAKEN','https://api.kraken.com/0/public/OHLC?pair=XBTUSD');
 assert.equal(kr.dataset,'SPOT_CANDLES');
 assert.equal(kr.scopes[0].minIntervalMs,1000);
 const krakenBudget=new Budget({mode:'SHADOW'});
 krakenBudget.configure('KRAKEN',profiles.KRAKEN);
 krakenBudget.observe({provider:'KRAKEN',dataset:kr.dataset,scopes:kr.scopes});
 const k2=krakenBudget.observe({provider:'KRAKEN',dataset:kr.dataset,scopes:kr.scopes});
 assert.equal(k2.blockingEligible,false);
 console.log('KRAKEN SAFE PACE OBSERVE-ONLY: OK');
 const okx=profile('OKX','https://www.okx.com/api/v5/market/books?instId=BTC-USDT-SWAP');
 assert.equal(okx.dataset,'PERP_ORDERBOOK');
 assert.equal(okx.scopes[0].id,'OKX_BOOKS');
 const okx429=Limits.feedback(okx,200,{}, {code:'50011'});
 assert.equal(okx429.rateLimited,true);
 assert.equal(okx429.category,'RATE_LIMIT');
 console.log('OKX ENDPOINT + 50011: OK');
 const bybit=profile('BYBIT','https://api.bybit.com/v5/market/orderbook?category=linear&symbol=BTCUSDT');
 assert.equal(bybit.scopes.length,2);
 const headerFeedback=Limits.feedback(bybit,200,{'X-Bapi-Limit':'20','X-Bapi-Limit-Status':'19'}, {});
 const bybitBudget=new Budget({mode:'SHADOW'});
 bybitBudget.configure('BYBIT',profiles.BYBIT);
 bybitBudget.feedback('BYBIT',headerFeedback);
 assert.equal(bybitBudget.status().providers.BYBIT.limitScopes.BYBIT_ORDERBOOK.observedLimit,20);
 const bybit429=Limits.feedback(bybit,200,{}, {retCode:10006});
 assert.equal(bybit429.rateLimited,true);
 assert.equal(bybit429.providerCooldownMs,600000);
 const bybit403=Limits.feedback(bybit,403,{}, {retMsg:'Forbidden'});
 assert.equal(bybit403.rateLimited,false);
 assert.equal(bybit403.category,'ACCESS_DENIED');
 console.log('BYBIT DYNAMIC HEADERS + 10006 + 403: OK');
 const legal=Limits.feedback(bybit,451,{}, {});
 assert.equal(legal.category,'GEO_RESTRICTED');
 const retry=Limits.feedback(okx,429,{'Retry-After':'2'}, {});
 assert.equal(retry.retryAfterMs,2000);
 console.log('HTTP 451 + RETRY-AFTER: OK');
 console.log('NETWORK REQUESTS: 0');
 console.log('TRADING ENGINES STARTED: 0');
 console.log('PROVIDER POLICIES SMOKE: SUCCESS');
}catch(e){console.error('PROVIDER POLICIES SMOKE: FAILED',e.stack||e);process.exitCode=1;}
