'use strict';
var http=require('http'),path=require('path'),E=require('./liquidity_engine'),M=require('./liquidity_metrics'),P=require('../Provider/market_data_provider'),Cache=require('../Cache/liquidity_cache'),LiqBuffer=require('../Cache/liquidation_buffer'),CPAdapter=require('../../Core/Communication/component_cp1_adapter'),FinancialClient=require('../../Core/Communication/financial_data_client_v1'),BUILD=require('../../Core/Shared/build_info');

var HOST='127.0.0.1',PORT=+(process.env.IATB_LIQUIDITY_PORT||8014),APP_ROOT=path.resolve(__dirname,'../..'),ROUTER_PORT=+(process.env.ROUTER_PORT||8021),VERSION=BUILD.version,
 provider=new P({root:APP_ROOT,routerPort:ROUTER_PORT,timeout:10000}),
 zoneCache=new Cache({ttlMs:+process.env.IATB_LIQUIDITY_ZONE_CACHE_TTL||10000,maxEntries:32}),
 rawCache=new Cache({ttlMs:+process.env.IATB_LIQUIDITY_RAW_CACHE_TTL||5000,maxEntries:64}),
 analysisCache=new Cache({ttlMs:+process.env.IATB_LIQUIDITY_ANALYSIS_CACHE_TTL||3000,maxEntries:64}),
 liqBuffer=new LiqBuffer({max:+process.env.IATB_LIQUIDATION_BUFFER_MAX||1000}),
 financialClient=new FinancialClient({root:APP_ROOT,routerPort:ROUTER_PORT,timeout:9000}),
 TF={'1m':1,'5m':1,'15m':1,'30m':1,'1h':1,'4h':1,'1d':1,'1w':1};

function send(r,c,o){var b=Buffer.from(JSON.stringify(o));r.writeHead(c,{'Content-Type':'application/json; charset=utf-8','Content-Length':b.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});r.end(b);}
function sym(s){s=String(s||'').toUpperCase();return/^[A-Z0-9/_-]{3,24}$/.test(s)?s:null;}
function tf(t){t=String(t||'1h').toLowerCase();return TF[t]?t:null;}
function src(s){s=String(s||'AUTO').toUpperCase();return/^(AUTO|REFERENCE|KRAKEN|BINANCE|BINANCE_FUTURES|OKX|BYBIT|HYPERLIQUID)$/.test(s)?s:null;}
function ratio(a,b){a=+a;b=+b;return isFinite(a)&&isFinite(b)&&b>0?a/b:null;}
function rawKey(s,source,depth){return s+'|'+source+'|'+depth;}
function analysisKey(s,source,depth,windowMs){return rawKey(s,source,depth)+'|'+windowMs;}

