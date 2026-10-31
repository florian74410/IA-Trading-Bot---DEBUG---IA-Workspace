'use strict';
var fs=require('fs'),path=require('path'),crypto=require('crypto');

// Node's Buffer.from(text,'hex') silently truncates malformed suffixes.
// Never accept partial/ambiguous master key material.
function decodeMasterKey(text){
  var input=String(text).trim();
  if(!/^[0-9a-fA-F]{64}$/.test(input))throw new Error('CLIENT_MASTER_KEY_INVALID');
  return Buffer.from(input,'hex');
}
function ensureDir(dir){
  if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true,mode:448});
  try{fs.chmodSync(dir,448);}catch(e){}
}
function ClientCrypto(keyFile,opts){
  opts=opts||{};
  this.keyFile=path.resolve(keyFile);
  // Constructor can create/chmod a master-key file or Security directory.
  // Its opt-in gate must be checked BEFORE any filesystem side effects.
  this.snapshotGate=opts.snapshotGate||null;
  if(this.snapshotGate){
    if(typeof this.snapshotGate.assertWritable!=='function')throw new Error('SNAPSHOT_GATE_INVALID');
    this.snapshotGate.assertWritable();
  }
  // A client DB may contain identities encrypted by the original master key.
  // Never replace that key silently. Optional override is for isolated fixtures.
  this.clientDbPath=path.resolve(opts.clientDbPath||path.join(path.dirname(this.keyFile),'..','Database','clients.sqlite'));
  ensureDir(path.dirname(this.keyFile));
  this.master=this._loadKey();
  this.indexKey=crypto.createHash('sha256').update(this.master).update('IA-TB_CLIENT_INDEX_V1').digest();
}
ClientCrypto.prototype._loadKey=function(){
  var k;
  try{k=decodeMasterKey(fs.readFileSync(this.keyFile,'utf8'));return k;}catch(e){}
  if(fs.existsSync(this.keyFile))throw new Error('CLIENT_MASTER_KEY_INVALID');
  // Even a WAL-only or journal file is evidence of pre-existing client data.
  // Blocking a new key is safer than rendering old ciphertext unreadable.
  var suffixes=['','-wal','-shm','-journal'];
  for(var i=0;i<suffixes.length;i++){
    if(fs.existsSync(this.clientDbPath+suffixes[i])){
      throw new Error('CLIENT_MASTER_KEY_MISSING_WITH_EXISTING_DB');
    }
  }
  k=crypto.randomBytes(32);
  try{fs.writeFileSync(this.keyFile,k.toString('hex'),{encoding:'utf8',mode:384,flag:'wx'});}catch(e){
    try{k=decodeMasterKey(fs.readFileSync(this.keyFile,'utf8'));}catch(x){}
  }
  if(!k||k.length!==32)throw new Error('CLIENT_MASTER_KEY_UNAVAILABLE');
  try{fs.chmodSync(this.keyFile,384);}catch(e){}
  return k;
};
ClientCrypto.prototype.seal=function(value){
  var text=String(value==null?'':value);
  if(!text)return'';
  var iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',this.master,iv);
  var data=Buffer.concat([c.update(Buffer.from(text,'utf8')),c.final()]);
  var env={v:1,alg:'AES-256-GCM',iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')};
  return Buffer.from(JSON.stringify(env),'utf8').toString('base64');
};
ClientCrypto.prototype.open=function(value){
  if(!value)return'';
  var env=JSON.parse(Buffer.from(String(value),'base64').toString('utf8'));
  if(env.v!==1||env.alg!=='AES-256-GCM')throw new Error('CLIENT_ENVELOPE_UNSUPPORTED');
  var d=crypto.createDecipheriv('aes-256-gcm',this.master,Buffer.from(env.iv,'base64'));
  d.setAuthTag(Buffer.from(env.tag,'base64'));
  return Buffer.concat([d.update(Buffer.from(env.data,'base64')),d.final()]).toString('utf8');
};
ClientCrypto.prototype.lookupHash=function(value){
  var s=String(value==null?'':value).trim().toLowerCase();
  if(!s)return'';
  return crypto.createHmac('sha256',this.indexKey).update(s).digest('hex');
};
ClientCrypto.prototype.externalHash=function(value){
  var s=String(value==null?'':value).trim().toLowerCase()||'local-admin';
  return crypto.createHmac('sha256',this.indexKey).update('external:'+s).digest('hex');
};
module.exports=ClientCrypto;
