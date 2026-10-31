'use strict';
/* IA-TB Auth 2.1 P2.2 — encrypted SQLite/client-key BUNDLE, FIXTURES ONLY.
 * Never import this into services or expose it through CLI/HTTP.
 * Source DB and client key must be in a dedicated private /tmp fixture root.
 * No persistent cleartext intermediate during CAPTURE: db.serialize() produces
 * an in-memory WAL-aware SQLite image. Restored files exist only inside a
 * disposable private test directory; never use actual customer data.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {assertFixture}=require('./auth21_v3_migration_trial');
const {attestRestoredPairFixture}=require('./auth21_key_restore_trial');

const FORMAT='IA-TB-AUTH21-ENCRYPTED-CLIENT-TEST-1';
const MARKER='.iatb-auth21-encrypted-fixture-only';
const MARKER_CONTENT='IA-TB-AUTH21-ENCRYPTED-FIXTURE-ONLY\n';
const MAX_DB=12*1024*1024,MAX_ENVELOPE=18*1024*1024;
function fail(message){throw Error(message);}
function privateRoot(db,root){
 const {home}=assertFixture(db,root);
 if(fs.realpathSync(root)!==path.resolve(root))fail('AUTH21_BUNDLE_ROOT_SYMLINK');
 const mode=fs.lstatSync(home);
 if(!mode.isDirectory()||mode.isSymbolicLink()||(mode.mode&0o777)!==0o700||
    (typeof process.getuid==='function'&&mode.uid!==process.getuid()))
  fail('AUTH21_BUNDLE_ROOT_NOT_PRIVATE');
 const marker=path.join(home,MARKER);
 const st=fs.lstatSync(marker);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o777)!==0o600||
    fs.readFileSync(marker,'utf8')!==MARKER_CONTENT)
  fail('AUTH21_BUNDLE_MARKER_INVALID');
 return home;
}
function allowedKey(home,keyFile){
 if(typeof keyFile!=='string'||!path.isAbsolute(keyFile))fail('AUTH21_BUNDLE_MASTER_KEY_INVALID');
 const candidate=path.resolve(keyFile);
 if(!candidate.startsWith(home+path.sep)||!fs.realpathSync(candidate).startsWith(home+path.sep))
  fail('AUTH21_BUNDLE_MASTER_KEY_OUTSIDE');
 const stat=fs.lstatSync(candidate);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
  fail('AUTH21_BUNDLE_MASTER_KEY_UNSAFE');
 const input=fs.readFileSync(candidate,'utf8').trim();
 if(!/^[0-9a-fA-F]{64}$/.test(input))fail('AUTH21_BUNDLE_MASTER_KEY_INVALID');
 return input.toLowerCase();
}
function transportKey(key){
 if(!Buffer.isBuffer(key)||key.length!==32)fail('AUTH21_BUNDLE_TRANSPORT_KEY_REQUIRED');
 return key;
}
function sha(input){return crypto.createHash('sha256').update(input).digest('hex');}
function exactKeys(value,keys){
 return value&&typeof value==='object'&&!Array.isArray(value)&&
  JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());
}
function encode(dbImage,masterKey){
 if(!Buffer.isBuffer(dbImage)||dbImage.length<100||dbImage.length>MAX_DB)
  fail('AUTH21_BUNDLE_DB_SIZE');
 return Buffer.from(JSON.stringify({
  format:FORMAT,db:dbImage.toString('base64'),masterKey,
  dbHash:sha(dbImage),keyHash:sha(Buffer.from(masterKey,'hex'))
 }), 'utf8');
}
function decode(text){
 let obj;
 try{obj=JSON.parse(text.toString('utf8'));}catch(_){fail('AUTH21_BUNDLE_PAYLOAD_INVALID');}
 if(!exactKeys(obj,['format','db','masterKey','dbHash','keyHash'])||obj.format!==FORMAT||
    typeof obj.db!=='string'||obj.db.length>MAX_DB*1.5||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(obj.db)||
    typeof obj.masterKey!=='string'||!/^[a-f0-9]{64}$/.test(obj.masterKey)||
    !/^[a-f0-9]{64}$/.test(obj.dbHash)||!/^[a-f0-9]{64}$/.test(obj.keyHash))
  fail('AUTH21_BUNDLE_PAYLOAD_INVALID');
 const image=Buffer.from(obj.db,'base64');
 if(image.length<100||image.length>MAX_DB||image.toString('base64')!==obj.db||
    sha(image)!==obj.dbHash||sha(Buffer.from(obj.masterKey,'hex'))!==obj.keyHash)
  fail('AUTH21_BUNDLE_PAYLOAD_INVALID');
 return {image,key:obj.masterKey};
}
function seal(contents,key){
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);
 c.setAAD(Buffer.from(FORMAT));
 const cipher=Buffer.concat([c.update(contents),c.final()]);
 return {
  type:FORMAT,algorithm:'AES-256-GCM',
  iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),
  ciphertext:cipher.toString('base64')
 };
}
function open(body,key){
 if(!exactKeys(body,['type','algorithm','iv','tag','ciphertext'])||
    body.type!==FORMAT||body.algorithm!=='AES-256-GCM')fail('AUTH21_BUNDLE_FORMAT_INVALID');
 for(const part of ['iv','tag','ciphertext']){
  if(typeof body[part]!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(body[part]))
   fail('AUTH21_BUNDLE_FORMAT_INVALID');
 }
 const iv=Buffer.from(body.iv,'base64'),tag=Buffer.from(body.tag,'base64');
 const encrypted=Buffer.from(body.ciphertext,'base64');
 if(iv.length!==12||tag.length!==16||encrypted.length<1||encrypted.length>MAX_ENVELOPE)
  fail('AUTH21_BUNDLE_FORMAT_INVALID');
 let plaintext;
 try{
  const d=crypto.createDecipheriv('aes-256-gcm',key,iv);
  d.setAAD(Buffer.from(FORMAT));d.setAuthTag(tag);
  plaintext=Buffer.concat([d.update(encrypted),d.final()]);
 }catch(_){fail('AUTH21_BUNDLE_AUTH_FAILED');}
 try{return decode(plaintext);}finally{plaintext.fill(0);}
}
/** Caller MUST inject an existing SnapshotCoordinator with the real local
 * fixture writer registered and frozen by its PREPARE/QUIESCED/RELEASE.
 * This does NOT prove coordination of independent engines/processes.
 */
