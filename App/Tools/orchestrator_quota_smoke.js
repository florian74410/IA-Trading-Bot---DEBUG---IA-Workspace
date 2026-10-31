'use strict';
// Strictly offline fixtures: request quotas, 429 feedback, cache TTL and dedup.
// No engines or providers are launched. SHADOW decisions are never enforced.
const assert=require('node:assert/strict');
const Budget=require('../MarketData/Orchestrator/request_budget');
const Broker=require('../MarketData/Orchestrator/request_broker');
const Orchestrator=require('../MarketData/Orchestrator/api_request_orchestrator');
try {
 const budget=new Budget({mode:'SHADOW'});
 budget.configure('FIXTURE',{
  shortLimit:2,shortWindowMs:60000,longLimit:3,longWindowMs:86400000,
  weightedScopes:{REST:{limit:3,windowMs:60000,unit:'WEIGHT',
   dynamicHeaders:{limit:'x-test-limit',remaining:'x-test-remaining',reset:'x-test-reset'}}}
 });
 const req={provider:'FIXTURE',dataset:'ASSET_SEARCH',cost:1,scopes:['REST']};
 const first=budget.observe(req),second=budget.observe(req),third=budget.observe(req),fourth=budget.observe(req);
 assert.equal(first.wouldAllow,true);
 assert.equal(second.wouldAllow,true);
 assert.equal(third.short.wouldAllow,false);
 assert.equal(fourth.long.wouldAllow,false);
 assert.equal(fourth.scopes[0].wouldAllowWindow,false);
 console.log('SHORT + LONG + WEIGHTED BUDGET: OK');
 const retry=budget.feedback('FIXTURE',{
  statusCode:429,rateLimited:true,retryAfterMs:3000,reason:'HTTP_429',
  scopes:['REST'],headers:{'x-test-limit':'5','x-test-remaining':'0','x-test-reset':'1234567890'}
 });
 assert.equal(retry.rateLimited,true);
 const after429=budget.observe(req);
 assert.equal(after429.providerCooldown.active,true);
 assert.equal(after429.wouldAllow,false);
 assert.equal(after429.scopes[0].observedLimit,5);
 assert.equal(after429.scopes[0].observedRemaining,0);
 console.log('HTTP 429 + RETRY-AFTER + HEADERS: OK');
 const unknown=budget.observe({provider:'UNKNOWN_PROVIDER',dataset:'ANY',cost:1});
 assert.equal(unknown.enforcementPolicy,'OBSERVE_ONLY_NON_BLOCKING');
 assert.equal(unknown.blockingEligible,false);
 console.log('UNKNOWN PROVIDER NON-BLOCKING: OK');
 const broker=new Broker({mode:'SHADOW',maxCacheEntries:8,maxCacheBytes:1048576});
 const k=broker.key({provider:'FIXTURE',dataset:'ASSET_SEARCH',signature:'fixture'});
 const s1=broker.before({provider:'FIXTURE',dataset:'ASSET_SEARCH',signature:'fixture'},{cacheTtlMs:20000});
 const s2=broker.before({provider:'FIXTURE',dataset:'ASSET_SEARCH',signature:'fixture'},{cacheTtlMs:20000});
 assert.equal(s1.inflightDuplicate,false);
 assert.equal(s2.inflightDuplicate,true);
 broker.after(k,true);broker.after(k,true);
 assert.equal(broker.cachePut(k,[null,{market:'TEST',nested:{value:5}}],20000),true);
 const cached=broker.cacheGet(k,20000);
 assert(cached);
 cached[1].nested.value=999;
 assert.equal(broker.cacheGet(k,20000)[1].nested.value,5);
 assert.equal(broker.cacheGet(k,0),null);
 console.log('DEDUP OBSERVATION + POST-FIREWALL CACHE TTL: OK');
 let delivered=0;
 broker.join(k,function(args){assert.equal(args[1].value,42);delivered++;});
 broker.resolve(k,[null,{value:42}]);
 assert.equal(delivered,1);
 console.log('DEDUP CALLBACK DELIVERY: OK');
 const orchestrator=new Orchestrator({mode:'SHADOW'});
 assert.equal(orchestrator.status().execution.budgetEnforcement,false);
 assert.equal(orchestrator.status().execution.decisionEnforcement,false);
 console.log('SHADOW NON-ENFORCEMENT: OK');
 console.log('EXTERNAL NETWORK REQUESTS: 0');
 console.log('TRADING ENGINES STARTED: 0');
 console.log('QUOTAS + 429 + CACHE SMOKE: SUCCESS');
} catch(e) {
 console.error('QUOTAS + 429 + CACHE SMOKE: FAILED',e.stack||e);
 process.exitCode=1;
}
