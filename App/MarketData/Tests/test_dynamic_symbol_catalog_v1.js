'use strict';

var assert=require('assert'),http=require('http');
var Binance=require('../Provider/binance_provider'),Kraken=require('../Provider/kraken_provider'),OKX=require('../Provider/okx_provider'),Bybit=require('../Provider/bybit_provider'),Hyperliquid=require('../Provider/hyperliquid_provider');
var Firewall=require('../../Core/Firewall/Protection/market_data_firewall');

function json(res,o){var b=Buffer.from(JSON.stringify(o));res.writeHead(200,{'Content-Type':'application/json','Content-Length':b.length});res.end(b);}
function candleMs(){return [[Date.now()-60000,'10','11','9','10.5','123'],[Date.now(),'10.5','12','10','11.5','150']];}

var server=http.createServer(function(req,res){
 var u=new URL(req.url,'http://127.0.0.1');
 if(req.method==='GET'&&u.pathname==='/api/v3/exchangeInfo')return json(res,{symbols:[
  {symbol:'BTCUSDT',status:'TRADING',baseAsset:'BTC',quoteAsset:'USDT',isSpotTradingAllowed:true},
  {symbol:'TESTFDUSD',status:'TRADING',baseAsset:'TEST',quoteAsset:'FDUSD',isSpotTradingAllowed:true},
  {symbol:'OLDUSDT',status:'BREAK',baseAsset:'OLD',quoteAsset:'USDT',isSpotTradingAllowed:true}
 ]});
 if(req.method==='GET'&&u.pathname==='/api/v3/klines')return json(res,candleMs());

 if(req.method==='GET'&&u.pathname==='/0/public/AssetPairs')return json(res,{error:[],result:{
  XXBTZUSD:{altname:'XBTUSD',wsname:'XBT/USD',status:'online'},
  ABCJPY:{altname:'ABCJPY',wsname:'ABC/JPY',status:'online'},
  OLDUSD:{altname:'OLDUSD',wsname:'OLD/USD',status:'cancel_only'}
 }});
 if(req.method==='GET'&&u.pathname==='/0/public/OHLC')return json(res,{error:[],result:{ABCJPY:[[Math.floor(Date.now()/1000)-60,'10','11','9','10.5','10.7','123','4'],[Math.floor(Date.now()/1000),'10.5','12','10','11.5','11','150','5']],last:Date.now()}});

 if(req.method==='GET'&&u.pathname==='/api/v5/public/instruments')return json(res,{code:'0',msg:'',data:[
  {instId:'BTC-USDT',instType:'SPOT',baseCcy:'BTC',quoteCcy:'USDT',state:'live'},
  {instId:'ABC-JPY',instType:'SPOT',baseCcy:'ABC',quoteCcy:'JPY',state:'live'},
  {instId:'OLD-USDT',instType:'SPOT',baseCcy:'OLD',quoteCcy:'USDT',state:'suspend'}
 ]});
 if(req.method==='GET'&&u.pathname==='/api/v5/market/candles')return json(res,{code:'0',msg:'',data:candleMs()});

 if(req.method==='GET'&&u.pathname==='/v5/market/instruments-info'){
  if(u.searchParams.get('cursor'))return json(res,{retCode:0,retMsg:'OK',result:{list:[
   {symbol:'SOLUSDT',contractType:'LinearPerpetual',status:'Trading',baseCoin:'SOL',quoteCoin:'USDT'},
   {symbol:'BTC-30OCT26',contractType:'LinearFutures',status:'Trading',baseCoin:'BTC',quoteCoin:'USDT'}
  ],nextPageCursor:''}});
  return json(res,{retCode:0,retMsg:'OK',result:{list:[
   {symbol:'BTCUSDT',contractType:'LinearPerpetual',status:'Trading',baseCoin:'BTC',quoteCoin:'USDT'},
   {symbol:'ETHUSDC',contractType:'LinearPerpetual',status:'Trading',baseCoin:'ETH',quoteCoin:'USDC'}
  ],nextPageCursor:'NEXT'}});
 }
 if(req.method==='GET'&&u.pathname==='/v5/market/kline')return json(res,{retCode:0,retMsg:'OK',result:{list:candleMs()}});

 if(req.method==='POST'&&u.pathname==='/info'){
  var a=[];req.on('data',function(c){a.push(c)});return req.on('end',function(){var o={};try{o=JSON.parse(Buffer.concat(a).toString('utf8')||'{}')}catch(e){}
   if(o.type==='meta')return json(res,{universe:[{name:'BTC',maxLeverage:40},{name:'SOL',maxLeverage:20},{name:'OLD',isDelisted:true}]});
   if(o.type==='candleSnapshot')return json(res,[{t:Date.now()-60000,o:'10',h:'11',l:'9',c:'10.5',v:'20'},{t:Date.now(),o:'10.5',h:'12',l:'10',c:'11.5',v:'30'}]);
   json(res,{});
  });
 }
 res.writeHead(404);res.end();
});

