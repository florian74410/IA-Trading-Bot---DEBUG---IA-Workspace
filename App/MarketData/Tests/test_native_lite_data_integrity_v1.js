'use strict';

var assert=require('assert');
var Policy=require('../Orchestrator/data_source_policy');
var Orchestrator=require('../Orchestrator/api_request_orchestrator');
var wrap=require('../Orchestrator/shadow_provider_proxy');
var signature=wrap.signature;

var p=new Policy();
p.setProviderDefaults('TEST',{cacheTtlMs:5000,priority:'P2',freshness:'STANDARD',criticality:'NORMAL'});
p.register({provider:'TEST',dataset:'COMPLEX',cacheTtlMs:5000});
var o=new Orchestrator({mode:'SHADOW',policy:p,cacheFirst:true,dedup:true,maxCacheEntries:16,maxCacheBytes:4*1024*1024});
var calls=0;
var raw={getComplex:function(input,cb){calls++;setTimeout(function(){cb(null,{input:input,nested:{price:123.45,arr:[1,{safe:true}]},bytes:Buffer.from('abc'),producedByCall:calls});},30);}};
var provider=wrap(raw,{provider:'TEST',orchestrator:o,methods:{getComplex:{dataset:'COMPLEX'}}});

var a={z:1,a:{b:2,a:3},long:'x'.repeat(3000)};
var b={long:'x'.repeat(3000),a:{a:3,b:2},z:1};
var c={long:'x'.repeat(2999)+'y',a:{a:3,b:2},z:1};
assert.equal(signature([a]),signature([b]));
assert.notEqual(signature([a]),signature([c]));
assert.equal(signature([a]).length,64);

var got=[];
function done(e,v){
 assert.ifError(e);got.push(v);
 if(got.length<2)return;
 assert.equal(calls,1,'concurrent identical request must collapse to one provider call');
 got[0].nested.price=-1;got[0].nested.arr[1].safe=false;got[0].bytes[0]=0;
 assert.equal(got[1].nested.price,123.45);
 assert.equal(got[1].nested.arr[1].safe,true);
 assert.equal(got[1].bytes.toString(),'abc');
 provider.getComplex({symbol:'ETHUSD'},function(e3,third){
  assert.ifError(e3);
  assert.equal(calls,2,'completed raw provider response must not persist in pre-firewall cache');
  assert.equal(third.nested.price,123.45);
  var st=o.status();
  assert.equal(st.execution.providerRawCache,false);
  assert.equal(st.broker.stats.cloneFailures,0);
  assert(st.broker.stats.dedupServed>=1);
  console.log('PASS Native-Lite signature + dedup isolation integrity');
 });
}
provider.getComplex({symbol:'ETHUSD'},done);
provider.getComplex({symbol:'ETHUSD'},done);