async function captureEncryptedFixture({db,fixtureRoot,keyFile,archiveKey,coordinator}={}){
 const home=privateRoot(db,fixtureRoot);
 const master=allowedKey(home,keyFile);
 const key=transportKey(archiveKey);
 if(sha(key)===sha(Buffer.from(master,'hex')))fail('AUTH21_BUNDLE_KEYS_MUST_DIFFER');
 if(!coordinator||typeof coordinator.execute!=='function'||
    !Array.isArray(coordinator.writerIds)||coordinator.writerIds.length!==1||
    coordinator.writerIds[0]!=='clients')
  fail('AUTH21_BUNDLE_COORDINATOR_REQUIRED');
 if(db.pragma('foreign_keys',{simple:true})!==1)fail('AUTH21_FOREIGN_KEYS_REQUIRED');
 const target=path.join(home,'auth21-encrypted-clients.fixture.enc.json');
 if(fs.existsSync(target))fail('AUTH21_BUNDLE_ALREADY_EXISTS');
 // Capture source and key inside the quiesced epoch; no mutable refs escape.
 const imageAndKey=await coordinator.execute(()=>{
  const before=allowedKey(home,keyFile);
  if(before!==master)fail('AUTH21_BUNDLE_KEY_CHANGED');
  if(db.pragma('integrity_check',{simple:true})!=='ok'||
     db.pragma('foreign_key_check').length)fail('AUTH21_BUNDLE_DB_INTEGRITY');
  // Cryptographic preflight while the cooperative writer is held; SQLite
  // integrity alone cannot detect a missing/wrong master key or corrupt AEAD.
  const proof=attestRestoredPairFixture({dbFile:db.name,keyFile,fixtureRoot:home});
  if(!proof.verified||proof.indexChecks<1)fail('AUTH21_BUNDLE_SOURCE_KEY_UNPROVEN');
  const image=db.serialize();
  if(allowedKey(home,keyFile)!==before)fail('AUTH21_BUNDLE_KEY_CHANGED');
  return {image,master:before};
 });
 let payload;
 try{payload=encode(imageAndKey.image,imageAndKey.master);}
 finally{imageAndKey.image.fill(0);}
 try{
  const envelope=seal(payload,key);
  fs.writeFileSync(target,JSON.stringify(envelope)+'\n',{mode:0o600,flag:'wx'});
 }finally{payload.fill(0);}
 return {archiveFile:target,encrypted:true,writerId:'clients'};
}
/** Restores the SINGLE client DB + key to NEW private scratch paths; validates
 * real AES-GCM/HMAC identity, FK, schema and wallet refs before reporting OK.
 */
