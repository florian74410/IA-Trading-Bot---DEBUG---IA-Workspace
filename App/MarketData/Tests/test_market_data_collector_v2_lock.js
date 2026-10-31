'use strict';
var Quality=require('../Financial/financial_quality_v2'),Policy=require('../Financial/financial_policy'),Settings=require('../Config/market_data_settings');
var fail=0;function ok(v,m){console.log((v?'[OK]   ':'[FAIL] ')+m);if(!v)fail++;}
var now=Date.now(),good={timestamp:now,cefi:{provider:'COINGECKO',observedAt:now,global:{marketCapUsd:2500000000000,totalVolume24hUsd:100000000000,btcDominancePct:52},assets:[{id:'bitcoin',priceUsd:90000,marketCapUsd:1800000000000,volume24hUsd:50000000000}],exchanges:[{id:'binance',volume24hUsd:20000000000}],exchangeShares:[{name:'Binance',sharePct:50}]},defi:{provider:'DEFILLAMA',observedAt:now,tvlUsd:100000000000,dexVolume24hUsd:10000000000,dexVolume7dUsd:70000000000,stablecoinMarketCapUsd:250000000000,protocols:[{slug:'a',tvlUsd:1}],chains:[{name:'Ethereum',tvlUsd:100000000000}],dexProtocols:[{slug:'dex',volume24hUsd:1,volume7dUsd:7}]}};
var q=Quality.inspect(good,{now:now});ok(q.ok,'Valid CoinGecko + DeFiLlama snapshot passes quality gate');
var bad=JSON.parse(JSON.stringify(good));bad.cefi.assets[0].priceUsd=-1;q=Quality.inspect(bad,{now:now});ok(!q.ok&&q.errors.some(function(x){return x.code==='INVALID_NON_NEGATIVE_VALUE'}),'Negative token price is rejected');
bad=JSON.parse(JSON.stringify(good));bad.cefi.provider='DEFILLAMA';q=Quality.inspect(bad,{now:now});ok(!q.ok&&q.errors.some(function(x){return x.code==='CEFI_PROVIDER_POLICY_VIOLATION'}),'Provider overlap cannot replace CoinGecko CeFi authority');
bad=JSON.parse(JSON.stringify(good));bad.defi.provider='COINGECKO';q=Quality.inspect(bad,{now:now});ok(!q.ok&&q.errors.some(function(x){return x.code==='DEFI_PROVIDER_POLICY_VIOLATION'}),'Provider overlap cannot replace DeFiLlama DeFi authority');
var own=Policy.ownerFor('tvlUsd');ok(own&&own.owner==='DEFILLAMA','TVL authority = DeFiLlama');
own=Policy.ownerFor('priceUsd');ok(own&&own.owner==='COINGECKO','Token price authority = CoinGecko');
var s=Settings.sanitize({financial:{refreshMs:1,cefiTtlMs:1,defiTtlMs:1},coingecko:{registryRefreshMs:1}});
ok(s.financial.refreshMs>=15000&&s.financial.cefiTtlMs>=5000&&s.financial.defiTtlMs>=5000,'Unsafe refresh/TTL values are clamped');
ok(s.coingecko.registryRefreshMs>=60000,'CoinGecko registry cannot refresh faster than 60 seconds');
console.log('\nMarket Data Collector V2.0 lock tests: '+(fail?'FAIL':'PASS')+' ('+fail+' error(s))');
process.exitCode=fail?1:0;