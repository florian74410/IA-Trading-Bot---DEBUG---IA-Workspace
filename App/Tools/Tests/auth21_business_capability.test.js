'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const business=require('../../Core/Clients/auth21_business_capability');
const secret=Buffer.alloc(32,0x42);
function fixture(role='ADMIN',clientId='CLAlice'){
 let now=1730000000000;
 const codec=proofCodec({secret,now:()=>now,replayWindowMs:30000});
 const sessions={verifySession:t=>t==='valid'?{clientId,role}:null};
 return {codec,sessions,advance:ms=>{now+=ms}};
}
test('unknown and trading actions fail closed',()=>{
 const f=fixture();
 for(const action of ['trading.order.place','wallet.transfer','fundamental.feed.delete','__proto__','constructor','']){
  assert.equal(business.issue({...f,token:'valid',action}),null);
  assert.equal(business.verify({codec:f.codec,proof:'bogus',action}).allowed,false);
 }
});
test('admin write requires live verified session and a matching engine',()=>{
 const f=fixture();
 assert.equal(business.issue({...f,token:'invalid',action:'indicator.settings.set'}),null);
 const proof=business.issue({...f,token:'valid',action:'indicator.settings.set'});
 assert.equal(typeof proof,'string');
 assert.equal(business.verify({codec:f.codec,proof,action:'marketdata.settings.set'}).allowed,false);
 assert.equal(business.verify({codec:f.codec,proof,action:'indicator.settings.set'}).allowed,true);
 assert.equal(business.verify({codec:f.codec,proof,action:'indicator.settings.set'}).allowed,false);
});
test('GUEST and USER cannot issue admin capabilities',()=>{
 for(const role of ['GUEST','USER']){
  const f=fixture(role);
  assert.equal(business.issue({...f,token:'valid',action:'indicator.settings.set'}),null);
 }
});
test('self capability enforces ownership and rejects tampering',()=>{
 const f=fixture('USER');
 assert.equal(business.issue({...f,token:'valid',action:'portfolio.preference.set',ownerClientId:'CLBob'}),null);
 const proof=business.issue({...f,token:'valid',action:'portfolio.preference.set',ownerClientId:'CLAlice'});
 assert.equal(typeof proof,'string');
 assert.equal(business.verify({codec:f.codec,proof,action:'portfolio.preference.set',ownerClientId:'CLBob'}).allowed,false);
 assert.equal(business.verify({codec:f.codec,proof,action:'portfolio.preference.set',ownerClientId:'CLAlice'}).allowed,true);
});
test('expired and forged proof rejected',()=>{
 const f=fixture();
 const proof=business.issue({...f,token:'valid',action:'fundamental.feed.create'});
 f.advance(30000);
 assert.equal(business.verify({codec:f.codec,proof,action:'fundamental.feed.create'}).allowed,false);
 const g=fixture();
 const other=proofCodec({secret:Buffer.alloc(32,0x24),now:()=>1730000000000});
 const forged=business.issue({sessions:g.sessions,token:'valid',codec:other,action:'fundamental.feed.create'});
 assert.equal(business.verify({codec:g.codec,proof:forged,action:'fundamental.feed.create'}).allowed,false);
});

test('same permission but different business action cannot reuse proof',()=>{
 const f=fixture();
 const proof=business.issue({...f,token:'valid',action:'indicator.settings.set'});
 assert.equal(business.verify({codec:f.codec,proof,action:'marketdata.settings.set'}).allowed,false);
 assert.equal(business.verify({codec:f.codec,proof,action:'indicator.settings.set'}).allowed,true);
 const p=business.issue({...f,token:'valid',action:'portfolio.preference.set',ownerClientId:'CLAlice'});
 assert.equal(business.verify({codec:f.codec,proof:p,action:'strategy.preference.set',ownerClientId:'CLAlice'}).allowed,false);
});
