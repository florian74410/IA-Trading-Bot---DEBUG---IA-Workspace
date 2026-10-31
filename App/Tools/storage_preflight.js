'use strict';
// Auth21 P2.2: independent maintenance tools must not bypass a held global snapshot.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')throw Error('AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT');

/* Offline, non-destructive DEBUG storage preflight. No engines or network. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const roots=['IATB_RUNTIME_ROOT','IATB_DATA_ROOT','IATB_STATE_ROOT'];
for(const name of roots){
  assert(process.env[name]&&path.isAbsolute(process.env[name]),name+' must be absolute');
}
const canonical=roots.map(k=>path.resolve(process.env[k]));
assert.equal(new Set(canonical).size,3,'DEBUG directories must be distinct');
for(const dir of canonical){
  assert(dir.startsWith('/iatb/debug/'),'Unexpected storage path: '+dir);
  assert(fs.statSync(dir).isDirectory(),'Missing mount '+dir);
  const marker=path.join(dir,'.iatb-write-probe-'+crypto.randomBytes(8).toString('hex'));
  try{fs.writeFileSync(marker,'probe',{flag:'wx',mode:0o600});assert.equal(fs.readFileSync(marker,'utf8'),'probe');}
  finally{try{fs.unlinkSync(marker);}catch(e){}}
}
const paths=require('../Core/Shared/paths');
const extras=[
  ['IATB_ANNEX_ROOT',paths.Annexes,'/iatb/debug/annexes'],
  ['IATB_UPDATES_ROOT',paths.Updates,'/iatb/debug/updates']
];
for(const [key,actual,expected] of extras){
  assert.equal(path.resolve(process.env[key]||''),expected,key+' not correctly configured');
  assert.equal(path.resolve(actual),expected,key+' paths mismatch');
  assert(fs.statSync(expected).isDirectory(),'Missing '+key+' mounted directory');
  const probe=path.join(expected,'.iatb-write-probe-'+crypto.randomBytes(8).toString('hex'));
  try{fs.writeFileSync(probe,'probe',{flag:'wx',mode:0o600});assert.equal(fs.readFileSync(probe,'utf8'),'probe');}
  finally{try{fs.unlinkSync(probe);}catch(e){}}
}
assert.equal(paths.Strategies,path.join(paths.Annexes,'Strategies'));
assert.equal(paths.ReleasePointer,path.join(paths.Updates,'current_release.dat'));

assert.equal(path.resolve(paths.AppRuntime.root),canonical[0]);
assert.equal(path.resolve(paths.PersistentData.root),canonical[1]);
assert.equal(path.resolve(path.dirname(paths.Data.user)),canonical[2]);
for(const file of [paths.RuntimeSecrets.internalServiceKey,paths.RuntimeSecrets.communicationProtocolKey]){
  assert(fs.existsSync(file),'Internal key missing');
  assert.equal(fs.statSync(file).mode&0o077,0,'Internal key permissions too broad');
}
const Settings=require('../Core/Settings/sqlite_settings_store');
const username='storage-preflight';
const store=new Settings(paths.ROOT,{username});
try{
  assert(store.ready,store.lastError);
  assert(store.dbPath.startsWith(canonical[1]+path.sep));
  store.set('preflight','storage',true);
  assert.equal(store.get('preflight','storage'),true);
}finally{if(store.native)store.native.close();}
assert(!fs.existsSync(path.join(paths.ROOT,'.runtime')),'Unexpected mutable app runtime inside image');
console.log('DEBUG MOUNTS: OK');
console.log('ANNEXES AND UPDATES MOUNTS: OK');
console.log('RUNTIME KEYS: OK');
console.log('SQLITE WRITE/READ: OK');
console.log('APP ROOT IMMUTABLE: OK');
console.log('STORAGE PREFLIGHT: SUCCESS');
