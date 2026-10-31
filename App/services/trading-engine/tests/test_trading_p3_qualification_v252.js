'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {preflightTradingAdminKey,loadTradingAdminKey}=require('../../../Core/Clients/auth21_trading_key_provider');
const {proofCodec}=require('../../../Core/Clients/auth21_ipc_proof');
const {issueTradingAdminProof}=require('../../../Core/Clients/auth21_trading_admin_issuer');
const {createVerifier}=require('../trading_auth21_admin_v2');
const {createProofReplayStore}=require('../../../Core/Clients/auth21_trading_replay_v2');
const {TradingAdminController}=require('../trading_admin_controller_v2');
const {AdminCommandLedger}=require('../trading_admin_ledger_v2');
const attest=require('../../../Core/Clients/auth21_trading_attestation');
test('P3 key preflight distinguishes path, absence, exact permissions, owner, symlinks and size without exposing bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-p3-preflight-')),file=path.join(root,'p3.key'),env={IATB_AUTH21_TRADING_IPC_KEY_FILE:file};
 try{
  assert.equal(preflightTradingAdminKey({env:{}}).state,'KEY_MISSING');
  assert.equal(preflightTradingAdminKey({env:{IATB_AUTH21_TRADING_IPC_KEY_FILE:'relative'}}).reason,'PATH_INVALID');
  assert.equal(preflightTradingAdminKey({env}).state,'KEY_MISSING');
  assert.equal(preflightTradingAdminKey({env:{IATB_AUTH21_TRADING_IPC_KEY_FILE:__filename}}).reason,'PATH_IN_REPOSITORY');
  const key=crypto.randomBytes(32);fs.writeFileSync(file,key,{mode:0o600});assert.equal(preflightTradingAdminKey({env}).ok,true);
  fs.chmodSync(file,0o400);assert.equal(preflightTradingAdminKey({env}).reason,'PERMISSIONS_INVALID');fs.chmodSync(file,0o600);
  fs.chmodSync(file,0o644);assert.equal(preflightTradingAdminKey({env}).reason,'PERMISSIONS_INVALID');fs.chmodSync(file,0o600);
  fs.writeFileSync(file,Buffer.alloc(31));assert.equal(preflightTradingAdminKey({env}).reason,'LENGTH_INVALID');fs.writeFileSync(file,key);
  const link=path.join(root,'link');fs.symlinkSync(file,link);assert.equal(preflightTradingAdminKey({env:{IATB_AUTH21_TRADING_IPC_KEY_FILE:link}}).reason,'SYMLINK_OR_TYPE_INVALID');
  assert.equal(preflightTradingAdminKey({env:{...env,IATB_AUTH21_TRADING_IPC_KEY_ROOT:path.join(root,'other')}}).reason,'PATH_NOT_AUTHORIZED');
  const uid=process.getuid;try{process.getuid=()=>uid()+1;assert.equal(preflightTradingAdminKey({env}).reason,'OWNER_INVALID');}finally{process.getuid=uid;}
  assert.ok(!JSON.stringify(preflightTradingAdminKey({env})).includes(key.toString('hex')));assert.equal(loadTradingAdminKey({env}).length,32);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('P3 proof integrity, expiry, roles, durable replay across restart and journal failure',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-p3-replay-')),file=path.join(root,'p3.key'),replayFile=path.join(root,'replay.db'),ledgerFile=path.join(root,'ledger.db');
 fs.writeFileSync(file,crypto.randomBytes(32),{mode:0o600});const env={IATB_AUTH21_TRADING_IPC_KEY_FILE:file};
 let store=createProofReplayStore({file:replayFile}),ledger=new AdminCommandLedger({file:ledgerFile});
 try{
  const sessions={verifySession:t=>t==='admin'?{role:'ADMIN',clientId:'CLadmin'}:t==='user'?{role:'USER',clientId:'CLuser'}:t==='guest'?{role:'GUEST',clientId:'CLguest'}:null};
  const issuer=proofCodec({secret:loadTradingAdminKey({env})}),payload={command:'STATUS',command_id:crypto.randomUUID(),timestamp:Date.now(),confirmed:true};
  for(const role of ['user','guest','expired'])assert.equal(issueTradingAdminProof({sessions,token:role,codec:issuer,payload}),null);
  const proof=issueTradingAdminProof({sessions,token:'admin',codec:issuer,payload}),verify=createVerifier({env,replayStore:store});
  assert.equal(await verify({payload:{...payload,command:'START'},proof}),null);
  assert.equal(await verify({payload,proof:proof.slice(0,-1)+(proof.endsWith('x')?'y':'x')}),null);
  const expired=proofCodec({secret:loadTradingAdminKey({env}),now:()=>Date.now()-40000}).issue({principal:sessions.verifySession('admin'),audience:'trading',operation:'admin.write',method:'POST',action:'trading.admin.command',bodyDigest:require('../../../Core/Communication/communication_protocol_v1').hashData(payload)});
  assert.equal(await verify({payload,proof:expired}),null);
  const lifecycle={file:path.join(root,'state'),snapshot:()=>({state:'STOPPED'})},controller=new TradingAdminController({lifecycle,ledger,verifyPrincipal:verify});
  assert.equal((await controller.command(payload,{payload,proof})).ok,true);
  store.close();store=createProofReplayStore({file:replayFile});const afterRestart=createVerifier({env,replayStore:store});
  assert.equal(await afterRestart({payload,proof}),null);
  const fresh=issueTradingAdminProof({sessions,token:'admin',codec:issuer,payload});const restarted=new TradingAdminController({lifecycle,ledger,verifyPrincipal:afterRestart});
  assert.equal((await restarted.command(payload,{payload,proof:fresh})).error,'ADMIN_COMMAND_REPLAY');
  ledger.close();ledger=null;const next={...payload,command_id:crypto.randomUUID(),timestamp:Date.now()},nextProof=issueTradingAdminProof({sessions,token:'admin',codec:issuer,payload:next});
  const broken=new TradingAdminController({lifecycle,ledger:{record(){throw Error('DISK_UNAVAILABLE')}},verifyPrincipal:afterRestart});
  assert.equal((await broken.command(next,{payload:next,proof:nextProof})).error,'ADMIN_LEDGER_UNAVAILABLE');
  const secret=loadTradingAdminKey({env}),body={ok:true},response={...body,p3Attestation:attest.sign(secret,'ENGINE',next,body)};
  assert.equal(attest.verify(secret,next,response),true);assert.equal(attest.verify(crypto.randomBytes(32),next,response),false);assert.equal(attest.verify(secret,next,{...response,ok:false}),false);
  assert.equal(lifecycle.snapshot().state,'STOPPED');
 }finally{store.close();if(ledger)ledger.close();fs.rmSync(root,{recursive:true,force:true})}
});
test('P3 configured dispatcher never confuses disabled or invalid configuration with READY',async()=>{
 const {createAuthenticatedDispatcher}=require('../../../Core/Clients/auth21_trading_admin_bridge');
 const sessions={verifySession:token=>token==='admin'?{clientId:'CLadmin',role:'ADMIN'}:{clientId:'CLuser',role:'USER'}},payload={command:'STATUS',command_id:crypto.randomUUID(),timestamp:Date.now(),confirmed:true};
 const disabled=createAuthenticatedDispatcher({sessions,env:{}});
 assert.equal((await disabled({token:'admin',payload})).body.bridge.state,'DISABLED');
 assert.equal((await disabled({token:'user',payload})).status,403);
 assert.equal((await disabled({token:'admin',payload:{...payload,role:'ADMIN'}})).status,400);
 assert.equal((await disabled({token:'admin',payload:{...payload,command:'START'}})).status,503);
 const missing=createAuthenticatedDispatcher({sessions,env:{IATB_AUTH21_TRADING_ADMIN_BRIDGE:'1'}});
 assert.equal((await missing({token:'admin',payload})).body.bridge.state,'KEY_MISSING');
 const rejected=createAuthenticatedDispatcher({sessions,env:{IATB_AUTH21_TRADING_ADMIN_REQUESTED:'1',IATB_AUTH21_TRADING_ADMIN_BRIDGE:'0'}});
 assert.equal((await rejected({token:'admin',payload})).body.bridge.state,'KEY_MISSING');
});
