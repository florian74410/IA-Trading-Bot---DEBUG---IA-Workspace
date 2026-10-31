const test=require('node:test');
const assert=require('node:assert/strict');
const {permission}=require('../App/Core/Clients/UserManagement/operator_policy');
const {permission:ownerPermission}=require('../App/Core/Clients/UserManagement/owner_policy');

test('ordinary Fundamental refresh has shared-write contract only',()=>{
 assert.equal(permission('fundamental','fundamental.collect'),'shared.write');
 assert.equal(permission('fundamental','fundamental.fedwatch.refresh'),'shared.write');
 assert.equal(ownerPermission('fundamental','fundamental.collect'),null);
});
test('destructive and configuration actions remain admin-only',()=>{
 for(const action of ['fundamental.news.purge','fundamental.feed.delete','fundamental.feed.create','fundamental.logs.purge','fundamental.timeline.rebuild'])
  assert.equal(permission('fundamental',action),'admin.write',action);
 assert.equal(permission('marketdata','marketdata.cache.clear'),'admin.write');
 assert.equal(permission('fundamental','fundamental.nonexistent'),null);
});
