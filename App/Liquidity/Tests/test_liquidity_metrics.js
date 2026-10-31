'use strict';
var M=require('../Engine/liquidity_metrics'),f=[];function ok(c,m){if(c)console.log('PASS',m);else f.push(m)}
var b={bids:[[100,3],[99,2]],asks:[[101,1],[102,1]]},r=M.orderBook(b,20);ok(r.available===true,'book available');ok(r.bestBid===100&&r.bestAsk===101,'best bid ask');ok(r.spread===1,'spread');ok(r.imbalance>0,'bid dominance');ok(r.dominantSide==='BID','dominant side');
var oi=M.openInterest('12.5',100);ok(oi.available&&oi.value===12.5,'open interest');ok(oi.notional===1250,'oi notional');
var now=1700001000000,l=M.liquidations([{time:now-1000,side:'LONG',price:100,size:2,source:'X'},{time:now-2000,side:'SHORT',price:100,size:1,source:'X'}],60000,now);ok(l.available&&l.count===2,'liquidations count');ok(l.long.notional===200&&l.short.notional===100,'liquidation notional');ok(l.imbalance>0,'liquidation imbalance');
var s=M.snapshot({source:'TEST',symbol:'BTCUSD',orderBook:b,openInterest:10,markPrice:100,depth:20});ok(s.bidAskImbalance.available===true,'snapshot imbalance');ok(s.openInterest.notional===1000,'snapshot OI');
if(f.length){console.error(f.join('\n'));process.exit(1)}console.log('ALL LIQUIDITY METRICS TESTS PASS');
