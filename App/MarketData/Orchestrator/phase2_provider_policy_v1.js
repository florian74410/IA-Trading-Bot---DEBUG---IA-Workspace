'use strict';
var ApplyPhase1=require('./phase1_provider_policy_v1');
var Weighted=require('./weighted_request_profile_v1');

function add(policy,provider,defaults,rules){
 policy.setProviderDefaults(provider,defaults);
 (rules||[]).forEach(function(x){policy.register(Object.assign({provider:provider},x));});
}

module.exports=function(policy){
 ApplyPhase1(policy);
 add(policy,'BINANCE',{
  priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:10000,
  mode:'ACTIVE_CONTEXT',firewallRequired:true,retention:'MEMORY',distribution:'ROUTER_CP1'
 },[
  {dataset:'SPOT_CANDLES',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:15000,mode:'ACTIVE_CONTEXT'},
  {dataset:'SPOT_ORDERBOOK',priority:'P0',freshness:'FAST',criticality:'CRITICAL',cacheTtlMs:5000,mode:'ACTIVE_CONTEXT'},
  {dataset:'PERP_ORDERBOOK',priority:'P0',freshness:'FAST',criticality:'CRITICAL',cacheTtlMs:5000,mode:'ACTIVE_CONTEXT'},
  {dataset:'OPEN_INTEREST',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:10000,mode:'ACTIVE_CONTEXT'},
  {dataset:'MARK_PRICE',priority:'P0',freshness:'FAST',criticality:'CRITICAL',cacheTtlMs:5000,mode:'ACTIVE_CONTEXT'}
 ]);
 add(policy,'HYPERLIQUID',{
  priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:10000,
  mode:'ACTIVE_CONTEXT',firewallRequired:true,retention:'MEMORY',distribution:'ROUTER_CP1'
 },[
  {dataset:'PERP_CANDLES',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:15000,mode:'ACTIVE_CONTEXT'},
  {dataset:'PERP_ORDERBOOK',priority:'P0',freshness:'FAST',criticality:'CRITICAL',cacheTtlMs:5000,mode:'ACTIVE_CONTEXT'},
  {dataset:'OPEN_INTEREST_CONTEXT',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:10000,mode:'ACTIVE_CONTEXT'}
 ]);
 return policy;
};
module.exports.budgetProfiles=function(opt){
 var x=ApplyPhase1.budgetProfiles(opt),w=Weighted.budgetProfiles();
 Object.keys(w).forEach(function(k){x[k]=w[k];});
 return x;
};
module.exports.shadowMaps=ApplyPhase1.shadowMaps;
