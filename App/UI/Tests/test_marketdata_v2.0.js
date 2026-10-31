'use strict';
var fs=require('fs'),path=require('path'),assert=require('assert');
var ROOT=path.resolve(__dirname,'../..');
var ref=fs.readFileSync(path.join(ROOT,'MarketData/Provider/reference_provider.js'),'utf8');
var svc=fs.readFileSync(path.join(ROOT,'MarketData/market_data_service.js'),'utf8');
var reg=JSON.parse(fs.readFileSync(path.join(ROOT,'Core/Communication/ProtocolRegistry/marketdata.json'),'utf8'));
assert(ref.indexOf('krakenPort')<0,'obsolete Kraken bridge option remains');
['marketdata.health','marketdata.symbols','marketdata.provider.test','marketdata.asset.price','marketdata.catalog','marketdata.asset.resolve','marketdata.settings.get','marketdata.settings.set','marketdata.registry.refresh'].forEach(function(name){
 assert(reg.table.commands.some(function(x){return x.name===name;}),'missing Market Data CP/1 command '+name);
});
assert(svc.indexOf("'marketdata.provider.test'")>=0,'generic provider self-test missing');
assert(svc.indexOf("'marketdata.asset.price'")>=0,'asset price ownership missing');
assert(svc.indexOf("'marketdata.catalog'")>=0,'asset catalog ownership missing');
console.log('[MARKETDATA] OK v2.0');
