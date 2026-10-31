'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluate,REQUIRED}=require('../CI/auth21_phase2_readiness');
test('phase 2 cannot be declared complete based on fixture CI alone',()=>{
 const report=evaluate({
  sqliteMigrationFixture:{pass:true,artifact:'https://github.com/florian74410/IA-Trading-Bot/actions/runs/38652358697'},
  argon2Node22:{pass:true,artifact:'https://github.com/florian74410/IA-Trading-Bot/actions/runs/38652358659'},
  lastAdminDbGuard:{pass:true,artifact:'https://github.com/florian74410/IA-Trading-Bot/actions/runs/38652358659'}
 });
 assert.equal(report.ready,false);
 assert.ok(report.missing.includes('interserviceQuiesce'));
 assert.ok(report.missing.includes('gen1Argon2Calibration'));
 assert.equal(report.deployAllowed,false);
});
test('missing, forged, invalid and partial evidence must fail closed',()=>{
 for(const e of [null,{},[],{interserviceQuiesce:{pass:true}},{
  interserviceQuiesce:{pass:true,artifact:'file:///tmp/fake.json'}
 }]){
  const report=evaluate(e);
  assert.equal(report.ready,false);
  assert.equal(report.deployAllowed,false);
 }
});
test('complete evidence shape alone does not authorize deployment',()=>{
 const complete=Object.fromEntries(REQUIRED.map((id,i)=>[id,{
  pass:true,artifact:'https://github.com/owner/repo/actions/runs/'+(i+1)
 }]));
 const report=evaluate(complete);
 assert.equal(report.ready,true);
 assert.equal(report.deployAllowed,false);
});
