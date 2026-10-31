'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const cfg=require('../Engine/risk_settings_v25');
test('Risk v2.5 policy is restrictive and separates R1/R2',()=>{
 const x=cfg.merge({});
 assert.equal(x.enabled,true);assert.equal(x.r1.level,'balanced');assert.equal(x.r2.enabled,true);
 assert.equal(x.r2.modules.correlation,false);assert.equal(x.r2.modules.stress,false);
});
test('Risk level changes R1 and R2 presets without modifying Risk Gate threshold',()=>{
 const x=cfg.apply({thresholds:{leverageWarning:5}},{r1:{level:'conservative',modules:{capital:false}},r2:{modules:{drawdown:false}}});
 assert.equal(x.r1.level,'conservative');
 assert.equal(x.r1.modules.capital,false);assert.equal(x.r2.modules.drawdown,false);
 assert.equal(x.r2.limits.portfolioStopRiskPct,2);
 assert.equal(x.thresholds.leverageWarning,5);
});
test('Unrecognized keys and invalid risk limits cannot broaden policy',()=>{
 const x=cfg.apply({}, {r1:{modules:{other:true},level:'unlimited'},r2:{limits:{portfolioStopRiskPct:-1,assetExposurePct:90000},modules:{bogus:true}},enabled:'yes',admin:true});
 assert.equal(x.enabled,true);assert.equal(x.admin,undefined);assert.equal(x.r1.level,'balanced');
 assert.equal(x.r2.limits.portfolioStopRiskPct,5);assert.equal(x.r2.limits.assetExposurePct,40);
 assert.equal(x.r1.modules.other,undefined);assert.equal(x.r2.modules.bogus,undefined);
});
test('Risk settings routes are ADMIN-only; UI does not use blocked CP1 UI writes',()=>{
 const root=path.resolve(__dirname,'../..');
 const src=fs.readFileSync(path.join(root,'Core/Clients/UserManagement/admin_routes.js'),'utf8');
 assert.match(src,/GET \/api\/admin\/risk\/settings/);
 assert.match(src,/POST \/api\/admin\/risk\/settings/);
 const ui=fs.readFileSync(path.join(root,'Frontend/JS/settings.js'),'utf8');
 assert.match(ui,/api\/admin\/risk\/settings/);
 assert.doesNotMatch(ui,/cpWrite\('risk','risk.settings.set'/);
});
