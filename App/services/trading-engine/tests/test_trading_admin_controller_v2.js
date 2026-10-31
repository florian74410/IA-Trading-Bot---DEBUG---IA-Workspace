'use strict';
const assert=require('node:assert/strict');
const {TradingAdminController}=require('../trading_admin_controller_v2');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {AdminCommandLedger}=require('../trading_admin_ledger_v2');
const lifecycle={file:'/tmp/unused-trading-state',snapshot:()=>({state:'STOPPED'})};
(async()=>{
 const locked=new TradingAdminController({lifecycle});
 assert.equal((await locked.command({command:'START'},{role:'ADMIN'})).error,'AUTH21_ADMIN_VERIFIER_NOT_CONFIGURED');
 const no=new TradingAdminController({lifecycle,verifyPrincipal:()=>({verified:false,role:'ADMIN',subject:'x'})});
 assert.equal((await no.command({command:'STATUS'})).error,'ADMIN_PERMISSION_DENIED');
 const yes=new TradingAdminController({lifecycle,verifyPrincipal:()=>({verified:true,role:'ADMIN',subject:'admin'}),now:()=>100000});
 assert.equal((await yes.command({command:'STATUS'})).error,'COMMAND_ID_INVALID');
 assert.equal((await yes.command({command:'EMERGENCY_STOP',command_id:'unique-test-command-01',confirmed:true,timestamp:100000})).error,'ADMIN_LEDGER_NOT_CONFIGURED');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-admin-controller-'));
 const ledger=new AdminCommandLedger({file:path.join(dir,'ledger.db')});
 try{const guarded=new TradingAdminController({lifecycle,ledger,verifyPrincipal:()=>({verified:true,role:'ADMIN',subject:'admin'}),now:()=>100000});
 assert.equal((await guarded.command({command:'EMERGENCY_STOP',command_id:'unique-test-command-02',confirmed:true,timestamp:100000})).error,'COMMAND_IMPLEMENTATION_PENDING');
 }finally{ledger.close();fs.rmSync(dir,{recursive:true,force:true});}
 assert.equal(lifecycle.snapshot().state,'STOPPED');
 console.log('PASS P3 ADMIN fail-closed controller');
})().catch(e=>{console.error(e);process.exitCode=1;});
