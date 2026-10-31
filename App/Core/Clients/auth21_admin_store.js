'use strict';
/* Auth 2.1: OPT-IN management of accounts, for trusted local CLI only.
 * Not connected to HTTP/Gateway/GEN-1. Creates accounts only in an existing schema; never keys or DBs.
 * First ADMIN must be created by a separate, authorized CLI bootstrap in Phase 5.
 * Every operation needs BOTH a live ADMIN session AND a locally injected OS
 * operator authorization callback; web sessions alone are insufficient.
 */
const Kdf=require('./password_hasher_v2');

const ROLES=new Set(['ADMIN','USER','GUEST']);
const CLIENT_ID=/^CL[A-Za-z0-9_-]{1,64}$/;

class Auth21AdminStore {
 constructor({sessionStore,authorizeLocalOperator,snapshotGate}={}){
  if(!sessionStore || !sessionStore.db || typeof sessionStore.verifySession!=='function')
   throw Error('AUTH21_ADMIN_SESSION_STORE_REQUIRED');
  if(typeof authorizeLocalOperator!=='function')throw Error('AUTH21_ADMIN_LOCAL_OPERATOR_REQUIRED');
  if(snapshotGate && typeof snapshotGate.assertWritable!=='function')throw Error('SNAPSHOT_GATE_INVALID');
  this.sessions=sessionStore;
  this.db=sessionStore.db;
  this.localAuth=authorizeLocalOperator;
  this.snapshotGate=snapshotGate || sessionStore.snapshotGate || null;
  if(sessionStore.snapshotGate && this.snapshotGate !== sessionStore.snapshotGate)
   throw Error('AUTH21_ADMIN_SNAPSHOT_GATE_MISMATCH');
  // Full SQL protection is essential: direct SQL/other writers can bypass API.
  for(const name of [
   'auth21_last_admin_account_update','auth21_last_admin_account_delete',
   'auth21_last_admin_client_update','auth21_last_admin_client_delete',
   'auth21_last_admin_account_replace','auth21_last_admin_client_replace',
   'auth21_account_security_invalidation','auth21_client_status_invalidation'
  ]){
   if(!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name))
    throw Error('AUTH21_ADMIN_SQL_GUARD_MISSING');
  }
 }
 _writable(){if(this.snapshotGate)this.snapshotGate.assertWritable();}
 _target(id){
  if(typeof id!=='string'||!CLIENT_ID.test(id))throw Error('AUTH21_CLIENT_ID_INVALID');
  return this.db.prepare([
   'SELECT a.client_id AS clientId,a.role AS role,a.enabled AS enabled,',
   'c.status AS status,c.security_version AS securityVersion',
   'FROM client_accounts a JOIN clients c ON c.client_id=a.client_id WHERE a.client_id=?'
  ].join(' ')).get(id);
 }
 _admin(token){
  // Local trusted operator proof is independent of a browser session.
  if(this.localAuth() !== true)throw Error('AUTH21_LOCAL_OPERATOR_DENIED');
  const principal=this.sessions.verifySession(token);
  if(!principal || principal.role!=='ADMIN')throw Error('AUTH21_ADMIN_FORBIDDEN');
  return principal;
 }
 _run(token,targetId,action,callback){
  if(typeof targetId!=='string'||!CLIENT_ID.test(targetId))throw Error('AUTH21_CLIENT_ID_INVALID');
  this._writable();
  return this.db.transaction(()=>{
   this._writable();
   const admin=this._admin(token);
   const target=this._target(targetId);
   if(!target)throw Error('AUTH21_ACCOUNT_NOT_FOUND');
   const result=callback(target,admin);
   if(result.changed)this.db.prepare([
    'INSERT INTO client_security_audit',
    "(client_id,actor_client_id,action,created_at,detail_enc)",
    "VALUES(?,?,?,datetime('now'),'')"
   ].join(' ')).run(targetId,admin.clientId,action);
   return result;
  }).immediate();
 }
 /** Minimal metadata, not encrypted client identity or credential digests. */
 listAccounts(adminToken){
  const admin=this._admin(adminToken);
  return this.db.prepare([
   'SELECT a.client_id AS clientId,a.role,a.enabled,c.status,c.security_version AS securityVersion',
   'FROM client_accounts a JOIN clients c ON c.client_id=a.client_id',
   'ORDER BY a.client_id'
  ].join(' ')).all();
 }
 activeAdminCount(adminToken){
  this._admin(adminToken);
  return this.db.prepare([
   "SELECT COUNT(*) AS n FROM client_accounts a JOIN clients c ON c.client_id=a.client_id",
   "WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE'"
  ].join(' ')).get().n;
 }
 /** Local CLI account creation. Identity and credentials commit together;
  * recheck the actor after the asynchronous password hash completes. */
 async createAccount(adminToken,{firstName,lastName,email,username,password,role}={}){
  this._admin(adminToken);
  if(!ROLES.has(role))throw Error('AUTH21_ROLE_INVALID');
  if(typeof firstName!=='string'||!firstName.trim()||firstName.length>80||
     typeof lastName!=='string'||!lastName.trim()||lastName.length>80||
     typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||
     typeof username!=='string'||!/^[A-Za-z0-9._-]{3,64}$/.test(username))
   throw Error('AUTH21_ACCOUNT_IDENTITY_INVALID');
  const hash=await Kdf.hashNewPassword(password);
  this._writable();
  const cipher=this.sessions.clientCrypto;
  const id='CL'+require('node:crypto').randomBytes(12).toString('hex').toUpperCase();
  const normalizedEmail=email.trim().toLowerCase(),normalizedUser=username.toUpperCase();
  return this.db.transaction(()=>{
   this._writable();const actor=this._admin(adminToken),now=new Date().toISOString();
   const userHash=cipher.lookupHash('username:'+normalizedUser);
   if(this.db.prepare('SELECT 1 FROM client_accounts WHERE username_hash=?').get(userHash))
    throw Error('AUTH21_ACCOUNT_USERNAME_TAKEN');
   if(this.db.prepare('SELECT 1 FROM clients WHERE email_hash=?').get(cipher.lookupHash(normalizedEmail)))
    throw Error('AUTH21_ACCOUNT_EMAIL_TAKEN');
   this.db.prepare("INSERT INTO clients(client_id,external_ref_hash,first_name_enc,last_name_enc,email_enc,email_hash,status,security_version,created_at,updated_at) VALUES(?,?,?,?,?,?,'ACTIVE',1,?,?)")
    .run(id,cipher.externalHash('auth21-account:'+id),cipher.seal(firstName.trim()),
     cipher.seal(lastName.trim()),cipher.seal(normalizedEmail),cipher.lookupHash(normalizedEmail),now,now);
   this.db.prepare("INSERT INTO client_accounts(client_id,username_enc,username_hash,password_salt,password_hash,password_iterations,password_algo,password_params_json,role,enabled,created_at,updated_at) VALUES(?,?,?,'',?,0,'ARGON2ID','{}',?,1,?,?)")
    .run(id,cipher.seal(normalizedUser),userHash,hash,role,now,now);
   this.db.prepare("INSERT INTO client_security_audit(client_id,actor_client_id,action,created_at,detail_enc) VALUES(?,?,'ADMIN_ACCOUNT_CREATED',?,'')")
    .run(id,actor.clientId,now);
   return {clientId:id,role,created:true};
  }).immediate();
 }
 audit(adminToken,{afterId=0,limit=100}={}){
  this._admin(adminToken);
  if(!Number.isSafeInteger(afterId)||afterId<0||!Number.isSafeInteger(limit)||limit<1||limit>500)
   throw Error('AUTH21_AUDIT_RANGE_INVALID');
  return this.db.prepare('SELECT id,client_id AS clientId,actor_client_id AS actorClientId,action,created_at AS createdAt FROM client_security_audit WHERE id>? ORDER BY id LIMIT ?').all(afterId,limit);
 }
 changeRole(adminToken,targetClientId,role){
  if(typeof role!=='string'||!ROLES.has(role))throw Error('AUTH21_ROLE_INVALID');
  return this._run(adminToken,targetClientId,'ADMIN_ROLE_CHANGED',(target)=>{
   if(target.role===role)return {changed:false};
   const r=this.db.prepare('UPDATE client_accounts SET role=?,updated_at=datetime(\'now\') WHERE client_id=?')
    .run(role,target.clientId);
   if(r.changes!==1)throw Error('AUTH21_UPDATE_RACE');
   return {changed:true};
  });
 }
 setEnabled(adminToken,targetClientId,enabled){
  if(typeof enabled!=='boolean')throw Error('AUTH21_ENABLED_INVALID');
  return this._run(adminToken,targetClientId,'ADMIN_ENABLED_CHANGED',(target)=>{
   if(target.enabled===(enabled?1:0))return {changed:false};
   const r=this.db.prepare("UPDATE client_accounts SET enabled=?,updated_at=datetime('now') WHERE client_id=?")
    .run(enabled?1:0,target.clientId);
   if(r.changes!==1)throw Error('AUTH21_UPDATE_RACE');
   return {changed:true};
  });
 }
 setClientStatus(adminToken,targetClientId,status){
  if(status!=='ACTIVE'&&status!=='DISABLED')throw Error('AUTH21_STATUS_INVALID');
  return this._run(adminToken,targetClientId,'ADMIN_CLIENT_STATUS_CHANGED',(target)=>{
   if(target.status===status)return {changed:false};
   const r=this.db.prepare("UPDATE clients SET status=?,updated_at=datetime('now') WHERE client_id=?")
    .run(status,target.clientId);
   if(r.changes!==1)throw Error('AUTH21_UPDATE_RACE');
   return {changed:true};
  });
 }
 /** Removes ONLY authentication credentials. Client, identity and wallet
  * associations are retained, as required by DEBUG 2.1's Wallet freeze.
  */
 removeLogin(adminToken,targetClientId){
  return this._run(adminToken,targetClientId,'ADMIN_LOGIN_REMOVED',(target)=>{
   const r=this.db.prepare('DELETE FROM client_accounts WHERE client_id=?').run(target.clientId);
   if(r.changes!==1)throw Error('AUTH21_UPDATE_RACE');
   // FK CASCADE drops sessions; since the client record remains, preferences
   // remain linked to the same clientId. No Wallet or identity deletes.
   return {changed:true};
  });
 }
 /** Explicit CLI password reset, NOT recovery over HTTP. No raw credentials in
  * logs, DB audits or return values. SQL invalidation trigger revokes all
  * sessions (including target's) and bumps security_version atomically.
  */
 async resetPassword(adminToken,targetClientId,newPassword){
  if(typeof targetClientId!=='string'||!CLIENT_ID.test(targetClientId))throw Error('AUTH21_CLIENT_ID_INVALID');
  this._admin(adminToken);
  const before=this._target(targetClientId);
  if(!before)throw Error('AUTH21_ACCOUNT_NOT_FOUND');
  const encoded=await Kdf.hashNewPassword(newPassword);
  this._writable();
  return this._run(adminToken,targetClientId,'ADMIN_PASSWORD_RESET',(target)=>{
   if(target.securityVersion!==before.securityVersion ||
      target.status!==before.status||target.role!==before.role||target.enabled!==before.enabled)
    throw Error('AUTH21_STALE_ACCOUNT');
   // Revocation happens in trigger, and audit in _run transaction.
   const r=this.db.prepare([
    "UPDATE client_accounts SET password_algo='ARGON2ID',password_hash=?,",
    "password_salt='',password_iterations=0,password_params_json='{}',updated_at=datetime('now')",
    "WHERE client_id=?"
   ].join(' ')).run(encoded,targetClientId);
   if(r.changes!==1)throw Error('AUTH21_UPDATE_RACE');
   return {changed:true};
  });
 }
}
module.exports={Auth21AdminStore};
