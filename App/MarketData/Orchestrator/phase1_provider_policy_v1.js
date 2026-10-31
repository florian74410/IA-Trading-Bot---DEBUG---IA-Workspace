'use strict';

var ApplyCoinGecko=require('./coingecko_policy_v1');

function add(policy,provider,defaults,rules){
 policy.setProviderDefaults(provider,defaults);
 (rules||[]).forEach(function(x){policy.register(Object.assign({provider:provider},x));});
}

module.exports=function(policy){
 ApplyCoinGecko(policy);

 add(policy,'DEFILLAMA',{
  priority:'P2',freshness:'STANDARD',criticality:'NORMAL',
  cacheTtlMs:300000,mode:'ON_DEMAND',firewallRequired:true,
  retention:'MEMORY',distribution:'ROUTER_CP1'
 },[
  {dataset:'PROTOCOLS',priority:'P2',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000,mode:'SCHEDULED'},
  {dataset:'PROTOCOL_DETAIL',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:300000},
  {dataset:'CHAIN_TVL_HISTORY',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:900000},
  {dataset:'CHAIN_TVL_HISTORY_BY_CHAIN',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:900000},
  {dataset:'PROTOCOL_TVL',priority:'P2',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000},
  {dataset:'CHAINS',priority:'P1',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000,mode:'SCHEDULED'},
  {dataset:'TOKEN_PRICES_CURRENT',priority:'P2',freshness:'FAST',criticality:'NORMAL',cacheTtlMs:60000},
  {dataset:'TOKEN_PRICES_HISTORICAL',priority:'P3',freshness:'SLOW',criticality:'LOW',cacheTtlMs:3600000},
  {dataset:'TOKEN_PRICES_BATCH_HISTORY',priority:'P3',freshness:'SLOW',criticality:'LOW',cacheTtlMs:3600000},
  {dataset:'TOKEN_PRICE_CHART',priority:'P3',freshness:'SLOW',criticality:'LOW',cacheTtlMs:3600000},
  {dataset:'TOKEN_PERCENTAGE',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:300000},
  {dataset:'TOKEN_FIRST_PRICE',priority:'P3',freshness:'SLOW',criticality:'LOW',cacheTtlMs:86400000},
  {dataset:'CHAIN_BLOCK',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:300000},
  {dataset:'STABLECOINS',priority:'P1',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000,mode:'SCHEDULED'},
  {dataset:'STABLECOIN_CHARTS',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:300000},
  {dataset:'STABLECOIN_CHARTS_BY_CHAIN',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:300000},
  {dataset:'STABLECOIN_DETAIL',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:300000},
  {dataset:'STABLECOIN_CHAINS',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:600000},
  {dataset:'STABLECOIN_PRICES',priority:'P2',freshness:'FAST',criticality:'NORMAL',cacheTtlMs:60000},
  {dataset:'DEX_OVERVIEW',priority:'P1',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000,mode:'SCHEDULED'},
  {dataset:'DEX_OVERVIEW_BY_CHAIN',priority:'P2',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000},
  {dataset:'DEX_SUMMARY',priority:'P2',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000},
  {dataset:'OPTIONS_OVERVIEW',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:300000},
  {dataset:'OPTIONS_OVERVIEW_BY_CHAIN',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:300000},
  {dataset:'OPTIONS_SUMMARY',priority:'P2',freshness:'STANDARD',criticality:'LOW',cacheTtlMs:300000},
  {dataset:'OPEN_INTEREST_OVERVIEW',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:60000},
  {dataset:'FEES_OVERVIEW',priority:'P1',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000,mode:'SCHEDULED'},
  {dataset:'FEES_OVERVIEW_BY_CHAIN',priority:'P2',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000},
  {dataset:'FEES_SUMMARY',priority:'P2',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000}
 ]);

 add(policy,'DEXSCREENER',{
  priority:'P2',freshness:'FAST',criticality:'NORMAL',
  cacheTtlMs:60000,mode:'ON_DEMAND',firewallRequired:true,
  retention:'MEMORY',distribution:'ROUTER_CP1'
 },[
  {dataset:'DEX_PAIR_LIQUIDITY',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:60000,mode:'ON_DEMAND'}
 ]);

 add(policy,'GMX',{
  priority:'P2',freshness:'FAST',criticality:'NORMAL',
  cacheTtlMs:60000,mode:'ON_DEMAND',firewallRequired:true,
  retention:'MEMORY',distribution:'ROUTER_CP1'
 },[
  {dataset:'PERP_CANDLES',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:15000,mode:'ACTIVE_CONTEXT'},
  {dataset:'PERP_TICKER',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:15000,mode:'ACTIVE_CONTEXT'},
  {dataset:'MARKET_SYMBOLS',priority:'P2',freshness:'STANDARD',criticality:'NORMAL',cacheTtlMs:300000,mode:'SCHEDULED'},
  {dataset:'OPEN_INTEREST',priority:'P1',freshness:'FAST',criticality:'HIGH',cacheTtlMs:30000,mode:'ACTIVE_CONTEXT'}
 ]);

 return policy;
};

