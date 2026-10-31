'use strict';
var assert=require('assert');
var Policy=require('../Orchestrator/data_source_policy');
var Orchestrator=require('../Orchestrator/api_request_orchestrator');
var ApplyPhase1=require('../Orchestrator/phase1_provider_policy_v1');

var policy=ApplyPhase1(new Policy());
var orch=new Orchestrator({mode:'SHADOW',policy:policy});
var profiles=ApplyPhase1.budgetProfiles({coingeckoDemo:true});
Object.keys(profiles).forEach(function(id){orch.configureProvider(id,profiles[id]);});

var cg=orch.budget.status().providers.COINGECKO;
assert.equal(cg.shortLimit,100);
assert.equal(cg.longLimit,10000);
assert.equal(cg.reserve,2000);

var cgAnonymous=ApplyPhase1.budgetProfiles({coingeckoDemo:false}).COINGECKO;
assert.equal(cgAnonymous.limitModel,'UNKNOWN');
assert.equal(cgAnonymous.shortLimit,null);
assert.equal(cgAnonymous.longLimit,null);
assert.equal(cgAnonymous.reserve,0);

var dl=orch.budget.observe({provider:'DEFILLAMA',dataset:'CHAINS',priority:'P1',cost:1});
assert.equal(dl.limitModel,'UNKNOWN');
assert.equal(dl.short.known,false);
assert.equal(dl.short.wouldAllow,null);
assert.equal(dl.long.known,false);
assert.equal(dl.long.wouldAllow,null);
assert.equal(dl.wouldAllow,true);

var gmx=orch.budget.observe({provider:'GMX',dataset:'PERP_CANDLES',priority:'P1',cost:1});
assert.equal(gmx.enforceable,false);
assert.equal(gmx.wouldAllow,true);

var ds=orch.budget.observe({provider:'DEXSCREENER',dataset:'DEX_PAIR_LIQUIDITY',priority:'P1',cost:1});
assert.equal(ds.short.known,true);
assert.equal(ds.short.limit,300);
assert.equal(ds.long.known,false);

assert.equal(policy.resolve('DEFILLAMA','OPEN_INTEREST_OVERVIEW').criticality,'HIGH');
assert.equal(policy.resolve('DEXSCREENER','DEX_PAIR_LIQUIDITY').freshness,'FAST');
assert.equal(policy.resolve('GMX','PERP_CANDLES').priority,'P1');

console.log('PASS Phase 1 provider policy/budget shadow profiles');
