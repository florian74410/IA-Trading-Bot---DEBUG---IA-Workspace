'use strict';
var assert=require('assert'),Gate=require('../Engine/risk_gate').RiskGate;
var cfg={enabled:true,thresholds:{leverageWarning:5}},g=new Gate({secret:'test-secret',getSettings:function(){return cfg;},ttlMs:30000});
var base={schema:'cp1.trade-intent/1.0',source:'supervisor.autonomous-trading',mode:'PAPER',exchange:'BINANCE',symbol:'BTCUSDT',action:'BUY',orderType:'MARKET',size:0.01,leverage:2};
var d=g.evaluate(base);assert.equal(d.decision,'APPROVED');assert(d.risk_approval_id);assert(g.verify(d.risk_approval_id,base,false).ok);assert.equal(g.verify(d.risk_approval_id,Object.assign({},base,{size:0.02}),false).ok,false);
var high=g.evaluate(Object.assign({},base,{leverage:10}));assert.equal(high.decision,'REJECTED');assert(high.reasons.indexOf('LEVERAGE_LIMIT')>=0);
var bad=g.evaluate(Object.assign({},base,{source:'evil'}));assert.equal(bad.decision,'REJECTED');
assert(g.verify(d.risk_approval_id,base,true).ok);assert.equal(g.verify(d.risk_approval_id,base,false).ok,false);
console.log('Risk Gate tests: OK');
