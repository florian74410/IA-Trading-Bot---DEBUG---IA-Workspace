'use strict';
/* Isolated security regression: Auth21 business writes remain unavailable
 * until Core issues action-bound capabilities and Router verifies them.
 * Does not start services or access live data. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {active,decision}=require('../../Core/Clients/auth21_service_boundary');
const root=path.resolve(__dirname,'../..');
const gateway=fs.readFileSync(path.join(root,'UI/Gateway/ui_service.js'),'utf8');
const router=fs.readFileSync(path.join(root,'Core/Router/router.js'),'utf8');
const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_DEBUG_MODE:'1'};
test('Auth21 isolated trial intercepts communication write and never forwards by default',()=>{
 assert.equal(active(env),true);
 for(const service of ['gateway','router']){
  const result=decision(env,service,'POST','/communication/v1/ui/write');
  assert.equal(result.intercept,true);
  assert.equal(result.forwardToCore,false);
 }
});
test('legacy mode does not silently enable isolated Auth21',()=>{
 assert.equal(active({...env,IATB_DEBUG_MODE:'0'}),false);
 assert.equal(decision({},'router','POST','/communication/v1/ui/write').intercept,false);
});
test('Gateway and Router have separate fail-closed write gates',()=>{
 assert.match(gateway,/AUTH21_BUSINESS_WRITE_NOT_AUTHORIZED/);
 assert.match(router,/AUTH21_BUSINESS_WRITE_PROOF_REQUIRED/);
 assert.match(gateway,/auth21_service_boundary'\)\.active\(process\.env\)/);
 assert.match(router,/auth21_service_boundary'\)\.active\(process\.env\)/);
});
test('no business write route is approved by the Auth21 isolated policy',()=>{
 for(const method of ['GET','POST','PUT','PATCH','DELETE']){
  for(const service of ['gateway','router']){
   const result=decision(env,service,method,'/communication/v1/ui/write');
   assert.equal(result.intercept,true);
   assert.notEqual(result.forwardToCore,true);
  }
 }
});
