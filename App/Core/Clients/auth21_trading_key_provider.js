'use strict';
// Server-only, pre-provisioned P3 key. No generation and no key material in diagnostics.
const fs=require('node:fs'),path=require('node:path');
function checkedKey({env=process.env}={}){
 const target=env.IATB_AUTH21_TRADING_IPC_KEY_FILE;
 function invalid(reason){const e=Error(reason);e.reason=reason;throw e;}
 if(!target)invalid('KEY_MISSING');
 if(typeof target!=='string'||!path.isAbsolute(target)||path.resolve(target)!==target)invalid('PATH_INVALID');
 const repo=path.resolve(__dirname,'../../..'),relative=path.relative(repo,target);
 if(relative===''||!relative.startsWith('..'+path.sep))invalid('PATH_IN_REPOSITORY');
 const root=env.IATB_AUTH21_TRADING_IPC_KEY_ROOT||(env.IATB_DATA_ROOT?path.join(env.IATB_DATA_ROOT,'Security'):null);
 if(root){if(!path.isAbsolute(root)||!(target.startsWith(path.resolve(root)+path.sep)))invalid('PATH_NOT_AUTHORIZED');}
 let st,fd;
 try{
  st=fs.lstatSync(target);
  if(st.isSymbolicLink()||!st.isFile()||fs.realpathSync(target)!==target)invalid('SYMLINK_OR_TYPE_INVALID');
  if((st.mode&0o777)!==0o600)invalid('PERMISSIONS_INVALID');
  if(process.getuid&&st.uid!==process.getuid())invalid('OWNER_INVALID');
  if(st.size!==32)invalid('LENGTH_INVALID');
  fd=fs.openSync(target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  const opened=fs.fstatSync(fd);
  if(opened.ino!==st.ino||opened.dev!==st.dev||opened.size!==32||(opened.mode&0o777)!==0o600||opened.uid!==st.uid)invalid('FILE_CHANGED');
  const key=fs.readFileSync(fd);if(key.length!==32)invalid('LENGTH_INVALID');return key;
 }catch(e){if(e.code==='ENOENT')invalid('KEY_MISSING');if(e.reason)throw e;invalid('KEY_UNREADABLE');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function preflightTradingAdminKey(options){try{checkedKey(options);return {ok:true,state:'VALIDATING',reason:'KEY_VALID',keyBytes:32};}catch(e){return {ok:false,state:e.reason==='KEY_MISSING'?'KEY_MISSING':'KEY_INVALID',reason:e.reason||'KEY_UNREADABLE'};}}
function loadTradingAdminKey(options){try{return checkedKey(options);}catch(e){throw Error(e.reason==='KEY_MISSING'?'TRADING_ADMIN_IPC_KEY_MISSING:ENOENT':'TRADING_ADMIN_IPC_KEY_UNSAFE:'+e.reason);}}
module.exports={loadTradingAdminKey,preflightTradingAdminKey};
