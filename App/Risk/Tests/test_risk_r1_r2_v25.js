'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R1=require('../Engine/risk_r1_modules');
const R2=require('../Engine/risk_r2_modules');
const intent={side:'BUY',quantity:0.1,entryPrice:70000,stopLoss:68600};
const context={equity:10000,feeRate:0.001,slippageRate:0.001,quantityStep:0.0001};
test('R1 calculation A B C D and proportional resize',()=>{
 const d=R1.evaluate(intent,{enabled:true,level:'balanced'},context);
 assert.equal(d.status,'RESIZE');assert.equal(d.metrics.notional,7000);
 assert.equal(d.metrics.stopLossQuote,140);assert.equal(d.metrics.feesAndSlippageQuote,14);
 assert.equal(d.metrics.estimatedLossQuote,154);assert.equal(d.metrics.budgetQuote,100);
 assert.ok(d.proposed.quantity<0.1);assert.ok(d.proposed.estimatedLossQuote<=100);
 assert.equal(d.executable,false);
});
test('R1 missing data, wrong stops and modules',()=>{
 assert.equal(R1.evaluate(intent,{enabled:false},context).status,'DISABLED');
 assert.equal(R1.evaluate({...intent,stopLoss:71000},{},context).status,'INSUFFICIENT_DATA');
 assert.equal(R1.evaluate(intent,{},{}).status,'INSUFFICIENT_DATA');
 assert.equal(R1.evaluate({...intent,quantity:0.01},{modules:{resize:false}},context).status,'PARTIAL');
});
test('R2 detects drawdown, aggregate risk, concentration and integrity',()=>{
 const d=R2.evaluate({equity:9300,peakEquity:11000,asOf:new Date().toISOString(),reconciled:true,positions:[{asset:'BTC',notional:7000,estimatedStopRiskQuote:500}]},{});
 assert.equal(d.status,'BREACH');assert.equal(d.policy.blockAdditionalRisk,true);
 assert.ok(d.alerts.some(a=>a.code==='DRAWDOWN_LIMIT'));
 assert.ok(d.alerts.some(a=>a.code==='ASSET_CONCENTRATION'));
 assert.ok(d.alerts.some(a=>a.code==='PORTFOLIO_STOP_RISK'));
 assert.equal(d.policy.autoLiquidation,false);assert.equal(d.executable,false);
});
test('R2 stale data fail closed; disabled passive mode',()=>{
 const d=R2.evaluate({equity:10000,positions:[],reconciled:false},{});
 assert.equal(d.status,'CRITICAL');assert.equal(d.supervisor.notify,true);
 assert.equal(R2.evaluate({}, {enabled:false}).status,'DISABLED');
});
