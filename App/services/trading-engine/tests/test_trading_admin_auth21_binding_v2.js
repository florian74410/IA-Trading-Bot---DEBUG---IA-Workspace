'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {proofCodec}=require('../../../Core/Clients/auth21_ipc_proof');
const {authorizeInterprocess,issueAuthorizedProof}=require('../../../Core/Clients/auth21_rbac_guard');
const {TradingAdminController}=require('../trading_admin_controller_v2');
const {AdminCommandLedger}=require('../trading_admin_ledger_v2');
const CP=require('../../../Core/Communication/communication_protocol_v1');
(async()=>{
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-p3-integration-'));
try {
 const secret=Buffer.alloc(32,7), now=()=>Date.now();
 const issuer=proofCodec({secret,now}), receiver=proofCodec({secret,now});
 const sessions={verifySession:(token)=>token==='admin-session'?{clientId:'CLadmin01',role:'ADMIN'}:{clientId:'CLuser01',role:'USER'}};
 const payload={command:'EMERGENCY_STOP',command_id:'unique-command-0001',timestamp:now(),confirmed:true};
 const digest=CP.hashData(payload), ledger=new AdminCommandLedger({file:path.join(dir,'admin.db')});
 const proof=issueAuthorizedProof({sessions,token:'admin-session',codec:issuer,audience:'trading',operation:'admin.write',method:'POST',action:'trading.admin.command',bodyDigest:digest});
 assert.equal(issueAuthorizedProof({sessions,token:'user-session',codec:issuer,audience:'trading',operation:'admin.write',method:'POST',action:'trading.admin.command',bodyDigest:digest}),null);
 const verifier=async ({proof,payload})=>{const access=authorizeInterprocess({codec:receiver,proof,audience:'trading',operation:'admin.write',method:'POST',action:'trading.admin.command',bodyDigest:CP.hashData(payload)});return access.allowed?{verified:true,role:access.role,subject:access.clientId}:null;};
 const lifecycle={file:path.join(dir,'runtime.json'),snapshot:()=>({state:'STOPPED'})};
 const ctrl=new TradingAdminController({lifecycle,ledger,verifyPrincipal:verifier,now});
 assert.equal((await ctrl.command(payload,{proof,payload})).error,'COMMAND_IMPLEMENTATION_PENDING');
 assert.equal((await ctrl.command(payload,{proof,payload})).error,'ADMIN_PERMISSION_DENIED','proof itself cannot be replayed');
 const newProof=issueAuthorizedProof({sessions,token:'admin-session',codec:issuer,audience:'trading',operation:'admin.write',method:'POST',action:'trading.admin.command',bodyDigest:digest});
 assert.equal((await ctrl.command(payload,{proof:newProof,payload})).error,'ADMIN_COMMAND_REPLAY','command id persisted');
 ledger.close();
 console.log('PASS Auth21 signed ADMIN proof, role rejection, replay and ledger');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
