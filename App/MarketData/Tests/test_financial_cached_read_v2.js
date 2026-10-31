'use strict';
// Local fixtures: verify only the opt-in stale-while-revalidate contract.
var test=require('node:test'),assert=require('assert'),Collector=require('../Financial/financial_collector');
function subject(fresh,stored){var c=Object.create(Collector.prototype);c.store={get:function(){return stored;},isFresh:function(){return fresh;}};return c;}
test('cached UI read returns before refresh, preserving original validated metadata',function(){
 var cached={timestamp:1,meta:{firewall:'VALIDATED_BEFORE_STORE',freshness:{cefi:{expiresAt:2}}}},c=subject(false,cached),events=[];
 c.refreshStale=function(){events.push('refresh');};
 c.snapshot(false,function(e,data){assert.ifError(e);assert.strictEqual(data,cached);events.push('response');},{staleWhileRevalidate:true});
 assert.deepStrictEqual(events,['response','refresh']);
});
test('fresh reads do not refresh; ordinary reads and force keep their existing contract',function(){
 var c=subject(true,{});c.refreshStale=function(){throw Error('unexpected refresh');};c.snapshot(false,function(e){assert.ifError(e);},{staleWhileRevalidate:true});
 c=subject(false,{});var calls=[];c.refreshStale=function(cb){calls.push('stale');cb(null,{fresh:true});};c.refresh=function(opt,cb){calls.push(opt.scope);cb(null,{forced:true});};
 c.snapshot(false,function(e,d){assert(d.fresh);});c.snapshot(true,function(e,d){assert(d.forced);},{staleWhileRevalidate:true});assert.deepStrictEqual(calls,['stale','ALL']);
});
test('cold UI read awaits a validated refresh and propagates its failure',function(){
 var c=subject(false,null);c.refreshStale=function(cb){cb(new Error('DATA_FIREWALL_REJECT'));};
 c.snapshot(false,function(e){assert.equal(e.message,'DATA_FIREWALL_REJECT');},{staleWhileRevalidate:true});
});
