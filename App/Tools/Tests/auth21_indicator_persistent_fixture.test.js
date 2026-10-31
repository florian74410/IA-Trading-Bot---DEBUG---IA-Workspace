'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const {issue,verify}=require('../../Core/Clients/auth21_business_capability');
const {createWriter}=require('../../Core/Clients/auth21_indicator_fixture_writer');
function setup(t,role='ADMIN'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-fixture-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const secret=Buffer.alloc(32,0x47);
 const core=proofCodec({secret}),router=proofCodec({secret}),engine=proofCodec({secret});
 const sessions={verifySession:t=>t==='valid'?{clientId:'CLtestAdmin',role}:null};
 return {root,core,router,engine,sessions,writer:createWriter({root,codec:engine})};
}
test('Core -> Router -> Indicator writes and reopens disk fixture; rollback restores it',t=>{
 const f=setup(t);const before=f.writer.read();
 const proof=issue({sessions:f.sessions,token:'valid',codec:f.core,action:'indicator.settings.set'});
 assert.equal(verify({codec:f.router,proof,action:'indicator.settings.set'}).allowed,true);
 const result=f.writer.write({proof,settings:{enabled:true,refreshMs:8000}});
 assert.equal(result.ok,true);
 assert.deepEqual(createWriter({root:f.root,codec:f.engine}).read(),{enabled:true,refreshMs:8000});
 const restoreProof=issue({sessions:f.sessions,token:'valid',codec:f.core,action:'indicator.settings.set'});
 assert.equal(verify({codec:f.router,proof:restoreProof,action:'indicator.settings.set'}).allowed,true);
 assert.equal(f.writer.write({proof:restoreProof,settings:before}).ok,true);
 assert.deepEqual(f.writer.read(),before);
});
test('missing proof and USER/GUEST cannot write',t=>{
 for(const role of ['USER','GUEST']){
  const f=setup(t,role);
  assert.equal(issue({sessions:f.sessions,token:'valid',codec:f.core,action:'indicator.settings.set'}),null);
  assert.equal(f.writer.write({proof:'',settings:{enabled:true,refreshMs:8000}}).ok,false);
  assert.deepEqual(f.writer.read(),{enabled:false,refreshMs:5000});
 }
});
test('engine rejects replay and cross-action proofs without writing',t=>{
 const f=setup(t);
 const p=issue({sessions:f.sessions,token:'valid',codec:f.core,action:'indicator.settings.set'});
 assert.equal(f.writer.write({proof:p,settings:{enabled:true,refreshMs:8000}}).ok,true);
 assert.equal(f.writer.write({proof:p,settings:{enabled:false,refreshMs:5000}}).ok,false);
 const wrong=issue({sessions:f.sessions,token:'valid',codec:f.core,action:'marketdata.settings.set'});
 assert.equal(f.writer.write({proof:wrong,settings:{enabled:false,refreshMs:5000}}).ok,false);
 assert.equal(f.writer.read().enabled,true);
});
test('invalid payload is rejected without persistence',t=>{
 const f=setup(t);
 const p=issue({sessions:f.sessions,token:'valid',codec:f.core,action:'indicator.settings.set'});
 assert.equal(f.writer.write({proof:p,settings:{enabled:true,refreshMs:-2}}).ok,false);
 assert.equal(fs.existsSync(path.join(f.root,'indicator-settings.fixture.json')),false);
});
