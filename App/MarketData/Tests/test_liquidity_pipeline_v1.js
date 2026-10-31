'use strict';
var assert=require('assert'),fs=require('fs'),path=require('path');
var Firewall=require('../../Core/Firewall/Protection/market_data_firewall');
var Metrics=require('../../Liquidity/Engine/liquidity_metrics');

var fw=new Firewall({
 enabled:true,mode:'PROTECTION',
 providerWhitelist:['BINANCE_FUTURES','HYPERLIQUID','KRAKEN','OKX'],
 typeWhitelist:['LIQUIDITY_SNAPSHOT','OPEN_INTEREST','LIQUIDATION'],
 rules:{duplicateProtection:false},
 maxMessageAgeMs:30000,maxSpreadPct:10
});
function message(book,oi){
 var bid=book.bids[0].price,ask=book.asks[0].price;
 return{provider:'BINANCE_FUTURES',source:'BINANCE_FUTURES',provenance:'MARKET_DATA_COLLECTOR:BINANCE_FUTURES',type:'LIQUIDITY_SNAPSHOT',symbol:'BTCUSDT',timestamp:Date.now(),bid:bid,ask:ask,price:(bid+ask)/2,data:{orderBook:book,openInterest:oi,liquidations:[]}};
}
var book={bids:[{price:100,size:10},{price:99.5,size:20}],asks:[{price:100.1,size:12},{price:100.5,size:20}]};
var valid=fw.inspect(message(book,{available:true,value:1000,markPrice:100.05}),{});
assert.notStrictEqual(valid.decision,'REJECT','valid microstructure snapshot must pass firewall');

var crossed={bids:[{price:101,size:10}],asks:[{price:100,size:10}]};
var invalid=fw.inspect(message(crossed,{available:true,value:1000,markPrice:100}),{});
assert.strictEqual(invalid.decision,'REJECT','crossed order book must be rejected');

var oiValid=fw.inspect({provider:'OKX',source:'OKX',provenance:'MARKET_DATA_COLLECTOR:OKX',type:'OPEN_INTEREST',symbol:'BTCUSDT',timestamp:Date.now(),data:{openInterest:{openInterestNotionalUsd:1000000,openInterestBase:10,markPrice:100000}}},{});
assert.notStrictEqual(oiValid.decision,'REJECT','valid standalone OI must pass');
var oiInvalid=fw.inspect({provider:'OKX',source:'OKX',provenance:'MARKET_DATA_COLLECTOR:OKX',type:'OPEN_INTEREST',symbol:'BTCUSDT',timestamp:Date.now(),data:{openInterest:{openInterestNotionalUsd:-1}}},{});
assert.strictEqual(oiInvalid.decision,'REJECT','negative OI must be rejected');

var liqValid=fw.inspect({provider:'BINANCE_FUTURES',source:'BINANCE_FUTURES',provenance:'BINANCE_FUTURES:forceOrder',type:'LIQUIDATION',symbol:'BTCUSDT',timestamp:Date.now(),price:100000,data:{side:'LONG',price:100000,quantity:0.1,quantityUnit:'BASE',notionalUsd:10000}},{});
assert.notStrictEqual(liqValid.decision,'REJECT','valid liquidation must pass');
var liqInvalid=fw.inspect({provider:'OKX',source:'OKX',provenance:'OKX:liquidation-orders',type:'LIQUIDATION',symbol:'BTCUSDT',timestamp:Date.now(),price:100000,data:{side:'UNKNOWN',price:100000,quantity:1,quantityUnit:'CONTRACT'}},{});
assert.strictEqual(liqInvalid.decision,'REJECT','invalid liquidation side must be rejected');

var m=Metrics.snapshot({source:'BINANCE_FUTURES',symbol:'BTCUSDT',depth:20,orderBook:book,openInterest:{available:true,value:1000,markPrice:100.05}});
assert(m.orderBook.available===true,'order book metrics unavailable');
assert(m.depthBands&&m.depthBands['100bps'],'depth bands missing');
assert(m.executionImpact&&m.executionImpact.buy&&m.executionImpact.sell,'execution impact missing');
assert(m.liquidityScore&&m.liquidityScore.available===true,'liquidity score missing');
assert(isFinite(m.oiToDepth100bps),'OI/depth stress ratio missing');

