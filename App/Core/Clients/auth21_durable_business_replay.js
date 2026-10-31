'use strict';
/* At-most-once signed business proof claim across isolated Engine restarts.
 * Not a distributed lock. A single participant owns one journal on a
 * prevalidated chmod-0700 fixture root. Failure is always fail-closed.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ENGINE=/^(indicators|marketdata|fundamental|portfolio|strategy)$/;
const ID=/^[a-z]+:[A-Za-z0-9_-]{22}$/;
function createDurableReplay({root,engine}={}){
 if(typeof root!=='string'||!path.isAbsolute(root)||!ENGINE.test(engine))
  throw Error('AUTH21_REPLAY_CONFIG_INVALID');
 const directory=path.join(root,'runtime');
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||
  fs.realpathSync(directory)!==directory||
  (process.getuid&&stat.uid!==process.getuid()))
  throw Error('AUTH21_REPLAY_DIRECTORY_UNSAFE');
 const file=path.join(directory,'auth21-business-replay-'+engine+'.json');
 function read(){
  if(!fs.existsSync(file))return Object.create(null);
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   st.size>150000||fs.realpathSync(file)!==file)
   throw Error('AUTH21_REPLAY_FILE_UNSAFE');
  let row;
  try{row=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){
   throw Error('AUTH21_REPLAY_FILE_CORRUPT');
  }
  if(!row||row.schema!==1||row.engine!==engine||!row.entries||
   typeof row.entries!=='object'||Array.isArray(row.entries))
   throw Error('AUTH21_REPLAY_FILE_CORRUPT');
  const keys=Object.keys(row.entries);
  if(keys.length>2048||keys.some(k=>!ID.test(k)||
    !Number.isSafeInteger(row.entries[k])||row.entries[k]<=0))
   throw Error('AUTH21_REPLAY_FILE_CORRUPT');
  return Object.assign(Object.create(null),row.entries);
 }
 function store(entries){
  const temp=path.join(directory,'.auth21-replay-'+engine+'-'+crypto.randomBytes(12).toString('hex')+'.tmp');
  let fd=null;
  try{
   fd=fs.openSync(temp,'wx',0o600);
   fs.writeFileSync(fd,JSON.stringify({schema:1,engine,entries})+'\n','utf8');
   fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
   fs.renameSync(temp,file);
   const dirfd=fs.openSync(directory,'r');
   try{fs.fsyncSync(dirfd);}finally{fs.closeSync(dirfd);}
  }finally{
   if(fd!==null)fs.closeSync(fd);
   try{fs.unlinkSync(temp);}catch(_){}
  }
 }
 return {
  claim(key,expiry,now){
   if(!ID.test(key)||!Number.isSafeInteger(expiry)||!Number.isSafeInteger(now)||
      expiry<=now)return false;
   const entries=read();
   if(Object.hasOwn(entries,key))return false;
   for(const [name,expiresAt] of Object.entries(entries))
    if(expiresAt<=now)delete entries[name];
   if(Object.keys(entries).length>=2048)return false;
   entries[key]=expiry;
   store(entries);
   return true;
  },
  journalPath:file
 };
}
module.exports={createDurableReplay};
