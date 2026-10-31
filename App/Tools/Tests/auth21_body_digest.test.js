'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const business=require('../../Core/Clients/auth21_business_capability');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
test('Core issued action and exact HTTP body hash verified at Router and Engine',()=>{
 const secret=Buffer.alloc(32,0x35);
 const core=proofCodec({secret}),router=proofCodec({secret}),engine=proofCodec({secret});
 const sessions={verifySession:t=>t==='valid'?{clientId:'CLowner1',role:'ADMIN'}:null};
 const request=Buffer.from('{"enabled":true,"refreshMs":8000}');
 const digest=sha256(request);
 const proof=business.issue({sessions,token:'valid',codec:core,action:'indicator.settings.set',bodyDigest:digest});
 assert.equal(typeof proof,'string');
 assert.equal(business.verify({codec:router,proof,action:'indicator.settings.set',bodyDigest:sha256(Buffer.from('{"enabled":false,"refreshMs":8000}'))}).allowed,false);
 assert.equal(business.verify({codec:router,proof,action:'indicator.settings.set',bodyDigest:digest}).allowed,true);
 assert.equal(business.verify({codec:engine,proof,action:'indicator.settings.set',bodyDigest:digest}).allowed,true);
 assert.equal(business.verify({codec:engine,proof,action:'indicator.settings.set',bodyDigest:digest}).allowed,false);
});
test('body-digest mismatch and unauthorized principal fail closed',()=>{
 const secret=Buffer.alloc(32,0x36),codec=proofCodec({secret});
 const sessions={verifySession:t=>t==='admin'?{clientId:'CLowner1',role:'ADMIN'}:null};
 const digest=sha256(Buffer.from('payload'));
 assert.equal(business.issue({sessions,token:'guest',codec,action:'indicator.settings.set',bodyDigest:digest}),null);
 const proof=business.issue({sessions,token:'admin',codec,action:'indicator.settings.set',bodyDigest:digest});
 assert.equal(business.verify({codec:proofCodec({secret}),proof,action:'indicator.settings.set',bodyDigest:'0'.repeat(64)}).allowed,false);
});
