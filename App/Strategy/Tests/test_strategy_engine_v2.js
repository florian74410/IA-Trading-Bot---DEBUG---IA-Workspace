'use strict';
var assert=require('assert'),path=require('path'),Core=require('../Engine/strategy_v2_core'),Registry=require('../Engine/strategy_registry_v2');
var ROOT=path.resolve(__dirname,'../..'),r=new Registry(ROOT);assert(r.items.length>=1,'catalog empty');
var legacy={schema_version:1,name:'Test RSI',version:'1.0',symbol:'BTCUSD',timeframe:'5m',entry:{side:'BUY',conditions:[{indicator:'RSI',operator:'<',value:30}]},risk:{leverage:2,max_position_usdt:10,stop_loss_percent:1,take_profit_percent:2}};
var n=Core.normalizeLegacy(legacy),v=Core.validate(n);assert(v.ok,v.errors&&v.errors.join(','));
var ev=Core.evaluateOne(n,{indicators:{RSI:25,summary:{bias:'BULLISH'}},fundamental:{score:0.2}});assert(ev.matched);assert(ev.confidence>0.5);var s=Core.buildSignal(ev,{correlation_id:'test-1'});assert.equal(s.schema,'strategy.signal/2.0');assert.equal(s.action,'BUY');assert.equal(s.execution.allowed,false);assert(s.expires_at>s.created_at);
var hold=Core.evaluateOne(n,{indicators:{RSI:50}});assert(!hold.matched);var agg=Core.aggregate([hold],{});assert.equal(agg.action,'HOLD');
console.log('Strategy Engine v2 core: OK; catalog='+r.items.length);
