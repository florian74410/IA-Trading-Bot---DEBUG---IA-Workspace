'use strict';
// Explicit local migration: old password unwraps the original RSA key; the
// same plaintext is re-encrypted under the existing client master key.
// The original file/key are never modified. A reset cannot recover a lost key.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function importVault({db,cipher,actor,target,file,password}){
 if(!file||!path.isAbsolute(file)||fs.realpathSync(file)!==file)throw Error('LEGACY_VAULT_PATH_INVALID');
 const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>262144)throw Error('LEGACY_VAULT_FILE_UNSAFE');
 const vault=JSON.parse(fs.readFileSync(file,'utf8')),env=vault.privateKeyEnvelope;
 if(!env||env.alg!=='AES-256-GCM'||env.kdf!=='PBKDF2-SHA256'||!Number.isSafeInteger(env.iterations)||env.iterations<10000||env.iterations>2000000)throw Error('LEGACY_VAULT_FORMAT_INVALID');
 const key=await new Promise((resolve,reject)=>crypto.pbkdf2(password,Buffer.from(env.salt,'base64'),env.iterations,32,'sha256',(e,k)=>e?reject(e):resolve(k)));
 let privateKey;try{const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(env.iv,'base64'));d.setAuthTag(Buffer.from(env.tag,'base64'));privateKey=Buffer.concat([d.update(Buffer.from(env.data,'base64')),d.final()]);}finally{key.fill(0);}
 const values={};try{for(const [name,value] of Object.entries(vault.secrets||{})){if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(name)||Object.keys(values).length>=32)throw Error('LEGACY_SECRET_INVALID');values[name]=crypto.privateDecrypt({key:privateKey,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(value,'base64')).toString('utf8');if(values[name].length>8192)throw Error('LEGACY_SECRET_TOO_LARGE');}}finally{privateKey.fill(0);}
 return db.transaction(()=>{
  actor(); // CLI rechecks local operator and live ADMIN after asynchronous KDF.
  const row=db.prepare('SELECT a.role,c.status FROM client_accounts a JOIN clients c USING(client_id) WHERE a.client_id=?').get(target);if(!row||row.role==='GUEST'||row.status!=='ACTIVE')throw Error('LEGACY_TARGET_INVALID');
  if(db.prepare("SELECT 1 FROM um_migration_claims WHERE kind='legacy-vault'").get())throw Error('LEGACY_VAULT_ALREADY_CLAIMED');
  const existing=db.prepare('SELECT payload_enc FROM um_secrets WHERE client_id=?').get(target),old=existing?JSON.parse(cipher.open(existing.payload_enc)):{};
  if(Object.keys(values).some(k=>Object.hasOwn(old,k)))throw Error('LEGACY_SECRET_CONFLICT');
  db.prepare('INSERT INTO um_secrets VALUES(?,?) ON CONFLICT(client_id) DO UPDATE SET payload_enc=excluded.payload_enc').run(target,cipher.seal(JSON.stringify({...old,...values})));
  db.prepare("INSERT INTO um_migration_claims VALUES('legacy-vault',?)").run(target);
  return {imported:Object.keys(values).length,clientId:target,originalPreserved:true};
 }).immediate();
}
module.exports={importVault};
