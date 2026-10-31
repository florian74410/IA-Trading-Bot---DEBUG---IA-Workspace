'use strict';
var assert=require('assert');
var Policy=require('../Orchestrator/data_source_policy');
var Orchestrator=require('../Orchestrator/api_request_orchestrator');
var ApplyCoinGeckoPolicy=require('../Orchestrator/coingecko_policy_v1');
var Wrap=require('../Orchestrator/shadow_provider_proxy');

var policy=ApplyCoinGeckoPolicy(new Policy());
var orch=new Orchestrator({mode:'SHADOW',policy:policy});
orch.configureProvider('COINGECKO',{shortWindowMs:60000,shortLimit:100,longWindowMs:2592000000,longLimit:10000,reserve:2000,costDefault:1});

var calls=0;
var provider={id:'COINGECKO',global:function(cb){calls++;setTimeout(function(){cb(null,{ok:true});},5);}};
var wrapped=Wrap(provider,{provider:'COINGECKO',orchestrator:orch,methods:{global:{dataset:'GLOBAL_MARKET'}}});

var p=policy.resolve('COINGECKO','GLOBAL_MARKET');
assert.equal(p.priority,'P1');
assert.equal(p.freshness,'STANDARD');
assert.equal(p.criticality,'NORMAL');
assert.equal(orch.mode,'SHADOW');

var done=0;
function finish(){
 done++;
 if(done<2)return;
 var s=orch.status();
 assert.equal(calls,2,'shadow mode must not deduplicate or block legacy calls');
 assert.ok(s.broker.stats.dedupOpportunities>=1,'shadow mode should detect overlapping duplicate opportunity');
 assert.equal(s.budget.providers.COINGECKO.longLimit,10000);
 assert.equal(s.budget.providers.COINGECKO.reserve,2000);
 assert.equal(s.budget.providers.COINGECKO.shortUsed,0,'logical Shadow requests must not consume transport quota');
 assert.equal(s.budget.providers.COINGECKO.longUsed,0,'logical Shadow requests must not consume transport quota');
 assert.equal(s.shadow,true);
 console.log('PASS API Request Orchestrator v1 Shadow Mode');
}
wrapped.global(function(e){assert.ifError(e);finish();});
wrapped.global(function(e){assert.ifError(e);finish();});
