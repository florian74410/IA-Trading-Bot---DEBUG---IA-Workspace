'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const boundary=require('../../Core/Clients/auth21_service_boundary');
test('actual Gateway and Router reject unsupported upgrade requests',()=>{
 for(const file of ['../../UI/Gateway/ui_service.js','../../Core/Router/router.js']){
  const s=fs.readFileSync(path.resolve(__dirname,file),'utf8');
  assert.match(s,/server\.on\('upgrade',function\(req,socket\)/);
  assert.match(s,/socket\.destroy\(\)/);
  assert.match(s,/HTTP\/1\.1 403 Forbidden/);
 }
});
test('Auth21 isolated mode prevents legacy CP1 and WebSocket paths at both HTTP boundaries',()=>{
 const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_DEBUG_MODE:'1'};
 for(const service of ['gateway','router']){
  for(const [method,p] of [['POST','/communication/v1/request'],['POST','/communication/v1/ui/write'],['GET','/ws'],['GET','/socket.io/'],['POST','/api/trading/order']]){
   const d=boundary.decision(env,service,method,p);
   assert.equal(d.intercept,true,service+' '+p);
   assert.equal(d.forwardToCore,false);
  }
 }
});
