'use strict';
/* IA-TB Auth 2.1: OPT-IN SQLite session + per-client encrypted preference store.
 * NO server imports this module yet; never creates a database or runs migrations.
 * Issue tokens ONLY after a successful password KDF verification; no public API
 * may directly accept an unverified clientId as proof of authentication.
 */
const crypto=require('node:crypto');
const Kdf=require('./password_hasher_v2');
const VALID_ROLES=new Set(['ADMIN','USER','GUEST']);
const DEFAULT_TTL_SECONDS=3600;
const MAX_TTL_SECONDS=43200;
const TOKEN_PATTERN=/^[A-Za-z0-9_-]{43}$/;
const SCOPE_PATTERN=/^[a-z][a-z0-9_.:-]{0,63}$/i;
const ACCOUNT_SQL=[
 'SELECT a.client_id AS clientId,a.password_hash AS passwordHash,',
 'a.password_salt AS passwordSalt,a.password_iterations AS passwordIterations,',
 'a.password_algo AS passwordAlgo,a.role AS role,a.enabled AS enabled,',
 'a.updated_at AS updatedAt,c.status AS status,c.security_version AS securityVersion',
 'FROM client_accounts a JOIN clients c ON c.client_id=a.client_id',
 'WHERE a.client_id=?'
].join(' ');
const SESSION_SQL=[
 'SELECT s.client_id AS clientId,s.issued_at AS issuedAt,',
 's.expires_at AS expiresAt,s.revoked_at AS revokedAt,',
 's.security_version AS sessionVersion,s.auth_protocol_version AS protocolVersion,s.last_seen_at AS lastActivityAt,',
 'c.security_version AS currentVersion,c.status AS status,',
 'a.enabled AS enabled,a.role AS role',
 'FROM client_sessions s',
 'JOIN clients c ON c.client_id=s.client_id',
 'JOIN client_accounts a ON a.client_id=s.client_id',
 'WHERE s.session_hash=?'
].join(' ');

function tokenHash(token){
 if(typeof token!=='string'||!TOKEN_PATTERN.test(token))return null;
 const decoded=Buffer.from(token,'base64url');
 if(decoded.length!==32||decoded.toString('base64url')!==token)return null;
 return crypto.createHash('sha256').update(decoded).digest('hex');
}
function assertName(value){
 if(typeof value!=='string'||!SCOPE_PATTERN.test(value))throw Error('AUTH21_PREFERENCE_KEY_INVALID');
}
function assertValue(value){
 if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>16384)throw Error('AUTH21_PREFERENCE_VALUE_INVALID');
}
function sameAccount(before,after){
 return Boolean(after&&before.clientId===after.clientId &&
   before.passwordHash===after.passwordHash &&
   before.passwordSalt===after.passwordSalt &&
   before.passwordIterations===after.passwordIterations &&
   before.passwordAlgo===after.passwordAlgo &&
   before.updatedAt===after.updatedAt &&
   before.role===after.role && before.enabled===after.enabled &&
   before.status===after.status &&
   before.securityVersion===after.securityVersion);
}

