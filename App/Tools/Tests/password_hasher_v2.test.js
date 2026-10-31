'use strict';
/* Native Argon2id + legacy PBKDF2, opt-in fixture tests. Run ONLY on CI with
 * argon2@0.45.1 installed into a temporary, isolated npm prefix.
 * No live client DB, server, authentication route or password reset.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const Kdf=require('../../Core/Clients/password_hasher_v2');
const argon2=require('argon2');

const FIXTURE_PASSWORD='FICTIONAL_Password_Only_234$';
const BAD_PASSWORD='NOT_THE_FICTIONAL_PASSWORD';

function legacy(password=FIXTURE_PASSWORD) {
 const salt='00112233445566778899aabbccddeeff';
 return {
  clientId:'CL_FIXTURE',
  enabled:true,
  passwordSalt:salt,
  passwordIterations:180000,
  passwordHash:crypto.pbkdf2Sync(password,salt,180000,32,'sha256').toString('hex')
 };
}
function current(hash){return {clientId:'CL_FAKE',enabled:true,passwordAlgo:'ARGON2ID',passwordHash:hash};}

test('native argon2 generates PHC Argon2id v19 at pinned policy cost',async ()=>{
 const hash=await Kdf.hashNewPassword(FIXTURE_PASSWORD);
 assert.ok(hash.startsWith('$argon2id$v=19$'), 'expected Argon2id PHC; returned prefix: '+hash.split('$').slice(0,3).join('$'));
 assert.deepEqual(Kdf.parseArgon2Cost(hash),{memoryCost:65536,timeCost:3,parallelism:1});
 assert.equal(await argon2.verify(hash,FIXTURE_PASSWORD),true);
 assert.equal(await argon2.verify(hash,BAD_PASSWORD),false);
});
test('native argon2 account accepts correct password without upgrade',async ()=>{
 const hash=await Kdf.hashNewPassword(FIXTURE_PASSWORD);
 assert.deepEqual(await Kdf.verifyAccountPassword(current(hash),FIXTURE_PASSWORD),{
  verified:true,algorithm:'ARGON2ID',needsUpgrade:false
 });
});
test('native argon2 account rejects wrong password',async ()=>{
 const hash=await Kdf.hashNewPassword(FIXTURE_PASSWORD);
 assert.equal((await Kdf.verifyAccountPassword(current(hash),BAD_PASSWORD)).verified,false);
});
test('under-strength but valid Argon2id is flagged for a future explicit rehash',async ()=>{
 const weaker=await argon2.hash(FIXTURE_PASSWORD,{
  type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1,hashLength:32
 });
 assert.deepEqual(await Kdf.verifyAccountPassword(current(weaker),FIXTURE_PASSWORD),{
  verified:true,algorithm:'ARGON2ID',needsUpgrade:true
 });
});
test('legacy PBKDF2 defaults to old schema and remains verifiable asynchronously',async ()=>{
 const account=legacy();
 const before=JSON.stringify(account);
 assert.deepEqual(await Kdf.verifyAccountPassword(account,FIXTURE_PASSWORD),{
  verified:true,algorithm:'PBKDF2_SHA256',needsUpgrade:true
 });
 assert.equal(JSON.stringify(account),before,'must not silently update legacy credentials');
});
test('explicit legacy algorithm remains valid, but wrong password is not',async ()=>{
 const account={...legacy(),passwordAlgo:'PBKDF2_SHA256'};
 assert.equal((await Kdf.verifyAccountPassword(account,FIXTURE_PASSWORD)).verified,true);
 assert.equal((await Kdf.verifyAccountPassword(account,BAD_PASSWORD)).verified,false);
});
test('disabled or suspended client accounts are never authenticated',async ()=>{
 const hash=await Kdf.hashNewPassword(FIXTURE_PASSWORD);
 for(const account of [
  {...legacy(),enabled:false},{...legacy(),enabled:0},{...legacy(),enabled:'0'},
  {...current(hash),status:'DISABLED'}
 ]){
  assert.equal((await Kdf.verifyAccountPassword(account,FIXTURE_PASSWORD)).verified,false);
 }
});
test('unknown algorithm, malformed legacy digest or bad iterations fail closed',async ()=>{
 const variants=[
  {...legacy(),passwordAlgo:'UNKNOWN'},
  {...legacy(),passwordHash:'not-hex'},
  {...legacy(),passwordIterations:1},
  {...legacy(),passwordIterations:90000000},
  {...legacy(),passwordSalt:''}
 ];
 for(const account of variants)assert.equal((await Kdf.verifyAccountPassword(account,FIXTURE_PASSWORD)).verified,false);
});
test('malformed Argon2 PHC and unbounded memory cost never reach native verify',async ()=>{
 const hashes=[
  '$argon2d$v=19$m=65536,t=3,p=1$ZmFrZXNhbHQ$ZmFrZWhhc2hmaWN0aW9uYWw',
  '$argon2id$v=19$m=4294967295,t=3,p=1$ZmFrZXNhbHQ$ZmFrZWhhc2hmaWN0aW9uYWw',
  '$argon2id$v=19$m=65536,t=999,p=1$ZmFrZXNhbHQ$ZmFrZWhhc2hmaWN0aW9uYWw',
  '$argon2id$v=19$m=65536,t=3,p=256$ZmFrZXNhbHQ$ZmFrZWhhc2hmaWN0aW9uYWw',
  'bad'
 ];
 for(const hash of hashes){
  assert.equal(Kdf.parseArgon2Cost(hash),null);
  assert.equal((await Kdf.verifyAccountPassword(current(hash),FIXTURE_PASSWORD)).verified,false);
 }
});
test('new password creation enforces minimum length and max byte length',async ()=>{
 for(const bad of ['','short','123456789','x'.repeat(1025)]){
  await assert.rejects(()=>Kdf.hashNewPassword(bad),/AUTH_PASSWORD_LENGTH_INVALID/);
 }
 for(const good of ['1234567890','x'.repeat(64),'x'.repeat(128)]){
  const hash=await Kdf.hashNewPassword(good);
  assert.equal((await Kdf.verifyAccountPassword(current(hash),good)).verified,true);
 }
 assert.equal((await Kdf.verifyAccountPassword(legacy(),'x'.repeat(1025))).verified,false);
});
test('invalid records and missing password are safely rejected',async ()=>{
 assert.equal((await Kdf.verifyAccountPassword(null,FIXTURE_PASSWORD)).verified,false);
 assert.equal((await Kdf.verifyAccountPassword(legacy(),undefined)).verified,false);
 assert.equal((await Kdf.verifyAccountPassword({passwordAlgo:'ARGON2ID',enabled:true},FIXTURE_PASSWORD)).verified,false);
});
