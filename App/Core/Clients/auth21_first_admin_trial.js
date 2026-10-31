'use strict';
/* Auth 2.1 Phase 2: OFFLINE FIRST ADMIN & LEGACY DEBUG TRIAL.
 * Deliberately *not* a CLI entry point, HTTP route, or production bootstrap.
 * Every call is restricted to ephemeral SQLite fixtures by assertFixture.
 * A local-operator callback is a placeholder for Phase 5 OS/SSH verification,
 * not itself proof of a real OS identity. Never supply a browser callback.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
const {assertFixture}=require('../../Tools/CI/auth21_v3_migration_trial');
const Kdf=require('./password_hasher_v2');

const ID=/^CL[A-Z0-9_-]{1,64}$/;
const NAME=/^[A-Z0-9._-]{3,64}$/;
const V3='auth21_schema_v3_offline_proposal';
const TRIGGERS=[
 'auth21_last_admin_account_update','auth21_last_admin_account_delete',
 'auth21_last_admin_client_update','auth21_last_admin_client_delete',
 'auth21_last_admin_account_replace','auth21_last_admin_client_replace',
 'auth21_account_security_invalidation','auth21_client_status_invalidation'
];

class Auth21FirstAdminTrial {
 constructor({db,fixtureRoot,clientCrypto,snapshotGate,authorizeLocalOperator}={}){
  assertFixture(db,fixtureRoot);
  if(!clientCrypto||typeof clientCrypto.seal!=='function'||
     typeof clientCrypto.open!=='function'||typeof clientCrypto.lookupHash!=='function'||
     typeof clientCrypto.externalHash!=='function')throw Error('AUTH21_CLIENT_CRYPTO_REQUIRED');
  if(!clientCrypto.keyFile||!clientCrypto.clientDbPath ||
     !fs.realpathSync(clientCrypto.keyFile).startsWith(fs.realpathSync(fixtureRoot)+path.sep)||
     fs.realpathSync(clientCrypto.clientDbPath)!==fs.realpathSync(db.name))
   throw Error('AUTH21_FIXTURE_KEY_REQUIRED');
  if(typeof authorizeLocalOperator!=='function')throw Error('AUTH21_LOCAL_OPERATOR_REQUIRED');
  if(snapshotGate&&typeof snapshotGate.assertWritable!=='function')throw Error('SNAPSHOT_GATE_INVALID');
  this.db=db;
  this.root=fs.realpathSync(fixtureRoot);
  this.crypto=clientCrypto;
  this.snapshotGate=snapshotGate||null;
  this.authorizeLocalOperator=authorizeLocalOperator;
  if(db.pragma('foreign_keys',{simple:true})!==1)throw Error('AUTH21_FOREIGN_KEYS_REQUIRED');
  const m=db.prepare('SELECT name FROM client_schema_migrations WHERE version=3').get();
  if(!m||m.name!==V3)throw Error('AUTH21_V3_REQUIRED');
  for(const name of TRIGGERS){
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name))
    throw Error('AUTH21_BOOTSTRAP_SQL_GUARD_MISSING');
  }
 }
 _authorized(){
  if(this.authorizeLocalOperator()!==true)throw Error('AUTH21_LOCAL_OPERATOR_DENIED');
 }
 _writable(){if(this.snapshotGate)this.snapshotGate.assertWritable();}
 _adminCount(){
  return this.db.prepare([
   'SELECT COUNT(*) AS n FROM client_accounts a JOIN clients c ON c.client_id=a.client_id',
   "WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE'"
  ].join(' ')).get().n;
 }
 _legacyCandidates(){
  const rows=this.db.prepare([
   'SELECT a.client_id AS clientId,a.username_enc AS usernameEnc,a.role,',
   'a.enabled,c.external_ref_hash AS externalHash,c.status,',
   '(SELECT COUNT(*) FROM client_wallets w WHERE w.client_id=a.client_id) AS walletLinks',
   'FROM client_accounts a JOIN clients c ON c.client_id=a.client_id',
   "WHERE a.role='SUPERADMIN' ORDER BY a.client_id"
  ].join(' ')).all();
  return rows.map(row=>{
   let origin='UNVERIFIED_SUPERADMIN';
   try{
    const username=this.crypto.open(row.usernameEnc);
    if(NAME.test(username)&&this.crypto.externalHash('debug-user:'+username)===row.externalHash)
     origin='VERIFIED_DEBUG_BOOTSTRAP';
   }catch(_){/* malformed encrypted identity is never sufficient proof */}
   return {clientId:row.clientId,role:row.role,enabled:row.enabled===1,
    status:row.status,walletLinks:row.walletLinks,origin,
    recommendedAction:origin==='VERIFIED_DEBUG_BOOTSTRAP'
      ? 'REVIEW_AND_REQUEST_EXPLICIT_APPROVAL' : 'MANUAL_PROVENANCE_REVIEW'};
  });
 }
 /** READ ONLY. Never deactivates/deletes old DEBUG logins or identities. */
 review(){
  this._authorized();
  return {activeAdmins:this._adminCount(),legacyCandidates:this._legacyCandidates(),
   safeForAutomaticReset:false,firstAdminRequiresExplicitApproval:true};
 }
 _username(username){
  if(typeof username!=='string'||!NAME.test(username))throw Error('AUTH21_ADMIN_USERNAME_INVALID');
  return username;
 }
 async _backup(fileName='pre-first-admin.sqlite'){
  if(!/^(pre-first-admin|pre-legacy-debug-CL[A-Z0-9_-]{1,64})\.sqlite$/.test(fileName))
   throw Error('AUTH21_BACKUP_NAME_INVALID');
  this._writable();
  const dest=path.join(this.root,fileName);
  if(fs.existsSync(dest))throw Error('AUTH21_FIRST_ADMIN_BACKUP_EXISTS');
  await this.db.backup(dest);
  let copy;
  try{
   copy=new Database(dest,{readonly:true,fileMustExist:true});
   if(copy.pragma('integrity_check',{simple:true})!=='ok'||copy.pragma('foreign_key_check').length)
    throw Error('AUTH21_FIRST_ADMIN_BACKUP_INVALID');
  }finally{if(copy)copy.close();}
  // A successful backup is mandatory. No restore into a live service here.
  return dest;
 }
 /** Create first ADMIN only after manual selection.
  * Existing client: {clientId, username, password}.
  * New client: {identity:{firstName,lastName,email},username,password}.
  * Legacy SUPERADMIN: must explicitly choose clientId + convertLegacy=true;
  * username must equal decrypted historical username (no account takeover).
  * All modes require exact confirmation AND positive local operator check.
  */
 async createFirstAdmin({clientId,identity,username,password,convertLegacy=false,
   confirmation,hooks}={}){
  this._authorized();
  if(confirmation!=='CREATE FIRST ADMIN ON FIXTURE')throw Error('AUTH21_BOOTSTRAP_APPROVAL_REQUIRED');
  this._username(username);
  if(this._adminCount()!==0)throw Error('AUTH21_FIRST_ADMIN_ALREADY_EXISTS');
  if(clientId!==undefined&&(!ID.test(clientId)||identity!==undefined))
   throw Error('AUTH21_BOOTSTRAP_TARGET_INVALID');
  if(clientId===undefined){
   if(!identity||typeof identity!=='object'||Array.isArray(identity)||
      !['firstName','lastName','email'].every(k=>typeof identity[k]==='string'&&identity[k].trim())||
      identity.firstName.length>80||identity.lastName.length>80||
      identity.email.length>254||!/^.+@.+\..+$/.test(identity.email))
    throw Error('AUTH21_BOOTSTRAP_IDENTITY_REQUIRED');
  }
  const existing=clientId?
   this.db.prepare('SELECT * FROM clients WHERE client_id=?').get(clientId):null;
  if(clientId&&(!existing||existing.status!=='ACTIVE'))throw Error('AUTH21_BOOTSTRAP_CLIENT_UNAVAILABLE');
  const current=clientId?this.db.prepare(
   'SELECT role,username_enc AS usernameEnc,username_hash AS usernameHash,password_hash AS passwordHash,updated_at AS updatedAt,enabled FROM client_accounts WHERE client_id=?').get(clientId):null;
  if(current){
   if(current.role!=='SUPERADMIN'||convertLegacy!==true)
    throw Error('AUTH21_BOOTSTRAP_EXISTING_LOGIN_REQUIRES_REVIEW');
   if(this.crypto.open(current.usernameEnc)!==username)
    throw Error('AUTH21_BOOTSTRAP_USERNAME_MISMATCH');
  }else if(convertLegacy)throw Error('AUTH21_BOOTSTRAP_LEGACY_MISSING');
  const usernameHash=this.crypto.lookupHash('username:'+username);
  if(current&&current.usernameHash!==usernameHash)throw Error('AUTH21_BOOTSTRAP_LEGACY_USERNAME_INDEX_INVALID');
  const taken=this.db.prepare('SELECT client_id FROM client_accounts WHERE username_hash=?').get(usernameHash);
  if(taken&&taken.client_id!==clientId)throw Error('AUTH21_BOOTSTRAP_USERNAME_TAKEN');
  const hash=await Kdf.hashNewPassword(password);
  this._authorized();
  this._writable();
  const backupFile=await this._backup();
  if(hooks&&typeof hooks.beforeCommit==='function')await hooks.beforeCommit(this.db);
  this._writable();
  const created=this.db.transaction(()=>{
   this._authorized();this._writable();
   if(this._adminCount()!==0)throw Error('AUTH21_FIRST_ADMIN_ALREADY_EXISTS');
   let target=clientId;
   if(target){
    const fresh=this.db.prepare('SELECT * FROM clients WHERE client_id=?').get(target);
    if(!fresh||Object.keys(existing).some(key=>fresh[key]!==existing[key]))
     throw Error('AUTH21_BOOTSTRAP_STALE_CLIENT');
    const auth=this.db.prepare('SELECT role,username_enc AS usernameEnc,username_hash AS usernameHash,password_hash AS passwordHash,updated_at AS updatedAt,enabled FROM client_accounts WHERE client_id=?').get(target);
    if(Boolean(auth)!==Boolean(current)||
       (auth&&(auth.role!==current.role||auth.passwordHash!==current.passwordHash||
        auth.updatedAt!==current.updatedAt||auth.enabled!==current.enabled||
        auth.usernameHash!==current.usernameHash||
        !convertLegacy||this.crypto.open(auth.usernameEnc)!==username)))
      throw Error('AUTH21_BOOTSTRAP_STALE_ACCOUNT');
   }else{
    target='CL'+crypto.randomBytes(12).toString('hex').toUpperCase();
    const now=new Date().toISOString();
    const email=identity.email.trim().toLowerCase();
    this.db.prepare([
     'INSERT INTO clients(client_id,external_ref_hash,first_name_enc,last_name_enc,',
     'email_enc,email_hash,status,security_version,created_at,updated_at)',
     "VALUES(?,?,?,?,?,?,'ACTIVE',1,?,?)"
    ].join(' ')).run(target,this.crypto.externalHash('auth21-manual-admin:'+target),
     this.crypto.seal(identity.firstName.trim()),this.crypto.seal(identity.lastName.trim()),
     this.crypto.seal(email),this.crypto.lookupHash(email),now,now);
   }
   if(current){
    this.db.prepare([
     "UPDATE client_accounts SET role='ADMIN',password_hash=?,password_salt='',",
     "password_iterations=0,password_algo='ARGON2ID',password_params_json='{}',",
     "updated_at=? WHERE client_id=?"
    ].join(' ')).run(hash,new Date().toISOString(),target);
   }else{
    const now=new Date().toISOString();
    this.db.prepare([
     'INSERT INTO client_accounts(client_id,username_enc,username_hash,password_salt,',
     'password_hash,password_iterations,password_algo,password_params_json,role,enabled,created_at,updated_at)',
     "VALUES(?,?,?,'',?,0,'ARGON2ID','{}','ADMIN',1,?,?)"
    ].join(' ')).run(target,this.crypto.seal(username),usernameHash,hash,now,now);
   }
   this.db.prepare([
    'INSERT INTO client_security_audit(client_id,action,created_at,detail_enc)',
    "VALUES(?,'FIRST_ADMIN_MANUAL_BOOTSTRAP',?,'')"
   ].join(' ')).run(target,new Date().toISOString());
   if(this._adminCount()!==1)throw Error('AUTH21_FIRST_ADMIN_INVARIANT');
   return {clientId:target,role:'ADMIN',createdIdentity:!clientId,convertedLegacy:Boolean(current)};
  }).immediate();
  return {...created,backupFile};
 }
 /** DISPOSABLE FIXTURE ONLY. Simulates the future approved cleanup of ONE
  * verified historical DEBUG bootstrap login. Never removes clients/wallets.
  * The real deletion workflow and OS attestation belong to Phase 5/6.
  */
 async retireLegacyDebugLoginFixture({adminStore,adminToken,targetClientId,confirmation,hooks}={}){
  this._authorized();
  if(typeof targetClientId!=='string'||!ID.test(targetClientId))
   throw Error('AUTH21_DEBUG_TARGET_INVALID');
  if(confirmation!=='RETIRE DEBUG LOGIN ON FIXTURE: '+targetClientId)
   throw Error('AUTH21_DEBUG_RESET_APPROVAL_REQUIRED');
  if(!adminStore||adminStore.db!==this.db||typeof adminStore._admin!=='function'||
     (adminStore.snapshotGate||null)!==(this.snapshotGate||null))
   throw Error('AUTH21_DEBUG_ADMIN_STORE_REQUIRED');
  let principal=adminStore._admin(adminToken);
  if(!principal||principal.role!=='ADMIN')throw Error('AUTH21_ADMIN_FORBIDDEN');
  const planned=this._legacyCandidates().find(x=>x.clientId===targetClientId);
  if(!planned||planned.origin!=='VERIFIED_DEBUG_BOOTSTRAP')
   throw Error('AUTH21_DEBUG_PROVENANCE_UNVERIFIED');
  if(this._adminCount()<1)throw Error('AUTH21_DEBUG_FIRST_ADMIN_REQUIRED');
  const original=this.db.prepare('SELECT password_hash AS digest,updated_at AS updatedAt,enabled,username_enc AS usernameEnc,role FROM client_accounts WHERE client_id=?').get(targetClientId);
  const originalClient=this.db.prepare('SELECT * FROM clients WHERE client_id=?').get(targetClientId);
  this._writable();
  const backupFile=await this._backup('pre-legacy-debug-'+targetClientId+'.sqlite');
  if(hooks&&typeof hooks.beforeCommit==='function')await hooks.beforeCommit(this.db);
  this._writable();
  const result=this.db.transaction(()=>{
   this._authorized();this._writable();
   principal=adminStore._admin(adminToken);
   if(!principal||principal.role!=='ADMIN')throw Error('AUTH21_ADMIN_FORBIDDEN');
   const fresh=this._legacyCandidates().find(x=>x.clientId===targetClientId);
   if(!fresh||fresh.origin!=='VERIFIED_DEBUG_BOOTSTRAP')
    throw Error('AUTH21_DEBUG_PROVENANCE_CHANGED');
   if(this._adminCount()<1)throw Error('AUTH21_DEBUG_FIRST_ADMIN_REQUIRED');
   const current=this.db.prepare('SELECT password_hash AS digest,updated_at AS updatedAt,enabled,username_enc AS usernameEnc,role FROM client_accounts WHERE client_id=?').get(targetClientId);
   const currentClient=this.db.prepare('SELECT * FROM clients WHERE client_id=?').get(targetClientId);
   if(!currentClient||Object.keys(originalClient).some(key=>originalClient[key]!==currentClient[key]))
    throw Error('AUTH21_DEBUG_CLIENT_STALE');
   if(!current||Object.keys(original).some(key=>original[key]!==current[key]))
    throw Error('AUTH21_DEBUG_ACCOUNT_STALE');
   const deleted=this.db.prepare([
    "DELETE FROM client_accounts WHERE client_id=? AND role='SUPERADMIN'"
   ].join(' ')).run(targetClientId);
   if(deleted.changes!==1)throw Error('AUTH21_DEBUG_DELETE_RACE');
   this.db.prepare([
    'INSERT INTO client_security_audit',
    "(client_id,actor_client_id,action,created_at,detail_enc)",
    "VALUES(?,?,'LEGACY_DEBUG_LOGIN_RETIRED',?,'')"
   ].join(' ')).run(targetClientId,principal.clientId,new Date().toISOString());
   return {clientId:targetClientId,loginRetired:true,identityPreserved:true};
  }).immediate();
  return {...result,backupFile};
 }

}
module.exports={Auth21FirstAdminTrial};
