'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const {ENGINES,createEngineGuard,digest}=require('../../Core/Clients/auth21_engine_guard');
const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_DEBUG_MODE:'1'};
test('all twelve declared service boundaries accept only their own signed read proof',()=>{
 assert.equal(ENGINES.length,12);
 const secret=crypto.randomBytes(32);
 for(const engine of ENGINES){
  const issuer=proofCodec({secret}),codec=proofCodec({secret});
  const gate=createEngineGuard({env,codec,engine});
  const action=engine+'.read';
  const proof=issuer.issue({principal:{clientId:'CLfixture1',role:'USER'},
   audience:engine,operation:'shared.read',method:'GET',action});
  assert.equal(gate({proof,action,method:'GET'}).allowed,true,engine);
  assert.equal(gate({proof,action,method:'GET'}).allowed,false,engine+' replay');
  const another=issuer.issue({principal:{clientId:'CLfixture1',role:'USER'},
   audience:engine,operation:'shared.read',method:'GET',action});
  assert.equal(gate({proof:another,action:engine+'.write',method:'POST'}).allowed,false);
  assert.equal(gate({proof:another,action,method:'POST'}).allowed,false);
  assert.equal(gate({proof:another,action,method:'GET',rawBody:Buffer.from('tampered')}).allowed,false);
 }
});
test('unknown engine, non-debug mode and unsigned requests fail closed',()=>{
 const secret=crypto.randomBytes(32),codec=proofCodec({secret});
 assert.throws(()=>createEngineGuard({env,codec,engine:'wallet'}),/CONFIG_REQUIRED/);
 assert.throws(()=>createEngineGuard({env:{...env,IATB_DEBUG_MODE:'0'},codec,engine:'risk'}),/CONFIG_REQUIRED/);
 assert.equal(createEngineGuard({env,codec,engine:'risk'})({action:'risk.read',method:'GET'}).allowed,false);
});
test('cryptographic request digests are binary exact',()=>{
 assert.equal(digest(Buffer.from('a')),crypto.createHash('sha256').update('a').digest('hex'));
 assert.notEqual(digest(Buffer.from('a')),digest(Buffer.from('a ')));
 assert.throws(()=>digest('a'),/RAW_BODY_REQUIRED/);
});
