'use strict';
var assert=require('assert'),URL=require('url').URL;
var Policy=require('../Orchestrator/data_source_policy');
var Orchestrator=require('../Orchestrator/api_request_orchestrator');
var Bridge=require('../Orchestrator/transport_orchestrator_bridge');
var Limits=require('../Orchestrator/request_limit_profile_v1');
var ApplyPhase3=require('../Orchestrator/phase3_provider_policy_v1');

var policy=ApplyPhase3(new Policy()),orch=new Orchestrator({mode:'SHADOW',policy:policy}),profiles=ApplyPhase3.budgetProfiles();
Object.keys(profiles).forEach(function(id){orch.configureProvider(id,profiles[id]);});
Bridge.set(orch);
assert.equal(Bridge.status().transportObserve,true);
assert.equal(Bridge.status().transportFeedback,true);

var p=Limits.resolve(new URL('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),{},'BINANCE');
var e=Bridge.observe({provider:'BINANCE',dataset:p.dataset,cost:p.cost,scopes:p.scopes});
assert(e&&e.budget,'transport observation must reach Request Budget');
assert.equal(e.budget.scopes[0].scope,'BINANCE_USDM_WEIGHT');
assert.equal(e.budget.scopes[0].limit,2400);

var b=Limits.resolve(new URL('https://api.bybit.com/v5/market/orderbook?category=linear&symbol=BTCUSDT&limit=20'),{},'BYBIT');
Bridge.observe({provider:'BYBIT',dataset:b.dataset,cost:1,scopes:b.scopes});
Bridge.feedback('BYBIT',{scopes:b.scopes,headers:{'x-bapi-limit':'25','x-bapi-limit-status':'24','x-bapi-limit-reset-timestamp':'2000000000000'},statusCode:200});
var s=orch.status();
assert.equal(s.version,'1.6');
assert.equal(s.budget.providers.BYBIT.limitScopes.BYBIT_ORDERBOOK.limit,25);
assert.equal(s.budget.providers.BYBIT.limitScopes.BYBIT_ORDERBOOK.source,'OBSERVED_HEADER');

console.log('PASS transport bridge -> orchestrator -> budget integration');
