'use strict';
var assert=require('assert');
var DexLiquidityCollector=require('../Collectors/dex_liquidity_collector');

var providerCalls=0,firewallCalls=0,saves=0;
var provider={pairLiquidity:function(symbol,cb){
 providerCalls++;
 cb(null,{symbol:symbol,canonicalSymbol:'BTCUSD',observedAt:Date.now(),weightedPriceUsd:100,liquidityUsd:1000,volume24hUsd:500,poolCount:2,chains:['ETH'],dexes:['TEST'],provenance:'TEST_PROVIDER'});
}};
var firewall={inspect:function(msg,cb){
 firewallCalls++;
 if(firewallCalls===1){var e=new Error('DATA_FIREWALL_REJECT');e.firewall={decision:'REJECT'};return cb(e);}
 cb(null,{decision:'PASS',reason:'VALID',firewall:{checkedAt:Date.now()}});
}};
var store={saveDexLiquidity:function(){saves++;}};
var c=new DexLiquidityCollector({provider:provider,firewall:firewall,store:store,cacheTtlMs:60000,maxEntries:8});

c.get('BTC/USD',false,function(e){
 assert(e,'first response must be rejected by firewall');
 assert.equal(c.cache.stats().entries,0,'rejected response must never enter cache');
 assert.equal(saves,0,'rejected response must never reach store');

 c.get('BTC/USD',false,function(e2,o){
  assert.ifError(e2);
  assert.equal(providerCalls,2);
  assert.equal(c.cache.stats().entries,1,'validated response may enter cache');
  assert.equal(saves,1,'validated response may reach store');

  c.get('BTC/USD',false,function(e3,o2){
   assert.ifError(e3);
   assert.equal(providerCalls,2,'validated post-firewall cache should serve the next request');
   assert.equal(o2.cache,'HIT');
   console.log('PASS Firewall reject => never cached; validated data => post-firewall cache');
  });
 });
});
