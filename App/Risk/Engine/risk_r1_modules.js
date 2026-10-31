'use strict';
// R1 deterministic calculator. Analytical only: NEVER grants execution approval.
// All monetary values denominated in account quote currency; linear spot/perpetual only.
function number(x){return x===null||x===undefined||x===''?NaN:Number(x);}
function finite(x){return Number.isFinite(x);}
function round(x){return Math.round(x*1e8)/1e8;}
const PRESETS={conservative:0.5,balanced:1,active:1.5,aggressive:2};
const MODULES=['capital','stopLoss','riskBudget','resize'];
function evaluate(intent,config,context){
 intent=intent||{};config=config||{};context=context||{};
 const enabled=config.enabled!==false,modules=Object.assign({capital:true,stopLoss:true,riskBudget:true,resize:true},config.modules||{});
 const level=String(config.level||'balanced'),maxRiskPct=finite(number(config.maxRiskPct))?number(config.maxRiskPct):PRESETS[level]||1;
 const reasons=[],metrics={},off=MODULES.filter(k=>!modules[k]);
 if(!enabled)return{schema:'risk.r1.decision/1.0',status:'DISABLED',executable:false,reasons:['R1_DISABLED'],metrics:{},disabledModules:MODULES};
 const equity=number(context.equity),quantity=number(intent.quantity!=null?intent.quantity:intent.size),price=number(intent.entryPrice!=null?intent.entryPrice:intent.limitPrice),stop=number(intent.stopLoss),side=String(intent.side||intent.action||'').toUpperCase();
 const feeRate=number(context.feeRate),slippageRate=number(context.slippageRate);
 if(!finite(equity)||equity<=0)reasons.push('EQUITY_REQUIRED');
 if(!finite(quantity)||quantity<=0)reasons.push('QUANTITY_REQUIRED');
 if(!finite(price)||price<=0)reasons.push('ENTRY_PRICE_REQUIRED');
 if(side!=='BUY'&&side!=='SELL')reasons.push('SIDE_INVALID');
 if(!finite(stop)||stop<=0)reasons.push('STOP_REQUIRED');
 if(finite(stop)&&finite(price)&&side==='BUY'&&stop>=price||finite(stop)&&finite(price)&&side==='SELL'&&stop<=price)reasons.push('STOP_SIDE_INVALID');
 if(!finite(feeRate)||feeRate<0||feeRate>0.1)reasons.push('FEE_RATE_REQUIRED');
 if(!finite(slippageRate)||slippageRate<0||slippageRate>0.2)reasons.push('SLIPPAGE_RATE_REQUIRED');
 if(!finite(maxRiskPct)||maxRiskPct<=0||maxRiskPct>5)reasons.push('RISK_POLICY_INVALID');
 if(reasons.length)return{schema:'risk.r1.decision/1.0',status:'INSUFFICIENT_DATA',executable:false,reasons,metrics,disabledModules:off};
 const notional=quantity*price,stopLoss=quantity*Math.abs(price-stop),cost=notional*(feeRate+slippageRate),loss=stopLoss+cost,budget=equity*maxRiskPct/100;
 if(modules.capital){metrics.equity=round(equity);metrics.notional=round(notional);metrics.capitalCommittedPct=round(notional/equity*100);}
 if(modules.stopLoss){metrics.stopDistancePct=round(Math.abs(price-stop)/price*100);metrics.stopLossQuote=round(stopLoss);metrics.feesAndSlippageQuote=round(cost);metrics.estimatedLossQuote=round(loss);}
 if(modules.riskBudget){metrics.maxRiskPct=maxRiskPct;metrics.budgetQuote=round(budget);metrics.estimatedRiskPct=round(loss/equity*100);}
 const breached=loss>budget+1e-9;
 if(modules.riskBudget&&breached)reasons.push('RISK_BUDGET_EXCEEDED');
 let proposed=null;
 if(modules.resize&&modules.riskBudget&&breached){
   const unitRisk=Math.abs(price-stop)+price*(feeRate+slippageRate);
   const cap=budget/unitRisk,step=number(context.quantityStep);
   if(finite(step)&&step>0&&cap>0){const qty=Math.floor((cap+1e-12)/step)*step;
     if(qty>0&&qty<quantity)proposed={quantity:round(qty),estimatedLossQuote:round(qty*unitRisk),requiresNewIntent:true};
   }else reasons.push('QUANTITY_STEP_REQUIRED');
 }
 if(off.length)reasons.push('PARTIAL_RISK_ANALYSIS');
 return{schema:'risk.r1.decision/1.0',status:breached&&modules.riskBudget?(proposed?'RESIZE':'REJECT'):off.length?'PARTIAL':'PASS',executable:false,reasons,metrics,proposed,disabledModules:off,
  supervisor:{decision:breached&&modules.riskBudget?'REVIEW':'OBSERVE',riskPct:round(loss/equity*100),budgetPct:maxRiskPct,proposedQuantity:proposed&&proposed.quantity||null}};
}
module.exports={evaluate,PRESETS,MODULES};
