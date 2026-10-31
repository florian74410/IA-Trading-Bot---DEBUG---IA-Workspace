'use strict';
/* Optional DEBUG-only HTTP boundary for UI/Router/Engine processes.
 * No network request can opt itself into this policy via headers.
 * Unknown operations fail closed, including all CP/1 and Trading LIVE.
 */
const AUTH_METHODS=Object.freeze({
 '/auth21/login':['POST'], '/auth21/me':['GET'], '/auth21/csrf':['GET'], '/auth21/logout':['POST'],
 '/auth21/state':['GET'], '/auth21/lock':['POST'], '/auth21/unlock':['POST'], '/auth21/activity':['POST'],
 '/auth21/preferences':['GET','PUT','DELETE']
});
function active(env){
 return !!(env&&env.IATB_AUTH21_CORE_AUTH_TRIAL==='1'&&
   env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&env.IATB_DEBUG_MODE==='1');
}
function decision(env,service,method,path){
 if(env?.IATB_AUTH_MODE==='authenticated'&&service==='router'){
  // Public UI bridges cannot bypass Core's authenticated capability issuer.
  return {intercept:!((method==='POST'&&['/communication/v1/request','/communication/v1/register','/communication/v1/event'].includes(path))||(method==='GET'&&['/router-health-internal','/router-health'].includes(path))),forwardToCore:false};
 }
 if(!active(env))return {intercept:false};
 if(service==='gateway'&&env.IATB_AUTH21_BUSINESS_TRIAL==='1'&&
    env.IATB_AUTH21_IPC_PROBE_TRIAL==='1'&&
    require('./auth21_business_actions').contract(path)&&
    method===(require('./auth21_business_actions').contract(path).method||'POST'))
    return {intercept:true,forwardToCore:true};
 if(service==='gateway'&&Object.hasOwn(AUTH_METHODS,path)&&AUTH_METHODS[path].includes(method))
  return {intercept:true,forwardToCore:true};
 return {intercept:true,forwardToCore:false};
}
module.exports={active,decision};
