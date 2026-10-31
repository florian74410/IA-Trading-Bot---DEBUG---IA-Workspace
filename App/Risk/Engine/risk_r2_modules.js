'use strict';
// R2 portfolio observation. No shell, order placement, OpenAI call, or autonomous liquidation.
function num(x){if(x===null||x===undefined||x==='')return NaN;return Number(x);}
function sane(x){return Number.isFinite(x);}
function pct(a,b){return b>0?Math.round(a/b*1e4)/100:null;}
const MODULES=['equity','drawdown','exposure','correlation','margin','stress','stopBudget','integrity'];
function evaluate(snapshot,config){
 snapshot=snapshot||{};config=config||{};
 if(config.enabled===false)return{schema:'risk.r2.snapshot/1.0',status:'DISABLED',alerts:[],summary:{},executable:false};
 const enabled=Object.assign({equity:true,drawdown:true,exposure:true,correlation:true,margin:true,stress:true,stopBudget:true,integrity:true},config.modules||{});
 const positions=Array.isArray(snapshot.positions)?snapshot.positions:[],equity=num(snapshot.equity),peak=num(snapshot.peakEquity);
 const limits=Object.assign({drawdownPct:15,assetExposurePct:40,portfolioStopRiskPct:5,marginRatioPct:130},config.limits||{});
 const alerts=[],summary={positionCount:positions.length,enabledModules:Object.keys(enabled).filter(k=>enabled[k])};
 const push=(module,code,current,limit,severity)=>alerts.push({module,code,current,limit,severity:severity||'HIGH'});
 if(enabled.equity){summary.equity=sane(equity)&&equity>0?equity:null;if(summary.equity===null)push('equity','EQUITY_UNAVAILABLE',null,null,'CRITICAL');}
 if(enabled.drawdown){if(sane(equity)&&sane(peak)&&peak>0){summary.drawdownPct=Math.max(0,pct(peak-equity,peak));if(summary.drawdownPct>limits.drawdownPct)push('drawdown','DRAWDOWN_LIMIT',summary.drawdownPct,limits.drawdownPct);}else push('drawdown','PEAK_EQUITY_UNAVAILABLE',null,null,'WARNING');}
 if(enabled.exposure){const byAsset={};positions.forEach(p=>{const v=num(p.notional),asset=String(p.asset||p.symbol||'UNKNOWN');if(sane(v))byAsset[asset]=(byAsset[asset]||0)+Math.abs(v);});summary.exposureByAsset=byAsset;if(sane(equity)&&equity>0)Object.keys(byAsset).forEach(asset=>{const x=pct(byAsset[asset],equity);if(x>limits.assetExposurePct)push('exposure','ASSET_CONCENTRATION',x,limits.assetExposurePct);});}
 if(enabled.stopBudget){let total=0,missing=0;positions.forEach(p=>{const n=num(p.estimatedStopRiskQuote);if(sane(n)&&n>=0)total+=n;else missing++;});summary.stopRiskQuote=total;summary.stopRiskPct=sane(equity)&&equity>0?pct(total,equity):null;if(missing)push('stopBudget','STOP_RISK_INCOMPLETE',missing,0,'WARNING');if(summary.stopRiskPct!==null&&summary.stopRiskPct>limits.portfolioStopRiskPct)push('stopBudget','PORTFOLIO_STOP_RISK',summary.stopRiskPct,limits.portfolioStopRiskPct);}
 if(enabled.margin){positions.forEach(p=>{if(p.marginRatioPct!=null&&sane(num(p.marginRatioPct))&&num(p.marginRatioPct)<limits.marginRatioPct)push('margin','MARGIN_BUFFER_LOW',num(p.marginRatioPct),limits.marginRatioPct,'CRITICAL');});}
 if(enabled.integrity){if(!snapshot.asOf||!sane(Date.parse(snapshot.asOf))||Date.now()-Date.parse(snapshot.asOf)>60000||Date.parse(snapshot.asOf)>Date.now()+5000)push('integrity','PORTFOLIO_SNAPSHOT_STALE',null,60,'CRITICAL');if(snapshot.reconciled!==true)push('integrity','POSITIONS_UNRECONCILED',null,null,'CRITICAL');}
 for(const module of ['correlation','stress'])if(enabled[module])push(module,module.toUpperCase()+'_DATA_NOT_READY',null,null,'WARNING');
 const urgent=alerts.some(a=>a.severity==='CRITICAL'),excess=alerts.some(a=>/LIMIT|CONCENTRATION|PORTFOLIO_STOP_RISK|MARGIN_BUFFER/.test(a.code));
 return{schema:'risk.r2.snapshot/1.0',status:urgent?'CRITICAL':excess?'BREACH':alerts.length?'PARTIAL':'OK',
  summary,alerts,policy:{blockAdditionalRisk:urgent||excess,autoLiquidation:false},executable:false,
  supervisor:{notify:urgent||excess,alertCount:alerts.length,highestSeverity:urgent?'CRITICAL':excess?'HIGH':'NONE',onDemandDetails:true}};
}
module.exports={evaluate,MODULES};
