'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {scan}=require('../CI/auth21_legacy_core_route_audit');
const {createIsolatedCoreGate}=require('../../Core/Clients/auth21_core_route_gate');
const source=fs.readFileSync(path.join(__dirname,'../../Core/Server/server.js'),'utf8');
test('every static Core legacy API has exactly one explicit deny-by-default migration class',()=>{
 const report=scan(source);
 assert.deepEqual(report.inventoryErrors,[],'only the nine explicitly retired update routes may disappear');
 assert.equal(report.routes.length,97);
 assert.deepEqual(report.unclassified,[]);
 assert.ok(report.groups['wallet-key-transfer-denied']>=10);
 assert.ok(report.groups.administration>=15);
 assert.ok(report.routes.every(r=>r.decision==='DENY_UNTIL_MIGRATED'));
});
test('every legacy Core route remains denied in Auth21 isolated handler, even with forged admin role',async()=>{
 const sessions={loginWithPassword:async()=>null,verifySession:()=>null,revokeSession:()=>false};
 const gate=createIsolatedCoreGate({sessions});
 const report=scan(source);
 for(const route of report.routes){
  let result=null;
  const req={method:route.method,url:route.path,headers:{'x-iatb-role':'ADMIN',
    'x-iatb-client-id':'CLvictim','authorization':'Bearer '+('A'.repeat(43))}};
  const res={writableEnded:false,writeHead(status){result=status;},end(){this.writableEnded=true;}};
  await gate(req,res);
  assert.equal(result,404,route.method+' '+route.path);
 }
});
