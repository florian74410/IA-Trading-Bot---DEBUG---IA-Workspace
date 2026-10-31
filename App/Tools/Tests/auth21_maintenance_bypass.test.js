'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const tools=['core_router_smoke','firewall_smoke','marketdata_smoke','orchestrator_sqlite_smoke',
 'persistence_volume_smoke','router_smoke','sqlite_preflight','ssh_ui_bridge',
 'storage_preflight','trading_static_audit','ui_core_router_smoke'];
test('all independent maintenance entrypoints reject isolated snapshots before operations',()=>{
 for(const name of tools){
  const src=fs.readFileSync(path.resolve(__dirname,'../',name+'.js'),'utf8');
  assert.ok(src.slice(0,650).includes("AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT"),name);
  assert.ok(src.slice(0,650).includes("IATB_AUTH21_SNAPSHOT_IPC_TRIAL"),name);
 }
});
