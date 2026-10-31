'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {authorize}=require('../../Core/Clients/auth21_rbac_guard');
const principals={admin:{clientId:'CL000001',role:'ADMIN'},user:{clientId:'CL000002',role:'USER'},guest:{clientId:'CL000003',role:'GUEST'}};
const sessions={verifySession:t=>principals[t]||null};
test('RBAC fails closed on no token, forged role and unknown operations',()=>{
 for(const operation of ['__proto__','wallet.withdraw','trade.live','admin.shell']){
  assert.equal(authorize({sessions,token:'admin',operation,method:'POST'}).allowed,false);
 }
 assert.equal(authorize({sessions,token:'fake',operation:'admin.write',method:'POST'}).allowed,false);
});
test('ADMIN role does not bypass tenant ownership',()=>{
 assert.equal(authorize({sessions,token:'admin',operation:'self.read',ownerClientId:'CL000002',method:'GET'}).allowed,false);
 assert.equal(authorize({sessions,token:'admin',operation:'self.read',ownerClientId:'CL000001',method:'GET'}).allowed,true);
});
test('GUEST is strictly read-only and cannot access tenant data',()=>{
 assert.equal(authorize({sessions,token:'guest',operation:'shared.read',method:'GET'}).allowed,true);
 for(const operation of ['self.read','self.write','admin.read','admin.write'])
  assert.equal(authorize({sessions,token:'guest',operation,ownerClientId:'CL000003',method:'POST'}).allowed,false);
});
test('USER can only mutate own records and cannot use admin actions',()=>{
 assert.equal(authorize({sessions,token:'user',operation:'self.write',ownerClientId:'CL000002',method:'PUT'}).allowed,true);
 assert.equal(authorize({sessions,token:'user',operation:'self.write',ownerClientId:'CL000001',method:'PUT'}).allowed,false);
 assert.equal(authorize({sessions,token:'user',operation:'admin.write',method:'POST'}).allowed,false);
});
test('GET never performs write and POST never impersonates a read',()=>{
 assert.equal(authorize({sessions,token:'admin',operation:'admin.write',method:'GET'}).allowed,false);
 assert.equal(authorize({sessions,token:'admin',operation:'admin.read',method:'POST'}).allowed,false);
});
