'use strict';
var assert=require('assert'),Collector=require('../Financial/financial_collector');

var snap=null,heavyCalls=0;
var store={
 get:function(){return snap;},
 set:function(x){snap=x;},
 isFresh:function(){return false;},
 list:function(){return snap?[snap]:[];},
 status:function(){return{ok:true};}
};
var cg={
 global:function(cb){setTimeout(function(){cb(null,{data:{total_market_cap:{usd:1000},total_volume:{usd:100},market_cap_percentage:{btc:50},active_cryptocurrencies:10,markets:20}});},20);},
 marketPage:function(p,n,c,cb){setTimeout(function(){cb(null,[{id:'bitcoin',symbol:'btc',name:'Bitcoin',current_price:60000,market_cap:1000,total_volume:50,price_change_percentage_24h:1}]);},20);},
 exchanges:function(p,n,cb){setTimeout(function(){cb(null,[{id:'x',name:'X',trust_score_rank:1,trust_score:10,trade_volume_24h_btc:1}]);},20);},
 simplePrice:function(ids,c,cb){setTimeout(function(){cb(null,{bitcoin:{usd:60000}});},20);}
};
var dl={
 chains:function(cb){setTimeout(function(){cb(null,[{name:'Ethereum',tvl:500,tokenSymbol:'ETH'}]);},20);},
 dexOverviewLite:function(cb){setTimeout(function(){cb(null,{total24h:50,total7d:300,protocols:[{name:'Dex',slug:'dex',total24h:50,total7d:300}]});},20);},
 stablecoins:function(includePrices,cb){setTimeout(function(){cb(null,{peggedAssets:[{circulating:{peggedUSD:200}}]});},20);},
 protocols:function(cb){heavyCalls++;cb(null,[]);},
 stablecoinCharts:function(cb){heavyCalls++;cb(null,[]);},
 feesOverview:function(cb){heavyCalls++;cb(null,{protocols:[]});},
 dexOverview:function(cb){heavyCalls++;cb(null,{totalDataChart:[]});}
};
var fw={inspect:function(msg,cb){cb(null,{decision:'PASS'});}};
var c=new Collector({coingecko:cg,defillama:dl,store:store,firewall:fw,defiEnrichmentDelayMs:5000,defiEnrichmentTtlMs:900000});

var t=Date.now();
c.requestRefresh(function(e,o){
 assert.ifError(e);
 assert.equal(o.accepted,true);
 assert.equal(o.joined,false);
 assert(o.refreshId);
 assert(Date.now()-t<100,'requestRefresh must acknowledge without waiting for providers');
});

var deadline=Date.now()+1500;
(function verify(){
 var st=c.status();
 if((st.busy||!st.refreshJob||!st.refreshJob.last)&&Date.now()<deadline)return setTimeout(verify,40);
 try{
  assert(snap&&snap.cefi&&snap.defi,'async refresh must eventually produce snapshot');
  assert.equal(heavyCalls,0,'heavy DeFi enrichment must stay off the critical path');
  assert.equal(snap.defi.tvlUsd,500);
  assert.equal(snap.defi.dexVolume24hUsd,50);
  assert.equal(snap.defi.stablecoinMarketCapUsd,200);
  assert(snap.defi.limitations.indexOf('HEAVY_DEFI_ENRICHMENT_DEFERRED')>=0);
  assert.equal(st.busy,false);
  assert(st.refreshJob&&st.refreshJob.last&&st.refreshJob.last.ok===true,'refresh job status must eventually complete');
  console.log('PASS Financial async refresh + DeFi fast lane');
 }catch(e){console.error(e&&e.stack||e);process.exitCode=1;}
})();