class Auth21SessionStore {
 constructor({db,clientCrypto,snapshotGate,nowSeconds,idleLockSeconds=0,permissionsVersion=null}={}){
  if(!db||typeof db.prepare!=='function'||typeof db.transaction!=='function'||
     typeof db.pragma!=='function')throw Error('AUTH21_DB_REQUIRED');
  if(!clientCrypto||typeof clientCrypto.seal!=='function'||
     typeof clientCrypto.open!=='function')throw Error('AUTH21_CRYPTO_REQUIRED');
  if(snapshotGate&&typeof snapshotGate.assertWritable!=='function')throw Error('SNAPSHOT_GATE_INVALID');
  if(nowSeconds&&typeof nowSeconds!=='function')throw Error('AUTH21_CLOCK_INVALID');
  if(!Number.isSafeInteger(idleLockSeconds)||idleLockSeconds<0||idleLockSeconds>3600)throw Error('AUTH21_IDLE_LOCK_INVALID');
  if(permissionsVersion!==null&&(!Number.isSafeInteger(permissionsVersion)||permissionsVersion<1))throw Error('AUTH21_PERMISSIONS_VERSION_INVALID');
  this.permissionsVersion=permissionsVersion;
  if(permissionsVersion!==null&&!db.pragma('table_info(client_sessions)').some(c=>c.name==='permissions_version'))throw Error('AUTH21_PERMISSIONS_SCHEMA_REQUIRED');
  this.idleLockSeconds=idleLockSeconds;
  this.db=db;this.clientCrypto=clientCrypto;
  this.snapshotGate=snapshotGate||null;
  this.clock=nowSeconds||(()=>Math.floor(Date.now()/1000));
  // Fail closed if v3 hasn't been applied or is incomplete. No DDL/PRAGMA writes.
  const version=db.prepare('SELECT name FROM client_schema_migrations WHERE version=3').get();
  if(!version||version.name!=='auth21_schema_v3_offline_proposal')throw Error('AUTH21_V3_REQUIRED');
  for(const table of ['client_sessions','client_preferences','client_security_audit']){
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)){
    throw Error('AUTH21_SCHEMA_INCOMPLETE');
   }
  }
  // A stale partially-applied v3 must NEVER authenticate with revocation
  // triggers absent; otherwise a changed role could inherit old sessions.
  for(const name of ['auth21_account_security_invalidation','auth21_client_status_invalidation']){
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name)){
    throw Error('AUTH21_SECURITY_TRIGGERS_MISSING');
   }
  }
 }
 _now(){
  const n=this.clock();
  if(!Number.isSafeInteger(n)||n<1)throw Error('AUTH21_CLOCK_INVALID');
  return n;
 }
 _writable(){if(this.snapshotGate)this.snapshotGate.assertWritable();}
 _audit(clientId,action){
  this.db.prepare("INSERT INTO client_security_audit(client_id,action,created_at,detail_enc) VALUES(?,?,?,'')")
   .run(clientId,action,new Date(this._now()*1000).toISOString());
 }
 _account(clientId){return this.db.prepare(ACCOUNT_SQL).get(clientId);}
 _active(account){
  return Boolean(account&&account.status==='ACTIVE'&&account.enabled===1&&
    VALID_ROLES.has(account.role)&&Number.isSafeInteger(account.securityVersion)&&
    account.securityVersion>=1);
 }
 _resolve(token,{allowLocked=false}={}){
  const hash=tokenHash(token);
  if(!hash)return null;
  const row=this.db.prepare(SESSION_SQL).get(hash);
  if(!row||row.revokedAt!==null||row.expiresAt<=this._now()||
     row.protocolVersion!==1||row.sessionVersion!==row.currentVersion||
     row.status!=='ACTIVE'||row.enabled!==1||!VALID_ROLES.has(row.role))return null;
  if(!allowLocked&&this.idleLockSeconds&&(!Number.isSafeInteger(row.lastActivityAt)||
     this._now()-row.lastActivityAt>=this.idleLockSeconds))return null;
  return {clientId:row.clientId,role:row.role,issuedAt:row.issuedAt,expiresAt:row.expiresAt};
 }
 /** Authenticate a client with the password KDF; the clientId is a lookup
  * key, NOT evidence of identity. Async KDF finishes before transactional CAS.
  * Legacy PBKDF2 is accepted but NOT auto-rehashed here.
  */
 async loginWithPassword(clientId,password,{ttlSeconds=DEFAULT_TTL_SECONDS}={}){
  if(typeof clientId!=='string'||!/^CL[A-Za-z0-9_-]{1,64}$/.test(clientId)||
     typeof password!=='string')throw Error('AUTH21_LOGIN_INPUT_INVALID');
  if(!Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>MAX_TTL_SECONDS)throw Error('AUTH21_SESSION_TTL_INVALID');
  const before=this._account(clientId);
  if(!this._active(before))return null;
  const checked=await Kdf.verifyAccountPassword(before,password);
  if(!checked.verified)return null;
  this._writable();
  const raw=crypto.randomBytes(32),token=raw.toString('base64url');
  const digest=crypto.createHash('sha256').update(raw).digest('hex');
  const now=this._now();
  // Concurrency check in the same SQLite write transaction as token issuance.
  return this.db.transaction(()=>{
   this._writable();
   const current=this._account(clientId);
   if(!this._active(current)||!sameAccount(before,current))return null;
   this.db.prepare([
    'INSERT INTO client_sessions',
    '(session_hash,client_id,issued_at,expires_at,security_version,auth_protocol_version,last_seen_at)',
    'VALUES(?,?,?,?,?,1,?)'
   ].join(' ')).run(digest,clientId,now,now+ttlSeconds,current.securityVersion,now);
   if(this.permissionsVersion!==null)this.db.prepare('UPDATE client_sessions SET permissions_version=? WHERE session_hash=?').run(this.permissionsVersion,digest);
   this._audit(clientId,'SESSION_ISSUED');
   return {token,clientId,role:current.role,expiresAt:now+ttlSeconds};
  }).immediate();
 }
 /** Read-only authentication: DOES NOT update last_seen_at or extend TTL,
  * including when used by polling, WebSocket or background data refresh.
  */
 verifySession(token){return this._resolve(token);}
 /** Minimal state for resuming the lock screen; never a business principal. */
 sessionState(token){
  const session=this._resolve(token,{allowLocked:true});
  return session?{locked:!this._resolve(token),expiresAt:session.expiresAt}:null;
 }
 /** Explicit trusted user activity only; automatic polling never refreshes idle time. */
 recordUserActivity(token){
  if(!this.idleLockSeconds)throw Error('AUTH21_IDLE_LOCK_DISABLED');
  this._writable();
  return this.db.transaction(()=>{
   const principal=this._resolve(token);
   if(!principal)return false;
   const hash=tokenHash(token);
   return this.db.prepare('UPDATE client_sessions SET last_seen_at=? WHERE session_hash=? AND revoked_at IS NULL')
    .run(this._now(),hash).changes===1;
  }).immediate();
 }
 lockSession(token){
  if(!this.idleLockSeconds)throw Error('AUTH21_IDLE_LOCK_DISABLED');
  this._writable();
  return this.db.transaction(()=>{
   this._writable();const principal=this._resolve(token,{allowLocked:true});
   if(!principal)return false;
   this.db.prepare('UPDATE client_sessions SET last_seen_at=? WHERE session_hash=? AND revoked_at IS NULL')
    .run(Math.max(0,this._now()-this.idleLockSeconds),tokenHash(token));
   this._audit(principal.clientId,'SESSION_LOCKED');return true;
  }).immediate();
 }
 /** A locked but unexpired session requires the original password again. */
 async unlockWithPassword(token,password){
  if(!this.idleLockSeconds||typeof password!=='string')return false;
  const before=this._resolve(token,{allowLocked:true});
  if(!before)return false;
  const account=this._account(before.clientId);
  if(!this._active(account))return false;
  const verified=await Kdf.verifyAccountPassword(account,password);
  if(!verified.verified)return false;
  this._writable();
  return this.db.transaction(()=>{
   const principal=this._resolve(token,{allowLocked:true});
   const current=this._account(before.clientId);
   if(!principal||!this._active(current)||!sameAccount(account,current))return false;
   return this.db.prepare('UPDATE client_sessions SET last_seen_at=? WHERE session_hash=? AND revoked_at IS NULL')
    .run(this._now(),tokenHash(token)).changes===1;
  }).immediate();
 }
 /** Logout is limited to the caller's presented token, even if expired. */
 revokeSession(token){
  const digest=tokenHash(token);
  if(!digest)return false;
  this._writable();
  return this.db.transaction(()=>{
   this._writable();
   const row=this.db.prepare('SELECT client_id FROM client_sessions WHERE session_hash=? AND revoked_at IS NULL').get(digest);
   if(!row)return false;
   this.db.prepare('UPDATE client_sessions SET revoked_at=? WHERE session_hash=? AND revoked_at IS NULL')
    .run(this._now(),digest);
   this._audit(row.client_id,'SESSION_REVOKED');
   return true;
  }).immediate();
 }
 /** Revoke all of the requesting person's own sessions; no clientId input. */
 revokeMySessions(token){
  this._writable();
  return this.db.transaction(()=>{
   this._writable();
   const principal=this._resolve(token);
   if(!principal)throw Error('AUTH21_UNAUTHORIZED');
   const result=this.db.prepare('UPDATE client_sessions SET revoked_at=? WHERE client_id=? AND revoked_at IS NULL')
    .run(this._now(),principal.clientId);
   this._audit(principal.clientId,'SESSIONS_REVOKED_ALL');
   return result.changes;
  }).immediate();
 }
 getPreference(token,scope,key){
  assertName(scope);assertName(key);
  const principal=this._resolve(token);
  if(!principal)throw Error('AUTH21_UNAUTHORIZED');
  const row=this.db.prepare('SELECT value_enc FROM client_preferences WHERE client_id=? AND scope=? AND setting_key=?')
   .get(principal.clientId,scope,key);
  return row?this.clientCrypto.open(row.value_enc):null;
 }
 setPreference(token,scope,key,value){
  assertName(scope);assertName(key);assertValue(value);
  // Encrypt before entering the write transaction, never store plaintext.
  const encrypted=this.clientCrypto.seal(value);
  this._writable();
  return this.db.transaction(()=>{
   this._writable();
   const principal=this._resolve(token);
   if(!principal)throw Error('AUTH21_UNAUTHORIZED');
   if(principal.role==='GUEST')throw Error('AUTH21_READ_ONLY');
   this.db.prepare([
    'INSERT INTO client_preferences(client_id,scope,setting_key,value_enc,updated_at)',
    'VALUES(?,?,?,?,?) ON CONFLICT(client_id,scope,setting_key)',
    'DO UPDATE SET value_enc=excluded.value_enc,updated_at=excluded.updated_at'
   ].join(' ')).run(principal.clientId,scope,key,encrypted,new Date(this._now()*1000).toISOString());
   this._audit(principal.clientId,'PREFERENCE_UPDATED');
   return true;
  }).immediate();
 }
 deletePreference(token,scope,key){
  assertName(scope);assertName(key);
  this._writable();
  return this.db.transaction(()=>{
   this._writable();
   const principal=this._resolve(token);
   if(!principal)throw Error('AUTH21_UNAUTHORIZED');
   if(principal.role==='GUEST')throw Error('AUTH21_READ_ONLY');
   const result=this.db.prepare('DELETE FROM client_preferences WHERE client_id=? AND scope=? AND setting_key=?')
    .run(principal.clientId,scope,key);
   if(result.changes)this._audit(principal.clientId,'PREFERENCE_DELETED');
   return result.changes===1;
  }).immediate();
 }
}
module.exports={Auth21SessionStore};
