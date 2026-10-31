'use strict';
// Local fixtures only: real Firewall rules and temporary SQLite, no WebSocket/Engine starts.
var test=require('node:test'),assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
var temp=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-liquidations-'));
['RUNTIME','DATA','STATE','ANNEX','UPDATES'].forEach(function(k){process.env['IATB_'+k+'_ROOT']=path.join(temp,k);});
var Normalize=require('../Normalizer/liquidations'),Collector=require('../Collectors/microstructure_collector'),Store=require('../Storage/microstructure_store'),DF=require('../../Core/Firewall/Protection/market_data_firewall');
var stores=[],index=0;
test.after(function(){stores.forEach(function(s){s.close();});fs.rmSync(temp,{recursive:true,force:true});});
function make(options){var store=new Store({file:path.join(temp,'liquidations-'+(++index)+'.db')}),fw=new DF({duplicateWindowMs:0}),state={checks:0,rates:0,instruments:0};stores.push(store);
 var c=new Collector(Object.assign({store:store,firewall:{inspect:function(msg,cb){state.checks++;var r=fw.inspect(msg);if(r.decision==='REJECT'){var e=new Error('DATA_FIREWALL_REJECT');e.firewall=r;return cb(e);}cb(null,{ok:true,decision:r.decision,reason:r.reason,firewall:r});}},currencyPriceResolver:function(unit,cb){state.rates++;setTimeout(function(){cb(null,{ok:true,value:.999,source:'LOCAL_VALIDATED_RATE_FIXTURE',updatedAt:Date.now()});},5);},instrumentResolver:function(cb){state.instruments++;cb(null,[{instId:'BTC-USDT-SWAP',ctVal:'0.01',ctValCcy:'BTC',ctType:'linear',ctMult:''},{instId:'BTC-USD-SWAP',ctVal:'100',ctValCcy:'USD',ctType:'inverse',ctMult:'1'}]);}},options||{}));return{c:c,store:store,state:state};}
