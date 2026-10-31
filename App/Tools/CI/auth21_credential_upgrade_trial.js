'use strict';
/* Auth 2.1 — OFFLINE credential conversion trial, not imported by runtime.
 * Purely fixture-only, with password verification before transactional CAS.
 */
const Kdf=require('../../Core/Clients/password_hasher_v2');
const {assertFixture}=require('./auth21_v3_migration_trial');

function findAccount(db,id){
 return db.prepare([
  'SELECT a.client_id AS clientId,a.password_hash AS passwordHash,',
  'a.password_salt AS passwordSalt,a.password_iterations AS passwordIterations,',
  'a.password_algo AS passwordAlgo,a.role AS role,a.enabled AS enabled,',
  'a.updated_at AS updatedAt,c.status AS status,c.security_version AS securityVersion',
  'FROM client_accounts a JOIN clients c ON c.client_id=a.client_id',
  'WHERE a.client_id=?'
 ].join(' ')).get(id);
}

async function upgradeLegacyFixture(db,opts){
 const {fixtureRoot,clientId,password,snapshotGate,hooks}=opts||{};
 assertFixture(db,fixtureRoot);
 if(snapshotGate)snapshotGate.assertWritable();
 if(typeof clientId!=='string'||!/^CL[0-9A-Za-z_-]{1,64}$/.test(clientId)||
    typeof password!=='string')throw Error('AUTH21_CREDENTIAL_INPUT_INVALID');
 const v3=db.prepare('SELECT name FROM client_schema_migrations WHERE version=3').get();
 if(!v3||v3.name!=='auth21_schema_v3_offline_proposal')throw Error('AUTH21_SCHEMA_V3_REQUIRED');
 const old=findAccount(db,clientId);
 if(!old)return {verified:false,upgraded:false};
 const verified=await Kdf.verifyAccountPassword(old,password);
 if(!verified.verified)return {verified:false,upgraded:false};
 if(verified.algorithm!=='PBKDF2_SHA256')return {verified:true,upgraded:false};
 if(snapshotGate)snapshotGate.assertWritable();
 const encoded=await Kdf.hashNewPassword(password);
 if(!Kdf.parseArgon2Cost(encoded))throw Error('AUTH21_ARGON2_OUTPUT_INVALID');
 // Only used to simulate races in offline fixture tests; no login runtime hook.
 if(hooks&&typeof hooks.beforeCAS==='function')await hooks.beforeCAS(db);
 if(snapshotGate)snapshotGate.assertWritable();
 const update=db.transaction(()=>{
  if(snapshotGate)snapshotGate.assertWritable();
  const changed=db.prepare([
   "UPDATE client_accounts SET password_algo='ARGON2ID',password_hash=?,",
   "password_salt='',password_iterations=0,password_params_json='{}',updated_at=?",
   "WHERE client_id=? AND password_algo='PBKDF2_SHA256'",
   "AND password_hash=? AND password_salt=? AND password_iterations=?",
   "AND role=? AND enabled=1 AND updated_at=?",
   "AND EXISTS(SELECT 1 FROM clients WHERE client_id=?",
   "AND status='ACTIVE' AND security_version=?)"
  ].join(' ')).run(encoded,new Date().toISOString(),
    old.clientId,old.passwordHash,old.passwordSalt,old.passwordIterations,
    old.role,old.updatedAt,old.clientId,old.securityVersion);
  if(changed.changes!==1)return false;
  // Never persist a password, PHC, or historical digest in the audit log.
  db.prepare([
   "INSERT INTO client_security_audit",
   "(client_id,action,created_at,detail_enc)",
   "VALUES(?,'CREDENTIAL_KDF_UPGRADED',?,'')"
  ].join(' ')).run(old.clientId,new Date().toISOString());
  return true;
 });
 const upgraded=update();
 // Fail closed: no authentication using stale account data after a concurrent
 // password reset, role change, disable, client version bump or rehash.
 if(!upgraded)return {verified:false,upgraded:false,reason:'AUTH21_STALE_ACCOUNT'};
 return {verified:true,upgraded:true,algorithm:'ARGON2ID'};
}
module.exports={upgradeLegacyFixture};