function list(p){return new Promise(function(resolve,reject){p.listSymbols(function(e,o){if(e)reject(e);else resolve(o);});});}
function candles(p,s){return new Promise(function(resolve,reject){p.getCandles(s,'1m',function(e,o){if(e)reject(e);else resolve(o);});});}

server.listen(0,'127.0.0.1',async function(){
 var base='http://127.0.0.1:'+server.address().port;
 try{
  var b=new Binance({base:base}),k=new Kraken({base:base}),o=new OKX({base:base}),y=new Bybit({base:base}),h=new Hyperliquid({base:base});
  var bl=await list(b);assert.deepEqual(bl.symbols.map(function(x){return x.symbol}),['BTCUSDT','TESTFDUSD']);assert.equal(bl.dynamic,true);
  var bc=await candles(b,'TESTFDUSD');assert.equal(bc.canonicalSymbol,'TEST/FDUSD');

  var kl=await list(k);assert(kl.symbols.some(function(x){return x.symbol==='BTCUSD'}));assert(kl.symbols.some(function(x){return x.symbol==='ABCJPY'}));assert(!kl.symbols.some(function(x){return x.symbol==='OLDUSD'}));
  var kc=await candles(k,'ABCJPY');assert.equal(kc.providerPair,'ABCJPY');assert.equal(kc.canonicalSymbol,'ABC/JPY');

  var ol=await list(o);assert(ol.symbols.some(function(x){return x.symbol==='BTCUSDT'}));assert(ol.symbols.some(function(x){return x.symbol==='ABCJPY'}));assert(!ol.symbols.some(function(x){return x.symbol==='OLDUSDT'}));
  var oc=await candles(o,'ABCJPY');assert.equal(oc.providerPair,'ABC-JPY');assert.equal(oc.canonicalSymbol,'ABC/JPY');

  var yl=await list(y);assert.deepEqual(yl.symbols.map(function(x){return x.symbol}),['BTCUSDT','ETHUSDC','SOLUSDT']);assert.equal(yl.symbols.length,3);
  var yc=await candles(y,'ETHUSDC');assert.equal(yc.providerPair,'ETHUSDC');assert.equal(yc.canonicalSymbol,'ETH/USDC');

  var hl=await list(h);assert.deepEqual(hl.symbols.map(function(x){return x.symbol}),['BTCUSD','SOLUSD']);assert.equal(hl.symbols[0].marketType,'PERPETUAL_DEX');
  var hc=await candles(h,'SOLUSD');assert.equal(hc.providerPair,'SOL');assert.equal(hc.canonicalSymbol,'SOL/USD');

  var fw=new Firewall({providerWhitelist:['BINANCE'],typeWhitelist:['MARKET_SYMBOLS'],duplicateWindowMs:0});
  var fr=fw.inspect({provider:'BINANCE',source:'BINANCE',provenance:'BINANCE:/api/v3/exchangeInfo',type:'MARKET_SYMBOLS',timestamp:Date.now(),data:{symbols:bl.symbols}});
  assert.notEqual(fr.decision,'REJECT');

  console.log('PASS dynamic MarketData symbol catalogs + Firewall contract');
 }catch(e){
  console.error(e&&e.stack||e);process.exitCode=1;
 }finally{
  server.close();
 }
});
