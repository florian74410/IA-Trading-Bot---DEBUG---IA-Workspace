'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {loadTradingAdminKey}=require('../../../Core/Clients/auth21_trading_key_provider');
const {proofCodec}=require('../../../Core/Clients/auth21_ipc_proof');
const {issueTradingAdminProof}=require('../../../Core/Clients/auth21_trading_admin_issuer');
const {authorizeInterprocess}=require('../../../Core/Clients/auth21_rbac_guard');
const CP=require('../../../Core/Communication/communication_protocol_v1');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-p31-p32-'));
try{
 const file=path.join(dir,'auth21_trading.key'),env={IATB_AUTH21_TRADING_IPC_KEY_FILE:file};
 assert.throws(()=>loadTradingAdminKey({env}),/ENOENT/);
 fs.writeFileSync(file,Buffer.alloc(32,19),{mode:0o600});
 assert.equal(loadTradingAdminKey({env}).length,32);
 fs.chmodSync(file,0o644);
 assert.throws(()=>loadTradingAdminKey({env}),/UNSAFE/);
 fs.chmodSync(file,0o600);
 const secret=loadTradingAdminKey({env}),issuer=proofCodec({secret}),receiver=proofCodec({secret});
 const sessions={verifySession:token=>token==='admin'?{clientId:'CLadmin01',role:'ADMIN'}:token==='user'?{clientId:'CLuser01',role:'USER'}:null};
 const payload={command:'EMERGENCY_STOP',command_id:'unique-command-test-01',timestamp:Date.now(),confirmed:true};
 assert.equal(issueTradingAdminProof({sessions,token:'user',codec:issuer,payload}),null);
 assert.equal(issueTradingAdminProof({sessions,token:'admin',codec:issuer,payload:{...payload,confirmed:false}}),null);
 const proof=issueTradingAdminProof({sessions,token:'admin',codec:issuer,payload});
 assert.ok(proof);
 const args={codec:receiver,proof,audience:'trading',operation:'admin.write',method:'POST',ownerClientId:null,action:'trading.admin.command',bodyDigest:CP.hashData(payload)};
 assert.equal(authorizeInterprocess(args).allowed,true);
 assert.equal(authorizeInterprocess(args).allowed,false,'proof replay rejected');
 assert.equal(authorizeInterprocess({...args,bodyDigest:CP.hashData({...payload,command:'START'})}).allowed,false);
 console.log('PASS P3.1/P3.2 Core issuer + provisioned key + replay checks');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
