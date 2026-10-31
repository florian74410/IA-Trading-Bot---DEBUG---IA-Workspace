'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const secret=Buffer.alloc(32,7);
const principal={clientId:'CL000001',role:'USER'};
const scope={audience:'router',operation:'self.read',method:'GET',ownerClientId:'CL000001'};
test('proof is valid once for exact scoped operation; rejects replay',()=>{
 let clock=100000;const c=proofCodec({secret,now:()=>clock});
 const p=c.issue({principal,...scope});
 assert.deepEqual(c.verify(p,scope),{clientId:'CL000001',role:'USER',ownerClientId:'CL000001'});
 assert.equal(c.verify(p,scope),null);
});
test('inter-process proof rejects forged audience, method, owner and expired token',()=>{
 let clock=100000;const c=proofCodec({secret,now:()=>clock});
 const p=c.issue({principal,...scope});
 for(const change of [{audience:'trading'},{method:'POST'},{operation:'admin.write'},{ownerClientId:'CL000002'}])
  assert.equal(c.verify(p,{...scope,...change}),null);
 const tampered=p.slice(0,-1)+(p.endsWith('A')?'B':'A');
 assert.equal(c.verify(tampered,scope),null);
 clock+=30000;assert.equal(c.verify(p,scope),null);
});
test('different process key never authenticates and invalid payload fails closed',()=>{
 const issuer=proofCodec({secret}),receiver=proofCodec({secret:Buffer.alloc(32,8)});
 const p=issuer.issue({principal,...scope});
 assert.equal(receiver.verify(p,scope),null);
 for(const v of ['',{},'malformed.token','x'.repeat(2000)])assert.equal(receiver.verify(v,scope),null);
});

test('Router/Engine role enforcement uses signed proof, never claimed browser role',()=>{
 const {authorizeInterprocess}=require('../../Core/Clients/auth21_rbac_guard');
 const codec=proofCodec({secret});
 const p=codec.issue({principal,...scope});
 assert.equal(authorizeInterprocess({codec,proof:p,...scope}).allowed,true);
 const admin=codec.issue({principal:{clientId:'CL000002',role:'ADMIN'},audience:'risk',operation:'admin.write',method:'POST'});
 assert.equal(authorizeInterprocess({codec,proof:admin,audience:'risk',operation:'admin.write',method:'POST'}).allowed,true);
 const guest=codec.issue({principal:{clientId:'CL000003',role:'GUEST'},audience:'portfolio',operation:'self.write',method:'POST',ownerClientId:'CL000003'});
 assert.equal(authorizeInterprocess({codec,proof:guest,audience:'portfolio',operation:'self.write',method:'POST',ownerClientId:'CL000003'}).allowed,false);
 const spoof=codec.issue({principal, audience:'trading',operation:'trade.live',method:'POST'});
 assert.equal(authorizeInterprocess({codec,proof:spoof,audience:'trading',operation:'trade.live',method:'POST'}).allowed,false);
});

test('Core issues scoped proof only from verified server session and permitted owner',()=>{
 const {issueAuthorizedProof,authorizeInterprocess}=require('../../Core/Clients/auth21_rbac_guard');
 const codec=proofCodec({secret});
 const sessions={verifySession:t=>t==='valid'?{clientId:'CL000001',role:'USER'}:null};
 assert.equal(issueAuthorizedProof({sessions,token:'forged',codec,...scope}),null);
 assert.equal(issueAuthorizedProof({sessions,token:'valid',codec,...scope,ownerClientId:'CL000009'}),null);
 assert.equal(issueAuthorizedProof({sessions,token:'valid',codec,audience:'trading',operation:'admin.write',method:'POST'}),null);
 const proof=issueAuthorizedProof({sessions,token:'valid',codec,...scope});
 assert.equal(authorizeInterprocess({codec,proof,...scope}).allowed,true);
});
