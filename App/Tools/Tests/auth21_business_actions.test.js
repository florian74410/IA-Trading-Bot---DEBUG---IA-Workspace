'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {contract,validate,RULES}=require('../../Core/Clients/auth21_business_actions');
const business=require('../../Core/Clients/auth21_business_capability');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const crypto=require('node:crypto');
test('five actions have exact immutable destinations and input grammar',()=>{
 assert.equal(Object.keys(RULES).length,6);
 assert.equal(contract('/auth21/business/marketdata/metadata').method,'GET');
 for(const [route,spec] of Object.entries(RULES)){
  assert.ok(route.startsWith('/auth21/business/'));
  assert.equal(contract(route),spec);
  assert.equal(business.contract(spec.action)!==null,true);
  assert.equal(contract(route+'?clientId=CLBob'),null);
 }
 for(const name of ['/auth21/business/trading/order','/auth21/business/wallet/transfer','__proto__','constructor']){
  assert.equal(contract(name),null);
 }
 assert.equal(validate(contract('/auth21/business/marketdata/settings'),{refreshMs:3000}),true);
 assert.equal(validate(contract('/auth21/business/marketdata/settings'),{refreshMs:1}),false);
 assert.equal(validate(contract('/auth21/business/fundamental/feed'),{feedUrl:'https://example.org/rss.xml'}),true);
 assert.equal(validate(contract('/auth21/business/fundamental/feed'),{feedUrl:'http://internal.local/'}),false);
 for(const url of ['https://127.0.0.1/rss','https://localhost/rss',
  'https://metadata.internal/latest','https://example.local/rss',
  'https://169.254.169.254/latest','https://example.org:8443/rss'])
  assert.equal(validate(contract('/auth21/business/fundamental/feed'),{feedUrl:url}),false,url);
 assert.equal(validate(contract('/auth21/business/portfolio/preference'),
  {ownerClientId:'CLAlice',key:'chart.zoom',value:'5'}),true);
 assert.equal(validate(contract('/auth21/business/portfolio/preference'),
  {ownerClientId:'CL../malicious',key:'chart.zoom',value:'5'}),false);
});
test('Core capability permits only owner and admin actions with non-replayable exact payload',()=>{
 const secret=crypto.randomBytes(32),codec=proofCodec({secret});
 const sessions={verifySession:t=>t==='admin'?{clientId:'CLAlice',role:'ADMIN'}:
  t==='user'?{clientId:'CLBob',role:'USER'}:null};
 for(const action of ['indicator.settings.set','marketdata.settings.set','fundamental.feed.create'])
  assert.equal(business.issue({sessions,token:'user',codec,action}),null);
 const guest=proofCodec({secret:crypto.randomBytes(32)});
 const guestSessions={verifySession:t=>t==='guest'?{clientId:'CLGuest',role:'GUEST'}:null};
 const shared=business.issue({sessions:guestSessions,token:'guest',codec:guest,action:'marketdata.metadata.get'});
 assert.equal(typeof shared,'string');
 assert.equal(business.verify({codec:guest,proof:shared,action:'marketdata.metadata.get'}).allowed,true);
 for(const action of ['portfolio.preference.set','strategy.preference.set']){
  const raw=JSON.stringify({ownerClientId:'CLBob',key:'test',value:'yes'});
  const bodyDigest=crypto.createHash('sha256').update(raw).digest('hex');
  assert.equal(business.issue({sessions,token:'user',codec,action,
    ownerClientId:'CLAlice',bodyDigest}),null);
  const proof=business.issue({sessions,token:'user',codec,action,
    ownerClientId:'CLBob',bodyDigest});
  assert.equal(typeof proof,'string');
  assert.equal(business.verify({codec,proof,action,ownerClientId:'CLAlice',bodyDigest}).allowed,false);
  assert.equal(business.verify({codec,proof,action,ownerClientId:'CLBob',bodyDigest}).allowed,true);
  assert.equal(business.verify({codec,proof,action,ownerClientId:'CLBob',bodyDigest}).allowed,false);
 }
});
