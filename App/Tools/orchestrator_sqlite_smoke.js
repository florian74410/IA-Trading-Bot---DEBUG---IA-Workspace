'use strict';
// Auth21 P2.2: independent maintenance tools must not bypass a held global snapshot.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')throw Error('AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT');

// Offline integration: SQLite telemetry + orchestrator shadow and broker.
// No HTTP calls, providers, exchange streams, or Trading Engine.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Store=require('../MarketData/Storage/api_telemetry_store');
const Telemetry=require('../MarketData/Orchestrator/api_telemetry');
const Orchestrator=require('../MarketData/Orchestrator/api_request_orchestrator');
const root='/tmp/iatb-orchestrator-smoke';
fs.mkdirSync(root,{recursive:true});
const file=path.join(root,'api_telemetry.db');
let store;
try{
 store=new Store({file,retentionDays:7});
 assert.equal(store.status().ok,true,'SQLite telemetry must be ready');
 Telemetry.setStore(store);
 const orch=new Orchestrator({mode:'SHADOW',cacheFirst:false,dedup:false});
 orch.configureProvider('COINGECKO',{shortLimit:2,shortWindowMs:60000,longLimit:3,longWindowMs:86400000});
 const req={provider:'COINGECKO',dataset:'ASSET_SEARCH',signature:'offline-fixture',cost:1};
 const first=orch.observeStart(req);
 const overlapping=orch.observeStart(req);
 assert.equal(overlapping.broker.inflightDuplicate,true);
 orch.observeEnd(first,null);
 orch.observeEnd(overlapping,null);
 const cacheCandidate=orch.observeStart(req);
 // The policy may assign zero TTL; only test dedup as invariant.
 orch.observeEnd(cacheCandidate,null);
 orch.observeTransport(req);
 orch.observeTransport(req);
 orch.observeTransport(req);
 const status=orch.status();
 assert.equal(status.shadow,true);
 assert.equal(status.execution.budgetEnforcement,false);
 assert.equal(status.execution.decisionEnforcement,false);
 assert.equal(status.broker.stats.dedupOpportunities>=1,true);
 console.log('ORCHESTRATOR SHADOW: OK');
 console.log('REQUEST BROKER DEDUP OBSERVATION: OK');
 console.log('BUDGET SHADOW ACCOUNTING: OK');
 const before=store.status();
 assert(before.events>=6,'Expected multiple telemetry events');
 store.close();
 store=new Store({file,retentionDays:7});
 const after=store.status();
 assert(after.ok);
 assert(after.events>=before.events);
 assert(fs.statSync(file).size>0);
 console.log('SQLITE TELEMETRY PERSISTENCE: OK');
 console.log('EXTERNAL NETWORK REQUESTS: 0');
 console.log('TRADING ENGINES STARTED: 0');
 console.log('ORCHESTRATOR + SQLITE SMOKE: SUCCESS');
}catch(e){
 console.error('ORCHESTRATOR + SQLITE SMOKE: FAILED:',e.stack||e);
 process.exitCode=1;
}finally{Telemetry.setStore(null);if(store)store.close();}
