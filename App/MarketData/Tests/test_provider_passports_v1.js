'use strict';
var assert=require('assert'),P=require('../Orchestrator/provider_passport_v1');
var expected=['COINGECKO','DEFILLAMA','GMX','DEXSCREENER','BINANCE','HYPERLIQUID','KRAKEN','OKX','BYBIT'];
var list=P.list(),ids=list.map(function(x){return x.provider;}).sort();
assert.deepEqual(ids,expected.slice().sort());
expected.forEach(function(id){
 var v=P.validate(id);
 assert(v.ok,id+' passport invalid: '+(v.reason||''));
 assert(v.passport.policy.defined,id+' policy missing');
 assert(Array.isArray(v.passport.quota.provenance)&&v.passport.quota.provenance.length,id+' provenance missing');
});
assert.equal(P.validate('FUTURE_PROVIDER').ok,false);
var s=P.summary();
assert.equal(s.total,expected.length);
assert.equal(s.nativeEnforcementReady,0,'Native enforcement must remain disabled');
console.log('PASS Provider Passport v1 registry');
