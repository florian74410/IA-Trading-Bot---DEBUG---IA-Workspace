'use strict';
// Security regression: Auth21 Core trial must not fall through to legacy Core.
const assert = require('node:assert/strict');
const {createIsolatedCoreGate} = require('../Clients/auth21_core_route_gate');
const noop = () => { throw Error('LEGACY_OR_SESSION_HANDLER_REACHED'); };
const sessions = {
  loginWithPassword:noop, verifySession:noop, revokeSession:noop
};
const gate = createIsolatedCoreGate({sessions});
async function invoke(url,method='GET') {
 const response={writableEnded:false,headersSent:false,
  writeHead(status,headers){this.status=status;this.headers=headers;},
  end(body){this.body=JSON.parse(body);this.writableEnded=true;}};
 await gate({url,method,headers:{}},response);
 return response;
}
(async () => {
 const paths = [
 '/api/profile','/api/session/change-password','/api/credits/usage',
 '/api/swap-bridge/history','/api/notifications','/api/chat',
 '/api/trading','/admin','/communication/v1/registry',
 '/auth21/business/portfolio/preference?ownerClientId=CLvictim',
 '/auth21/business/marketdata/metadata?anything=1',
 '/api/profile?clientId=CLvictim'
 ];
 for(const url of paths){
  for(const method of ['GET','POST','PUT','DELETE']){
   const r=await invoke(url,method);
   assert.equal(r.status,404,method+' '+url+' must not reach legacy Core');
   assert.equal(r.body.error,'NOT_FOUND');
   assert.equal(r.headers['Cache-Control'],'no-store');
  }
 }
 console.log('AUTH21_CORE_GATE_DENY_REGRESSION_OK '+(paths.length*4));
})().catch(e=>{console.error(e);process.exitCode=1;});
