'use strict';
/* Auth 2.1 P2.2: startup/import side effects tested ONLY in disposable /tmp.
 * Never imports paths.js inside the main test process.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const MODULE=path.resolve(__dirname,'../../Core/Shared/paths.js');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-paths-preflight-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return {root,runtime:path.join(root,'runtime'),data:path.join(root,'userdata'),
  annex:path.join(root,'annex'),updates:path.join(root,'updates')};
}
function invoke(f,script,{readonly=true}={}){
 const result=spawnSync(process.execPath,['-e',script],{
  cwd:f.root,encoding:'utf8',timeout:4000,
  env:{...process.env,IATB_PATHS_PREFLIGHT_READONLY:readonly?'1':'0',
   IATB_RUNTIME_ROOT:f.runtime,IATB_DATA_ROOT:f.data,
   IATB_ANNEX_ROOT:f.annex,IATB_UPDATES_ROOT:f.updates,
   IATB_STATE_ROOT:path.join(f.root,'legacy')}
 });
 if(result.error)throw result.error;
 return result;
}
function requirePaths(){return 'const p=require('+JSON.stringify(MODULE)+');';}
test('read-only import never creates runtime dirs, updates or keys',t=>{
 const f=fixture(t);
 const r=invoke(f,requirePaths()+'console.log(JSON.stringify({readonly:p.preflightReadOnly,security:p.RuntimeSecrets,clientDb:p.PersistentData.clientDb}));');
 assert.equal(r.status,0,r.stderr);
 const result=JSON.parse(r.stdout.trim());
 assert.equal(result.readonly,true);
 assert.equal(result.clientDb,path.join(f.data,'Database','clients.sqlite'));
 assert.equal(result.security.internalServiceKey,path.join(f.runtime,'state','security','internal_service_key.dat'));
 for(const p of [f.runtime,f.data,f.annex,f.updates])
  assert.equal(fs.existsSync(p),false,p);
});
test('all explicit initialization functions refuse writes during readonly preflight',t=>{
 const f=fixture(t);
 const js=requirePaths()+'let errors=[];for(const action of ["ensureAppRuntimeDirs","ensureUpdateRuntimeDirs","ensureInternalServiceRuntimeKey","ensureCommunicationProtocolRuntimeKey"]){try{p[action]();errors.push("BYPASS:"+action)}catch(e){errors.push(e.message)}}console.log(JSON.stringify(errors));';
 const r=invoke(f,js);
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(JSON.parse(r.stdout.trim()),Array(4).fill('IATB_PATHS_PREFLIGHT_READONLY'));
 assert.equal(fs.existsSync(f.runtime),false);
 assert.equal(fs.existsSync(f.updates),false);
});
test('preflight preserves damaged existing internal secret exactly, even permissions',t=>{
 const f=fixture(t),dir=path.join(f.runtime,'state','security');
 fs.mkdirSync(dir,{recursive:true});
 const key=path.join(dir,'internal_service_key.dat');
 fs.writeFileSync(key,'DAMAGED-FICTIONAL-SECRET-DO-NOT-TOUCH',{mode:0o644});
 const before=fs.statSync(key).mode&0o777;
 const r=invoke(f,requirePaths()+'console.log(p.preflightReadOnly);');
 assert.equal(r.status,0,r.stderr);
 assert.equal(r.stdout.trim(),'true');
 assert.equal(fs.readFileSync(key,'utf8'),'DAMAGED-FICTIONAL-SECRET-DO-NOT-TOUCH');
 assert.equal(fs.statSync(key).mode&0o777,before);
 assert.equal(fs.existsSync(path.join(dir,'communication_protocol_key.dat')),false);
});
test('explicit secret creation under readonly preflight fails closed',t=>{
 const f=fixture(t);
 const r=invoke(f,requirePaths()+'p.ensureInternalServiceRuntimeKey();');
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/IATB_PATHS_PREFLIGHT_READONLY/);
 assert.equal(fs.existsSync(f.runtime),false);
});
test('normal legacy startup is unchanged on synthetic isolated runtime',t=>{
 const f=fixture(t);
 const r=invoke(f,requirePaths()+'console.log(p.preflightReadOnly);',{readonly:false});
 assert.equal(r.status,0,r.stderr);
 assert.equal(r.stdout.trim(),'false');
 for(const rel of ['logs','state','database','config','updates/Inbox','updates/Backups'])
  assert.equal(fs.statSync(path.join(f.runtime,rel)).isDirectory(),true,rel);
 for(const name of ['internal_service_key.dat','communication_protocol_key.dat']){
  const key=path.join(f.runtime,'state','security',name);
  assert.match(fs.readFileSync(key,'utf8'),/^[0-9a-f]{64}$/);
  assert.equal(fs.statSync(key).mode&0o777,0o600);
 }
});
test('normal legacy startup preserves malformed existing key and fails closed',t=>{
 const f=fixture(t),dir=path.join(f.runtime,'state','security');
 fs.mkdirSync(dir,{recursive:true});
 const key=path.join(dir,'internal_service_key.dat');
 fs.writeFileSync(key,'DAMAGED-TEST-KEY',{mode:0o600});
 const r=invoke(f,requirePaths(),{readonly:false});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/INTERNAL_SERVICE_KEY_UNAVAILABLE/);
 assert.equal(fs.readFileSync(key,'utf8'),'DAMAGED-TEST-KEY');
});
test('preflight preserves existing user data and does not create Security path',t=>{
 const f=fixture(t);
 fs.mkdirSync(f.data,{mode:0o700});
 const sentinel=path.join(f.data,'sentinel.dat');
 fs.writeFileSync(sentinel,'SENTINEL',{mode:0o600});
 const r=invoke(f,requirePaths()+'console.log(p.PersistentData.clientMasterKey);');
 assert.equal(r.status,0,r.stderr);
 assert.equal(r.stdout.trim(),path.join(f.data,'Security','client_master.key'));
 assert.equal(fs.readFileSync(sentinel,'utf8'),'SENTINEL');
 assert.equal(fs.existsSync(path.join(f.data,'Security')),false);
 assert.equal(fs.existsSync(f.runtime),false);
});

test('simultaneous Engine startup cannot observe or overwrite a partly written secret',{timeout:15000},async t=>{
 const f=fixture(t),{spawn}=require('node:child_process'),{once}=require('node:events');
 const release=path.join(f.root,'release');
 const env={...process.env,IATB_PATHS_PREFLIGHT_READONLY:'0',IATB_RUNTIME_ROOT:f.runtime,
  IATB_DATA_ROOT:f.data,IATB_ANNEX_ROOT:f.annex,IATB_UPDATES_ROOT:f.updates,
  IATB_STATE_ROOT:path.join(f.root,'legacy')};
 // Pause the first writer after creating an EMPTY file but before filling it.
 // Another Engine must publish/read a complete winner while this one is paused.
 const code=`const fs=require('node:fs');const original=fs.writeFileSync;let held=false;
 fs.writeFileSync=function(file,data,options){
  if(!held&&String(file).includes('internal_service_key.dat')){
   held=true;original.call(fs,file,'',options);process.send('partial');
   const start=Date.now();while(!fs.existsSync(${JSON.stringify(release)})){
    if(Date.now()-start>10000)throw Error('TEST_BARRIER_TIMEOUT');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
   }
   return original.call(fs,file,data,{...options,flag:'w'});
  }return original.call(fs,file,data,options);
 };require(${JSON.stringify(MODULE)});`;
 const first=spawn(process.execPath,['-e',code],{env,stdio:['ignore','ignore','pipe','ipc']});
 let errors='';first.stderr.on('data',x=>errors+=x);
 t.after(()=>first.kill('SIGKILL'));
 await once(first,'message');
 const second=invoke(f,requirePaths(),{readonly:false});
 fs.writeFileSync(release,'release');
 assert.equal(second.status,0,second.stderr);
 const key=path.join(f.runtime,'state','security','internal_service_key.dat');
 const winner=fs.readFileSync(key,'utf8');assert.match(winner,/^[a-f0-9]{64}$/);
 const [status]=await once(first,'exit');assert.equal(status,0,errors);
 assert.equal(fs.readFileSync(key,'utf8'),winner);
 assert.equal(fs.statSync(key).mode&0o777,0o600);
 assert.deepEqual(fs.readdirSync(path.dirname(key)).filter(x=>x.endsWith('.tmp')),[]);
});
