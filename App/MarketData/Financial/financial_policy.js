'use strict';
/* IA-TB Financial Provider Policy v1.0
   One authoritative provider per metric family. Secondary providers are fallback/validation only.
*/
var POLICY={
 token_market:{
  owner:'COINGECKO',
  reason:'CoinGecko is the canonical breadth provider for token spot price, market cap, volume, supply/ranking metadata.',
  metrics:['priceUsd','marketCapUsd','volume24hUsd','change24hPct','global.marketCapUsd','global.totalVolume24hUsd','global.btcDominancePct','exchanges','exchangeShares']
 },
 defi_protocol:{
  owner:'DEFILLAMA',
  reason:'DeFiLlama is the canonical provider for protocol and chain TVL, DeFi categories and protocol-level DeFi coverage.',
  metrics:['tvlUsd','protocols','categories','chains']
 },
 dex_market:{
  owner:'DEFILLAMA',
  reason:'DeFiLlama DEX overview is preferred for aggregate DEX volume and protocol DEX rankings.',
  metrics:['dexVolume24hUsd','dexVolume7dUsd','dexProtocols']
 },
 stablecoin_defi:{
  owner:'DEFILLAMA',
  reason:'DeFiLlama stablecoin dataset is preferred for aggregate stablecoin market capitalization and DeFi stablecoin analytics.',
  metrics:['stablecoinMarketCapUsd']
 }
};
function clone(x){return JSON.parse(JSON.stringify(x));}
function ownerFor(metric){
 metric=String(metric||'');
 var keys=Object.keys(POLICY),i,j,m;
 for(i=0;i<keys.length;i++){m=POLICY[keys[i]];for(j=0;j<m.metrics.length;j++)if(m.metrics[j]===metric||metric.indexOf(m.metrics[j]+'.')===0)return{family:keys[i],owner:m.owner,reason:m.reason};}
 return null;
}
function describe(){return clone(POLICY);}
module.exports={policy:POLICY,ownerFor:ownerFor,describe:describe};
