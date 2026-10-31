'use strict';
var get=require('./http_json');

function enc(v){return encodeURIComponent(String(v==null?'':v));}
function clean(o){var q=[];Object.keys(o||{}).forEach(function(k){var v=o[k];if(v===undefined||v===null||v==='')return;q.push(enc(k)+'='+enc(typeof v==='object'?JSON.stringify(v):v));});return q.length?'?'+q.join('&'):'';}
function validDataType(v,allowed,fallback){v=String(v||fallback);return allowed.indexOf(v)>=0?v:fallback;}
function P(o){
 o=o||{};
 this.base=String(o.base||'https://api.llama.fi').replace(/\/$/,'');
 this.coinsBase=String(o.coinsBase||'https://coins.llama.fi').replace(/\/$/,'');
 this.stableBase=String(o.stableBase||'https://stablecoins.llama.fi').replace(/\/$/,'');
 this.yieldsBase=String(o.yieldsBase||'https://yields.llama.fi').replace(/\/$/,'');
 this.id='DEFILLAMA';
 this._cache={};
}
P.prototype._cached=function(key,ttl,loader,cb){var h=this._cache[key],now=Date.now();if(h&&now-h.at<ttl)return cb(null,h.data);var self=this;loader(function(e,o){if(!e)self._cache[key]={at:Date.now(),data:o};cb(e,o);});};
P.prototype._get=function(base,path,opt,cb){opt=opt||{};get(base+path+clean(opt.query),{timeout:+opt.timeout||18000,maxBytes:+opt.maxBytes||16*1024*1024},cb);};
P.prototype._overviewQuery=function(extra){return Object.assign({excludeTotalDataChart:false,excludeTotalDataChartBreakdown:true},extra||{});};

/* Public/free endpoint catalogue. Yield endpoints intentionally remain outside
   this catalogue: IA-TB keeps Yield work out of the current scope. */
P.prototype.publicEndpointCatalog=function(){
 return{
  auth:'NONE',base:this.base,premium:false,
  tvl:['protocols','protocol','historicalChainTvl','historicalChainTvlByChain','tvl','chains'],
  prices:['pricesCurrent','pricesHistorical','batchHistorical','priceChart','percentage','pricesFirst','block'],
  stablecoins:['stablecoins','stablecoinCharts','stablecoinChartsByChain','stablecoin','stablecoinChains','stablecoinPrices'],
  dex:['dexOverview','dexOverviewByChain','dexSummary'],
  options:['optionsOverview','optionsOverviewByChain','optionsSummary'],
  derivatives:['openInterestOverview'],
  feesRevenue:['feesOverview','feesOverviewByChain','feesSummary'],
  excluded:{yield:true,premium:true}
 };
};

