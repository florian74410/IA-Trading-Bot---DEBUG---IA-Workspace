'use strict';
/* Auth 2.1 P2.2: MULTI-RESOURCE ENCRYPTED SNAPSHOT — DISPOSABLE FIXTURES ONLY.
 * No service wiring. Never use with real credentials, wallets or GEN-1.
 * Clients/settings/portfolio DB images and allowlisted annex data stay in RAM
 * until protected by AES-256-GCM. No cleartext staging during capture.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
const {assertFixture}=require('./auth21_v3_migration_trial');
const {SnapshotCoordinator}=require('../../Core/Backup/snapshot_coordinator');
const {attestRestoredPairFixture}=require('./auth21_key_restore_trial');
const {MARKER,MARKER_CONTENT}=require('./auth21_encrypted_snapshot_trial');

const MAGIC='IA-TB-AUTH21-MULTI-FIXTURE-AEAD-1';
const FILE='auth21-multi.fixture.enc.json';
const RESTORE='auth21-multi-restored';
const WRITERS=['clients','settings','portfolio','annexes'];
const DBFILES=Object.freeze({
 clients:'clients-fixture.sqlite',
 settings:'settings-fixture.sqlite',
 portfolio:'portfolio-fixture.sqlite'
});
const ANNEXES=['annexes/preferences.jsonl','annexes/notes/export.json'];
const MAX_DB=12*1024*1024,MAX_ANNEX=1024*1024,MAX_RAW=38*1024*1024;
function refuse(code){throw Error(code);}
function hash(data){return crypto.createHash('sha256').update(data).digest('hex');}
function equalKeys(obj,names){
 return obj&&typeof obj==='object'&&!Array.isArray(obj)&&
  JSON.stringify(Object.keys(obj).sort())===JSON.stringify([...names].sort());
}
function homeOf(root){
 if(typeof root!=='string'||!path.isAbsolute(root))refuse('AUTH21_MULTI_FIXTURE_ONLY');
 const absolute=path.resolve(root),real=fs.realpathSync(root),temp=fs.realpathSync(os.tmpdir());
 if(real!==absolute||!real.startsWith(temp+path.sep)||
    !path.basename(real).startsWith('iatb-auth21-v3-'))
  refuse('AUTH21_MULTI_FIXTURE_ONLY');
 const s=fs.lstatSync(real);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o777)!==0o700||
    (process.getuid&&s.uid!==process.getuid()))
  refuse('AUTH21_MULTI_PRIVATE_ROOT_REQUIRED');
 const marker=path.join(real,MARKER);
 const m=fs.lstatSync(marker);
 if(!m.isFile()||m.isSymbolicLink()||(m.mode&0o777)!==0o600||
    fs.readFileSync(marker,'utf8')!==MARKER_CONTENT)
  refuse('AUTH21_MULTI_FIXTURE_MARKER_REQUIRED');
 return real;
}
function inside(root,relative){
 if(typeof relative!=='string'||relative.startsWith('/')||
    relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'))
  refuse('AUTH21_MULTI_PATH_INVALID');
 const target=path.join(root,...relative.split('/'));
 let cur=root;
 for(const part of relative.split('/')){
  cur=path.join(cur,part);
  if(fs.existsSync(cur) && fs.lstatSync(cur).isSymbolicLink())
   refuse('AUTH21_MULTI_SYMLINK_REFUSED');
 }
 if(!target.startsWith(root+path.sep))refuse('AUTH21_MULTI_PATH_INVALID');
 return target;
}
function privateFile(root,rel){
 const p=inside(root,rel),s=fs.lstatSync(p);
 if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600||
    (process.getuid&&s.uid!==process.getuid()))
  refuse('AUTH21_MULTI_PRIVATE_FILE_REQUIRED');
 return p;
}
function getMaster(root,keyFile){
 if(typeof keyFile!=='string'||path.resolve(keyFile)!==path.join(root,'Security','client_master.key'))
  refuse('AUTH21_MULTI_MASTER_KEY_PATH_INVALID');
 const p=privateFile(root,'Security/client_master.key');
 const raw=fs.readFileSync(p,'utf8').trim();
 if(!/^[a-f0-9]{64}$/i.test(raw))refuse('AUTH21_MULTI_MASTER_KEY_INVALID');
 return raw.toLowerCase();
}
function transportKey(key,master){
 if(!Buffer.isBuffer(key)||key.length!==32)refuse('AUTH21_MULTI_TRANSPORT_KEY_REQUIRED');
 if(master && key.equals(Buffer.from(master,'hex')))
  refuse('AUTH21_MULTI_SEPARATE_KEYS_REQUIRED');
 return key;
}
function sourceDB(root,label,db){
 if(!Object.hasOwn(DBFILES,label) || !db || typeof db.serialize!=='function')
  refuse('AUTH21_MULTI_DB_REQUIRED');
 assertFixture(db,root);
 const expected=path.join(root,DBFILES[label]);
 if(fs.realpathSync(db.name)!==fs.realpathSync(expected))
  refuse('AUTH21_MULTI_DB_PATH_INVALID');
 if(db.pragma('foreign_keys',{simple:true})!==1 ||
    db.pragma('integrity_check',{simple:true})!=='ok' ||
    db.pragma('foreign_key_check').length)
  refuse('AUTH21_MULTI_DB_INTEGRITY');
}
function encodeBundle(images,annexes,master,epoch){
 const database={},annex={},manifest={};
 let sum=0;
 for(const [name,bytes] of Object.entries(images)){
  if(!Object.hasOwn(DBFILES,name)||!Buffer.isBuffer(bytes)||bytes.length<100||bytes.length>MAX_DB)
   refuse('AUTH21_MULTI_DB_SIZE_INVALID');
  sum+=bytes.length;
  database[name]=bytes.toString('base64');
  manifest['sqlite/'+name]={bytes:bytes.length,sha256:hash(bytes)};
 }
 for(const [name,bytes] of Object.entries(annexes)){
  if(!ANNEXES.includes(name)||!Buffer.isBuffer(bytes)||bytes.length>MAX_ANNEX)
   refuse('AUTH21_MULTI_ANNEX_SIZE_INVALID');
  sum+=bytes.length;
  annex[name]=bytes.toString('base64');
  manifest[name]={bytes:bytes.length,sha256:hash(bytes)};
 }
 if(sum>MAX_RAW || Object.keys(database).length!==3 ||
    Object.keys(annex).length!==ANNEXES.length)
  refuse('AUTH21_MULTI_PAYLOAD_INCOMPLETE');
 return Buffer.from(JSON.stringify({
  format:MAGIC,source:'SYNTHETIC_ONLY',epoch,
  databases:database,annexes:annex,
  masterKey:master,manifest
 }),'utf8');
}
function parseBundle(payload){
 let obj;
 try{obj=JSON.parse(payload.toString('utf8'))}catch(_){refuse('AUTH21_MULTI_PAYLOAD_INVALID')}
 if(!equalKeys(obj,['format','source','epoch','databases','annexes','masterKey','manifest'])||
    obj.format!==MAGIC||obj.source!=='SYNTHETIC_ONLY'||
    !Number.isSafeInteger(obj.epoch)||obj.epoch<1||
    !/^[a-f0-9]{64}$/.test(obj.masterKey)|| !equalKeys(obj.databases,Object.keys(DBFILES))||
    !equalKeys(obj.annexes,ANNEXES)||
    !equalKeys(obj.manifest,[...Object.keys(DBFILES).map(x=>'sqlite/'+x),...ANNEXES]))
  refuse('AUTH21_MULTI_PAYLOAD_INVALID');
 const result={dbs:{},annexes:{},master:obj.masterKey,epoch:obj.epoch};
 let total=0;
 for(const [name,content] of [
  ...Object.keys(DBFILES).map(k=>['sqlite/'+k,obj.databases[k]]),
  ...ANNEXES.map(k=>[k,obj.annexes[k]])
 ]){
  if(typeof content!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(content)||
     content.length>MAX_DB*1.5)refuse('AUTH21_MULTI_PAYLOAD_INVALID');
  const value=Buffer.from(content,'base64');
  const max=name.startsWith('sqlite/')?MAX_DB:MAX_ANNEX;
  if(value.length>max || value.toString('base64')!==content ||
     (name.startsWith('sqlite/')&&value.length<100))refuse('AUTH21_MULTI_PAYLOAD_INVALID');
  total+=value.length;if(total>MAX_RAW)refuse('AUTH21_MULTI_PAYLOAD_INVALID');
  const meta=obj.manifest[name];
  if(!equalKeys(meta,['bytes','sha256'])||meta.bytes!==value.length||
     meta.sha256!==hash(value))refuse('AUTH21_MULTI_CHECKSUM_FAILED');
  if(name.startsWith('sqlite/'))result.dbs[name.slice(7)]=value;
  else result.annexes[name]=value;
 }
 return result;
}
function encrypt(payload,key){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(MAGIC));
 const data=Buffer.concat([cipher.update(payload),cipher.final()]);
 return {type:MAGIC,alg:'AES-256-GCM',iv:iv.toString('base64'),
  tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
function decrypt(wrapped,key){
 if(!equalKeys(wrapped,['type','alg','iv','tag','data'])||wrapped.type!==MAGIC||
    wrapped.alg!=='AES-256-GCM')refuse('AUTH21_MULTI_ENVELOPE_INVALID');
 const values={};
 for(const part of ['iv','tag','data']){
  if(typeof wrapped[part]!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(wrapped[part])||
     wrapped[part].length>MAX_RAW*2)refuse('AUTH21_MULTI_ENVELOPE_INVALID');
  values[part]=Buffer.from(wrapped[part],'base64');
  if(values[part].toString('base64')!==wrapped[part])refuse('AUTH21_MULTI_ENVELOPE_INVALID');
 }
 if(values.iv.length!==12||values.tag.length!==16||values.data.length<1||
    values.data.length>MAX_RAW*1.5)refuse('AUTH21_MULTI_ENVELOPE_INVALID');
 let clear;
 try{
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,values.iv);
  decipher.setAAD(Buffer.from(MAGIC));decipher.setAuthTag(values.tag);
  clear=Buffer.concat([decipher.update(values.data),decipher.final()]);
 }catch(_){refuse('AUTH21_MULTI_AEAD_FAILED')}
 try{return parseBundle(clear)}finally{clear.fill(0)}
}
/** Fixture-only coordinator: ALL 4 ACKs before any data is captured.
 * No promise that a real service actually uses LocalSnapshotWriter yet.
 */
