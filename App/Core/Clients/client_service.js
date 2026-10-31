'use strict';
var crypto=require('crypto');

function cleanName(v){return String(v==null?'':v).trim().replace(/\s+/g,' ').slice(0,80);}
function cleanEmail(v){var e=String(v==null?'':v).trim().toLowerCase().slice(0,254);if(e&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw new Error('CLIENT_EMAIL_INVALID');return e;}
function splitName(username){
  var s=cleanName(username);if(!s||s==='Utilisateur')return{firstName:s||'',lastName:''};
  var p=s.split(' ');return{firstName:p.shift()||'',lastName:p.join(' ')};
}
function ClientService(repository,crypto,store){
  this.repo=repository;this.crypto=crypto;this.store=store;this.bindingScope='client_identity';this.bindingKey='active_client_id';
}
ClientService.prototype._public=function(x){
  if(!x)return null;
  return{clientId:x.clientId,firstName:this.crypto.open(x.firstNameEnc),lastName:this.crypto.open(x.lastNameEnc),email:this.crypto.open(x.emailEnc),status:x.status,securityVersion:x.securityVersion,createdAt:x.createdAt,updatedAt:x.updatedAt};
};
ClientService.prototype._externalRef=function(sess){
  if(sess&&sess.userId)return'user:'+sess.userId;
  if(sess&&sess.email)return'email:'+String(sess.email).toLowerCase();
  if(sess&&sess.username)return'username:'+String(sess.username).toLowerCase();
  return'local-admin';
};
ClientService.prototype.resolveSession=function(sess){
  this.repo.assertReady();
  if(sess&&sess.auth21){var owned=this.repo.byId(sess.clientId);if(!owned||owned.status!=='ACTIVE')throw Error('AUTH_REQUIRED');return this._public(owned);}
  var explicit=String(sess&&sess.clientId||'').trim(),x=null,bound='';
  if(explicit)x=this.repo.byId(explicit);
  var email=cleanEmail(sess&&sess.email||'');
  if(!x&&email)x=this.repo.byEmailHash(this.crypto.lookupHash(email));
  if(!x&&this.store){bound=String(this.store.get(this.bindingScope,this.bindingKey,'')||'');if(bound)x=this.repo.byId(bound);}
  var extHash=this.crypto.externalHash(this._externalRef(sess));
  if(!x)x=this.repo.byExternalHash(extHash);
  if(!x){
    var n=splitName(sess&&sess.username||'Utilisateur'),now=new Date().toISOString();
    x=this.repo.insert({clientId:this.repo.nextClientId(),externalRefHash:extHash,firstNameEnc:this.crypto.seal(n.firstName),lastNameEnc:this.crypto.seal(n.lastName),emailEnc:this.crypto.seal(email),emailHash:email?this.crypto.lookupHash(email):'',status:'ACTIVE',securityVersion:1,createdAt:now,updatedAt:now});
    this.repo.audit(x.clientId,'CLIENT_CREATED',null,this.crypto.seal(JSON.stringify({source:'session-bootstrap'})));
  }
  if(this.store){this.store.set(this.bindingScope,this.bindingKey,x.clientId);this.store.set('local_profile','username','');this.store.set('local_profile','email','');}
  if(sess)sess.clientId=x.clientId;
  return this._public(x);
};
ClientService.prototype.update=function(sess,input){
  input=input||{};var me=this.resolveSession(sess),hasUsername=input.username!=null&&String(input.username).trim()!=='',n=hasUsername?splitName(input.username):{firstName:me.firstName,lastName:me.lastName},first=cleanName(input.firstName!=null?input.firstName:n.firstName),last=cleanName(input.lastName!=null?input.lastName:n.lastName),email=cleanEmail(input.email!=null?input.email:me.email),emailHash=email?this.crypto.lookupHash(email):'';
  if(emailHash){var other=this.repo.byEmailHash(emailHash);if(other&&other.clientId!==me.clientId)throw new Error('CLIENT_EMAIL_ALREADY_USED');}
  var out=this.repo.updateIdentity(me.clientId,{firstNameEnc:this.crypto.seal(first),lastNameEnc:this.crypto.seal(last),emailEnc:this.crypto.seal(email),emailHash:emailHash,updatedAt:new Date().toISOString()});
  this.repo.audit(me.clientId,'CLIENT_PROFILE_UPDATED',null,this.crypto.seal(JSON.stringify({fields:['firstName','lastName','email']})));
  if(sess){sess.clientId=me.clientId;sess.email=email;sess.username=(first+' '+last).trim()||sess.username;}
  return this._public(out);
};
ClientService.prototype._passwordHash=function(password,salt,iterations){
  return crypto.pbkdf2Sync(String(password||''),String(salt||''),+iterations||180000,32,'sha256').toString('hex');
};
ClientService.prototype.accountByClientId=function(clientId){
  var a=this.repo.authByClientId(String(clientId||''));if(!a)return null;
  return{clientId:a.clientId,username:this.crypto.open(a.usernameEnc),role:String(a.role||'USER').toUpperCase(),enabled:a.enabled,createdAt:a.createdAt,updatedAt:a.updatedAt};
};
ClientService.prototype.verifyPassword=function(clientId,password){
  var trusted=require('./UserManagement/context').current();if(trusted&&trusted.credentialClientId===clientId)return true;
  var a=this.repo.authByClientId(String(clientId||''));if(!a||!a.enabled)return false;
  var candidate=this._passwordHash(password,a.passwordSalt,a.passwordIterations),stored=String(a.passwordHash||'');
  if(candidate.length!==stored.length)return false;
  try{return crypto.timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(stored,'hex'));}catch(e){return false;}
};
ClientService.prototype.bootstrapDebugUser=function(opts){
  opts=opts||{};this.repo.assertReady();
  var username=String(opts.username||'').trim().toUpperCase(),password=String(opts.password||''),role=String(opts.role||'SUPERADMIN').trim().toUpperCase();
  if(!/^[A-Z0-9._-]{3,64}$/.test(username)||password.length<16)throw new Error('DEBUG_BOOTSTRAP_EXPLICIT_CREDENTIALS_REQUIRED');
  var email=cleanEmail(opts.email||'overkill.debug@iatb.local'),first=cleanName(opts.firstName||'OVERKILL'),last=cleanName(opts.lastName||'DEBUG');
  var extHash=this.crypto.externalHash('debug-user:'+username),x=this.repo.byExternalHash(extHash),now=new Date().toISOString();
  if(!x){
    var existingEmail=this.repo.byEmailHash(this.crypto.lookupHash(email));
    if(existingEmail)x=existingEmail;
  }
  if(!x){
    x=this.repo.insert({clientId:this.repo.nextClientId(),externalRefHash:extHash,firstNameEnc:this.crypto.seal(first),lastNameEnc:this.crypto.seal(last),emailEnc:this.crypto.seal(email),emailHash:this.crypto.lookupHash(email),status:'ACTIVE',securityVersion:1,createdAt:now,updatedAt:now});
    this.repo.audit(x.clientId,'DEBUG_CLIENT_CREATED',null,this.crypto.seal(JSON.stringify({username:username,role:role})));
  }else{
    x=this.repo.updateIdentity(x.clientId,{firstNameEnc:this.crypto.seal(first),lastNameEnc:this.crypto.seal(last),emailEnc:this.crypto.seal(email),emailHash:this.crypto.lookupHash(email),updatedAt:now});
  }
  var usernameHash=this.crypto.lookupHash('username:'+username),auth=this.repo.authByClientId(x.clientId),iterations=180000,salt=auth&&auth.passwordSalt||crypto.randomBytes(16).toString('hex');
  var expected=this._passwordHash(password,salt,iterations),needsAuth=!auth||auth.usernameHash!==usernameHash||auth.passwordHash!==expected||String(auth.role||'').toUpperCase()!==role||!auth.enabled;
  if(needsAuth){
    auth=this.repo.upsertAuth({clientId:x.clientId,usernameEnc:this.crypto.seal(username),usernameHash:usernameHash,passwordSalt:salt,passwordHash:expected,passwordIterations:iterations,role:role,enabled:true,createdAt:auth&&auth.createdAt||now,updatedAt:now});
    this.repo.audit(x.clientId,'DEBUG_AUTH_READY',null,this.crypto.seal(JSON.stringify({username:username,role:role})));
  }
  if(this.store){this.store.set(this.bindingScope,this.bindingKey,x.clientId);this.store.set('client_identity','debug_username',username);}
  return{clientId:x.clientId,username:username,firstName:first,lastName:last,email:email,status:'ACTIVE',role:role,enabled:true,debug:true};
};
ClientService.prototype.active=function(){if(!this.store)return null;var id=String(this.store.get(this.bindingScope,this.bindingKey,'')||'');if(!id)return null;var x=this.repo.byId(id);if(!x)return null;var p=this._public(x),a=this.accountByClientId(id);if(a){p.username=a.username;p.role=a.role;p.enabled=a.enabled;}return p;};
ClientService.prototype.byId=function(id){var x=this.repo.byId(String(id||''));return x?this._public(x):null;};
ClientService.prototype.findByEmail=function(email){var h=this.crypto.lookupHash(cleanEmail(email));if(!h)return null;var x=this.repo.byEmailHash(h);return x?this._public(x):null;};
ClientService.prototype.me=function(sess){var p=this.resolveSession(sess),a=this.accountByClientId(p.clientId);if(a){p.username=a.username;p.role=a.role;p.enabled=a.enabled;}p.walletIds=this.repo.walletIds(p.clientId,true);return p;};
ClientService.prototype.listAdmin=function(){var self=this;return this.repo.list().map(function(x){var p=self._public(x),a=self.accountByClientId(p.clientId);if(a){p.username=a.username;p.role=a.role;p.enabled=a.enabled;}p.walletIds=self.repo.walletIds(p.clientId,true);return p;});};
ClientService.prototype.linkWallet=function(sess,walletId){var me=this.resolveSession(sess);this.repo.linkWallet(me.clientId,walletId);this.repo.audit(me.clientId,'WALLET_LINKED',walletId,'');return me.clientId;};
ClientService.prototype.archiveWallet=function(sess,walletId){var me=this.resolveSession(sess);this.repo.archiveWallet(me.clientId,walletId);this.repo.audit(me.clientId,'WALLET_ARCHIVED',walletId,'');return me.clientId;};
ClientService.prototype.status=function(){var s=this.repo.status();return{ready:s.ready,schemaVersion:s.schemaVersion,backend:s.backend,lastError:s.lastError};};
module.exports=ClientService;
