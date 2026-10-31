'use strict';
/* Explicitly isolated persistence adapter for Auth21 integration tests.
 * Never use with real Indicator settings, user data or GEN-1 paths.
 */
const fs=require('node:fs');
const path=require('node:path');
const {verify}=require('./auth21_business_capability');
function createWriter({root,codec,onVerified=null}={}){
 if(!root||!codec||typeof codec.verify!=='function')throw Error('AUTH21_FIXTURE_CONFIG_REQUIRED');
 const resolved=fs.realpathSync(root);
 const stat=fs.lstatSync(resolved);
 if(!stat.isDirectory()||(stat.mode&0o002)!==0)throw Error('AUTH21_FIXTURE_DIRECTORY_UNSAFE');
 const target=path.join(resolved,'indicator-settings.fixture.json');
 function read(){
  if(!fs.existsSync(target))return {enabled:false,refreshMs:5000};
  const s=fs.lstatSync(target);
  if(!s.isFile()||s.isSymbolicLink()||s.size>4096)throw Error('AUTH21_FIXTURE_FILE_UNSAFE');
  const value=JSON.parse(fs.readFileSync(target,'utf8'));
  return value;
 }
 function write({proof,settings,bodyDigest}={}){
  const access=verify({codec,proof,action:'indicator.settings.set',bodyDigest});
  if(!access.allowed)return {ok:false,error:'FORBIDDEN'};
  if(onVerified&&!onVerified(proof))return {ok:false,error:'REPLAY_DENIED'};
  if(!settings||Object.keys(settings).sort().join(',')!=='enabled,refreshMs'||
    typeof settings.enabled!=='boolean'||!Number.isSafeInteger(settings.refreshMs)||
    settings.refreshMs<1000||settings.refreshMs>60000)return {ok:false,error:'INVALID_SETTINGS'};
  if(fs.existsSync(target))read();
  const temp=path.join(resolved,'.indicator-'+require('node:crypto').randomBytes(12).toString('hex')+'.tmp');
  try{
   fs.writeFileSync(temp,JSON.stringify(settings)+'\n',{flag:'wx',mode:0o600});
   fs.renameSync(temp,target);
   return {ok:true,settings:read()};
  }finally{try{fs.unlinkSync(temp)}catch(_){}}
 }
 return {read,write};
}
module.exports={createWriter};