async function captureMultiFixture({root,dbs,keyFile,archiveKey,coordinator}={}){
 const home=homeOf(root),key=getMaster(home,keyFile);
 transportKey(archiveKey,key);
 if(!(coordinator instanceof SnapshotCoordinator)||
    !Array.isArray(coordinator.writerIds)||
    JSON.stringify([...coordinator.writerIds].sort())!==JSON.stringify([...WRITERS].sort()))
  refuse('AUTH21_MULTI_WRITER_ALLOWLIST_REQUIRED');
 const archive=path.join(home,FILE);
 if(fs.existsSync(archive))refuse('AUTH21_MULTI_ARCHIVE_EXISTS');
 for(const label of Object.keys(DBFILES))sourceDB(home,label,dbs&&dbs[label]);
 const captured=await coordinator.execute(({epoch})=>{
  if(getMaster(home,keyFile)!==key)refuse('AUTH21_MULTI_MASTER_KEY_CHANGED');
  // Verify real ClientCrypto AES-GCM/HMAC before accepting a client snapshot.
  const proof=attestRestoredPairFixture({
   dbFile:dbs.clients.name,keyFile,fixtureRoot:home
  });
  if(!proof.verified||proof.indexChecks<1)refuse('AUTH21_MULTI_CLIENT_KEY_UNPROVEN');
  const images={},annexes={};
  try{
   for(const name of Object.keys(DBFILES)){
    sourceDB(home,name,dbs[name]);
    images[name]=dbs[name].serialize();
   }
   for(const name of ANNEXES){
    const source=privateFile(home,name);
    const stat=fs.statSync(source);
    if(stat.size>MAX_ANNEX)refuse('AUTH21_MULTI_ANNEX_SIZE_INVALID');
    annexes[name]=fs.readFileSync(source);
   }
   if(getMaster(home,keyFile)!==key)refuse('AUTH21_MULTI_MASTER_KEY_CHANGED');
   const payload=encodeBundle(images,annexes,key,epoch);
   try{return encrypt(payload,archiveKey)}finally{payload.fill(0)}
  }finally{
   for(const value of [...Object.values(images),...Object.values(annexes)])value.fill(0);
  }
 });
 // Atomic visibility and no incomplete archive on encryption/write failure.
 const pending=path.join(home,'.pending-multi-'+crypto.randomUUID());
 try{
  const fd=fs.openSync(pending,'wx',0o600);
  try{
   fs.writeFileSync(fd,JSON.stringify(captured)+'\n');
   fs.fsyncSync(fd);
  }finally{fs.closeSync(fd)}
  // Hard-link publication is atomic and refuses a concurrent existing name;
  // unlike rename(), it can never replace an already-created archive.
  try{fs.linkSync(pending,archive)}
  catch(error){
   if(error.code==='EEXIST')refuse('AUTH21_MULTI_ARCHIVE_EXISTS');
   throw error;
  }
 }finally{if(fs.existsSync(pending))fs.unlinkSync(pending)}
 return {archiveFile:archive,encrypted:true,epoch:coordinator.epoch};
}
function restoreMultiFixture({root,archiveFile,archiveKey}={}){
 const home=homeOf(root);
 transportKey(archiveKey);
 if(typeof archiveFile!=='string'||path.resolve(archiveFile)!==path.join(home,FILE))
  refuse('AUTH21_MULTI_ARCHIVE_PATH_INVALID');
 const file=privateFile(home,FILE),stat=fs.statSync(file);
 if(stat.size>MAX_RAW*2)refuse('AUTH21_MULTI_ARCHIVE_SIZE_INVALID');
 const dest=path.join(home,RESTORE);
 if(fs.existsSync(dest))refuse('AUTH21_MULTI_RESTORE_EXISTS');
 let wrapped;
 try{wrapped=JSON.parse(fs.readFileSync(file,'utf8'))}catch(_){refuse('AUTH21_MULTI_ENVELOPE_INVALID')}
 const decoded=decrypt(wrapped,archiveKey);
 fs.mkdirSync(dest,{mode:0o700});
 let success=false;
 try{
  for(const [name,data] of Object.entries(decoded.dbs)){
   fs.writeFileSync(inside(dest,DBFILES[name]),data,{flag:'wx',mode:0o600});
  }
  const k=path.join(dest,'Security');
  fs.mkdirSync(k,{mode:0o700});
  const restoredKey=path.join(k,'client_master.key');
  fs.writeFileSync(restoredKey,decoded.master,{flag:'wx',mode:0o600});
  for(const [name,data] of Object.entries(decoded.annexes)){
   const location=inside(dest,name);
   fs.mkdirSync(path.dirname(location),{recursive:true,mode:0o700});
   fs.writeFileSync(location,data,{flag:'wx',mode:0o600});
  }
  let checks=0;
  for(const name of Object.keys(DBFILES)){
   const restored=inside(dest,DBFILES[name]);
   // Normalize ONLY the recovered scratch DB: WAL-mode serialized images
   // otherwise create sidecar files when opened. Source DB is never altered.
   const db=new Database(restored,{fileMustExist:true});
   try{
    db.pragma('journal_mode=DELETE');
    db.pragma('foreign_keys=ON');
    if(db.pragma('integrity_check',{simple:true})!=='ok'||
       db.pragma('foreign_key_check').length)refuse('AUTH21_MULTI_RESTORED_DB_BAD');
    checks++;
   }finally{db.close()}
  }
  const proof=attestRestoredPairFixture({
   dbFile:path.join(dest,DBFILES.clients),keyFile:restoredKey,fixtureRoot:home
  });
  if(!proof.verified||proof.indexChecks<1)refuse('AUTH21_MULTI_RESTORED_CLIENT_KEY_BAD');
  success=true;
  return {verified:true,epoch:decoded.epoch,databases:checks,
   annexes:Object.keys(decoded.annexes).length,walletLinks:proof.walletLinks,
   indexChecks:proof.indexChecks,restoredDir:dest};
 }finally{
  for(const data of [...Object.values(decoded.dbs),...Object.values(decoded.annexes)])data.fill(0);
  if(!success)fs.rmSync(dest,{recursive:true,force:true});
 }
}
module.exports={captureMultiFixture,restoreMultiFixture,WRITERS,DBFILES,ANNEXES,MAGIC};
