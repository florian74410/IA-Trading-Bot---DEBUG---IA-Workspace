'use strict';
const crypto=require('node:crypto'),Kdf=require('../password_hasher_v2');
const {Auth21SessionStore}=require('../auth21_session_store');
function digest(value){return crypto.createHash('sha256').update(value).digest('hex');}
function identity(email){return typeof email==='string'&&email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())?email.trim().toLowerCase():null;}
class UserStore extends Auth21SessionStore{
 constructor(options){super({...options,permissionsVersion:3});if(!this.db.prepare('SELECT 1 FROM client_schema_migrations WHERE version=5').get())throw Error('USER_MANAGEMENT_MIGRATION_REQUIRED');this.concurrent=0;}
 audit(id,action,result='OK'){
  if(!/^[A-Z0-9_]{1,64}$/.test(action)||!['OK','DENIED','FAILED'].includes(result))throw Error('AUDIT_INVALID');
  this.db.prepare("INSERT INTO client_security_audit(client_id,action,created_at,detail_enc,result) VALUES(?,?,?,?,?)").run(id,action,new Date(this._now()*1000).toISOString(),this.clientCrypto.seal(JSON.stringify({result})),result);
 }
 verifyHashedSession(hash){if(typeof hash!=='string'||!/^([a-f0-9]{64})$/.test(hash))return null;const r=this.db.prepare('SELECT s.client_id,s.expires_at,s.revoked_at,s.security_version,s.auth_protocol_version,s.permissions_version,c.security_version AS current_version,c.status,a.role,a.enabled FROM client_sessions s JOIN clients c ON c.client_id=s.client_id JOIN client_accounts a ON a.client_id=s.client_id WHERE session_hash=?').get(hash);return r&&r.permissions_version===3&&r.auth_protocol_version===1&&r.revoked_at===null&&r.expires_at>this._now()&&r.security_version===r.current_version&&r.status==='ACTIVE'&&r.enabled===1&&['ADMIN','USER','GUEST'].includes(r.role)?{clientId:r.client_id,role:r.role}:null;}
 verifySession(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;const permission=this.db.prepare('SELECT permissions_version FROM client_sessions WHERE session_hash=?').get(digest(Buffer.from(token,'base64url')));if(!permission||permission.permissions_version!==3)return null;const p=super.verifySession(token);if(!p&&typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token)){const hash=digest(Buffer.from(token,'base64url')),r=this.db.prepare('SELECT client_id,expires_at,revoked_at,auth_protocol_version FROM client_sessions WHERE session_hash=?').get(hash);if(r&&r.auth_protocol_version===1&&r.revoked_at===null&&r.expires_at<=this._now())this.db.transaction(()=>{this.db.prepare('UPDATE client_sessions SET revoked_at=? WHERE session_hash=?').run(this._now(),hash);this.audit(r.client_id,'SESSION_EXPIRED');}).immediate();}return p;}
 profile(token){const p=this.verifySession(token);if(!p)throw Error('UNAUTHORIZED');const c=this.db.prepare('SELECT * FROM clients WHERE client_id=?').get(p.clientId);return {clientId:p.clientId,role:p.role,firstName:this.clientCrypto.open(c.first_name_enc),lastName:this.clientCrypto.open(c.last_name_enc),email:this.clientCrypto.open(c.email_enc),username:this.clientCrypto.open(this.db.prepare('SELECT username_enc FROM client_accounts WHERE client_id=?').get(p.clientId).username_enc)};}
 attempt(key,limit=5){const now=this._now();return this.db.transaction(()=>{this.db.prepare('DELETE FROM um_login_attempts WHERE until_at<?').run(now);const r=this.db.prepare('SELECT * FROM um_login_attempts WHERE key=?').get(key);if(r&&r.attempts>=limit)return false;this.db.prepare('INSERT INTO um_login_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').run(key,now+300);return true;}).immediate();}
 touch(token){const p=this.verifySession(token);if(!p)return false;return this.db.prepare('UPDATE client_sessions SET last_seen_at=? WHERE session_hash=? AND last_seen_at<?').run(this._now(),digest(Buffer.from(token,'base64url')),this._now()-30).changes===1;}
 async loginEmail(email,password,ip='local'){
  const normalized=identity(email),key=digest('email:'+String(normalized||'invalid')),peer=digest('ip:'+ip);
  if(!this.attempt(peer,30)||!this.attempt(key))return {throttled:true};
  if(this.concurrent>=2)return {busy:true};this.concurrent++;
  try{
   const row=normalized&&this.db.prepare('SELECT client_id FROM clients WHERE email_hash=?').get(this.clientCrypto.lookupHash(normalized));
   let login=null;
   if(row)login=await this.loginWithPassword(row.client_id,password);
   if(!row||!this._active(this._account(row.client_id)))await Kdf.hashNewPassword('Dummy credential for timing only 4B!');
   if(!login){this.audit(row?.client_id||null,'LOGIN_FAILED','DENIED');return null;}
   this.db.prepare('DELETE FROM um_login_attempts WHERE key=?').run(key);
   // A valid login does not erase IP-wide rate accounting; bound issuance.
   const old=this.db.prepare('SELECT session_hash FROM client_sessions WHERE client_id=? AND revoked_at IS NULL ORDER BY (session_hash=?) DESC,issued_at DESC,session_hash').all(login.clientId,digest(Buffer.from(login.token,'base64url')));
   for(const x of old.slice(20))this.db.prepare('UPDATE client_sessions SET revoked_at=? WHERE session_hash=?').run(this._now(),x.session_hash);
   this.audit(login.clientId,'LOGIN_SUCCEEDED');return login;
  }finally{this.concurrent--;}
 }
 async reauthenticate(token,password){
  const p=this.verifySession(token);if(!p)throw Error('UNAUTHORIZED');
  if(!this.attempt(digest('reauth:'+p.clientId)))throw Error('AUTH_THROTTLED');
  const before=this._account(p.clientId),ok=await Kdf.verifyAccountPassword(before,password);
  const after=this.verifySession(token),current=this._account(p.clientId);
  if(!ok.verified||!after||JSON.stringify(before)!==JSON.stringify(current)){this.audit(p.clientId,'REAUTH_FAILED','DENIED');throw Error('INVALID_CREDENTIALS');}
  this.db.prepare('DELETE FROM um_login_attempts WHERE key=?').run(digest('reauth:'+p.clientId));return {principal:after,before};
 }
 async updateProfile(token,input){
  if(Object.keys(input).some(k=>!['firstName','lastName','email','password'].includes(k)))throw Error('INVALID_REQUEST');
  const {principal:p,before}=await this.reauthenticate(token,input.password),me=this.profile(token);
  const email=identity(input.email??me.email),first=String(input.firstName??me.firstName).trim(),last=String(input.lastName??me.lastName).trim();
  if(!email||!first||first.length>80||last.length>80)throw Error('INVALID_REQUEST');
  return this.db.transaction(()=>{
   if(!this.verifySession(token)||this._account(p.clientId).securityVersion!==before.securityVersion)throw Error('UNAUTHORIZED');
   this.db.prepare('UPDATE clients SET first_name_enc=?,last_name_enc=?,email_enc=?,email_hash=?,updated_at=? WHERE client_id=?').run(this.clientCrypto.seal(first),this.clientCrypto.seal(last),this.clientCrypto.seal(email),this.clientCrypto.lookupHash(email),new Date().toISOString(),p.clientId);
   this.audit(p.clientId,'PROFILE_UPDATED');
   if(email!==me.email){this.db.prepare('UPDATE clients SET security_version=security_version+1 WHERE client_id=?').run(p.clientId);this.revokeAllFor(p.clientId);this.audit(p.clientId,'EMAIL_CHANGED');}
   return {ok:true,reauthenticationRequired:email!==me.email};
  }).immediate();
 }
 async changePassword(token,input){
  if(Object.keys(input).sort().join(',')!=='newPassword,password')throw Error('INVALID_REQUEST');
  const {principal:p,before}=await this.reauthenticate(token,input.password);const hash=await Kdf.hashNewPassword(input.newPassword);
  return this.db.transaction(()=>{
   if(!this.verifySession(token)||this._account(p.clientId).securityVersion!==before.securityVersion)throw Error('UNAUTHORIZED');
   this.db.prepare("UPDATE client_accounts SET password_algo='ARGON2ID',password_hash=?,password_salt='',password_iterations=0,updated_at=? WHERE client_id=?").run(hash,new Date().toISOString(),p.clientId);
   this.audit(p.clientId,'PASSWORD_CHANGED');return {ok:true,reauthenticationRequired:true,userSecretsPreserved:true};
  }).immediate();
 }
 revokeAllFor(id,exceptHash=null){return this.db.prepare('UPDATE client_sessions SET revoked_at=? WHERE client_id=? AND revoked_at IS NULL AND session_hash<>?').run(this._now(),id,exceptHash||'').changes;}
 planBrowserAction(token,action,args){const principal=this.verifySession(token);if(!principal||principal.role==='GUEST')throw Error('FORBIDDEN');if(!/^chart\.(?:get_state|set_symbol|set_timeframe|add_indicator|remove_indicator|list_indicators|fit|focus|restore|clear_analysis|add_level|remove_level)$/.test(action)||!args||typeof args!=='object'||Array.isArray(args))throw Error('INVALID_REQUEST');const now=Date.now(),record={action_id:'act-'+require('node:crypto').randomBytes(16).toString('hex'),protocol:'CP/1',target:'chart_viewer',action,arguments:args,created_at:now,expires_at:now+90000,request_id:null,status:'PENDING_ACK'};const rows=this.db.prepare("SELECT setting_key,value_enc FROM client_preferences WHERE client_id=? AND scope='browser_actions'").all(principal.clientId);let active=0;for(const row of rows){const previous=JSON.parse(this.clientCrypto.open(row.value_enc));if(previous.expires_at<=now)this.deletePreference(token,'browser_actions',row.setting_key);else active++;}if(active>=128)throw Error('BROWSER_ACTION_LIMIT');this.setPreference(token,'browser_actions',record.action_id,JSON.stringify(record));return record;}
 acknowledgeBrowserAction(token,input){if(!input||Object.keys(input).some(k=>!['action_id','status','message','data'].includes(k))||!['SUCCESS','REJECTED','ERROR'].includes(input.status))throw Error('INVALID_REQUEST');const value=this.getPreference(token,'browser_actions',input.action_id);if(!value)throw Error('NOT_FOUND');const action=JSON.parse(value);if(action.expires_at<=Date.now())throw Error('NOT_FOUND');this.deletePreference(token,'browser_actions',input.action_id);return {action_id:action.action_id,target:action.target,action:action.action,status:input.status,completed_at:Date.now(),message:String(input.message||'').slice(0,500),data:input.data||{}};}
 browserState(token){const p=this.verifySession(token);if(!p)throw Error('UNAUTHORIZED');if(p.role==='GUEST')return {};const row=this.db.prepare('SELECT value_enc FROM um_browser_state WHERE client_id=?').get(p.clientId);return row?JSON.parse(this.clientCrypto.open(row.value_enc)):JSON.parse(this.getPreference(token,'browser','state')||'{}');}
 setBrowserState(token,state){const p=this.verifySession(token);if(!p||p.role==='GUEST')throw Error('FORBIDDEN');if(!state||typeof state!=='object'||Array.isArray(state)||Object.keys(state).length>256||Object.entries(state).some(([k,v])=>!k||k.length>128||typeof v!=='string'||Buffer.byteLength(v)>131072))throw Error('INVALID_REQUEST');const raw=JSON.stringify(state);if(Buffer.byteLength(raw)>262144)throw Error('INVALID_REQUEST');this.db.prepare('INSERT INTO um_browser_state VALUES(?,?) ON CONFLICT(client_id) DO UPDATE SET value_enc=excluded.value_enc').run(p.clientId,this.clientCrypto.seal(raw));}
 sessionsFor(token){const p=this.verifySession(token);if(!p)throw Error('UNAUTHORIZED');const own=digest(Buffer.from(token,'base64url'));return this.db.prepare('SELECT session_hash,issued_at,expires_at,last_seen_at FROM client_sessions WHERE client_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY issued_at DESC').all(p.clientId,this._now()).map(x=>({id:this.sessionId(x.session_hash),createdAt:x.issued_at,expiresAt:x.expires_at,lastActivityAt:x.last_seen_at,current:x.session_hash===own}));}
 sessionId(hash){return crypto.createHmac('sha256',this.clientCrypto.master).update('session-public-id:'+hash).digest('hex').slice(0,32);}
 revokeOwn(token,id){const p=this.verifySession(token);if(!p)throw Error('UNAUTHORIZED');if(id==='others'){const n=this.revokeAllFor(p.clientId,digest(Buffer.from(token,'base64url')));this.audit(p.clientId,'OTHER_SESSIONS_REVOKED');return n;}
  const rows=this.db.prepare('SELECT session_hash FROM client_sessions WHERE client_id=? AND revoked_at IS NULL').all(p.clientId);const row=rows.find(x=>this.sessionId(x.session_hash)===id);if(!row)throw Error('NOT_FOUND');this.db.prepare('UPDATE client_sessions SET revoked_at=? WHERE session_hash=?').run(this._now(),row.session_hash);this.audit(p.clientId,'SESSION_REVOKED');return 1;
 }
 recent(token){const p=this.verifySession(token);if(!p)throw Error('UNAUTHORIZED');return this.db.prepare('SELECT action,result,created_at AS createdAt FROM client_security_audit WHERE client_id=? ORDER BY id DESC LIMIT 30').all(p.clientId);}
 secretForSessionHash(hash,name){const p=this.verifyHashedSession(hash);if(!p||p.role==='GUEST')throw Error('UNAUTHORIZED');const row=this.db.prepare('SELECT payload_enc FROM um_secrets WHERE client_id=?').get(p.clientId);return row?JSON.parse(this.clientCrypto.open(row.payload_enc))[name]||'':'';}
 secrets(token){const p=this.verifySession(token);if(!p||p.role==='GUEST')throw Error('FORBIDDEN');const row=this.db.prepare('SELECT payload_enc FROM um_secrets WHERE client_id=?').get(p.clientId);return row?JSON.parse(this.clientCrypto.open(row.payload_enc)):{};}
 setSecrets(token,values){const p=this.verifySession(token);if(!p||p.role==='GUEST')throw Error('FORBIDDEN');const out=this.secrets(token);for(const [k,v] of Object.entries(values)){if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(k)||typeof v!=='string'||v.length>8192)throw Error('INVALID_REQUEST');if(v==='__CLEAR__')delete out[k];else if(v)out[k]=v;}this.db.prepare('INSERT INTO um_secrets VALUES(?,?) ON CONFLICT(client_id) DO UPDATE SET payload_enc=excluded.payload_enc').run(p.clientId,this.clientCrypto.seal(JSON.stringify(out)));this.audit(p.clientId,'SECRETS_UPDATED');}
}
module.exports={UserStore,identity};
