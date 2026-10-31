'use strict';
var BUILD=require('../../Core/Shared/build_info'),http=require('http'),path=require('path'),CPClient=require('../../Core/Communication/cp1_client'),fail=0,pending=0,ROOT=path.resolve(__dirname,'../..'),cp=new CPClient({root:ROOT,routerPort:8021,timeout:12000,maxBytes:4*1024*1024});
function get(port,p,cb){pending++;var q=http.get({host:'127.0.0.1',port:port,path:p,timeout:12000,headers:{Accept:'application/json'}},function(r){var a=[];r.on('data',function(c){a.push(c)});r.on('end',function(){pending--;var o;try{o=JSON.parse(Buffer.concat(a).toString('utf8')||'{}')}catch(e){return cb(new Error('JSON_INVALID '+port+p))}if((r.statusCode||500)>=400)return cb(new Error((o&&o.error)||('HTTP_'+r.statusCode)));cb(null,o)});});q.on('timeout',function(){q.destroy(new Error('TIMEOUT '+port+p))});q.on('error',function(e){pending--;cb(e)});}
function request(target,action,args,cb){pending++;cp.request(target,action,args||{},'analysis',function(e,o){pending--;cb(e,o);});}
function ok(v,m){console.log((v?'[OK]   ':'[FAIL] ')+m);if(!v)fail++;}
function done(){setTimeout(function(){if(pending)return done();console.log('\nMarket Data Collector V2.0 runtime audit: '+(fail?'FAIL':'PASS')+' ('+fail+' error(s))');process.exitCode=fail?1:0;},30);}
get(8013,'/health',function(e,o){ok(!e&&o&&o.ok&&String(o.version)===BUILD.version,'Collector 8013 matches current build '+BUILD.version);});
request('marketdata','marketdata.audit',{},function(e,o){ok(!e&&o&&o.ok&&o.status!=='FAIL','Collector self-audit is PASS/WARN');ok(!e&&o&&o.routing&&o.routing.distribution==='ROUTER_CP1','Financial distribution is Router CP/1');});
request('marketdata','marketdata.financial.snapshot',{force:true},function(e,o){
 ok(!e&&o&&o.cefi&&o.cefi.provider==='COINGECKO','CoinGecko CeFi snapshot collected');
 ok(!e&&o&&o.defi&&o.defi.provider==='DEFILLAMA','DeFiLlama DeFi snapshot collected');
 ok(!e&&o&&o.meta&&o.meta.quality&&o.meta.quality.ok===true,'Financial snapshot passed V2 quality gate');
 ok(!e&&o&&o.cefi&&o.cefi.cexCoverage&&o.cefi.cexCoverage.complete===false,'CEX sampled volume is explicitly marked partial');
 ok(!e&&o&&o.defi&&o.defi.tvlAggregateSource,'DeFi TVL aggregate provenance present');
});
request('liquidity','liquidity.financial',{scope:'ALL'},function(e,o){if(e)console.log('[INFO] Liquidity CP error:',e.message);else console.log('[INFO] Liquidity financial source:',o&&o.source);ok(!e&&o&&o.source==='MARKET_DATA_VIA_ROUTER_CP1','Liquidity consumes financial data through Router CP/1');});
request('indicator','indicator.financial_context',{scope:'ALL'},function(e,o){if(e)console.log('[INFO] Indicator CP error:',e.message);else console.log('[INFO] Indicator financial source:',o&&o.source);ok(!e&&o&&o.source==='MARKET_DATA_VIA_ROUTER','Indicator Engine consumes financial data through Router CP/1');});
function validCandles(o){var a=o&&o.candles||[];return a.length>10&&a.every(function(x){return Array.isArray(x)&&x.length>=6&&x.slice(0,6).every(function(v){return isFinite(+v)})&&+x[1]>0&&+x[2]>=Math.max(+x[1],+x[4])&&+x[3]<=Math.min(+x[1],+x[4])&&+x[5]>=0;});}
get(8013,'/candles?symbol=BTCUSD&interval=1h&limit=100&source=BINANCE',function(e,o){
 if(!e){console.log('[INFO] Binance candle rows:',o&&o.candles&&o.candles.length||0);return ok(validCandles(o),'BINANCE OHLCV values satisfy price/volume invariants');}
 console.log('[INFO] Binance runtime error:',e.message);
 if(e.message!=='PROVIDER_HTTP_451')return ok(false,'BINANCE OHLCV values satisfy price/volume invariants');
 console.log('[WARN] Binance is region-blocked from this CI runner (HTTP 451); validating live CEX OHLCV with OKX fallback');
 get(8013,'/candles?symbol=BTCUSD&interval=1h&limit=100&source=OKX',function(e2,o2){
  if(e2)console.log('[INFO] OKX fallback runtime error:',e2.message);else console.log('[INFO] OKX fallback candle rows:',o2&&o2.candles&&o2.candles.length||0);
  ok(!e2&&validCandles(o2),'Live CEX OHLCV invariants pass via OKX fallback when Binance CI access is region-blocked');
 });
});
done();
