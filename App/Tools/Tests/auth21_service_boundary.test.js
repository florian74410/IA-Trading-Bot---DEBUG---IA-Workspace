'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decision,active}=require('../../Core/Clients/auth21_service_boundary');
const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_DEBUG_MODE:'1'};
test('trial boundary cannot be activated by partial flags',()=>{
 for(const key of Object.keys(env)){
  const v={...env};delete v[key];
  assert.equal(active(v),false);
  assert.equal(decision(v,'router','POST','/communication/v1/ui/write').intercept,false);
 }
});
test('Gateway forwards only Auth21 routes and denies legacy pages and API',()=>{
 assert.deepEqual(decision(env,'gateway','POST','/auth21/login'),{intercept:true,forwardToCore:true});
 for(const p of ['/api/bootstrap','/api/admin','/firewall-admin/edit','/communication/v1/ui/write','/bank/keys','/assets/hack.js']){
  assert.deepEqual(decision(env,'gateway','POST',p),{intercept:true,forwardToCore:false});
 }
});
test('Router denies CP1, market data and fallback-to-Core in isolated mode',()=>{
 for(const p of ['/communication/v1/ui/read','/communication/v1/ui/write','/communication/v1/request','/router-health','/market-data/candles','/api/bootstrap','/']){
  assert.deepEqual(decision(env,'router','GET',p),{intercept:true,forwardToCore:false});
 }
});
test('Engine direct HTTP paths default deny in isolated mode',()=>{
 for(const p of ['/health','/orders','/open-trades','/api/positions','/cp/v1']){
  assert.deepEqual(decision(env,'engine','POST',p),{intercept:true,forwardToCore:false});
 }
});

test('real service HTTP entrypoints invoke the isolated boundary before legacy handlers',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const specs=[
 ['../../UI/Gateway/ui_service.js',"decision(process.env,'gateway'"],
 ['../../Core/Router/router.js',"decision(process.env,'router'"],
 ['../../services/trading-engine/trading_service.js',"decision(process.env,'engine'"],
 ['../../Portfolio/Engine/portfolio_service.js',"decision(process.env,'engine'"],
 ['../../Risk/Engine/risk_service.js',"decision(process.env,'engine'"]
 ];
 for(const [relative,proof] of specs){
  const source=fs.readFileSync(path.resolve(__dirname,relative),'utf8');
  const gate=source.indexOf(proof),server=source.indexOf('createServer(');
  if(relative.includes('Gateway/')){
   const handler=source.indexOf('var handler=function(req,res){');
   assert.ok(handler>=0&&gate>handler&&server>gate,relative);
  }else assert.ok(gate>server&&server>=0,relative);
 }
});

test('gateway method allowlist never forwards writes as reads or unknown operations',()=>{
 for(const [method,path] of [['GET','/auth21/login'],['POST','/auth21/me'],['GET','/auth21/logout'],['POST','/auth21/preferences'],['PATCH','/auth21/preferences'],['DELETE','/auth21/login']]){
  assert.deepEqual(decision(env,'gateway',method,path),{intercept:true,forwardToCore:false});
 }
 for(const [method,path] of [['GET','/auth21/me'],['GET','/auth21/preferences'],['PUT','/auth21/preferences'],['DELETE','/auth21/preferences'],['POST','/auth21/unlock']]){
  assert.deepEqual(decision(env,'gateway',method,path),{intercept:true,forwardToCore:true});
 }
});
