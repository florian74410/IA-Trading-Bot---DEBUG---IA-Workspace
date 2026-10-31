'use strict';
var fs=require('fs'),path=require('path'),crypto=require('crypto'),Multi=require('./multichain_wallet');
function denySnapshotTrial(){if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1')throw Error('AUTH21_WALLET_DISABLED_DURING_SNAPSHOT_TRIAL');}
function WalletService(root,store,clientService,opts){opts=opts||{};this.root=root;this.store=store;this.clientService=clientService;this.legacyKeyFile=path.join(root,'UserData','wallet_master.key');this.keyFile=path.resolve(opts.keyFile||this.legacyKeyFile);this.schemaVersion=3;}
WalletService.prototype._master=function(){denySnapshotTrial();if(require('../../Core/Clients/UserManagement/context').current()){var original=fs.lstatSync(this.keyFile);if(!original.isFile()||original.isSymbolicLink()||(original.mode&0o077))throw Error('WALLET_ORIGINAL_KEY_REQUIRED');var encoded=fs.readFileSync(this.keyFile,'utf8').trim();if(!/^[a-f0-9]{64}$/i.test(encoded))throw Error('WALLET_ORIGINAL_KEY_INVALID');return Buffer.from(encoded,'hex');}var k;try{k=Buffer.from(String(fs.readFileSync(this.keyFile,'utf8')).trim(),'hex');if(k.length===32)return k;}catch(e){}if(this.keyFile!==this.legacyKeyFile){try{k=Buffer.from(String(fs.readFileSync(this.legacyKeyFile,'utf8')).trim(),'hex');if(k.length===32){var md=path.dirname(this.keyFile);if(!fs.existsSync(md))fs.mkdirSync(md,{recursive:true,mode:448});fs.writeFileSync(this.keyFile,k.toString('hex'),{encoding:'utf8',mode:384,flag:'wx'});try{fs.chmodSync(this.keyFile,384);}catch(x){}return k;}}catch(e){}}k=crypto.randomBytes(32);var d=path.dirname(this.keyFile);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true,mode:448});fs.writeFileSync(this.keyFile,k.toString('hex'),{encoding:'utf8',mode:384,flag:'wx'});try{fs.chmodSync(this.keyFile,384);}catch(e){}return k;};
WalletService.prototype._legacyOwner=function(sess){var raw=String(sess&&sess.userId||sess&&sess.email||sess&&sess.username||'local-admin').trim().toLowerCase();return crypto.createHash('sha256').update(raw).digest('hex').slice(0,32);};
WalletService.prototype._client=function(sess){if(!this.clientService)throw new Error('CLIENT_SERVICE_REQUIRED');return this.clientService.resolveSession(sess);};
WalletService.prototype._key=function(sess){return'wallets:client:'+this._client(sess).clientId;};
WalletService.prototype._legacyKey=function(sess){return'wallets:'+this._legacyOwner(sess);};
WalletService.prototype._all=function(sess){
 denySnapshotTrial();var client=this._client(sess),key='wallets:client:'+client.clientId,a=this.store.get('bank_wallets',key,[]);
 if(!Array.isArray(a))a=[];
 if(!a.length&&!(sess&&sess.auth21)){
  var legacyKey=this._legacyKey(sess),legacy=this.store.get('bank_wallets',legacyKey,[]);
  if((!Array.isArray(legacy)||!legacy.length)&&this.store.listKeys){
   var candidates=this.store.listKeys('bank_wallets').filter(function(k){return /^wallets:(?!client:)/.test(k);});
   if(candidates.length===1){legacyKey=candidates[0];legacy=this.store.get('bank_wallets',legacyKey,[]);}
  }
  if(Array.isArray(legacy)&&legacy.length){
   a=legacy.map(function(w){var x=Object.assign({},w);if(x.ownerId&&!x.legacyOwnerId)x.legacyOwnerId=x.ownerId;delete x.ownerId;x.clientId=client.clientId;x.schemaVersion=Math.max(+x.schemaVersion||1,3);return x;});
   this.store.set('bank_wallets',key,a);
   if(this.store.markMigration)this.store.markMigration('wallet-client-link-'+client.clientId,{wallets:a.length,legacyKey:legacyKey,newKey:key});
   for(var i=0;i<a.length;i++)this.clientService.linkWallet(sess,a[i].id);
  }
 }
 return a;
};
WalletService.prototype._save=function(sess,a){denySnapshotTrial();this.store.set('bank_wallets',this._key(sess),a);return a;};
WalletService.prototype._enc=function(text){var iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',this._master(),iv),d=Buffer.concat([c.update(Buffer.from(String(text),'utf8')),c.final()]);return{v:1,alg:'AES-256-GCM',iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:d.toString('base64')};};
WalletService.prototype._dec=function(env){var d=crypto.createDecipheriv('aes-256-gcm',this._master(),Buffer.from(env.iv,'base64'));d.setAuthTag(Buffer.from(env.tag,'base64'));return Buffer.concat([d.update(Buffer.from(env.data,'base64')),d.final()]).toString('utf8');};
WalletService.prototype._legacyAccounts=function(x){if(Array.isArray(x.accounts))return x.accounts;return[{id:String(x.family||'evm').toLowerCase(),family:x.family||'EVM',address:x.address,publicKey:x.publicKey,networks:[String(x.network||'ethereum').toLowerCase().replace('bnb chain','bnb')],secretEnvelope:x.privateKeyEnvelope||null,recoveryFormat:'HEX_PRIVATE_KEY'}];};
WalletService.prototype.public=function(x){var accounts=this._legacyAccounts(x).map(function(a){return{id:a.id,family:a.family,address:a.address,publicKey:a.publicKey,networks:a.networks||[],recoveryFormat:a.recoveryFormat,hasSecret:!!a.secretEnvelope,keyManagerHidden:!!a.keyManagerHidden};});var primary=accounts[0]||{};return{id:x.id,walletId:x.id,schemaVersion:x.schemaVersion||1,clientId:x.clientId||null,name:x.name,kind:x.kind||((x.schemaVersion||1)>=2?'MULTICHAIN':'LEGACY_SINGLE_CHAIN'),network:(x.schemaVersion||1)>=2?'Multi-chain':(x.network||((primary.networks||[])[0])),networks:(x.networks||accounts.reduce(function(z,a){return z.concat(a.networks||[])},[])).filter(function(v,i,a){return a.indexOf(v)===i}),address:primary.address,publicKey:primary.publicKey,hasSecret:accounts.some(function(a){return!!a.hasSecret}),accounts:accounts,createdAt:x.createdAt,archived:!!x.archived};};
WalletService.prototype.list=function(sess,includeArchived){var self=this;return this._all(sess).filter(function(x){return includeArchived||!x.archived;}).map(function(x){return self.public(x);});};
WalletService.prototype.networks=function(){return Multi.publicNetworks();};
WalletService.prototype.nextId=function(sess){var a=this._all(sess),used={};a.forEach(function(w){used[String(w.id||'')]=1;});var n=1,id;do{id='W'+String(n++).padStart(4,'0');}while(used[id]);return id;};
WalletService.prototype.create=function(sess,input){input=input||{};var name=String(input.name||'').trim().slice(0,60);if(!name)throw new Error('WALLET_NAME_REQUIRED');var type=String(input.type||'MULTICHAIN').trim().toUpperCase(),network=String(input.network||'MULTICHAIN').trim().toLowerCase(),password=String(input.password||''),client=this._client(sess),account=this.clientService.accountByClientId(client.clientId);if(account){if(!this.clientService.verifyPassword(client.clientId,password))throw new Error('WALLET_PASSWORD_INVALID');}else if(password.length<8)throw new Error('WALLET_PASSWORD_TOO_SHORT');if(input.notRobot!==true)throw new Error('HUMAN_CONFIRMATION_REQUIRED');var expected=this.nextId(sess);if(input.id&&String(input.id)!==expected)throw new Error('WALLET_ID_STALE');var bundle=Multi.generateBundle(),self=this,accounts=bundle.accounts.map(function(a){return{id:a.id,family:a.family,address:a.address,publicKey:a.publicKey,networks:a.networks.slice(),recoveryFormat:a.recoveryFormat,secretEnvelope:self._enc(JSON.stringify({privateKey:a.privateKey,recovery:a.recovery,recoveryFormat:a.recoveryFormat}))};}),a=this._all(sess),x={id:expected,schemaVersion:this.schemaVersion,clientId:client.clientId,name:name,kind:'MULTICHAIN',requestedType:type,preferredNetwork:network,networks:Multi.NETWORKS.map(function(n){return n.id}),accounts:accounts,createdAt:new Date().toISOString(),archived:false};password='';a.push(x);this._save(sess,a);this.clientService.linkWallet(sess,x.id);return this.public(x);};
WalletService.prototype.importWallet=function(sess,input){
 input=input||{};var name=String(input.name||'').trim().slice(0,60);if(!name)throw new Error('WALLET_NAME_REQUIRED');
 var type=String(input.type||'PERSONAL').trim().toUpperCase(),network=String(input.network||'').trim().toLowerCase(),secret=String(input.secret||'').trim(),password=String(input.password||''),client=this._client(sess),auth=this.clientService.accountByClientId(client.clientId);
 if(!secret)throw new Error('WALLET_IMPORT_SECRET_REQUIRED');
 if(auth){if(!this.clientService.verifyPassword(client.clientId,password))throw new Error('WALLET_PASSWORD_INVALID');}else if(password.length<8)throw new Error('WALLET_PASSWORD_TOO_SHORT');
 if(input.notRobot!==true)throw new Error('HUMAN_CONFIRMATION_REQUIRED');
 var expected=this.nextId(sess);if(input.id&&String(input.id)!==expected)throw new Error('WALLET_ID_STALE');
 var bundle=Multi.importBundle(network,secret),self=this,accounts=bundle.accounts.map(function(a){return{id:a.id,family:a.family,address:a.address,publicKey:a.publicKey,networks:a.networks.slice(),recoveryFormat:a.recoveryFormat,secretEnvelope:self._enc(JSON.stringify({privateKey:a.privateKey,recovery:a.recovery,recoveryFormat:a.recoveryFormat}))};});
 secret='';var networks=accounts.reduce(function(z,a){return z.concat(a.networks||[])},[]).filter(function(v,i,a){return a.indexOf(v)===i}),all=this._all(sess),x={id:expected,schemaVersion:this.schemaVersion,clientId:client.clientId,name:name,kind:'IMPORTED',requestedType:type,preferredNetwork:network,networks:networks,accounts:accounts,createdAt:new Date().toISOString(),importedAt:new Date().toISOString(),archived:false};
 all.push(x);this._save(sess,all);this.clientService.linkWallet(sess,x.id);return this.public(x);
};
WalletService.prototype.removeSecret=function(sess,id,accountId){
 var all=this._all(sess),x=all.filter(function(w){return w.id===id&&!w.archived;})[0];if(!x)throw new Error('WALLET_NOT_FOUND');
 var accounts=this._legacyAccounts(x),a=accounts.filter(function(v){return v.id===accountId})[0];if(!a)throw new Error('WALLET_ACCOUNT_NOT_FOUND');
 a.secretEnvelope=null;a.secretRemovedAt=new Date().toISOString();a.keyManagerHidden=true;x.accounts=accounts;this._save(sess,all);return this.public(x);
};
WalletService.prototype.exportKeys=function(sess){
 var self=this,client=this._client(sess);
 return{schema:1,application:'IA-TB',type:'WALLET_KEY_METADATA',exportedAt:new Date().toISOString(),clientId:client.clientId,secretsExcluded:true,items:this._all(sess).filter(function(w){return!w.archived;}).map(function(w){var p=self.public(w);return{id:p.id,name:p.name,kind:p.kind,networks:p.networks,accounts:p.accounts.map(function(a){return{id:a.id,family:a.family,address:a.address,publicKey:a.publicKey,networks:a.networks,recoveryFormat:a.recoveryFormat,hasSecret:a.hasSecret};})};})};
};
WalletService.prototype.reveal=function(sess,id,accountId){var x=this._all(sess).filter(function(w){return w.id===id&&!w.archived;})[0];if(!x)throw new Error('WALLET_NOT_FOUND');var accounts=this._legacyAccounts(x),account=accounts.filter(function(a){return a.id===accountId})[0]||accounts[0];if(!account||!account.secretEnvelope)throw new Error('WALLET_SECRET_NOT_STORED');var raw=this._dec(account.secretEnvelope),secret;try{secret=JSON.parse(raw);}catch(e){secret={privateKey:raw,recovery:raw,recoveryFormat:account.recoveryFormat||'PRIVATE_KEY'};}return{id:x.id,accountId:account.id,family:account.family,address:account.address,publicKey:account.publicKey,privateKey:secret.privateKey,recovery:secret.recovery||secret.privateKey,recoveryFormat:secret.recoveryFormat||account.recoveryFormat,expiresIn:30};};
WalletService.prototype.archive=function(sess,id){var a=this._all(sess),x=a.filter(function(w){return w.id===id&&!w.archived;})[0];if(!x)throw new Error('WALLET_NOT_FOUND');x.archived=true;x.archivedAt=new Date().toISOString();this._save(sess,a);this.clientService.archiveWallet(sess,id);return this.public(x);};
module.exports=WalletService;