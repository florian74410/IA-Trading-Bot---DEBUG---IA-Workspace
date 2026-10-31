'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {AdminCommandLedger}=require('../trading_admin_ledger_v2');
const {TradingAdminController}=require('../trading_admin_controller_v2');
const {TradingFirewall,defaults}=require('../../../Core/Firewall/Protection/trading_firewall');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-admin-p3-'));
 try{
  const file=path.join(dir,'admin.sqlite'),identity={verified:true,role:'ADMIN',subject:'admin-1'};
  let ledger=new AdminCommandLedger({file,now:()=>100000});
  const controller=new TradingAdminController({lifecycle:{file:path.join(dir,'runtime.json'),snapshot:()=>({state:'STOPPED'})},ledger,verifyPrincipal:async()=>identity,now:()=>100000});
  const cmd={command:'START',command_id:'admin-command-test-001',timestamp:100000,confirmed:true};
  assert.equal((await controller.command(cmd)).error,'COMMAND_IMPLEMENTATION_PENDING');
  assert.equal((await controller.command(cmd)).error,'ADMIN_COMMAND_REPLAY');
  ledger.close();
  ledger=new AdminCommandLedger({file,now:()=>100100});
  assert.equal(ledger.record({command_id:cmd.command_id,command:'START',actor:'admin-1',fingerprint:'same',decision:'PENDING'}).error,'ADMIN_COMMAND_REPLAY');
  ledger.close();
  const firewall=new TradingFirewall({getConfig:()=>({...defaults(),mode:'OBSERVATION'}),audit:()=>{}});
  const response=firewall.inspect({action:'trading.admin.command',request_id:'test-request',timestamp:Date.now(),arguments:{command:'START'}},{cpAuthenticated:true,signatureValid:true});
  assert.equal(response.ok,false);
  assert.equal(response.code,'ADMIN_AUTH21_BOUND_CAPABILITY_REQUIRED');
  console.log('PASS ADMIN ledger persistence and Firewall fail-closed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
