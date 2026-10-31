'use strict';
var Policy=require('./financial_policy'),Quality=require('./financial_quality_v2'),DataFirewallClient=require('../Firewall/data_firewall_client');
function num(v){v=+v;return isFinite(v)?v:null}
function sum(a,f){return(a||[]).reduce(function(z,x){var v=f?f(x):x;v=+v;return z+(isFinite(v)?v:0)},0)}
function pct(v,t){return t>0?Math.round(v/t*1000)/10:0}

function groupCategory(rows){var m={};(rows||[]).forEach(function(x){var k=String(x.category||'Other');m[k]=(m[k]||0)+(+x.tvl||0)});return Object.keys(m).map(function(k){return{name:k,tvlUsd:m[k]}}).sort(function(a,b){return b.tvlUsd-a.tvlUsd})}
function Collector(o){o=o||{};this.coingecko=o.coingecko;this.defillama=o.defillama;this.store=o.store;this.firewallPort=+o.firewallPort||8017;this.firewall=o.firewall||new DataFirewallClient({port:this.firewallPort});this.ttlMs=Math.max(5000,+o.ttlMs||45000);this.cefiTtlMs=Math.max(5000,+o.cefiTtlMs||this.ttlMs);this.defiTtlMs=Math.max(5000,+o.defiTtlMs||Math.max(this.ttlMs,90000));this.providerEnabled={COINGECKO:o.coingeckoEnabled!==false,DEFILLAMA:o.defillamaEnabled!==false};this.busy=false;this.waiters=[];this.lastError='';this.lastRefreshAt=0;this.refreshSeq=0;this.activeRefreshId=null;this.refreshStartedAt=0;this.lastRefreshJob=null;this.cefiEnrichmentTtlMs=Math.max(300000,+o.cefiEnrichmentTtlMs||1800000);this.cefiEnrichmentDelayMs=Math.max(10000,+o.cefiEnrichmentDelayMs||120000);this.cefiEnrichment={at:0,data:null,busy:false,timer:null,lastError:''};this.defiEnrichmentTtlMs=Math.max(900000,+o.defiEnrichmentTtlMs||1800000);this.defiEnrichmentDelayMs=Math.max(60000,+o.defiEnrichmentDelayMs||300000);this.defiEnrichment={at:0,data:null,busy:false,timer:null,lastError:''};}
Collector.prototype._gate=function(provider,data,cb){this.firewall.inspect({provider:provider,source:provider,provenance:{collector:'MARKET_DATA',provider:provider},type:'MARKET_ANALYTICS',symbol:'GLOBAL',timestamp:Date.now(),data:data},cb)};
Collector.prototype._scheduleCefiEnrichment=function(){
 var self=this,e=this.cefiEnrichment;if(e.busy||e.timer||(e.data&&Date.now()-e.at<this.cefiEnrichmentTtlMs))return;
 e.timer=setTimeout(function(){e.timer=null;self._runCefiEnrichment();},this.cefiEnrichmentDelayMs);if(e.timer.unref)e.timer.unref();
};
Collector.prototype._runCefiEnrichment=function(){
 var self=this,e=this.cefiEnrichment;if(e.busy)return;e.busy=true;
 this.coingecko.exchanges(1,250,function(err,rows){
  if(err){e.busy=false;e.lastError=err.message;return;}
  if(!Array.isArray(rows)||!rows.length||rows.some(function(x){return !x||typeof x!=='object'||!x.id;})){e.busy=false;e.lastError='COINGECKO_EXCHANGES_EMPTY_OR_INVALID';return;}
  self._gate('COINGECKO',{exchanges:rows||[]},function(gateError){if(gateError){e.busy=false;e.lastError=gateError.message;return;}
  e.data=(rows||[]).map(function(x){return{id:x.id,name:x.name,rank:+x.trust_score_rank||null,trustScore:+x.trust_score||null,volumeBtc:+x.trade_volume_24h_btc||0,url:x.url||''};}).slice(0,250);
  e.at=Date.now();e.busy=false;e.lastError='';
  // Publish initial exchange coverage once; later enrichment is consumed by the next due CeFi cycle.
  var prior=self.store&&self.store.get&&self.store.get();
  if(!self.busy&&!(prior&&prior.cefi&&prior.cefi.exchanges&&prior.cefi.exchanges.length))self.refresh({scope:'CEFI'},function(){});
  });
 });
};
Collector.prototype._cefi=function(cb){
 if(!this.providerEnabled.COINGECKO)return cb(null,null);
 var self=this,pending=2,err=[],global=null,markets=null;
 function done(){if(--pending)return;if(!global&&!markets)return cb(new Error(err.join('; ')||'COINGECKO_EMPTY'));
  var previous=self.store&&self.store.get&&self.store.get(),prev=previous&&previous.cefi||null;
  if(err.length&&prev)return cb(new Error('COINGECKO_REFRESH_FAILED:'+err.join('; ')));
  if((!markets||!markets.length)&&prev&&prev.assets&&prev.assets.length){markets=prev.assets.map(function(x){return{id:x.id,symbol:x.symbol,name:x.name,current_price:x.priceUsd,market_cap:x.marketCapUsd,total_volume:x.volume24hUsd,price_change_percentage_24h:x.change24hPct,image:x.image};});err.push('MARKETS_FALLBACK_LAST_GOOD');}
  var gd=global&&global.data||{},globalCap=num(gd.total_market_cap&&gd.total_market_cap.usd),globalVolume=num(gd.total_volume&&gd.total_volume.usd),globalVolumeInvalid=globalVolume!=null&&!Quality.validGlobalVolume(globalVolume,globalCap);if(globalVolumeInvalid)globalVolume=null,err.push('COINGECKO_GLOBAL_VOLUME_OUTLIER');
  var btc=(markets||[]).filter(function(x){return String(x.symbol).toLowerCase()==='btc';})[0],btcUsd=btc&&+btc.current_price||0,en=self.cefiEnrichment.data||null;
  var exRaw=en||(prev&&prev.exchanges||[]),ex=(exRaw||[]).map(function(x){var vb=x.volumeBtc!=null?+x.volumeBtc:null,usd=x.volume24hUsd!=null?+x.volume24hUsd:(vb!=null&&btcUsd>0?vb*btcUsd:null);return{id:x.id,name:x.name,rank:x.rank==null?null:+x.rank,trustScore:x.trustScore==null?null:+x.trustScore,volumeBtc:vb,volume24hUsd:usd,url:x.url||''};}).filter(function(x){return x.volume24hUsd!=null;}).sort(function(a,b){return b.volume24hUsd-a.volume24hUsd;});
  var exAvailable=ex.length>0,exTotal=exAvailable?sum(ex,function(x){return x.volume24hUsd;}):null,
      assets=(markets||[]).map(function(x){return{id:x.id,symbol:String(x.symbol||'').toUpperCase(),name:x.name,priceUsd:num(x.current_price),marketCapUsd:num(x.market_cap),volume24hUsd:num(x.total_volume),change24hPct:num(x.price_change_percentage_24h),image:x.image||''};}).sort(function(a,b){return(+b.volume24hUsd||0)-(+a.volume24hUsd||0);}),
      assetAvailable=assets.length>0,assetTotal=assetAvailable?sum(assets,function(x){return x.volume24hUsd;}):null,
      limitations=['CEX_VOLUME_IS_TOP_EXCHANGE_SAMPLE_NOT_GLOBAL_TOTAL','ASSET_VOLUME_IS_TOP_MARKET_SAMPLE','OPEN_INTEREST_REQUIRES_DERIVATIVES_PROVIDER','LIQUIDATIONS_REQUIRES_DERIVATIVES_PROVIDER'];
  if(!en&&!ex.length)limitations.push('CEX_EXCHANGE_ENRICHMENT_DEFERRED');if(err.length)limitations.push('COINGECKO_PARTIAL_RESPONSE');
  cb(null,{provider:'COINGECKO',observedAt:Date.now(),partial:err.length>0,errors:err.slice(),global:{marketCapUsd:num(gd.total_market_cap&&gd.total_market_cap.usd),totalVolume24hUsd:globalVolume,btcDominancePct:num(gd.market_cap_percentage&&gd.market_cap_percentage.btc),activeCryptocurrencies:num(gd.active_cryptocurrencies),markets:num(gd.markets)},cexVolume24hUsdSampled:exTotal,spotVolume24hUsd:exTotal,cexCoverage:{kind:'SAMPLED_TOP_EXCHANGES',requested:250,received:ex.length,complete:false,available:exAvailable},exchanges:ex.slice(0,20),exchangeShares:exAvailable?ex.slice(0,10).map(function(x){return{name:x.name,sharePct:pct(x.volume24hUsd,exTotal),volume24hUsd:x.volume24hUsd};}):[],assets:assets.slice(0,30),assetVolume24hUsdSampled:assetTotal,assetCoverage:{kind:'TOP_MARKET_CAP_SAMPLE',requested:100,received:assets.length,complete:false,available:assetAvailable},openInterestUsd:null,liquidations24hUsd:null,limitations:limitations});
  self._scheduleCefiEnrichment();
 }
 self.coingecko.global(function(e,o){if(e)err.push(e.message);else global=o;done();});
 self.coingecko.marketPage(1,100,'usd',function(e,o){if(e)err.push(e.message);else markets=o;done();});
};
Collector.prototype._enrichmentSeed=function(){
 var cur=this.store&&this.store.get&&this.store.get(),d=cur&&cur.defi||null;if(!d)return null;
 return{protocols:(d.protocols||[]).slice(),categories:(d.categories||[]).slice(),stablecoinHistory:(d.stablecoinHistory||[]).slice(),stablecoinFlowHistory:(d.stablecoinFlowHistory||[]).slice(),dexVolumeHistory:(d.dexVolumeHistory||[]).slice(),dexFeeProtocols:(d.dexFeeProtocols||[]).slice()};
};
Collector.prototype._scheduleDefiEnrichment=function(){
 var self=this,e=this.defiEnrichment;if(e.busy||e.timer||(e.data&&Date.now()-e.at<this.defiEnrichmentTtlMs))return;
 e.timer=setTimeout(function(){e.timer=null;self._runDefiEnrichment();},this.defiEnrichmentDelayMs);if(e.timer.unref)e.timer.unref();
};
Collector.prototype._runDefiEnrichment=function(){
 var self=this,e=this.defiEnrichment;if(e.busy)return;e.busy=true;var pending=4,protocols=null,stableCharts=null,fees=null,dex=null,errs=[];
 function done(){if(--pending)return;
  var ps=(protocols||[]).map(function(x){return{name:x.name,slug:x.slug||'',symbol:x.symbol||'',category:x.category||'Other',chain:x.chain||'',tvlUsd:num(x.tvl),change1dPct:num(x.change_1d),change7dPct:num(x.change_7d),mcapUsd:num(x.mcap),url:x.url||''}}).filter(function(x){return x.tvlUsd!=null}).sort(function(a,b){return b.tvlUsd-a.tvlUsd});
  var stablecoinHistory=(Array.isArray(stableCharts)?stableCharts:(stableCharts&&stableCharts.data)||[]).map(function(x){if(Array.isArray(x)){var ts=(+x[0]||0),v=num(x[1]);return ts&&v!=null?{timestamp:ts<20000000000?ts*1000:ts,valueUsd:v}:null;}x=x||{};var rawTs=+(x.date||x.timestamp||x.time||0),bucket=x.totalCirculatingUSD||x.totalCirculating||x.circulating||{},v=num(bucket.peggedUSD!=null?bucket.peggedUSD:(x.totalUsd!=null?x.totalUsd:x.valueUsd));return rawTs&&v!=null?{timestamp:rawTs<20000000000?rawTs*1000:rawTs,valueUsd:v}:null;}).filter(function(x){return x&&x.timestamp&&x.valueUsd!=null&&x.valueUsd>0}).sort(function(a,b){return a.timestamp-b.timestamp}).slice(-120);
  var stablecoinFlowHistory=[];for(var si=1;si<stablecoinHistory.length;si++){var cur=stablecoinHistory[si],prev=stablecoinHistory[si-1],delta=cur.valueUsd-prev.valueUsd;stablecoinFlowHistory.push({timestamp:cur.timestamp,netChangeUsd:delta,inflowUsd:delta>0?delta:0,outflowUsd:delta<0?-delta:0});}
  var dx=dex||{},dexVolumeHistory=(dx.totalDataChart||[]).map(function(x){return Array.isArray(x)?{timestamp:(+x[0]||0)*1000,valueUsd:num(x[1])}:null;}).filter(function(x){return x&&x.timestamp&&x.valueUsd!=null;}).slice(-120);
  var feeRows=(fees&&fees.protocols||[]).map(function(x){return{name:x.name||x.displayName||'',slug:x.slug||'',category:x.category||'',logo:x.logo||'',fees24hUsd:num(x.total24h),fees7dUsd:num(x.total7d),change1dPct:num(x.change_1d)}}).filter(function(x){return x.fees24hUsd!=null;}).sort(function(a,b){return b.fees24hUsd-a.fees24hUsd});
  e.data={protocols:ps.slice(0,30),categories:groupCategory(protocols||[]).slice(0,12),stablecoinHistory:stablecoinHistory,stablecoinFlowHistory:stablecoinFlowHistory,dexVolumeHistory:dexVolumeHistory,dexFeeProtocols:feeRows.filter(function(x){return /DEX/i.test(String(x.category||''));}).slice(0,30)};
  e.at=Date.now();e.busy=false;e.lastError=errs.join('; ');
  if(!self.busy)self.refresh({scope:'DEFI'},function(){});
 }
 self.defillama.protocols(function(x,o){if(x)errs.push('PROTOCOLS:'+x.message);else protocols=o;done()});
 self.defillama.stablecoinCharts(function(x,o){if(x)errs.push('STABLECOIN_CHART:'+x.message);else stableCharts=o;done()});
 self.defillama.feesOverview(function(x,o){if(x)errs.push('FEES:'+x.message);else fees=o;done()});
 self.defillama.dexOverview(function(x,o){if(x)errs.push('DEX_HISTORY:'+x.message);else dex=o;done()});
};
Collector.prototype._defi=function(cb){
 if(!this.providerEnabled.DEFILLAMA)return cb(null,null);
 var self=this,pending=3,err=[],chains=null,dex=null,stables=null;
 function done(){if(--pending)return;if(!chains&&!dex&&!stables)return cb(new Error(err.join('; ')||'DEFILLAMA_EMPTY'));
  var cs=(chains||[]).map(function(x){return{name:x.name||x.gecko_id||'',tvlUsd:num(x.tvl),tokenSymbol:x.tokenSymbol||''}}).filter(function(x){return x.tvlUsd!=null}).sort(function(a,b){return b.tvlUsd-a.tvlUsd});
  var chainTvl=sum(cs,function(x){return x.tvlUsd}),stableRows=(stables&&stables.peggedAssets)||[],stableCap=sum(stableRows,function(x){var c=x.circulating||{};return c.peggedUSD||0}),nonUsdStableRows=stableRows.filter(function(x){var c=x&&x.circulating||{};return !c.peggedUSD&&(c.peggedEUR||c.peggedGBP||c.peggedJPY);}).length;
  var dx=dex||{},dexProtocols=(dx.protocols||[]).map(function(x){return{name:x.name||x.displayName||'',slug:x.slug||'',logo:x.logo||'',volume24hUsd:num(x.total24h),volume7dUsd:num(x.total7d),change1dPct:num(x.change_1d)}}).filter(function(x){return x.volume24hUsd!=null}).sort(function(a,b){return b.volume24hUsd-a.volume24hUsd});
  var en=self.defiEnrichment.data||self._enrichmentSeed()||{};
  var limitations=['BRIDGE_VOLUME_PROVIDER_NOT_CONNECTED','POOL_LEVEL_VOLUME_AND_FEES_NOT_AVAILABLE_FROM_CURRENT_FREE_FEED','NON_USD_PEGS_NOT_MIXED_IN_USD_TOTAL'];
  if(!self.defiEnrichment.data)limitations.push('HEAVY_DEFI_ENRICHMENT_DEFERRED');
  cb(null,{provider:'DEFILLAMA',observedAt:Date.now(),tvlUsd:chainTvl||null,tvlAggregateSource:'CHAIN_AGGREGATE',dexVolume24hUsd:num(dx.total24h),dexVolume7dUsd:num(dx.total7d),dexVolumeHistory:en.dexVolumeHistory||[],stablecoinMarketCapUsd:stableCap,stablecoinHistory:en.stablecoinHistory||[],stablecoinFlowHistory:en.stablecoinFlowHistory||[],stablecoinCoverage:{unit:'USD',nonUsdPegRowsExcluded:nonUsdStableRows,historySource:(en.stablecoinHistory&&en.stablecoinHistory.length)?'DEFILLAMA_STABLECOINCHARTS_ALL':'DEFERRED_ENRICHMENT'},bridgeVolume24hUsd:null,protocols:en.protocols||[],categories:en.categories||[],chains:cs.slice(0,20),dexProtocols:dexProtocols.slice(0,20),yieldPools:[],dexFeeProtocols:en.dexFeeProtocols||[],limitations:limitations});
  self._scheduleDefiEnrichment();
 }
 self.defillama.chains(function(e,o){if(e)err.push(e.message);else chains=o;done()});
 if(typeof self.defillama.dexOverviewLite==='function')self.defillama.dexOverviewLite(function(e,o){if(e)err.push(e.message);else dex=o;done()});else self.defillama.dexOverview(function(e,o){if(e)err.push(e.message);else dex=o;done()});
 self.defillama.stablecoins(false,function(e,o){if(e)err.push(e.message);else stables=o;done()});
};
Collector.prototype.refresh=function(opt,cb){
 if(typeof opt==='function'){cb=opt;opt={};}opt=opt||{};cb=cb||function(){};
 var self=this;if(this.busy){this.waiters.push(cb);return;}
 var scope=String(opt.scope||'ALL').toUpperCase(),wantCefi=scope==='ALL'||scope==='CEFI',wantDefi=scope==='ALL'||scope==='DEFI',prev=this.store&&this.store.get&&this.store.get()||null;
 this.busy=true;var pending=(wantCefi?1:0)+(wantDefi?1:0),cefi=wantCefi?null:(prev&&prev.cefi||null),defi=wantDefi?null:(prev&&prev.defi||null),errors=[];
 if(!pending){this.busy=false;return cb(null,prev);}
 function complete(e,o){self.busy=false;var q=self.waiters.splice(0);cb(e,o);q.forEach(function(fn){try{fn(e,o)}catch(x){}});}
 function done(){
  if(--pending)return;
  function finish(){
   if(!cefi&&!defi){self.lastError=errors.join('; ')||'FINANCIAL_REFRESH_EMPTY';return complete(new Error(self.lastError));}
   var now=Date.now(),prevFresh=prev&&prev.meta&&prev.meta.freshness||{},cefiFresh,defiFresh;
   if(wantCefi&&cefi)cefiFresh={observedAt:cefi.observedAt||now,expiresAt:(cefi.observedAt||now)+self.cefiTtlMs,ttlMs:self.cefiTtlMs,provider:'COINGECKO'};
   else cefiFresh=prevFresh.cefi||{observedAt:cefi&&cefi.observedAt||null,expiresAt:null,ttlMs:self.cefiTtlMs,provider:'COINGECKO'};
   if(wantDefi&&defi)defiFresh={observedAt:defi.observedAt||now,expiresAt:(defi.observedAt||now)+self.defiTtlMs,ttlMs:self.defiTtlMs,provider:'DEFILLAMA'};
   else defiFresh=prevFresh.defi||{observedAt:defi&&defi.observedAt||null,expiresAt:null,ttlMs:self.defiTtlMs,provider:'DEFILLAMA'};
   var expiries=[];if(cefi&&cefiFresh.expiresAt)expiries.push(+cefiFresh.expiresAt);if(defi&&defiFresh.expiresAt)expiries.push(+defiFresh.expiresAt);
   var snap={schema:'iatb.financial.snapshot/2.1',timestamp:now,expiresAt:expiries.length?Math.min.apply(Math,expiries):now+Math.min(self.cefiTtlMs,self.defiTtlMs),cefi:cefi,defi:defi,meta:{collector:'MARKET_DATA',collectorVersion:'2.1',firewall:'VALIDATED_BEFORE_STORE',distribution:'ROUTER_CP1',refreshScope:scope,providers:{coingecko:!!cefi,defillama:!!defi},ownership:Policy.describe(),freshness:{cefi:cefiFresh,defi:defiFresh},errors:errors.slice()}};
   var quality=Quality.inspect(snap,{now:now});snap.meta.quality=quality;
   if(!quality.ok){self.lastError='FINANCIAL_QUALITY_REJECT:'+quality.errors.map(function(x){return x.code}).join(',');return complete(new Error(self.lastError));}
   self.lastRefreshAt=now;self.lastError=errors.join('; ');self.store.set(snap);complete(null,snap);
  }
  var gateCefi=!!(wantCefi&&cefi),gateDefi=!!(wantDefi&&defi),gates=(gateCefi?1:0)+(gateDefi?1:0);
  function gateDone(){if(--gates===0)finish();}
  if(!gates)return finish();
  if(gateCefi)self._gate('COINGECKO',cefi,function(e){if(e){errors.push('COINGECKO_FIREWALL:'+e.message);cefi=prev&&prev.cefi||null;}gateDone();});
  if(gateDefi)self._gate('DEFILLAMA',defi,function(e){if(e){errors.push('DEFILLAMA_FIREWALL:'+e.message);defi=prev&&prev.defi||null;}gateDone();});
 }
 if(wantCefi)self._cefi(function(e,o){if(e){errors.push('COINGECKO:'+e.message);cefi=prev&&prev.cefi||null;}else cefi=o;done();});
 if(wantDefi)self._defi(function(e,o){if(e){errors.push('DEFILLAMA:'+e.message);defi=prev&&prev.defi||null;}else defi=o;done();});
};
Collector.prototype.refreshStale=function(cb){
 cb=cb||function(){};var f=this.store&&this.store.freshness?this.store.freshness():{cefi:{fresh:false},defi:{fresh:false}},cefiEnabled=this.providerEnabled.COINGECKO,defiEnabled=this.providerEnabled.DEFILLAMA;
 var staleCefi=cefiEnabled&&!(f.cefi&&f.cefi.fresh),staleDefi=defiEnabled&&!(f.defi&&f.defi.fresh);
 if(!staleCefi&&!staleDefi)return cb(null,{ok:true,skipped:true,reason:'FAMILIES_FRESH',freshness:f});
 if(staleCefi&&staleDefi)return this.refresh({scope:'ALL'},cb);
 return this.refresh({scope:staleCefi?'CEFI':'DEFI'},cb);
};
Collector.prototype.requestRefresh=function(cb){
 cb=cb||function(){};var self=this;
 if(this.busy)return cb(null,{ok:true,accepted:true,busy:true,joined:true,refreshId:this.activeRefreshId||null,statusAction:'marketdata.financial.status'});
 var id='financial-'+Date.now()+'-'+(++this.refreshSeq);this.activeRefreshId=id;this.refreshStartedAt=Date.now();
 this.refresh({scope:'ALL'},function(e,o){self.lastRefreshJob={refreshId:id,startedAt:self.refreshStartedAt||null,completedAt:Date.now(),ok:!e,error:e?e.message:null,snapshotTimestamp:o&&o.timestamp||null};self.activeRefreshId=null;self.refreshStartedAt=0;});
 cb(null,{ok:true,accepted:true,busy:true,joined:false,refreshId:id,statusAction:'marketdata.financial.status'});
};
Collector.prototype.snapshot=function(force,cb,opt){
 var h=this.store.get();
 if(!force&&h&&this.store.isFresh())return cb(null,h);
 // Opt-in UI mode: the stored snapshot already passed Firewall/quality validation.
 // Other consumers retain the existing fresh-data contract.
 if(!force&&h&&opt&&opt.staleWhileRevalidate===true){cb(null,h);this.refreshStale(function(){});return;}
 if(force)return this.refresh({scope:'ALL'},cb);this.refreshStale(cb);
};
Collector.prototype.history=function(opt){opt=opt||{};var rows=this.store.list(opt.limit||96,opt.since||0),family=String(opt.family||'ALL').toUpperCase();if(family==='CEFI')rows=rows.map(function(x){return{timestamp:x.timestamp,cefi:x.cefi,meta:x.meta}});if(family==='DEFI')rows=rows.map(function(x){return{timestamp:x.timestamp,defi:x.defi,meta:x.meta}});return{ok:true,schema:'iatb.financial.history/1.0',family:family,items:rows,count:rows.length,storage:this.store.status()}};
Collector.prototype.aiContext=function(scope){var s=this.store.get();if(!s)return{ok:false,error:'FINANCIAL_SNAPSHOT_UNAVAILABLE'};scope=String(scope||'ALL').toUpperCase();var out={ok:true,schema:'iatb.financial.ai-context/1.0',timestamp:s.timestamp,expiresAt:s.expiresAt,readOnly:true,scope:scope};if(scope==='ALL'||scope==='CEFI')out.cefi=s.cefi;if(scope==='ALL'||scope==='DEFI')out.defi=s.defi;out.meta={provenance:s.meta,storage:this.store.status()};return out};
Collector.prototype.status=function(){var cur=this.store.get(),quality=cur&&cur.meta&&cur.meta.quality||null,e=this.defiEnrichment;return{ok:true,version:'2.1',busy:this.busy,lastRefreshAt:this.lastRefreshAt,lastError:this.lastError||null,refreshJob:{activeRefreshId:this.activeRefreshId||null,startedAt:this.refreshStartedAt||null,last:this.lastRefreshJob},cefiEnrichment:{ready:!!this.cefiEnrichment.data,busy:!!this.cefiEnrichment.busy,lastAt:this.cefiEnrichment.at||null,ttlMs:this.cefiEnrichmentTtlMs,delayMs:this.cefiEnrichmentDelayMs,lastError:this.cefiEnrichment.lastError||null},defiEnrichment:{ready:!!e.data,busy:!!e.busy,lastAt:e.at||null,ttlMs:this.defiEnrichmentTtlMs,delayMs:this.defiEnrichmentDelayMs,lastError:e.lastError||null},quality:quality,ttl:{cefiMs:this.cefiTtlMs,defiMs:this.defiTtlMs},providers:{coingecko:this.providerEnabled.COINGECKO,defillama:this.providerEnabled.DEFILLAMA},ownership:Policy.describe(),store:this.store.status()}};
module.exports=Collector;
