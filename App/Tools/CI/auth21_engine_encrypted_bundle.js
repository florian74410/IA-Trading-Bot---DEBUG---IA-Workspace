'use strict';
/* Auth21 P2.2: encrypted restorable capture from QUIESCED engine data in a
 * disposable trial root. Captures only caller-allowlisted non-wallet files.
 * NOT a runtime backup service; caller must attest every real writer's ACK.
 */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {preflightEnv}=require('../../Core/Backup/auth21_core_local_trial_wiring');
const {SnapshotCoordinator}=require('../../Core/Backup/snapshot_coordinator');
const MAGIC='AUTH21_P22_ENGINE_ARCHIVE_V1';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function assertRel(rel){
 if(typeof rel!=='string'||rel.length>200||rel.includes('\\')||!(/^(?:userdata\/(?:Shared Data|User Data|Database)\/[a-zA-Z0-9._\/ -]+\.(?:db|sqlite|jsonl)|annexes\/(?:Strategies|Mosaics)\/[A-Za-z0-9._\/-]+\.json|App\/Indicators\/Custom\/[A-Za-z0-9._-]+\.indicator\.json|runtime\/config\/market_data_settings\.json|runtime\/state\/strategy\/strategy_stats\.json|userdata\/Security\/client_master\.key|App\/\.runtime\/accounting\/usage_ledger\.jsonl)$/.test(rel))||
   rel.split('/').some(s=>!s||s==='.'||s==='..')||
   (rel!=='userdata/Security/client_master.key' && /wallet|master|secret|credential|private|\.key/i.test(rel)))throw Error('P22_RESOURCE_DISALLOWED');
}
function assertRoot(env,root){if(preflightEnv(env).root!==root)throw Error('P22_ROOT_MISMATCH');}
function ensureSafe(root,rel){
 const full=path.join(root,...rel.split('/'));let dir=root;
 for(const piece of rel.split('/')){
  dir=path.join(dir,piece);
  if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw Error('P22_SYMLINK_REFUSED');
 }
 return full;
}
function capture({env,root,resources,transportKey,coordinator,epoch}={}){
 assertRoot(env,root);
 if(!(coordinator instanceof SnapshotCoordinator)||coordinator.state!=='QUIESCED'||
    coordinator.epoch!==epoch||!Number.isSafeInteger(epoch)||epoch<1)
  throw Error('P22_QUIESCENCE_PROOF_REQUIRED');
 if(!Buffer.isBuffer(transportKey)||transportKey.length!==32)throw Error('P22_TRANSPORT_KEY_REQUIRED');
 if(!Array.isArray(resources)||!resources.length||resources.length>32||
   new Set(resources).size!==resources.length)throw Error('P22_RESOURCE_LIST_INVALID');
 const required=new Set(resources.map(rel=>rel==='userdata/Security/client_master.key'||rel.startsWith('userdata/Database/')?'clients':
  rel.startsWith('annexes/Strategies/')?'annex-root':
  rel.startsWith('annexes/Mosaics/')?'mosaics':
  rel.startsWith('App/Indicators/Custom/')?'indicators':
  rel.endsWith('/user_data.db')?'settings':
  rel==='runtime/config/market_data_settings.json'?'marketdata':
  rel==='runtime/state/strategy/strategy_stats.json'?'strategy':
  rel==='App/.runtime/accounting/usage_ledger.jsonl'?'portfolio':
  rel.endsWith('/trading_history.jsonl')?'trading':
  rel.startsWith('userdata/User Data/')?'portfolio':
  rel.startsWith('userdata/Shared Data/MarketData/')?'marketdata':
  rel.startsWith('userdata/Shared Data/Fundamental/')?'fundamental':'unknown'));
 if(required.has('unknown')||[...required].some(id=>!coordinator.writerIds.includes(id)))
  throw Error('P22_WRITER_ACK_MISSING');
 const Database=require('better-sqlite3'),rows=[];let total=0;
 for(const rel of [...resources].sort()){
  assertRel(rel);const file=ensureSafe(root,rel),st=fs.lstatSync(file);
  if(!st.isFile()||st.size>12*1024*1024)throw Error('P22_RESOURCE_UNSAFE');
  const sqlite=/\.(db|sqlite)$/.test(rel);
  const kind=sqlite?'sqlite':rel.endsWith('.jsonl')?'jsonl':rel.endsWith('.json')?'json':'key';
  if(kind==='key'&&(st.mode&0o077)!==0)throw Error('P22_KEY_PERMISSIONS');
  let buffer;
  if(sqlite){
   const db=new Database(file,{readonly:true,fileMustExist:true});
   try{
    if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)
     throw Error('P22_SQLITE_INTEGRITY');
    buffer=db.serialize();
   }finally{db.close();}
  }else{
   buffer=fs.readFileSync(file);
   if(kind==='jsonl')for(const line of buffer.toString('utf8').split(/\r?\n/).filter(Boolean))JSON.parse(line);
   if(kind==='json')JSON.parse(buffer.toString('utf8'));
   if(kind==='key'&&(buffer.length<16||buffer.length>4096))throw Error('P22_CLIENT_KEY_INVALID');
  }
  total+=buffer.length;if(total>32*1024*1024)throw Error('P22_RESOURCE_BUDGET_EXCEEDED');
  rows.push({rel,kind,size:buffer.length,digest:sha(buffer),data:buffer.toString('base64')});
 }
 const plain=Buffer.from(JSON.stringify({magic:MAGIC,rows}));
 const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',transportKey,nonce);
 cipher.setAAD(Buffer.from(MAGIC));const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
 return Buffer.from(JSON.stringify({magic:MAGIC,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}));
}
function restore({archive,transportKey,outputDir}={}){
 if(!Buffer.isBuffer(archive)||archive.length>50*1024*1024||
    !Buffer.isBuffer(transportKey)||transportKey.length!==32)throw Error('P22_ARCHIVE_INPUT_INVALID');
 let outer,inside;
 try{
  outer=JSON.parse(archive.toString('utf8'));
  if(outer.magic!==MAGIC)throw Error('P22_ARCHIVE_MAGIC');
  const decrypt=crypto.createDecipheriv('aes-256-gcm',transportKey,Buffer.from(outer.nonce,'base64'));
  decrypt.setAAD(Buffer.from(MAGIC));decrypt.setAuthTag(Buffer.from(outer.tag,'base64'));
  inside=JSON.parse(Buffer.concat([decrypt.update(Buffer.from(outer.ciphertext,'base64')),decrypt.final()]).toString('utf8'));
 }catch(_){throw Error('P22_ARCHIVE_AUTH_FAILED');}
 if(inside.magic!==MAGIC||!Array.isArray(inside.rows)||!inside.rows.length||
    inside.rows.length>32||new Set(inside.rows.map(r=>r.rel)).size!==inside.rows.length)
  throw Error('P22_ARCHIVE_MANIFEST_INVALID');
 const temp=fs.realpathSync(os.tmpdir());
 if(typeof outputDir!=='string'||!path.isAbsolute(outputDir)||fs.existsSync(outputDir)||
    path.dirname(path.resolve(outputDir))!==temp||
    !path.basename(outputDir).startsWith('iatb-auth21-restore-'))
  throw Error('P22_RESTORE_TARGET_UNSAFE');
 const Database=require('better-sqlite3');
 fs.mkdirSync(outputDir,{mode:0o700});
 try{
  for(const item of inside.rows){
   assertRel(item.rel);
   if(item.kind!==(/\.(db|sqlite)$/.test(item.rel)?'sqlite':item.rel.endsWith('.jsonl')?'jsonl':item.rel.endsWith('.json')?'json':'key')||
      !Number.isSafeInteger(item.size)||item.size<0||item.size>12*1024*1024)
    throw Error('P22_RESTORE_MANIFEST_INVALID');
   const bytes=Buffer.from(item.data,'base64');
   if(bytes.length!==item.size||sha(bytes)!==item.digest)throw Error('P22_RESTORE_DIGEST_FAILED');
   const target=path.join(outputDir,...item.rel.split('/'));
   fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
   fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});
   if(item.kind==='sqlite'){
    const db=new Database(target,{readonly:true,fileMustExist:true});
    try{if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)
       throw Error('P22_RESTORED_SQLITE_BAD');}finally{db.close();}
   }else if(item.kind==='jsonl')for(const line of bytes.toString('utf8').split(/\r?\n/).filter(Boolean))JSON.parse(line);
   else if(item.kind==='json')JSON.parse(bytes.toString('utf8'));
   else if(bytes.length<16||bytes.length>4096)throw Error('P22_RESTORED_CLIENT_KEY_INVALID');
  }
  return {restored:true,files:inside.rows.map(r=>r.rel),outputDir};
 }catch(e){fs.rmSync(outputDir,{recursive:true,force:true});throw e;}
}
module.exports={capture,restore};
