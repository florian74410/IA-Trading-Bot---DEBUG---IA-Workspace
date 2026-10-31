'use strict';
var assert=require('assert'),Collector=require('../Financial/financial_collector');

function baseSnap(){
 var now=Date.now();
 return{schema:'iatb.financial.snapshot/2.1',timestamp:now,expiresAt:now+90000,
  cefi:{provider:'COINGECKO',observedAt:now,global:{},assets:[],exchanges:[],exchangeShares:[],limitations:[]},
  defi:{provider:'DEFILLAMA',observedAt:now,tvlUsd:1,chains:[],protocols:[],dexProtocols:[],limitations:[]},
  meta:{freshness:{
   cefi:{observedAt:now,expiresAt:now+45000,ttlMs:45000,provider:'COINGECKO'},
   defi:{observedAt:now,expiresAt:now+90000,ttlMs:90000,provider:'DEFILLAMA'}
  }}
 };
}
var current=baseSnap(),fresh={fresh:false,cefi:{fresh:false},defi:{fresh:true}};
var store={
 get:function(){return current;},
 set:function(x){current=x;return x;},
 freshness:function(){return fresh;},
 isFresh:function(){return !!fresh.fresh;},
 list:function(){return[];},
 status:function(){return{ok:true};}
};
var fw={inspect:function(m,cb){cb(null,{decision:'PASS'});}};
var c=new Collector({coingecko:{},defillama:{},store:store,firewall:fw,defiEnrichmentDelayMs:999999,cefiEnrichmentDelayMs:999999});
var cefiCalls=0,defiCalls=0;
c._cefi=function(cb){cefiCalls++;cb(null,{provider:'COINGECKO',observedAt:Date.now(),global:{},assets:[],exchanges:[],exchangeShares:[],limitations:[]});};
c._defi=function(cb){defiCalls++;cb(null,{provider:'DEFILLAMA',observedAt:Date.now(),tvlUsd:2,chains:[],protocols:[],dexProtocols:[],limitations:[]});};

c.refreshStale(function(e){
 assert.ifError(e);
 assert.equal(cefiCalls,1,'stale CeFi should refresh');
 assert.equal(defiCalls,0,'fresh DeFi must not refresh with CeFi');
 var preserved=current.meta.freshness.defi.expiresAt;
 assert(preserved,'DeFi freshness must be preserved');

 fresh={fresh:false,cefi:{fresh:true},defi:{fresh:false}};
 c.refreshStale(function(e2){
  assert.ifError(e2);
  assert.equal(cefiCalls,1,'fresh CeFi must not refresh with DeFi');
  assert.equal(defiCalls,1,'stale DeFi should refresh');

  fresh={fresh:true,cefi:{fresh:true},defi:{fresh:true}};
  c.refreshStale(function(e3,o3){
   assert.ifError(e3);
   assert.equal(o3.skipped,true);
   assert.equal(cefiCalls,1);
   assert.equal(defiCalls,1);
   console.log('PASS Financial family scheduler: CeFi/DeFi refresh independently');
  });
 });
});
