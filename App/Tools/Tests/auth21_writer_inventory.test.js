'use strict';
/* Read-only source inventory regression tests: do NOT import any live store. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspectWriters,WRITERS}=require('../CI/auth21_writer_inventory');
const APP=path.resolve(__dirname,'../..');
function copyFixtures(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-writer-inventory-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const name of [...WRITERS.map(x=>x.file),'Core/Shared/paths.js']){
  const dest=path.join(root,name);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(path.join(APP,name),dest);
 }
 return root;
}
test('reviewed snapshot writer inventory is readable without importing or mutating services',()=>{
 const report=inspectWriters(APP);
 assert.equal(report.reviewedCount,12);
 assert.ok(report.kinds.includes('sqlite'));
 assert.ok(report.kinds.includes('jsonl'));
 assert.ok(report.kinds.includes('annex'));
 assert.ok(report.reviewedWriters.every(x=>x.guardPresent));
 assert.ok(report.reviewedWriters.every(x=>x.injectedAtRuntime===false));
});
test('inventory explicitly refuses to certify exhaustive runtime coverage',()=>{
 const report=inspectWriters(APP);
 assert.equal(report.exhaustive,false);
 assert.equal(report.allRuntimeWritersInjected,false);
 assert.equal(report.runtimeStartupStillEager,true);
 assert.equal(report.startupPreflightReadOnlyAvailable,true);
 assert.ok(report.remainingRisks.some(x=>x.includes('coverage')||x.includes('unregistered')));
});
test('missing a reviewed writer fails source preflight instead of marking green',t=>{
 const root=copyFixtures(t);
 fs.unlinkSync(path.join(root,WRITERS[0].file));
 assert.throws(()=>inspectWriters(root),/ENOENT/);
});
test('a reviewed writer without snapshotGate fails the inventory',t=>{
 const root=copyFixtures(t);
 const file=path.join(root,WRITERS[0].file);
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('snapshotGate','oldGate'));
 assert.throws(()=>inspectWriters(root),/AUTH21_WRITER_GUARD_NOT_FOUND:clients/);
});
test('a reviewed writer without assertWritable fails the inventory',t=>{
 const root=copyFixtures(t);
 const file=path.join(root,WRITERS[1].file);
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('assertWritable','allowAnything'));
 assert.throws(()=>inspectWriters(root),/AUTH21_WRITER_GUARD_NOT_FOUND:settings/);
});
test('removing startup readonly preflight contract causes inventory failure',t=>{
 const root=copyFixtures(t);
 const file=path.join(root,'Core/Shared/paths.js');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('IATB_PATHS_PREFLIGHT_READONLY','DELETED_FLAG'));
 assert.throws(()=>inspectWriters(root),/AUTH21_PATHS_PREFLIGHT_GUARD_MISSING/);
});
test('relative root cannot be silently interpreted as arbitrary current directory',()=>{
 assert.throws(()=>inspectWriters('.'),/AUTH21_WRITER_SOURCE_ROOT_REQUIRED/);
});
