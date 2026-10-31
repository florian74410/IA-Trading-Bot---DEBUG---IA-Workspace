'use strict';
var ApplyPhase2=require('./phase2_provider_policy_v1');
var Limits=require('./request_limit_profile_v1');

function add(policy,provider,defaults,rules){
 policy.setProviderDefaults(provider,defaults);
 (rules||[]).forEach(function(x){policy.register(Object.assign({provider:provider},x));});
}
module.exports=function(policy){
 ApplyPhase2(policy);
 add(policy,'KRAKEN',{priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:15000,mode:'ACTIVE_CONTEXT',firewallRequired:true,retention:'MEMORY',distribution:'ROUTER_CP1'},[
  {dataset:'SPOT_CANDLES',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:15000},
  {dataset:'SPOT_ORDERBOOK',priority:'P0',freshness:'FAST',criticality:'CRITICAL',cacheTtlMs:5000}
 ]);
 add(policy,'OKX',{priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:10000,mode:'ACTIVE_CONTEXT',firewallRequired:true,retention:'MEMORY',distribution:'ROUTER_CP1'},[
  {dataset:'SPOT_CANDLES',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:15000},
  {dataset:'SPOT_ORDERBOOK',priority:'P0',freshness:'FAST',criticality:'CRITICAL',cacheTtlMs:5000},
  {dataset:'PERP_ORDERBOOK',priority:'P0',freshness:'FAST',criticality:'CRITICAL',cacheTtlMs:5000},
  {dataset:'OPEN_INTEREST',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:10000}
 ]);
 add(policy,'BYBIT',{priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:10000,mode:'ACTIVE_CONTEXT',firewallRequired:true,retention:'MEMORY',distribution:'ROUTER_CP1'},[
  {dataset:'PERP_CANDLES',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:15000},
  {dataset:'PERP_ORDERBOOK',priority:'P0',freshness:'FAST',criticality:'CRITICAL',cacheTtlMs:5000},
  {dataset:'OPEN_INTEREST_CONTEXT',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:10000}
 ]);
 return policy;
};
module.exports.budgetProfiles=function(opt){
 var x=ApplyPhase2.budgetProfiles(opt),p=Limits.budgetProfiles();
 Object.keys(p).forEach(function(k){x[k]=p[k];});
 return x;
};
module.exports.shadowMaps=ApplyPhase2.shadowMaps;
