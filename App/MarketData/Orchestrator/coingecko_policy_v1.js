'use strict';

module.exports=function(policy){
 policy.setProviderDefaults('COINGECKO',{
  priority:'P2',freshness:'STANDARD',criticality:'NORMAL',
  cacheTtlMs:300000,mode:'ON_DEMAND',firewallRequired:true,
  retention:'MEMORY',distribution:'ROUTER_CP1'
 });
 [
  {dataset:'ASSET_SEARCH',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:300000,mode:'ON_DEMAND'},
  {dataset:'MARKET_REGISTRY',priority:'P1',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:1800000,mode:'SCHEDULED'},
  {dataset:'ASSET_METADATA',priority:'P2',freshness:'SLOW',criticality:'LOW',cacheTtlMs:86400000,mode:'ON_DEMAND',retention:'PERSISTENT'},
  {dataset:'GLOBAL_MARKET',priority:'P1',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:900000,mode:'SCHEDULED'},
  {dataset:'REFERENCE_PRICE',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:60000,mode:'ON_DEMAND'},
  {dataset:'CEX_REFERENCE',priority:'P2',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:1800000,mode:'SCHEDULED'}
 ].forEach(function(x){policy.register(Object.assign({provider:'COINGECKO'},x));});
 return policy;
};
