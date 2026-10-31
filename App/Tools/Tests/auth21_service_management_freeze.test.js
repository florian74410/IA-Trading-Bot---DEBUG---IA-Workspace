'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../Core/Admin/service_registry.js'),'utf8');
test('all administrative process mutation APIs refuse isolated P2.2 backup mode',()=>{
 for(const signature of ['Registry.prototype.spawnFixed=function(s,cb){',
  'Registry.prototype.stop=function(id,cb){',
  'Registry.prototype.restart=function(id,cb){',
  'Registry.prototype.setProcessEnabled=function(id,enabled,cb){',
  'Registry.prototype.postJson=function(id,targetPath,payload,cb){']){
  const i=src.indexOf(signature);
  assert.ok(i>=0,signature);
  assert.match(src.slice(i,i+315),/IATB_AUTH21_SNAPSHOT_IPC_TRIAL/);
  assert.match(src.slice(i,i+315),/AUTH21_SERVICE_MANAGEMENT_READ_ONLY/);
 }
});
