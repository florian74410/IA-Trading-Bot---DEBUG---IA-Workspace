'use strict';
const fs=require('node:fs'),path=require('node:path');
function configuration(env=process.env){
 if(env.IATB_AUTH_MODE&&!['disabled','authenticated'].includes(env.IATB_AUTH_MODE))throw Error('AUTH_MODE_INVALID');
 const mode=String(env.IATB_DEPLOYMENT_MODE||(env.IATB_AUTH_MODE==='authenticated'?'AUTHENTICATED':env.NODE_ENV==='production'?'PRODUCTION':'DEV-LOCAL')).toUpperCase();
 if(!['DEV-LOCAL','AUTHENTICATED','PRODUCTION'].includes(mode))throw Error('USER_MODE_INVALID');
 const bypass=String(env.IATB_AUTH_MODE||'disabled').toLowerCase()==='disabled';
 if(mode==='PRODUCTION'&&(bypass||env.IATB_DEBUG_BOOTSTRAP==='1'||env.IATB_UI_BYPASS_ROLE))throw Error('PRODUCTION_BYPASS_FORBIDDEN');
 if(mode!=='DEV-LOCAL'&&bypass)throw Error('AUTHENTICATION_REQUIRED');
 if(mode==='DEV-LOCAL'&&!bypass)throw Error('DEV_MODE_REQUIRES_EXPLICIT_BYPASS');
 if(!bypass&&Object.keys(env).some(k=>k.startsWith('IATB_AUTH21_')&&k.endsWith('_TRIAL')&&env[k]==='1'))throw Error('AUTHENTICATED_TRIAL_MODES_EXCLUSIVE');
 if(!bypass){
  if(!env.IATB_AUTH_ORIGIN||new URL(env.IATB_AUTH_ORIGIN).origin!==env.IATB_AUTH_ORIGIN||!env.IATB_AUTH_ORIGIN.startsWith('https://'))throw Error('AUTH_HTTPS_ORIGIN_REQUIRED');
  for(const name of ['IATB_AUTH_TLS_CERT','IATB_AUTH_TLS_KEY'])if(!env[name]||!path.isAbsolute(env[name]))throw Error('AUTH_TLS_FILES_REQUIRED');
 }
 return {mode,enabled:!bypass,origin:env.IATB_AUTH_ORIGIN,certFile:env.IATB_AUTH_TLS_CERT,keyFile:env.IATB_AUTH_TLS_KEY};
}
function tls(config){
 for(const file of [config.certFile,config.keyFile]){
  const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||fs.realpathSync(file)!==file)throw Error('AUTH_TLS_FILE_UNSAFE');
  if(file===config.keyFile&&(st.mode&0o077))throw Error('AUTH_TLS_KEY_PERMISSIONS');
 }
 return {cert:fs.readFileSync(config.certFile),key:fs.readFileSync(config.keyFile),minVersion:'TLSv1.2'};
}
module.exports={configuration,tls};
