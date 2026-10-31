'use strict';
/* IA-TB Market Data Collector V2.0 - financial quality gate.
   Pure validation: no provider calls, no mutation, no trading decisions. */
function finite(v){return typeof v==='number'&&isFinite(v)}
function money(v){return v==null||(finite(v)&&v>=0)}

// Conservative outlier guard for the single global 24h volume metric.
// A daily traded volume >1000x total crypto market capitalization is structurally implausible.
// Do not modify other CeFi metrics or erase historical raw snapshots.
function validGlobalVolume(volume,cap){
 return typeof volume==='number'&&isFinite(volume)&&volume>=0&&
   typeof cap==='number'&&isFinite(cap)&&cap>0&&volume<=cap*1000;
}
function uniq(rows,key,label,warnings){
 var seen=Object.create(null),dups=0;(rows||[]).forEach(function(x){var k=String(x&&x[key]||'').trim().toLowerCase();if(!k)return;if(seen[k])dups++;else seen[k]=1;});
 if(dups)warnings.push({code:'DUPLICATE_'+label,count:dups});
}
function checkRows(rows,fields,label,errors){
 (rows||[]).forEach(function(x,i){fields.forEach(function(k){if(x&&x[k]!=null&&!money(x[k]))errors.push({code:'INVALID_NON_NEGATIVE_VALUE',path:label+'['+i+'].'+k,value:x[k]});});});
}
function inspect(snapshot,opt){
 opt=opt||{};var now=+opt.now||Date.now(),errors=[],warnings=[],c=snapshot&&snapshot.cefi,d=snapshot&&snapshot.defi;
 if(!snapshot||typeof snapshot!=='object')errors.push({code:'SNAPSHOT_INVALID'});
 if(c){
  if(String(c.provider)!=='COINGECKO')errors.push({code:'CEFI_PROVIDER_POLICY_VIOLATION',provider:c.provider});
  if(!finite(+c.observedAt)||+c.observedAt>now+5000)errors.push({code:'CEFI_TIMESTAMP_INVALID'});
  ['marketCapUsd','totalVolume24hUsd'].forEach(function(k){if(c.global&&c.global[k]!=null&&!money(c.global[k]))errors.push({code:'CEFI_GLOBAL_INVALID',metric:k,value:c.global[k]});});
  if(c.global&&c.global.btcDominancePct!=null&&(!finite(c.global.btcDominancePct)||c.global.btcDominancePct<0||c.global.btcDominancePct>100))errors.push({code:'BTC_DOMINANCE_INVALID',value:c.global.btcDominancePct});
  checkRows(c.assets,['priceUsd','marketCapUsd','volume24hUsd'],'cefi.assets',errors);checkRows(c.exchanges,['volume24hUsd'],'cefi.exchanges',errors);
  uniq(c.assets,'id','ASSET_ID',warnings);uniq(c.exchanges,'id','EXCHANGE_ID',warnings);
  var shares=(c.exchangeShares||[]).reduce(function(z,x){return z+(finite(+x.sharePct)?+x.sharePct:0)},0);if(shares>100.5)warnings.push({code:'CEX_SAMPLE_SHARE_GT_100',value:shares});
 }
 if(d){
  if(String(d.provider)!=='DEFILLAMA')errors.push({code:'DEFI_PROVIDER_POLICY_VIOLATION',provider:d.provider});
  if(!finite(+d.observedAt)||+d.observedAt>now+5000)errors.push({code:'DEFI_TIMESTAMP_INVALID'});
  ['tvlUsd','dexVolume24hUsd','dexVolume7dUsd','stablecoinMarketCapUsd'].forEach(function(k){if(d[k]!=null&&!money(d[k]))errors.push({code:'DEFI_GLOBAL_INVALID',metric:k,value:d[k]});});
  checkRows(d.protocols,['tvlUsd','mcapUsd'],'defi.protocols',errors);checkRows(d.chains,['tvlUsd'],'defi.chains',errors);checkRows(d.dexProtocols,['volume24hUsd','volume7dUsd'],'defi.dexProtocols',errors);
  uniq(d.protocols,'slug','PROTOCOL_SLUG',warnings);uniq(d.chains,'name','CHAIN_NAME',warnings);uniq(d.dexProtocols,'slug','DEX_SLUG',warnings);
  var chainTvl=(d.chains||[]).reduce(function(z,x){return z+(finite(+x.tvlUsd)?+x.tvlUsd:0)},0);
  if(d.tvlUsd>0&&chainTvl>0){var delta=Math.abs(chainTvl-d.tvlUsd)/d.tvlUsd*100;if(delta>1)warnings.push({code:'DEFI_TVL_AGGREGATE_MISMATCH',deltaPct:delta});}
 }
 if(!c&&!d)errors.push({code:'NO_FINANCIAL_FAMILY'});
 return{ok:errors.length===0,status:errors.length?'REJECT':warnings.length?'WARN':'PASS',checkedAt:now,errors:errors,warnings:warnings};
}
module.exports={inspect:inspect,validGlobalVolume:validGlobalVolume};