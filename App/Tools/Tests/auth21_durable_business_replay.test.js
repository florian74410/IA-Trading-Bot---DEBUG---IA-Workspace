'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const {createDurableReplay}=require('../../Core/Clients/auth21_durable_business_replay');
test('business capability survives process restart without becoming replayable',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);const directory=path.join(root,'runtime');
 fs.mkdirSync(directory,{mode:0o700});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const secret=crypto.randomBytes(32),principal={clientId:'CLAlice',role:'ADMIN'};
 const issue=proofCodec({secret,now:()=>10000});
 const proof=issue.issue({principal,audience:'marketdata',operation:'admin.write',
  method:'POST',action:'marketdata.settings.set',bodyDigest:'a'.repeat(64)});
 const opts={audience:'marketdata',operation:'admin.write',method:'POST',
  action:'marketdata.settings.set',bodyDigest:'a'.repeat(64)};
 function receiver(){return proofCodec({secret,now:()=>11000,
  replayStore:createDurableReplay({root,engine:'marketdata'})});}
 assert.equal(receiver().verify(proof,opts).clientId,'CLAlice');
 assert.equal(receiver().verify(proof,opts),null);
 const journal=path.join(directory,'auth21-business-replay-marketdata.json');
 assert.equal(fs.lstatSync(journal).mode&0o077,0);
 fs.writeFileSync(journal,'{oops', {mode:0o600});
 assert.throws(()=>receiver().verify(issue.issue({principal,audience:'marketdata',
  operation:'admin.write',method:'POST',action:'marketdata.settings.set',
  bodyDigest:'a'.repeat(64)}),opts),/AUTH21_REPLAY_FILE_CORRUPT/);
});
test('replay storage rejects unsafe symlink rather than resetting protection',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);const directory=path.join(root,'runtime');
 fs.mkdirSync(directory,{mode:0o700});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const link=path.join(directory,'auth21-business-replay-strategy.json');
 const target=path.join(root,'safe-destination');
 fs.writeFileSync(target,'{}');fs.symlinkSync(target,link);
 assert.throws(()=>createDurableReplay({root,engine:'strategy'}).claim(
  'strategy:'+crypto.randomBytes(16).toString('base64url'),1234,1000),
 /AUTH21_REPLAY_FILE_UNSAFE/);
});