function restoreEncryptedFixture({archiveFile,fixtureRoot,archiveKey}={}){
 // No source DB needed here, but apply same exact sandbox/marker/permissions.
 if(typeof fixtureRoot!=='string'||typeof archiveFile!=='string')fail('AUTH21_FIXTURE_ONLY');
 const home=fs.realpathSync(fixtureRoot),temp=fs.realpathSync(os.tmpdir());
 if(!home.startsWith(temp+path.sep)||!path.basename(home).startsWith('iatb-auth21-v3-')||
    fs.realpathSync(fixtureRoot)!==path.resolve(fixtureRoot))fail('AUTH21_FIXTURE_ONLY');
 const st=fs.lstatSync(home);
 if((st.mode&0o777)!==0o700||!st.isDirectory())fail('AUTH21_BUNDLE_ROOT_NOT_PRIVATE');
 const marker=fs.lstatSync(path.join(home,MARKER));
 if(!marker.isFile()||marker.isSymbolicLink()||
    fs.readFileSync(path.join(home,MARKER),'utf8')!==MARKER_CONTENT)
  fail('AUTH21_BUNDLE_MARKER_INVALID');
 const dest=path.join(home,'auth21-encrypted-restore');
 if(fs.existsSync(dest))fail('AUTH21_BUNDLE_RESTORE_EXISTS');
 const file=path.resolve(archiveFile);
 if(file!==path.join(home,'auth21-encrypted-clients.fixture.enc.json')||
    !fs.realpathSync(file).startsWith(home+path.sep))fail('AUTH21_BUNDLE_ARCHIVE_PATH_INVALID');
 const mode=fs.lstatSync(file);
 if(!mode.isFile()||mode.isSymbolicLink()||(mode.mode&0o777)!==0o600||
    mode.size>MAX_ENVELOPE*2)fail('AUTH21_BUNDLE_ARCHIVE_UNSAFE');
 const key=transportKey(archiveKey);
 let body;
 try{body=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){fail('AUTH21_BUNDLE_FORMAT_INVALID');}
 const {image,key:master}=open(body,key);
 fs.mkdirSync(dest,{mode:0o700});
 let success=false;
 try{
  const dbFile=path.join(dest,'clients-fixture.sqlite');
  const keyFile=path.join(dest,'client_master.key');
  fs.writeFileSync(dbFile,image,{mode:0o600,flag:'wx'});
  fs.writeFileSync(keyFile,master,{mode:0o600,flag:'wx'});
  const report=attestRestoredPairFixture({dbFile,keyFile,fixtureRoot:home});
  success=true;
  return {verified:true,dbFile,keyFile,
   encryptedFields:report.encryptedFields,indexChecks:report.indexChecks,
   walletLinks:report.walletLinks,tables:report.tables};
 }finally{
  image.fill(0);
  if(!success)fs.rmSync(dest,{recursive:true,force:true});
 }
}
module.exports={captureEncryptedFixture,restoreEncryptedFixture,MARKER,MARKER_CONTENT};