module.exports.budgetProfiles=function(opt){
 opt=opt||{};var cgDemo=opt.coingeckoDemo!==undefined?opt.coingeckoDemo===true:true;
 return{
  COINGECKO:cgDemo?
   {limitModel:'SHORT_AND_MONTHLY',shortWindowMs:60000,shortLimit:100,longWindowMs:2592000000,longLimit:10000,reserve:2000,costDefault:1}:
   {limitModel:'UNKNOWN',shortWindowMs:60000,shortLimit:null,longWindowMs:2592000000,longLimit:null,reserve:0,costDefault:1},
  DEFILLAMA:{limitModel:'UNKNOWN',shortWindowMs:60000,shortLimit:null,longWindowMs:2592000000,longLimit:null,reserve:0,costDefault:1},
  GMX:{limitModel:'UNKNOWN',shortWindowMs:60000,shortLimit:null,longWindowMs:2592000000,longLimit:null,reserve:0,costDefault:1},
  DEXSCREENER:{limitModel:'RPM',shortWindowMs:60000,shortLimit:300,longWindowMs:2592000000,longLimit:null,reserve:0,costDefault:1}
 };
};

module.exports.shadowMaps=function(){
 return{
  DEFILLAMA:{
   protocols:{dataset:'PROTOCOLS'},protocol:{dataset:'PROTOCOL_DETAIL'},historicalChainTvl:{dataset:'CHAIN_TVL_HISTORY'},historicalChainTvlByChain:{dataset:'CHAIN_TVL_HISTORY_BY_CHAIN'},tvl:{dataset:'PROTOCOL_TVL'},chains:{dataset:'CHAINS'},
   pricesCurrent:{dataset:'TOKEN_PRICES_CURRENT'},pricesHistorical:{dataset:'TOKEN_PRICES_HISTORICAL'},batchHistorical:{dataset:'TOKEN_PRICES_BATCH_HISTORY'},priceChart:{dataset:'TOKEN_PRICE_CHART'},percentage:{dataset:'TOKEN_PERCENTAGE'},pricesFirst:{dataset:'TOKEN_FIRST_PRICE'},block:{dataset:'CHAIN_BLOCK'},
   stablecoins:{dataset:'STABLECOINS'},stablecoinCharts:{dataset:'STABLECOIN_CHARTS'},stablecoinChartsByChain:{dataset:'STABLECOIN_CHARTS_BY_CHAIN'},stablecoin:{dataset:'STABLECOIN_DETAIL'},stablecoinChains:{dataset:'STABLECOIN_CHAINS'},stablecoinPrices:{dataset:'STABLECOIN_PRICES'},
   dexOverview:{dataset:'DEX_OVERVIEW'},dexOverviewByChain:{dataset:'DEX_OVERVIEW_BY_CHAIN'},dexSummary:{dataset:'DEX_SUMMARY'},
   optionsOverview:{dataset:'OPTIONS_OVERVIEW'},optionsOverviewByChain:{dataset:'OPTIONS_OVERVIEW_BY_CHAIN'},optionsSummary:{dataset:'OPTIONS_SUMMARY'},
   openInterestOverview:{dataset:'OPEN_INTEREST_OVERVIEW'},
   feesOverview:{dataset:'FEES_OVERVIEW'},feesOverviewByChain:{dataset:'FEES_OVERVIEW_BY_CHAIN'},feesSummary:{dataset:'FEES_SUMMARY'}
  },
  DEXSCREENER:{pairLiquidity:{dataset:'DEX_PAIR_LIQUIDITY'}},
  GMX:{getCandles:{dataset:'PERP_CANDLES'},getTicker:{dataset:'PERP_TICKER'},listSymbols:{dataset:'MARKET_SYMBOLS'}}
 };
};
