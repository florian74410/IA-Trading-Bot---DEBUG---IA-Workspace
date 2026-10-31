'use strict';
var assert=require('assert');
var Risk=require('../Engine/risk_engine');

function candles(){
  var out=[],p=100;
  for(var i=0;i<120;i++){
    var drift=(i%17===0?-0.035:0.0015)+(i%9===0?0.01:0);
    var o=p, c=Math.max(1,p*(1+drift)), h=Math.max(o,c)*1.005, l=Math.min(o,c)*0.995;
    out.push([Date.now()-(120-i)*3600000,o,h,l,c,100+i]);
    p=c;
  }
  return out;
}
var portfolio={
  equity:10000,
  cash:6000,
  positions:[
    {symbol:'ETHUSD',entryPrice:3000,quantity:1,leverage:2,stopLoss:2850,unrealizedPnl:120}
  ]
};
var strategy={symbol:'BTCUSD',entryPrice:100000,quantity:0.02,leverage:3,stopLoss:97000};
var a=Risk.analyze({symbol:'BTCUSD',timeframe:'1h',market:{candles:candles()},portfolio:portfolio,strategy:strategy});

assert.strictEqual(a.schema,'risk.analysis/0.1');
assert.strictEqual(a.notes.indexOf('ANALYTICAL_ONLY')>=0,true);
assert(a.position.notional>0);
assert(a.position.lossAtStop>0);
assert(a.portfolio.totalNotional>0);
assert(a.projected.grossExposurePct>a.portfolio.grossExposurePct);
assert(a.marketRisk.volatility.samples>50);
assert(a.marketRisk.historicalVaR95Pct>=0);
assert(a.marketRisk.historicalExpectedShortfall95Pct>=a.marketRisk.historicalVaR95Pct);
assert(a.score>=0&&a.score<=100);
assert(['VERY_LOW','LOW','MODERATE','HIGH','CRITICAL'].indexOf(a.level)>=0);

var pr=Risk.positionRisk({entryPrice:100,stopLoss:95,quantity:10,leverage:5},{equity:10000});
assert.strictEqual(Math.round(pr.notional),1000);
assert.strictEqual(Math.round(pr.lossAtStop),50);
assert.strictEqual(Math.round(pr.marginUsed),200);

console.log('Risk Engine pure calculations: OK');
console.log(JSON.stringify({
  score:a.score,
  level:a.level,
  capitalAtRiskPct:+a.position.capitalAtRiskPct.toFixed(3),
  projectedGrossExposurePct:+a.projected.grossExposurePct.toFixed(3),
  historicalVaR95Pct:+a.marketRisk.historicalVaR95Pct.toFixed(3),
  historicalES95Pct:+a.marketRisk.historicalExpectedShortfall95Pct.toFixed(3)
},null,2));
