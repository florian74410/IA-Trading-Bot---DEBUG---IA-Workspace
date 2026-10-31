'use strict';
/* Auth 2.1 Core-local injection tested on throwaway /tmp roots.
 * Never imports the live Core server; no HTTP, external services or wallets.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {preflightEnv,createTrial,IDS,MARKER,CONTENT}=require('../../Core/Backup/auth21_core_local_trial_wiring');
const {LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');

const serverFile=path.resolve(__dirname,'../../Core/Server/server.js');
const repoFile=path.resolve(__dirname,'../../Core/Clients/client_repository.js');
const settingsFile=path.resolve(__dirname,'../../Core/Settings/sqlite_settings_store.js');
const mosaicsFile=path.resolve(__dirname,'../../Core/Mosaics/mosaic_store_v1.0.js');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);
 fs.writeFileSync(path.join(root,MARKER),CONTENT,{mode:0o600});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const env={
  IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',
  IATB_AUTH21_LOCAL_TRIAL_ROOT:root,IATB_RUNTIME_ROOT:path.join(root,'runtime'),
  IATB_DATA_ROOT:path.join(root,'userdata'),
  IATB_ANNEX_ROOT:path.join(root,'annexes'),
  IATB_UPDATES_ROOT:path.join(root,'updates'),
  IATB_STATE_ROOT:path.join(root,'legacy')
 };
 return {root,env};
}
test('only explicit DEBUG marker and private temporary root authorize opt-in gates',t=>{
 const f=fixture(t),ready=preflightEnv(f.env);
 assert.equal(ready.root,f.root);
 assert.deepEqual(IDS,['clients','settings','mosaics','annex-root']);
 const ctx=createTrial(f.env);
 assert.equal(ctx.root,f.root);
 assert.deepEqual(ctx.coordinator.writerIds,IDS);
 for(const name of IDS){
  assert.ok(ctx.gateFor(name) instanceof LocalSnapshotWriter);
  assert.ok(ctx.coordinator.writers.has(name));
 }
 for(const name of ['runtime','userdata','annexes','updates','legacy'])
  assert.equal(fs.existsSync(path.join(f.root,name)),false);
});
test('unset trial flag or non-DEBUG context fails closed',t=>{
 const f=fixture(t);
 for(const patch of [
  {IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'0'},
  {IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:''},
  {IATB_DEBUG_MODE:'0'},
  {IATB_DEBUG_BOOTSTRAP:'1'},
  {IATB_AUTH21_LOCAL_TRIAL_ROOT:'/tmp/imaginary-auth21-target'}
 ]){
  assert.throws(()=>preflightEnv({...f.env,...patch}),/AUTH21_CORE_LOCAL_TRIAL_UNSAFE/);
 }
});
test('settings, data, annexes and runtime roots cannot be redirected elsewhere',t=>{
 const f=fixture(t);
 for(const [key,p] of [
  ['IATB_DATA_ROOT','/var/tmp/userdata'],
  ['IATB_RUNTIME_ROOT','/tmp/extra-runtime'],
  ['IATB_ANNEX_ROOT','/tmp/other-annexes'],
  ['IATB_UPDATES_ROOT','/tmp/other-updates'],
  ['IATB_STATE_ROOT','/tmp/other-state'],
  ['IATB_USER_DB','/tmp/other-settings.sqlite']
 ]){
  assert.throws(()=>preflightEnv({...f.env,[key]:p}),/AUTH21_CORE_LOCAL_TRIAL_UNSAFE/);
 }
});
test('private marker cannot be absent, replaced or made world-readable',t=>{
 const f=fixture(t),file=path.join(f.root,MARKER);
 fs.chmodSync(file,0o644);
 assert.throws(()=>preflightEnv(f.env),/AUTH21_CORE_LOCAL_TRIAL_UNSAFE/);
 fs.chmodSync(file,0o600);
 fs.writeFileSync(file,'TAMPERED');
 assert.throws(()=>preflightEnv(f.env),/AUTH21_CORE_LOCAL_TRIAL_UNSAFE/);
 fs.unlinkSync(file);
 assert.throws(()=>preflightEnv(f.env),/ENOENT|AUTH21_CORE_LOCAL_TRIAL_UNSAFE/);
});
test('unsafe root permissions are rejected',t=>{
 const f=fixture(t);
 fs.chmodSync(f.root,0o755);
 assert.throws(()=>preflightEnv(f.env),/AUTH21_CORE_LOCAL_TRIAL_UNSAFE/);
});
test('symlinked root subdirectory is rejected even if its destination is private',t=>{
 const f=fixture(t);
 const external=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-test-external-'));
 t.after(()=>fs.rmSync(external,{recursive:true,force:true}));
 fs.symlinkSync(external,path.join(f.root,'userdata'));
 assert.throws(()=>preflightEnv(f.env),/AUTH21_CORE_LOCAL_TRIAL_UNSAFE/);
});
test('unknown writer name cannot accidentally bypass the fixed gate registry',t=>{
 const f=fixture(t),ctx=createTrial(f.env);
 assert.throws(()=>ctx.gateFor('trade-execution'),/AUTH21_CORE_LOCAL_UNKNOWN_WRITER/);
});
test('real snapshot freeze blocks all four Core gates and releases each afterwards',async t=>{
 const f=fixture(t),ctx=createTrial(f.env),trace=[];
 const result=await ctx.coordinator.execute(({epoch})=>{
  trace.push('QUIESCED:'+epoch);
  for(const name of IDS)assert.throws(()=>ctx.gateFor(name).assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
  return 'FICTIONAL_CAPTURE';
 });
 assert.equal(result,'FICTIONAL_CAPTURE');
 assert.deepEqual(trace,['QUIESCED:1']);
 assert.equal(ctx.coordinator.state,'IDLE');
 for(const name of IDS)ctx.gateFor(name).assertWritable();
});
test('Core trial gates recover after a snapshot abort and block stale generations',async t=>{
 const f=fixture(t),ctx=createTrial(f.env);
 await assert.rejects(()=>ctx.coordinator.execute(()=>{
  assert.throws(()=>ctx.gateFor('settings').assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
  throw Error('FAKE_DISK_FAILURE');
 }),/FAKE_DISK_FAILURE/);
 assert.equal(ctx.coordinator.state,'IDLE');
 for(const name of IDS)ctx.gateFor(name).assertWritable();
 assert.throws(()=>ctx.gateFor('clients').prepare(1),/SNAPSHOT_STALE_OR_BUSY_EPOCH/);
});
test('MosaicStore real constructor refuses creating Annexes while its injected gate is held',t=>{
 const f=fixture(t),ctx=createTrial(f.env);
 const MosaicStore=require(mosaicsFile);
 const gate=ctx.gateFor('mosaics'),annex=path.join(f.root,'annexes');
 gate.prepare(1);
 const before=process.env.IATB_ANNEX_ROOT;
 process.env.IATB_ANNEX_ROOT=annex;
 try{
  assert.throws(()=>new MosaicStore(f.root,{snapshotGate:gate}),/SNAPSHOT_WRITE_QUIESCED/);
  assert.equal(fs.existsSync(path.join(annex,'Mosaiques')),false);
  gate.abort(1);
  const store=new MosaicStore(f.root,{snapshotGate:gate});
  assert.ok(store);assert.equal(fs.existsSync(path.join(annex,'Mosaiques')),true);
 }finally{
  if(before===undefined)delete process.env.IATB_ANNEX_ROOT;
  else process.env.IATB_ANNEX_ROOT=before;
 }
});
test('actual ClientRepository and SettingsStore source still accepts the opt-in gate contract',()=>{
 for(const file of [repoFile,settingsFile,mosaicsFile]){
  const code=fs.readFileSync(file,'utf8');
  assert.match(code,/snapshotGate/);
  assert.match(code,/assertWritable/);
 }
});
test('Core server validates trial env before importing paths or instantiating stores',()=>{
 const src=fs.readFileSync(serverFile,'utf8');
 const p=src.indexOf('AUTH21_LOCAL_TRIAL.preflightEnv(process.env)');
 const paths=src.indexOf("PATHS=require('../Shared/paths')");
 const settings=src.indexOf("snapshotGate:AUTH21_LOCAL_WRITERS.gateFor('settings')");
 const clients=src.indexOf("snapshotGate:AUTH21_LOCAL_WRITERS?AUTH21_LOCAL_WRITERS.gateFor('clients'):null");
 const annex=src.indexOf("gateFor('annex-root').assertWritable()");
 const mosaic=src.indexOf("snapshotGate:AUTH21_LOCAL_WRITERS.gateFor('mosaics')");
 assert.ok(p>=0&&paths>p,'trial preflight runs before paths import');
 assert.ok(settings>paths&&clients>paths&&annex>clients&&mosaic>clients);
});
test('Core server default mode does not instantiate or expose trial coordinator',()=>{
 const src=fs.readFileSync(serverFile,'utf8');
 assert.match(src,/if\(process\.env\.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'\)/);
 assert.match(src,/AUTH21_LOCAL_WRITERS=AUTH21_LOCAL_TRIAL\?AUTH21_LOCAL_TRIAL\.createTrial\(process\.env\):null/);
 assert.equal(src.includes("'/api/auth21/snapshot'"),false);
});

test('native Auth21 Core bridge refuses absent sandbox and never creates SQLite files',t=>{
 const f=fixture(t);
 const {openCoreAuthTrial}=require('../../Core/Clients/auth21_core_route_gate');
 assert.throws(()=>openCoreAuthTrial({root:f.root,env:{...f.env,IATB_DEBUG_MODE:'0'}}),
  /AUTH21_CORE_LOCAL_TRIAL_UNSAFE/);
 assert.equal(fs.existsSync(path.join(f.root,'userdata')),false);
});
test('native Auth21 Core bridge refuses wrong sandbox root before inspecting credentials',t=>{
 const f=fixture(t);
 const {openCoreAuthTrial}=require('../../Core/Clients/auth21_core_route_gate');
 assert.throws(()=>openCoreAuthTrial({root:'/tmp/unrelated',env:f.env}),
  /AUTH21_CORE_TRIAL_ROOT_MISMATCH/);
 assert.equal(fs.existsSync(path.join(f.root,'userdata')),false);
});
test('native Auth21 bridge rejects missing original database without generating a replacement key',t=>{
 const f=fixture(t);
 const {openCoreAuthTrial}=require('../../Core/Clients/auth21_core_route_gate');
 assert.throws(()=>openCoreAuthTrial({root:f.root,env:f.env,clientCrypto:{keyFile:'NONE'},snapshotGate:{assertWritable(){}}}),
  /ENOENT/);
 assert.equal(fs.existsSync(path.join(f.root,'userdata')),false);
});

test('Core auth routing is disabled by default and checks original DB before constructing Clients',()=>{
 const src=fs.readFileSync(serverFile,'utf8');
 const ready=src.indexOf("AUTH21_CORE_AUTH_EXISTING_FILES_REQUIRED");
 const crypto=src.indexOf("CLIENT_CRYPTO=new ClientCrypto");
 const bridge=src.indexOf("openCoreAuthTrial({root:AUTH21_LOCAL_WRITERS.root");
 const route=src.indexOf("if(AUTH21_CORE_AUTH){AUTH21_CORE_AUTH.handler(req,res);return;}");
 const legacy=src.indexOf("if(p==='/api/bootstrap')");
 assert.ok(ready>0&&ready<crypto&&bridge>crypto&&route>bridge);
 assert.ok(legacy<0||legacy>route);
 assert.match(src,/var AUTH21_CORE_AUTH=null;/);
 assert.match(src,/IATB_AUTH21_CORE_AUTH_TRIAL==='1'/);
});
