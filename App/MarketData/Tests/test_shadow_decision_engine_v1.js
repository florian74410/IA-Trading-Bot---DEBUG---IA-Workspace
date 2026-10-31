'use strict';

var assert=require('assert');
var Policy=require('../Orchestrator/data_source_policy');
var Orchestrator=require('../Orchestrator/api_request_orchestrator');
var Decision=require('../Orchestrator/shadow_decision_engine_v1');

var p=new Policy();
p.setProviderDefaults('BINANCE',{priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:10000});
p.register({provider:'BINANCE',dataset:'SPOT_CANDLES',priority:'P1',criticality:'HIGH'});
p.setProviderDefaults('DEFILLAMA',{priority:'P2',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000});
p.register({provider:'DEFILLAMA',dataset:'TEST',priority:'P2',criticality:'NORMAL'});

var o=new Orchestrator({mode:'SHADOW',policy:p});
o.configureProvider('BINANCE',{limitModel:'RPM',shortWindowMs:60000,shortLimit:1,costDefault:1});
o.configureProvider('DEFILLAMA',{limitModel:'UNKNOWN',shortLimit:null,longLimit:null,costDefault:1});

var s1=o.observeStart({provider:'BINANCE',dataset:'SPOT_CANDLES',signature:'same'});
var s2=o.observeStart({provider:'BINANCE',dataset:'SPOT_CANDLES',signature:'same'});
assert.equal(s1.decision.action,'ALLOW');
assert.equal(s2.decision.action,'DEDUP_CANDIDATE');
assert.equal(s2.decision.executable,false);
assert.equal(s2.decision.blocking,false);
o.observeEnd(s1,null);o.observeEnd(s2,null);

var t1=o.observeTransport({provider:'BINANCE',dataset:'SPOT_CANDLES',cost:1});
var t2=o.observeTransport({provider:'BINANCE',dataset:'SPOT_CANDLES',cost:1});
assert.equal(t1.decision.action,'ALLOW');
assert.equal(t2.budget.wouldAllow,false);
assert.equal(t2.decision.action,'DELAY');
assert.equal(t2.decision.executable,false,'Shadow decision must never execute');
assert.equal(t2.decision.blocking,false,'Shadow decision must never block');

var unknown=o.observeTransport({provider:'DEFILLAMA',dataset:'SPOT_CANDLES',cost:1});
assert.equal(unknown.decision.action,'ALLOW_WITH_ADVISORY');
assert.equal(unknown.decision.executable,false);

var fallback=Decision.end({provider:'BINANCE',dataset:'SPOT_CANDLES',policy:p.resolve('BINANCE','SPOT_CANDLES'),error:new Error('PROVIDER_ERROR')});
assert.equal(fallback.action,'FALLBACK_CANDIDATE');
assert.deepEqual(fallback.alternates,['BINANCE','OKX','KRAKEN','BYBIT']);
assert.equal(fallback.nextProvider,'OKX');
assert.equal(fallback.nextRank,2);
assert.equal(fallback.executable,false);

var st=o.status();
assert.equal(st.version,'1.6');
assert.equal(st.execution.decisionEnforcement,false);
console.log('PASS Shadow Decision Engine v1 observation-only contract');