var root=path.resolve(__dirname,'../..');
[
 path.join(root,'Liquidity','Engine','liquidity_service.js'),
 ...fs.readdirSync(path.join(root,'Liquidity','Provider')).filter(function(name){return /\.js$/.test(name)}).map(function(name){return path.join(root,'Liquidity','Provider',name)})
].forEach(function(file){
 var src=fs.readFileSync(file,'utf8');
 assert(!/require\(['"]https['"]\)/.test(src),'Liquidity Engine must not require https: '+file);
 assert(!/https:\/\//.test(src),'Liquidity Engine must not contain Internet provider URLs: '+file);
});
var providerSrc=fs.readFileSync(path.join(root,'MarketData','Provider','microstructure_provider.js'),'utf8');
assert(/fapi\.binance\.com/.test(providerSrc),'Binance Futures microstructure provider missing');
assert(/api\.hyperliquid\.xyz/.test(providerSrc),'Hyperliquid microstructure provider missing');
assert(/api\.kraken\.com/.test(providerSrc),'Kraken microstructure provider missing');
assert(/\/api\/v5\/public\/open-interest/.test(providerSrc),'OKX open interest provider missing');
assert(/aggregateOpenInterest/.test(providerSrc),'covered OI aggregator missing');
assert(/arbitrum\.gmxapi\.io/.test(providerSrc)&&/avalanche\.gmxapi\.io/.test(providerSrc),'GMX DEX OI coverage missing');
assert(/api\.bybit\.com/.test(providerSrc)&&/openInterestValue/.test(providerSrc),'Bybit microstructure/OI provider missing');

var md=fs.readFileSync(path.join(root,'MarketData','market_data_service.js'),'utf8');
assert(/MicrostructureProvider/.test(md)&&/LiquidationStreamManager/.test(md),'microstructure must be owned by Market Data service');
assert(!/\.\/Liquidity\//.test(md),'obsolete MarketData/Liquidity subservice path must not be used');
assert(/marketdata\.derivatives\.open_interest/.test(md),'aggregate OI CP1 action missing');
assert(/marketdata\.liquidations\.streams/.test(md),'liquidation stream status action missing');

var bw=fs.readFileSync(path.join(root,'MarketData','Workers','binance_liquidations_worker.js'),'utf8');
var ow=fs.readFileSync(path.join(root,'MarketData','Workers','okx_liquidations_worker.js'),'utf8');
assert(/!forceOrder@arr/.test(bw),'Binance liquidation stream missing');
assert(/liquidation-orders/.test(ow),'OKX liquidation stream missing');
var yw=fs.readFileSync(path.join(root,'MarketData','Workers','bybit_liquidations_worker.js'),'utf8');
assert(/allLiquidation\./.test(yw)&&/stream\.bybit\.com/.test(yw),'Bybit liquidation stream missing');
var bybit=fs.readFileSync(path.join(root,'MarketData','Provider','bybit_provider.js'),'utf8');
assert(/\/v5\/market\/kline/.test(bybit),'Bybit candle provider missing');
var dex=fs.readFileSync(path.join(root,'MarketData','Provider','dexscreener_provider.js'),'utf8');
assert(/api\.dexscreener\.com/.test(dex)&&/POOL_LIQUIDITY_USD/.test(dex),'DEX Screener pool liquidity provider missing');
var dxc=fs.readFileSync(path.join(root,'MarketData','Collectors','dex_liquidity_collector.js'),'utf8');
assert(/MARKET_ANALYTICS/.test(dxc)&&/firewall\.inspect/.test(dxc),'DEX liquidity must pass Data Firewall');

console.log('LIQUIDITY_PIPELINE_V4_OK');