function accept(c,x){return new Promise(function(resolve,reject){c.acceptLiquidation(x,function(e,o){if(e)reject(e);else resolve(o);});});}
function binance(id){return Normalize.binance({e:'forceOrder',o:{s:'BTCUSDT',S:'SELL',ap:'100',p:'99',l:'1',z:'2',q:'3',T:Date.now()+(id||0)}});}
test('raw stream units, filled quantity and side semantics are explicit',function(){
 var b=binance();assert.equal(b.quantity,1,'last fill, not cumulative or original order size');assert.equal(b.notionalUsd,null);assert.equal(b.side,'LONG');assert.equal(b.quoteCurrency,'USDT');
 var by=Normalize.bybit({data:[{s:'ETHUSDC',S:'Buy',p:'100',v:'2',T:Date.now()}]})[0];assert.equal(by.side,'LONG');assert.equal(by.quantityUnit,'BASE');assert.equal(by.quoteCurrency,'USDC');
 var ok=Normalize.okx({data:[{instId:'BTC-USDT-SWAP',details:[{bkPx:'10000',sz:'2',ts:String(Date.now()),posSide:'long',side:'sell'}]}]})[0];assert.equal(ok.quantityUnit,'CONTRACT');assert.equal(ok.notionalUsd,null);
 assert.equal(Normalize.bybit({data:[{s:'BTCUSDT',S:'nonsense',p:'1',v:'1',T:Date.now()}]}).length,0);
});
test('linear/base/inverse amounts use validated rates and metadata; final USD passes Firewall before SQLite',async function(){
 var f=make(),b=binance(),by=Normalize.bybit({data:[{s:'BTCUSDT',S:'Buy',p:'100',v:'2',T:Date.now()}]})[0];
 var contracts=Normalize.okx({data:[{instId:'BTC-USDT-SWAP',details:[{bkPx:'10000',sz:'2',ts:String(Date.now()),posSide:'long',side:'sell'}]},{instId:'BTC-USD-SWAP',details:[{bkPx:'10000',sz:'1',ts:String(Date.now()),posSide:'short',side:'buy'}]}]});
 var events=await Promise.all([b,by].concat(contracts).map(function(x){return accept(f.c,x);}));
 assert(Math.abs(events[0].notionalUsd-99.9)<1e-8);assert(Math.abs(events[1].notionalUsd-199.8)<1e-8);assert(Math.abs(events[2].notionalUsd-199.8)<1e-8);assert.equal(events[3].notionalUsd,100);
 assert.equal(events[0].normalizationReceipt.observedAssetPriceUsd,.999);assert.equal(events[0].normalizationReceipt.sourceUnit,'USDT');
 assert.equal(f.state.rates,1,'concurrent conversions must deduplicate');assert.equal(f.state.instruments,1,'metadata must deduplicate and cache after Firewall');assert.equal(f.state.checks,9);
 events.forEach(function(x){assert(x.firewall.checkedAt);assert.equal(x.normalizationStatus,'NORMALIZED');assert(x.provenance);});
 var stats=f.c.liquidationStats({windowMs:86400000});assert.equal(stats.count,4);assert.equal(stats.coverage.notionalKnownEvents,4);assert(Math.abs(stats.coveredNotionalUsd-599.5)<1e-8);assert.equal(stats.coverage.storage,'SQLITE_24H');assert.equal(stats.byProvider.length,3);
});
test('simultaneous replay and replay after restart do not double count either memory or SQLite',async function(){
 var f=make(),event=binance(),out=await Promise.all([accept(f.c,event),accept(f.c,event),accept(f.c,event)]);assert.equal(out.filter(function(x){return x.duplicate;}).length,2);assert.equal(f.c.liquidationBuffer.length,1);assert.equal(f.c.liquidationStats({}).count,1);
 var reopened=new Store({file:f.store.file});stores.push(reopened);var c=new Collector({store:reopened});assert.equal((await accept(c,event)).duplicate,true);assert.equal(c.liquidationStats({}).count,1);
});
test('unknown contract metadata or USD conversion keeps events and explicit unavailable amounts',async function(){
 var f=make({currencyPriceResolver:function(s,cb){cb(new Error('COINGECKO_COOLDOWN'));}}),x=await accept(f.c,binance());assert.equal(x.notionalUsd,null);assert.equal(x.normalizationError,'COINGECKO_COOLDOWN');assert.equal(f.c.liquidationStats({}).coveredNotionalUsd,null);
 var q=Normalize.okx({data:[{instId:'UNKNOWN-USDT-SWAP',details:[{bkPx:'10',sz:'2',ts:String(Date.now()),posSide:'long'}]}]})[0];var u=await accept(f.c,q);assert.equal(u.normalizationError,'CONTRACT_METADATA_UNAVAILABLE');assert.equal(f.c.liquidationStats({}).coverage.notionalUnknownEvents,2);
});
test('invalid raw data and final Firewall refusal cannot be persisted',async function(){
 var f=make(),bad=binance();bad.price=-1;await assert.rejects(accept(f.c,bad),{message:'DATA_FIREWALL_REJECT'});assert.equal(f.state.rates,0);assert.equal(f.c.liquidationStats({}).count,0);
 var real=f.c.firewall.inspect;f.c.firewall.inspect=function(msg,cb){if(msg.data.normalizationStatus==='NORMALIZED')return cb(new Error('FINAL_FIREWALL_REJECT'));real(msg,cb);};
 await assert.rejects(accept(f.c,binance()),{message:'FINAL_FIREWALL_REJECT'});assert.equal(f.c.liquidationStats({}).count,0);assert.equal(f.c.liquidationBuffer.length,0);
});
test('24h SQL aggregates include more than 500 events, no recent-buffer heuristic or invented legacy USD',function(){
 var f=make(),now=Date.now();
 for(var i=0;i<600;i++)assert.equal(f.store.saveLiquidation({provider:'BYBIT',symbol:'ETHUSD',side:'LONG',price:1,quantity:1,notionalUsd:1,timestamp:now-i,eventKey:'bulk-'+i,normalizationStatus:'NORMALIZED',normalizationReceipt:{sourceUnit:'USD'},firewall:{decision:'PASS',checkedAt:now}}),true);
 var s=f.c.liquidationStats({windowMs:86400000});assert.equal(s.count,600);assert.equal(s.coveredNotionalUsd,600);assert.equal(s.coverage.truncated,false);assert.equal(f.c.liquidationStats({symbol:'BTCUSD'}).count,0);
 // Preserve legacy history, but do not mislabel quote/contract amounts as verified USD.
 f.store.run("INSERT INTO liquidation_events(timestamp,provider,symbol,side,price,quantity,notional_usd,event_key,data_json) VALUES("+now+",'OKX','ETHUSD','SHORT',1,1,123456,'legacy','{}');");
 s=f.c.liquidationStats({});assert.equal(s.count,601);assert.equal(s.coveredNotionalUsd,600);assert.equal(s.totalNotionalUsd,null);assert.equal(s.coverage.notionalUnknownEvents,1);
});

test('order-only Binance prices and unsupported inverse Bybit contracts remain unavailable; memory contract retained',async function(){
 var f=make(),x=binance();x.priceBasis='ORDER_PRICE_ONLY';var out=await accept(f.c,x);assert.equal(out.normalizationError,'EXECUTION_PRICE_UNAVAILABLE');assert.equal(f.state.rates,0);
 var by=Normalize.bybit({data:[{s:'BTCUSD',S:'Buy',p:'100',v:'2',T:Date.now()}]})[0];assert.equal((await accept(f.c,by)).normalizationError,'LIQUIDATION_CONTRACT_UNSUPPORTED');
 assert.equal(f.c.liquidationStats({}).unavailableReasons.length,2);f.c.store=null;var s=f.c.liquidationStats({});assert.equal(s.count,2);assert.equal(s.long.count,2);assert.equal(s.byProvider.length,2);assert.equal(s.coveredNotionalUsd,null);
});
