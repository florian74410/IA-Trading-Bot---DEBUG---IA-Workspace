'use strict';
/* Auth 2.1 Phase 2 — READ-ONLY source inventory for previously reviewed
 * opt-in snapshot writers. This is NOT a proof of runtime gate injection,
 * exhaustive interprocess coverage, or consistency.
 * Never require/import the inspected files: constructors can mutate disks.
 */
const fs=require('node:fs');
const path=require('node:path');

const WRITERS=Object.freeze([
 ['Core/Clients/client_repository.js','sqlite','clients'],
 ['Core/Settings/sqlite_settings_store.js','sqlite','settings'],
 ['Portfolio/Engine/portfolio_store.js','sqlite','portfolio'],
 ['Fundamental/Engine/database_core.js','sqlite','fundamental-core'],
 ['Fundamental/Engine/database.js','sqlite','fundamental-legacy'],
 ['MarketData/Registry/market_registry.js','sqlite','registry'],
 ['MarketData/Storage/api_telemetry_store.js','sqlite','telemetry'],
 ['MarketData/Storage/microstructure_store.js','sqlite','microstructure'],
 ['MarketData/Financial/financial_store.js','jsonl','financial'],
 ['services/trading-engine/history-store.js','jsonl','trading-history'],
 ['Core/Services/usage_ledger_v1.js','jsonl','usage-ledger'],
 ['Core/Mosaics/mosaic_store_v1.0.js','annex','mosaics']
].map(([file,kind,id])=>Object.freeze({file,kind,id,gate:'snapshotGate'})));

const REMAINING_RISKS=Object.freeze([
 'Runtime Core/Shared/paths.js still performs eager initialization on NORMAL imports',
 'SnapshotGate is injected only into the isolated DEBUG runtime; normal runtime remains uncoordinated',
 'Remaining unregistered writable auxiliary services and administrative scripts require conservative triage',
 'Unreviewed startup/update/restart scripts and unlisted Annexes are not covered',
 'Crash/recovery and encrypted fixture restore have CI evidence; coverage of unregistered writers and in-service operations is not yet proven'
]);

function inspectWriters(sourceRoot){
 if(typeof sourceRoot!=='string'||!path.isAbsolute(sourceRoot))
  throw Error('AUTH21_WRITER_SOURCE_ROOT_REQUIRED');
 const root=path.resolve(sourceRoot);
 const entries=[];
 for(const item of WRITERS){
  const file=path.join(root,...item.file.split('/'));
  const src=fs.readFileSync(file,'utf8');
  if(!src.includes('snapshotGate')||!src.includes('assertWritable'))
   throw Error('AUTH21_WRITER_GUARD_NOT_FOUND:'+item.id);
  entries.push({...item,guardPresent:true,injectedAtRuntime:false});
 }
 const legacyPaths=fs.readFileSync(path.join(root,'Core','Shared','paths.js'),'utf8');
 for(const marker of [
  'IATB_PATHS_PREFLIGHT_READONLY','assertStartupWritable()',
  'if(!PREFLIGHT_READONLY&&!SNAPSHOT_FROZEN_STARTUP){ensureAppRuntimeDirs();',
  'ensureInternalServiceRuntimeKey();ensureCommunicationProtocolRuntimeKey();'
 ]){
  if(!legacyPaths.includes(marker))throw Error('AUTH21_PATHS_PREFLIGHT_GUARD_MISSING');
 }
 const ids=entries.map(x=>x.id);
 if(new Set(ids).size!==entries.length)throw Error('AUTH21_WRITER_DUPLICATE_ID');
 return {
  reviewedWriters:entries,reviewedCount:entries.length,
  kinds:[...new Set(entries.map(x=>x.kind))].sort(),
  startupPreflightReadOnlyAvailable:true,
  runtimeStartupStillEager:true,
  allRuntimeWritersInjected:false,
  exhaustive:false,
  remainingRisks:[...REMAINING_RISKS]
 };
}
module.exports={WRITERS,REMAINING_RISKS,inspectWriters};
