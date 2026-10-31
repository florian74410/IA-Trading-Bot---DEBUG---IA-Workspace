'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const {createIpcBoundary}=require('../../Core/Clients/auth21_ipc_boundary');
const {issueAuthorizedProof}=require('../../Core/Clients/auth21_rbac_guard');
const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_DEBUG_MODE:'1'};
const codec=proofCodec({secret:Buffer.alloc(32,4)});
test('IPC verifier needs all DEBUG trial guards',()=>{
 for(const k of Object.keys(env)){const e={...env};delete e[k];assert.throws(()=>createIpcBoundary({env:e,codec,audience:'router'}),/AUTH21_IPC_TRIAL_REQUIRED/)}
});
test('Core-authorized capability is accepted once by exact receiver',()=>{
 const sessions={verifySession:t=>t==='valid'?{clientId:'CL000001',role:'USER'}:null};
 const scope={audience:'router',operation:'self.read',method:'GET',ownerClientId:'CL000001'};
 const proof=issueAuthorizedProof({sessions,token:'valid',codec,...scope});
 const verify=createIpcBoundary({env,codec,audience:'router'});
 const req={method:'GET',headers:{'x-iatb-auth21-proof':proof,'x-iatb-ui-role':'ADMIN'}};
 assert.equal(verify(req,scope).allowed,true);
 assert.equal(verify(req,scope).allowed,false);
});
test('IPC proof cannot authorize unknown trade or wrong owner',()=>{
 const sessions={verifySession:()=>({clientId:'CL000001',role:'ADMIN'})};
 const proof=issueAuthorizedProof({sessions,token:'valid',codec,audience:'portfolio',operation:'self.read',method:'GET',ownerClientId:'CL000001'});
 const verify=createIpcBoundary({env,codec,audience:'portfolio'});
 assert.equal(verify({method:'GET',headers:{'x-iatb-auth21-proof':proof}},{operation:'self.read',ownerClientId:'CL000002'}).allowed,false);
 assert.equal(verify({method:'GET',headers:{'x-iatb-auth21-proof':proof}},{operation:'trade.live'}).allowed,false);
});
