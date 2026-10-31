'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const {createCoreBusinessIssuer}=require('../../Core/Clients/auth21_core_business_issuer');
const {verify}=require('../../Core/Clients/auth21_business_capability');
const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_DEBUG_MODE:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1'};
function trial(role='ADMIN'){
 const secret=Buffer.alloc(32,0x55),codec=proofCodec({secret});
 const sessions={verifySession:t=>t==='valid'?{clientId:'CLtesting1',role}:null};
 return {codec,sessions,issuer:createCoreBusinessIssuer({sessions,codec,env})};
}
test('isolated Core issues Indicator proof from verified ADMIN session',()=>{
 const t=trial();
 const proof=t.issuer.issueForService({token:'valid',action:'indicator.settings.set'});
 assert.equal(typeof proof,'string');
 const receiver=proofCodec({secret:Buffer.alloc(32,0x55)});
 assert.equal(verify({codec:receiver,proof,action:'indicator.settings.set'}).allowed,true);
});
test('unverified users and dangerous or unknown actions never receive proof',()=>{
 for(const role of ['USER','GUEST']){
  const t=trial(role);
  assert.equal(t.issuer.issueForService({token:'valid',action:'indicator.settings.set'}),null);
 }
 const t=trial();
 for(const action of ['trading.order.place','wallet.transfer','__proto__','fundamental.feed.delete'])
  assert.equal(t.issuer.issueForService({token:'valid',action}),null);
 assert.equal(t.issuer.issueForService({token:'bad',action:'indicator.settings.set'}),null);
 for(const action of ['marketdata.settings.set','fundamental.feed.create'])
  assert.equal(typeof t.issuer.issueForService({token:'valid',action}),'string');
});
test('Core issuer refuses non-isolated contexts',()=>{
 const {codec,sessions}=trial();
 for(const key of Object.keys(env))
  assert.throws(()=>createCoreBusinessIssuer({codec,sessions,env:{...env,[key]:'0'}}),/ISOLATION_REQUIRED/);
});