function zones(s,t,l,cb){
 var k=s+'|'+t+'|'+l,h=zoneCache.get(k);if(h)return cb(null,Object.assign({},h,{cache:'HIT'}));
 provider.getCandles(s,t,l,function(e,m){if(e)return cb(e);var x=E.compute(m.candles,{maxZones:10,minStrength:.20});x.symbol=m.canonicalSymbol||s;x.timeframe=t;x.marketDataProvider=m.provider||'MARKET_DATA';x.firewall=m.firewall||null;x.cache='MISS';zoneCache.set(k,x);cb(null,x);});
}
function ingestLiquidations(raw){
 var rows=raw&&Array.isArray(raw.liquidations)?raw.liquidations:[];rows.forEach(function(x){if(!x)return;var side=String(x.side||'').toUpperCase(),p=+x.price,q=+(x.quantity!=null?x.quantity:x.size),t=+(x.time||x.timestamp||raw.observedAt||Date.now());if(t>0&&t<1e12)t*=1000;if((side==='LONG'||side==='SHORT')&&isFinite(p)&&p>0&&isFinite(q)&&q>=0&&isFinite(t))liqBuffer.add({symbol:String(raw.symbol||'').toUpperCase(),source:String(raw.source||'').toUpperCase(),side:side,price:p,quantity:q,notional:isFinite(+x.notional)?+x.notional:p*q,time:Math.round(t),providerEventId:x.providerEventId||null});});
}
function rawSnapshot(s,source,depth,force,cb){
 var k=rawKey(s,source,depth),h=!force&&rawCache.get(k);if(h)return cb(null,Object.assign({},h,{engineCache:'HIT'}));
 provider.getLiquiditySnapshot(s,source,depth,force,function(e,o){if(e)return cb(e);ingestLiquidations(o);o.engineCache='MISS';rawCache.set(k,o);cb(null,o);});
}
function realtimeSnapshot(s,source,depth,windowMs,force,cb){
 var k=analysisKey(s,source,depth,windowMs),h=!force&&analysisCache.get(k);if(h)return cb(null,Object.assign({},h,{engineCache:'HIT'}));
 rawSnapshot(s,source,depth,force,function(e,raw){
  if(e)return cb(e);var oi=raw.openInterest||null,x=M.snapshot({source:raw.source,symbol:raw.symbol,canonicalSymbol:raw.canonicalSymbol,depth:raw.depth||depth,orderBook:raw.orderBook||{},openInterest:oi,markPrice:oi&&oi.markPrice,liquidations:{available:false,reason:'LOADING_MARKET_DATA_FEED'}});
  x.schema='iatb.liquidity.analysis/2.1';x.marketData={schema:raw.schema||null,observedAt:raw.observedAt||null,firewall:raw.firewall||null,collectorCache:raw.cache||null,partial:raw.partial===true,errors:raw.errors||[]};x.engineCache='MISS';
  var left=3,oiAgg=null,liqStats=null,dexPool=null,warnings=[],done=function(){if(--left)return;x.aggregateOpenInterest=oiAgg;x.liquidations=liqStats||{available:false,reason:'LIQUIDATION_FEED_UNAVAILABLE'};x.dexPoolLiquidity=dexPool;x.contextWarnings=warnings;analysisCache.set(k,x);cb(null,x);};
  provider.getOpenInterestAggregate(s,undefined,function(oe,o){if(oe)warnings.push('AGGREGATE_OI:'+oe.message);else oiAgg=o;done();});
  provider.getLiquidationStats({symbol:s,windowMs:windowMs},function(le,l){if(le)warnings.push('LIQUIDATIONS:'+le.message);else liqStats=l;done();});
  provider.getDexLiquidity(s,false,function(de,d){if(de)warnings.push('DEX_POOL_LIQUIDITY:'+de.message);else dexPool=d;done();});
 });
}
function financialLiquidity(scope,cb){
 financialClient.snapshot(scope||'ALL',function(e,s){if(e)return cb(e);s=s||{};var c=s.cefi||{},d=s.defi||{},out={ok:true,schema:'iatb.liquidity.financial/2.0',source:'MARKET_DATA_VIA_ROUTER_CP1',timestamp:s.timestamp||Date.now(),expiresAt:s.expiresAt||null,scope:String(scope||'ALL').toUpperCase(),meta:s.meta||{}};
 if(c&&Object.keys(c).length)out.cefi={marketCapUsd:c.global&&c.global.marketCapUsd||null,totalVolume24hUsd:c.global&&c.global.totalVolume24hUsd||null,spotExchangeVolume24hUsd:c.spotVolume24hUsd||null,assetVolume24hUsd:c.assetVolume24hUsdSampled||null,volumeToMarketCap:ratio(c.global&&c.global.totalVolume24hUsd,c.global&&c.global.marketCapUsd),topExchanges:(c.exchanges||[]).slice(0,10),topAssets:(c.assets||[]).slice(0,20)};
 if(d&&Object.keys(d).length)out.defi={tvlUsd:d.tvlUsd||null,dexVolume24hUsd:d.dexVolume24hUsd||null,dexVolume7dUsd:d.dexVolume7dUsd||null,stablecoinMarketCapUsd:d.stablecoinMarketCapUsd||null,dexTurnover24h:ratio(d.dexVolume24hUsd,d.tvlUsd),stablecoinToTvl:ratio(d.stablecoinMarketCapUsd,d.tvlUsd),topProtocols:(d.protocols||[]).slice(0,20),topChains:(d.chains||[]).slice(0,20),topDex:(d.dexProtocols||[]).slice(0,20)};
 cb(null,out);
 });
}
function compactContext(rt,z){
 var bands=rt&&rt.depthBands||{},band=function(k){var x=bands[k]||{};return{bidUsd:+x.bidNotional||0,askUsd:+x.askNotional||0,totalUsd:+x.totalNotional||0,imbalance:+x.imbalance||0};};
 return{ok:true,schema:'iatb.liquidity.context/1.0',timestamp:Date.now(),symbol:rt&&rt.symbol||null,source:rt&&rt.source||null,microstructure:{midPrice:rt&&rt.orderBook&&rt.orderBook.midPrice||null,spreadBps:rt&&rt.orderBook&&rt.orderBook.spreadBps||null,bidAskImbalancePct:rt&&rt.bidAskImbalance&&rt.bidAskImbalance.percent||null,dominantSide:rt&&rt.bidAskImbalance&&rt.bidAskImbalance.dominantSide||null,depth:{bps10:band('10bps'),bps25:band('25bps'),bps50:band('50bps'),bps100:band('100bps')},openInterestNotional:rt&&rt.openInterest&&rt.openInterest.notional||null,aggregateOpenInterest:rt&&rt.aggregateOpenInterest||null,oiToDepth100bps:rt&&rt.oiToDepth100bps||null,liquidityScore:rt&&rt.liquidityScore||null,executionImpact:rt&&rt.executionImpact||null,liquidations:rt&&rt.liquidations||null,dexPoolLiquidity:rt&&rt.dexPoolLiquidity||null},estimatedZones:z?{nearestLong:z.nearestLong||null,nearestShort:z.nearestShort||null,atr:z.atr||null,zones:(z.zones||[]).slice(0,6)}:null,quality:{firewall:rt&&rt.marketData&&rt.marketData.firewall||null,partial:!!(rt&&rt.marketData&&rt.marketData.partial),warnings:rt&&rt.marketData&&rt.marketData.errors||[]},execution:'NONE'};
}
function liquidityHealth(){
 return{ok:true,name:'IA-TB Liquidity Engine',service:'LIQUIDITY',version:VERSION,pid:process.pid,host:HOST,port:PORT,mode:'INTERNAL_ANALYSIS_ONLY',internetAccess:false,dataPath:'PROVIDER/API -> MARKET_DATA -> DATA_FIREWALL -> CACHE/SQL -> ROUTER_CP1 -> LIQUIDITY',features:{estimatedZones:true,openInterest:true,aggregateOpenInterest:true,orderBook:true,bidAskImbalance:true,depthBands:true,executionImpact:true,liquidityScore:true,liquidations:'VALIDATED_DATA_ONLY',financialContext:'MARKET_DATA_VIA_ROUTER_CP1',supervisorContext:true,dexPoolLiquidity:true},cache:{zones:zoneCache.stats(),raw:rawCache.stats(),analysis:analysisCache.stats()},liquidationBuffer:liqBuffer.stats()};
}
function liquidityCapabilities(){
 return{ok:true,schema:'iatb.liquidity/2.1',role:'LIQUIDITY_ANALYSIS_ONLY',internetAccess:false,input:'MARKET_DATA_COLLECTOR_VIA_ROUTER_CP1',consumers:['STRATEGY','PORTFOLIO','SUPERVISOR','CHAT_IA'],aiAccess:'READ_ONLY',features:['ESTIMATED_ZONES','ORDERBOOK','OPEN_INTEREST','AGGREGATE_OPEN_INTEREST','LIQUIDATIONS','DEPTH_BANDS','EXECUTION_IMPACT','LIQUIDITY_SCORE','OI_DEPTH_STRESS','RAW_VALIDATED_DATA','SQL_HISTORY','DEX_POOL_LIQUIDITY','FINANCIAL_MARKET_CONTEXT','SUPERVISOR_CONTEXT'],rule:'NO_EXTERNAL_PROVIDER_ACCESS_IN_LIQUIDITY_ENGINE'};
}

