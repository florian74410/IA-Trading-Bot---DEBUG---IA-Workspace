'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {spawnSync}=require('node:child_process');
for(const file of ['launcher.js','Core/Admin/restart_all.js','Core/Admin/stop_total.js']){
 test('isolated snapshot trial refuses startup of '+file+' before side effects',()=>{
  const target=path.resolve(__dirname,'../..',file);
  const run=spawnSync(process.execPath,[target],{encoding:'utf8',timeout:3000,
   env:{...process.env,IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',
    IATB_AUTH21_SNAPSHOT_IPC_TRIAL:'1'}});
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/AUTH21_OPERATOR_SCRIPT_DISABLED_DURING_SNAPSHOT_TRIAL/);
 });
}