/* TVL */
P.prototype.protocols=function(cb){this._get(this.base,'/protocols',{timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.protocol=function(protocol,cb){this._get(this.base,'/protocol/'+enc(protocol),{timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.historicalChainTvl=function(cb){this._get(this.base,'/v2/historicalChainTvl',{timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.historicalChainTvlByChain=function(chain,cb){this._get(this.base,'/v2/historicalChainTvl/'+enc(chain),{timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.tvl=function(protocol,cb){this._get(this.base,'/tvl/'+enc(protocol),{timeout:15000,maxBytes:1024*1024},cb);};
P.prototype.chains=function(cb){this._get(this.base,'/v2/chains',{timeout:15000,maxBytes:8*1024*1024},cb);};

/* Coins & prices. These are on-demand methods; the collector should not bulk
   request arbitrary token histories without an explicit consumer scope. */
P.prototype.pricesCurrent=function(coins,cb){this._get(this.coinsBase,'/prices/current/'+enc(coins),{timeout:15000,maxBytes:8*1024*1024},cb);};
P.prototype.pricesHistorical=function(timestamp,coins,cb){this._get(this.coinsBase,'/prices/historical/'+enc(timestamp)+'/'+enc(coins),{timeout:15000,maxBytes:8*1024*1024},cb);};
P.prototype.batchHistorical=function(coinsByTimestamp,cb){this._get(this.coinsBase,'/batchHistorical',{query:{coins:coinsByTimestamp},timeout:18000,maxBytes:16*1024*1024},cb);};
P.prototype.priceChart=function(coins,opt,cb){if(typeof opt==='function'){cb=opt;opt={};}this._get(this.coinsBase,'/chart/'+enc(coins),{query:opt||{},timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.percentage=function(coins,opt,cb){if(typeof opt==='function'){cb=opt;opt={};}this._get(this.coinsBase,'/percentage/'+enc(coins),{query:opt||{},timeout:15000,maxBytes:8*1024*1024},cb);};
P.prototype.pricesFirst=function(coins,cb){this._get(this.coinsBase,'/prices/first/'+enc(coins),{timeout:15000,maxBytes:8*1024*1024},cb);};
P.prototype.block=function(chain,timestamp,cb){this._get(this.coinsBase,'/block/'+enc(chain)+'/'+enc(timestamp),{timeout:15000,maxBytes:1024*1024},cb);};

/* Stablecoins */
P.prototype.stablecoins=function(includePrices,cb){if(typeof includePrices==='function'){cb=includePrices;includePrices=true;}this._get(this.stableBase,'/stablecoins',{query:{includePrices:includePrices!==false},timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.stablecoinCharts=function(stablecoin,cb){if(typeof stablecoin==='function'){cb=stablecoin;stablecoin=null;}var self=this;this._cached('stablecoinCharts:'+String(stablecoin||'all'),300000,function(done){self._get(self.stableBase,'/stablecoincharts/all',{query:{stablecoin:stablecoin},timeout:18000,maxBytes:24*1024*1024},done);},cb);};
P.prototype.stablecoinChartsByChain=function(chain,stablecoin,cb){if(typeof stablecoin==='function'){cb=stablecoin;stablecoin=null;}this._get(this.stableBase,'/stablecoincharts/'+enc(chain),{query:{stablecoin:stablecoin},timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.stablecoin=function(asset,cb){this._get(this.stableBase,'/stablecoin/'+enc(asset),{timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.stablecoinChains=function(cb){this._get(this.stableBase,'/stablecoinchains',{timeout:18000,maxBytes:12*1024*1024},cb);};
P.prototype.stablecoinPrices=function(cb){this._get(this.stableBase,'/stablecoinprices',{timeout:18000,maxBytes:24*1024*1024},cb);};

/* DEX volumes */
P.prototype.dexOverview=function(cb){this._get(this.base,'/overview/dexs',{query:this._overviewQuery({dataType:'dailyVolume'}),timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.dexOverviewLite=function(cb){this._get(this.base,'/overview/dexs',{query:{dataType:'dailyVolume',excludeTotalDataChart:true,excludeTotalDataChartBreakdown:true},timeout:15000,maxBytes:8*1024*1024},cb);};
P.prototype.dexOverviewByChain=function(chain,cb){this._get(this.base,'/overview/dexs/'+enc(chain),{query:this._overviewQuery({dataType:'dailyVolume'}),timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.dexSummary=function(protocol,cb){this._get(this.base,'/summary/dexs/'+enc(protocol),{query:this._overviewQuery({dataType:'dailyVolume'}),timeout:18000,maxBytes:24*1024*1024},cb);};

/* Options: both public dimensions are exposed without deriving any signal. */
P.prototype.optionsOverview=function(dataType,cb){if(typeof dataType==='function'){cb=dataType;dataType=null;}dataType=validDataType(dataType,['dailyPremiumVolume','dailyNotionalVolume'],'dailyNotionalVolume');this._get(this.base,'/overview/options',{query:this._overviewQuery({dataType:dataType}),timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.optionsOverviewByChain=function(chain,dataType,cb){if(typeof dataType==='function'){cb=dataType;dataType=null;}dataType=validDataType(dataType,['dailyPremiumVolume','dailyNotionalVolume'],'dailyNotionalVolume');this._get(this.base,'/overview/options/'+enc(chain),{query:this._overviewQuery({dataType:dataType}),timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.optionsSummary=function(protocol,dataType,cb){if(typeof dataType==='function'){cb=dataType;dataType=null;}dataType=validDataType(dataType,['dailyPremiumVolume','dailyNotionalVolume'],'dailyNotionalVolume');this._get(this.base,'/summary/options/'+enc(protocol),{query:{dataType:dataType},timeout:18000,maxBytes:24*1024*1024},cb);};

/* Public perpetual/open-interest surface. Perp volume/funding endpoints that
   require pro-api are intentionally NOT added. */
P.prototype.openInterestOverview=function(cb){var self=this;this._cached('openInterestOverview',60000,function(done){self._get(self.base,'/overview/open-interest',{query:self._overviewQuery(),timeout:18000,maxBytes:24*1024*1024},done);},cb);};

/* Fees & Revenue. Public API exposes dailyFees, dailyRevenue and
   dailyHoldersRevenue. We collect the factual datasets only. */
P.prototype.feesOverview=function(dataType,cb){if(typeof dataType==='function'){cb=dataType;dataType=null;}dataType=validDataType(dataType,['dailyFees','dailyRevenue','dailyHoldersRevenue'],'dailyFees');var self=this,key='feesOverview:'+dataType;this._cached(key,300000,function(done){self._get(self.base,'/overview/fees',{query:self._overviewQuery({dataType:dataType}),timeout:18000,maxBytes:24*1024*1024},done);},cb);};
P.prototype.feesOverviewByChain=function(chain,dataType,cb){if(typeof dataType==='function'){cb=dataType;dataType=null;}dataType=validDataType(dataType,['dailyFees','dailyRevenue','dailyHoldersRevenue'],'dailyFees');this._get(this.base,'/overview/fees/'+enc(chain),{query:this._overviewQuery({dataType:dataType}),timeout:18000,maxBytes:24*1024*1024},cb);};
P.prototype.feesSummary=function(protocol,dataType,cb){if(typeof dataType==='function'){cb=dataType;dataType=null;}dataType=validDataType(dataType,['dailyFees','dailyRevenue','dailyHoldersRevenue'],'dailyFees');this._get(this.base,'/summary/fees/'+enc(protocol),{query:{dataType:dataType},timeout:18000,maxBytes:24*1024*1024},cb);};

/* Existing Yield methods retained untouched for backward compatibility only.
   Yield is explicitly outside the current IA-TB workstream. */
P.prototype.yieldPools=function(cb){var self=this;this._cached('yieldPools',600000,function(done){get(self.yieldsBase+'/pools',{timeout:22000,maxBytes:24*1024*1024},done);},cb);};

module.exports=P;
