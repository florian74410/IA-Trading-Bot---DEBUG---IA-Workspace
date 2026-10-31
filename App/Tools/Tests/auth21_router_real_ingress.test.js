'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const {createEngineGuard}=require('../../Core/Clients/auth21_engine_guard');
const routerSource=fs.readFileSync(path.join(__dirname,'../../Core/Router/router.js'),'utf8');
const secret=Buffer.alloc(32,0x46),env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_DEBUG_MODE:'1'};
test('real Router code wires guarded endpoint before isolated default deny',()=>{
 const endpoint=routerSource.indexOf("p==='/auth21/ipc/router-read'");
 const deny=routerSource.indexOf("if(auth21Boundary.intercept)return sendJson(res,404");
 assert.ok(endpoint>0&&deny>endpoint);
 assert.match(routerSource,/createRouterRead\(\{env:process\.env,root:process\.env\.IATB_AUTH21_LOCAL_TRIAL_ROOT\}\)/);
});
test('router scoped exact proof works; other service and write proofs denied',()=>{
 const gate=createEngineGuard({env,codec:proofCodec({secret}),engine:'router'});
 const issuer=proofCodec({secret});
 const principal={clientId:'CLtest1',role:'USER'};
 const proof=issuer.issue({principal,audience:'router',operation:'shared.read',method:'GET',action:'router.read'});
 assert.equal(gate({proof,action:'router.read',method:'GET'}).allowed,true);
 assert.equal(gate({proof,action:'router.read',method:'GET'}).allowed,false);
 const other=issuer.issue({principal,audience:'indicator',operation:'shared.read',method:'GET',action:'indicator.read'});
 assert.equal(gate({proof:other,action:'router.read',method:'GET'}).allowed,false);
 assert.equal(gate({proof,action:'router.write',method:'POST'}).allowed,false);
});
