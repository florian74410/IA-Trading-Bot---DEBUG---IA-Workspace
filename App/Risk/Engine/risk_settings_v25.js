'use strict';
// Centralized whitelist for Auth21 ADMIN settings. RiskGate remains a separate safety barrier.
const LEVELS=['conservative','balanced','active','aggressive'];
const R1=['capital','stopLoss','riskBudget','resize'];
const R2=['equity','drawdown','exposure','correlation','margin','stress','stopBudget','integrity'];
const DEFAULT={enabled:true,r1:{enabled:true,level:'balanced',modules:{capital:true,stopLoss:true,riskBudget:true,resize:true}},r2:{enabled:true,modules:{equity:true,drawdown:true,exposure:true,correlation:false,margin:true,stress:false,stopBudget:true,integrity:true},limits:{drawdownPct:15,assetExposurePct:40,portfolioStopRiskPct:5,marginRatioPct:130}}};
const LEVEL_LIMITS={
 conservative:{drawdownPct:8,assetExposurePct:25,portfolioStopRiskPct:2,marginRatioPct:170},
 balanced:{drawdownPct:15,assetExposurePct:40,portfolioStopRiskPct:5,marginRatioPct:130},
 active:{drawdownPct:20,assetExposurePct:55,portfolioStopRiskPct:8,marginRatioPct:120},
 aggressive:{drawdownPct:25,assetExposurePct:65,portfolioStopRiskPct:12,marginRatioPct:110}
};
const clone=x=>JSON.parse(JSON.stringify(x));
function safe(x){return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}
function merge(raw){const data=safe(raw),o=clone(DEFAULT);
 o.enabled=typeof data.enabled==='boolean'?data.enabled:o.enabled;
 for(const key of ['r1','r2']){const d=safe(data[key]);if(typeof d.enabled==='boolean')o[key].enabled=d.enabled;
 const modules=safe(d.modules);for(const m of Object.keys(o[key].modules))if(typeof modules[m]==='boolean')o[key].modules[m]=modules[m];
 if(key==='r1'&&LEVELS.includes(d.level))o.r1.level=d.level;
 if(key==='r2'){const limits=safe(d.limits);for(const k of Object.keys(o.r2.limits)){const n=Number(limits[k]);if(limits[k]!==undefined&&Number.isFinite(n)&&n>0&&n<=1000)o.r2.limits[k]=n;}}}
 return o;
}
function apply(current,patch){const prior=safe(current),p=safe(patch),o=Object.assign({},prior);
 const next=merge(prior);if(typeof p.enabled==='boolean')next.enabled=p.enabled;
 for(const key of ['r1','r2']){const d=safe(p[key]);if(typeof d.enabled==='boolean')next[key].enabled=d.enabled;
 if(key==='r1'&&LEVELS.includes(d.level)&&d.level!==next.r1.level){next.r1.level=d.level;next.r2.limits=clone(LEVEL_LIMITS[d.level]);}
 const modules=safe(d.modules);for(const m of Object.keys(next[key].modules))if(typeof modules[m]==='boolean')next[key].modules[m]=modules[m];
 if(key==='r2'){const lim=safe(d.limits);for(const k of Object.keys(next.r2.limits)){const n=Number(lim[k]);if(lim[k]!==undefined&&Number.isFinite(n)&&n>0&&n<=1000)next.r2.limits[k]=n;}}}
 return Object.assign(o,next);
}
module.exports={DEFAULT,merge,apply,LEVELS,LEVEL_LIMITS,R1,R2};
