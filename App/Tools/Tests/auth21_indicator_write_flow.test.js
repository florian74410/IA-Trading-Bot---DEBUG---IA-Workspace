'use strict';
/* Executable, in-memory Core -> Router -> Indicator trial. No live engine or data. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const business=require('../../Core/Clients/auth21_business_capability');
function setup(role='ADMIN'){
 const secret=Buffer.alloc(32,0x79),clock={time:1730000000000};
 const core=proofCodec({secret,now:()=>clock.time});
 const router=proofCodec({secret,now:()=>clock.time});
 const indicator=proofCodec({secret,now:()=>clock.time});
 const sessions={verifySession:token=>token==='SESSION_OK'?{clientId:'CLadmin1',role}:null};
 const stored={enabled:false,refreshMs:5000};
 function dispatch({token,action='indicator.settings.set',settings={enabled:true,refreshMs:10000},tamper=null}){
  // Core: validate the live session before issuing an engine-scoped proof.
  const proof=business.issue({sessions,token,codec:core,action});
  if(!proof)return {status:401,changed:false};
  // Router: validate capability before allowing a route to an engine.
  const routerDecision=business.verify({codec:router,proof,action:tamper||action});
  if(!routerDecision.allowed)return {status:403,changed:false};
  // Indicator: verify independently before changing even a fixture setting.
  const engineDecision=business.verify({codec:indicator,proof,action});
  if(!engineDecision.allowed)return {status:403,changed:false};
  if(action!=='indicator.settings.set')return {status:403,changed:false};
  if(!settings||typeof settings!=='object'||typeof settings.enabled!=='boolean'||
    !Number.isInteger(settings.refreshMs)||settings.refreshMs<1000||settings.refreshMs>60000)
    return {status:400,changed:false};
  Object.assign(stored,settings);
  return {status:200,changed:true};
 }
 return {dispatch,stored,clock,core,router,indicator,sessions};
}
test('ADMIN session writes a real in-memory Indicator fixture after two independent checks',()=>{
 const f=setup();
 assert.deepEqual(f.dispatch({token:'SESSION_OK'}),{status:200,changed:true});
 assert.deepEqual(f.stored,{enabled:true,refreshMs:10000});
});
test('missing session, USER and GUEST cannot change fixture',()=>{
 for(const role of ['ADMIN','USER','GUEST']){
  const f=setup(role);
  const r=f.dispatch({token:role==='ADMIN'?'INVALID':'SESSION_OK'});
  assert.notEqual(r.status,200);
  assert.equal(f.stored.enabled,false);
 }
});
test('Router refuses a capability for a different engine',()=>{
 const f=setup();
 const r=f.dispatch({token:'SESSION_OK',tamper:'marketdata.settings.set'});
 assert.equal(r.status,403);
 assert.equal(f.stored.enabled,false);
});
test('Router and engine each reject replay independently',()=>{
 const f=setup();
 const proof=business.issue({sessions:f.sessions,token:'SESSION_OK',codec:f.core,action:'indicator.settings.set'});
 for(const codec of [f.router,f.indicator]){
  assert.equal(business.verify({codec,proof,action:'indicator.settings.set'}).allowed,true);
  assert.equal(business.verify({codec,proof,action:'indicator.settings.set'}).allowed,false);
 }
});
test('invalid settings do not modify the fixture',()=>{
 const f=setup();
 assert.equal(f.dispatch({token:'SESSION_OK',settings:{enabled:true,refreshMs:-1}}).status,400);
 assert.equal(f.stored.enabled,false);
});
test('LIVE trading and wallet writes have no Core capability',()=>{
 const f=setup();
 for(const action of ['trading.order.place','wallet.transfer']){
  assert.equal(business.issue({sessions:f.sessions,token:'SESSION_OK',codec:f.core,action}),null);
 }
});