var CP_ACTIONS=['liquidity.capabilities','liquidity.health','liquidity.zones','liquidity.raw','liquidity.history','liquidity.realtime','liquidity.snapshot','liquidity.context','liquidity.open_interest','liquidity.open_interest.history','liquidity.dex_liquidity','liquidity.dex_liquidity.history','liquidity.financial','liquidity.liquidations','liquidity.cache.clear'];
var cpAdapter=new CPAdapter({root:APP_ROOT,id:'liquidity',label:'Liquidity Engine',port:PORT,version:VERSION,schema:'liquidity.response/2.0',actions:CP_ACTIONS,handlers:{
 'liquidity.capabilities':function(){return liquidityCapabilities();},
 'liquidity.health':function(){return liquidityHealth();},
 'liquidity.zones':function(a,m,done){var s=sym(a.symbol),t=tf(a.timeframe),l=Math.max(100,Math.min(500,+a.limit||300));if(!s)return done(new Error('SYMBOL_INVALID'));if(!t)return done(new Error('TIMEFRAME_INVALID'));zones(s,t,l,done);},
 'liquidity.raw':function(a,m,done){var s=sym(a.symbol),so=src(a.source||'AUTO'),d=Math.max(5,Math.min(100,+a.depth||20));if(!s)return done(new Error('SYMBOL_INVALID'));if(!so)return done(new Error('SOURCE_INVALID'));rawSnapshot(s,so,d,!!a.force,done);},
 'liquidity.history':function(a,m,done){var s=a.symbol?sym(a.symbol):'',so=a.source?src(a.source):'',lim=Math.max(1,Math.min(2000,+a.limit||240)),since=Math.max(0,+a.since||0);if(a.symbol&&!s)return done(new Error('SYMBOL_INVALID'));if(a.source&&!so)return done(new Error('SOURCE_INVALID'));provider.getLiquidityHistory({symbol:s||'',source:so||'',limit:lim,since:since},done);},
 'liquidity.realtime':function(a,m,done){var s=sym(a.symbol),so=src(a.source||'AUTO'),d=Math.max(5,Math.min(100,+a.depth||20)),w=Math.max(60000,Math.min(86400000,+a.liquidationWindowMs||900000));if(!s)return done(new Error('SYMBOL_INVALID'));if(!so)return done(new Error('SOURCE_INVALID'));realtimeSnapshot(s,so,d,w,!!a.force,done);},
 'liquidity.snapshot':function(a,m,done){var s=sym(a.symbol),so=src(a.source||'AUTO'),d=Math.max(5,Math.min(100,+a.depth||20)),w=Math.max(60000,Math.min(86400000,+a.liquidationWindowMs||900000)),t=tf(a.timeframe||'1h'),l=Math.max(100,Math.min(500,+a.limit||300));if(!s)return done(new Error('SYMBOL_INVALID'));if(!so)return done(new Error('SOURCE_INVALID'));if(!t)return done(new Error('TIMEFRAME_INVALID'));realtimeSnapshot(s,so,d,w,!!a.force,function(e,rt){if(e)return done(e);zones(s,t,l,function(ze,z){if(ze)return done(ze);done(null,{ok:true,schema:'iatb.liquidity.snapshot/2.0',symbol:s,source:rt.source,realtime:rt,estimated:z,supervisor:compactContext(rt,z)});});});},
 'liquidity.context':function(a,m,done){var s=sym(a.symbol),so=src(a.source||'AUTO'),d=Math.max(5,Math.min(100,+a.depth||20)),w=Math.max(60000,Math.min(86400000,+a.liquidationWindowMs||900000)),t=tf(a.timeframe||'1h'),l=Math.max(100,Math.min(500,+a.limit||300));if(!s)return done(new Error('SYMBOL_INVALID'));if(!so)return done(new Error('SOURCE_INVALID'));realtimeSnapshot(s,so,d,w,false,function(e,rt){if(e)return done(e);zones(s,t,l,function(ze,z){if(ze)return done(null,compactContext(rt,null));done(null,compactContext(rt,z));});});},
 'liquidity.open_interest':function(a,m,done){var s=sym(a.symbol);if(!s)return done(new Error('SYMBOL_INVALID'));provider.getOpenInterestAggregate(s,Array.isArray(a.sources)?a.sources:undefined,done);},
 'liquidity.open_interest.history':function(a,m,done){var s=a.symbol?sym(a.symbol):'';if(a.symbol&&!s)return done(new Error('SYMBOL_INVALID'));provider.getOpenInterestHistory({symbol:s||'',limit:Math.max(1,Math.min(5000,+a.limit||500)),since:Math.max(0,+a.since||0)},done);},
 'liquidity.dex_liquidity':function(a,m,done){var s=sym(a.symbol);if(!s)return done(new Error('SYMBOL_INVALID'));provider.getDexLiquidity(s,!!a.force,done);},
 'liquidity.dex_liquidity.history':function(a,m,done){var s=a.symbol?sym(a.symbol):'';if(a.symbol&&!s)return done(new Error('SYMBOL_INVALID'));provider.getDexLiquidityHistory({symbol:s||'',limit:Math.max(1,Math.min(5000,+a.limit||500)),since:Math.max(0,+a.since||0)},done);} ,
 'liquidity.financial':function(a,m,done){financialLiquidity(a.scope||'ALL',done);},
 'liquidity.liquidations':function(a,m,done){var s=sym(a.symbol),so=String(a.source||'').toUpperCase(),w=Math.max(60000,Math.min(86400000,+a.windowMs||900000));if(!s)return done(new Error('SYMBOL_INVALID'));provider.getLiquidationStats({symbol:s,source:so||'',windowMs:w},done);},
 'liquidity.cache.clear':function(){zoneCache.clear();rawCache.clear();analysisCache.clear();return{ok:true,cache:{zones:zoneCache.stats(),raw:rawCache.stats(),analysis:analysisCache.stats()}};}
}});

var srv=require('../../Core/Clients/auth21_engine_ingress').createServer(function(req,res){
 if(cpAdapter.handle(req,res))return;var u=new URL(req.url,'http://'+HOST+':'+PORT),p=u.pathname;
 if(req.method==='GET'&&p==='/health')return send(res,200,liquidityHealth());
 send(res,404,{ok:false,error:'NOT_FOUND'});
});

srv.on('error',function(e){console.error('Liquidity Engine bind error:',e&&e.message||e);process.exit(16)});
srv.listen(PORT,HOST,function(){console.log('IA-TB Liquidity Engine v'+VERSION+' http://'+HOST+':'+PORT+' · INTERNAL ANALYSIS ONLY · CP/1 Market Data');cpAdapter.maintainRegistration({initialDelayMs:500});});
function stop(){cpAdapter.stopRegistration();srv.close(function(){process.exit(0)});setTimeout(function(){process.exit(0)},1200)}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
