'use strict';
var assert=require('assert'),Policy=require('../Orchestrator/data_source_policy'),Orchestrator=require('../Orchestrator/api_request_orchestrator'),wrap=require('../Orchestrator/shadow_provider_proxy');

var p=new Policy();
p.setProviderDefaults('TEST',{cacheTtlMs:1000,priority:'P2',freshness:'STANDARD',criticality:'NORMAL'});
p.register({provider:'TEST',dataset:'VALUE',cacheTtlMs:1000});
var o=new Orchestrator({mode:'SHADOW',policy:p,cacheFirst:true,dedup:true,maxCacheEntries:8,maxCacheBytes:1024*1024});
var calls=0;
var raw={getValue:function(x,cb){calls++;setTimeout(function(){cb(null,{x:x,call:calls});},40);}};
var provider=wrap(raw,{provider:'TEST',orchestrator:o,methods:{getValue:{dataset:'VALUE'}}});

provider.getValue('A',function(e){
 assert.ifError(e);assert.equal(calls,1);
 provider.getValue('A',function(e2){
  assert.ifError(e2);
  assert.equal(calls,2,'sequential raw provider calls must not be served from pre-firewall cache');

  var done=0,vals=[];
  function finish(err,v){assert.ifError(err);vals.push(v);if(++done<2)return;
   assert.equal(calls,3,'two concurrent calls must still collapse to one provider call');
   assert.deepEqual(vals[0],vals[1]);
   var st=o.status();
   assert.equal(st.execution.providerRawCache,false);
   assert.equal(st.execution.cacheBoundary,'POST_FIREWALL_ONLY');
   assert.equal(st.broker.stats.cacheHitsServed,0);
   assert(st.broker.stats.dedupServed>=1);
   console.log('PASS Native-Lite dedup + post-firewall cache boundary');
  }
  provider.getValue('B',finish);
  provider.getValue('B',finish);
 });
});
