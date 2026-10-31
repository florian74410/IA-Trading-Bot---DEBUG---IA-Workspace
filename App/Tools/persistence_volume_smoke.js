'use strict';
// Auth21 P2.2: independent maintenance tools must not bypass a held global snapshot.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')throw Error('AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT');

// Persistent volume smoke, scoped to a dedicated disposable diagnostic directory.
// Does not open or modify any existing IA-TB engine database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const Better=require('better-sqlite3');
const Settings=require('../Core/Settings/sqlite_settings_store');
const Portfolio=require('../Portfolio/Engine/portfolio_store');
const Telemetry=require('../MarketData/Storage/api_telemetry_store');
const mode=process.argv[2]||'';
const root=path.resolve(process.env.IATB_DATA_ROOT||'/tmp','_iatb_persistence_probe_v1');
const expected=path.resolve(process.env.IATB_DATA_ROOT||'/tmp');
const files={settings:path.join(root,'settings.db'),portfolio:path.join(root,'portfolio.db'),telemetry:path.join(root,'telemetry.db')};
let settings,portfolio,telemetry;
function close(){try{if(settings&&settings.native)settings.native.close();}catch(e){}try{portfolio?.close();}catch(e){}try{telemetry?.close();}catch(e){}}
try{
 assert(['write','verify','cleanup'].includes(mode),'MODE_INVALID');
 assert.equal(expected,'/iatb/debug/data','EXPECTED_DEBUG_DATA_ROOT');
 assert.equal(root,'/iatb/debug/data/_iatb_persistence_probe_v1');
 if(mode==='cleanup'){
   close();
   // Only delete known probe files, never recursive-delete unknown content.
   for(const f of Object.values(files)){
     for(const suffix of ['', '-wal','-shm'])try{fs.unlinkSync(f+suffix);}catch(e){if(e.code!=='ENOENT')throw e;}
   }
   try{fs.rmdirSync(root);}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTEMPTY')throw e;}
   console.log('PERSISTENCE PROBE CLEANUP: OK');
 } else {
   if(mode==='write')fs.mkdirSync(root,{recursive:true});
   else for(const f of Object.values(files))assert(fs.existsSync(f),'PROBE_MISSING '+f);
   settings=new Settings(path.resolve(__dirname,'..'),{dbPath:files.settings,username:'probe'});
   portfolio=new Portfolio(path.resolve(__dirname,'..'),{dbPath:files.portfolio,username:'probe'});
   telemetry=new Telemetry({file:files.telemetry});
   assert(settings.status().ready,'SETTINGS_DB_NOT_READY');
   assert(portfolio.status().ready,'PORTFOLIO_DB_NOT_READY');
   assert(telemetry.status().ok,'TELEMETRY_DB_NOT_READY');
   if(mode==='write'){
     settings.set('persistence_probe','marker',{value:'IA-TB-V1',sequence:17});
     portfolio.setSetting('persistence_probe_marker',{value:'IA-TB-V1',sequence:17});
     assert(telemetry.save({requestId:'PERSISTENCE-PROBE-V1',timestamp:Date.now(),provider:'OFFLINE_PROBE',dataset:'STORAGE_TEST',phase:'HTTP_END',ok:true}), 'TELEMETRY_WRITE_FAILED');
     console.log('PERSISTENCE WRITE: OK');
   }else{
     assert.deepEqual(settings.get('persistence_probe','marker',null),{value:'IA-TB-V1',sequence:17});
     assert.deepEqual(portfolio.getSetting('persistence_probe_marker',null),{value:'IA-TB-V1',sequence:17});
     assert(telemetry.status().events>=1,'TELEMETRY_NOT_PERSISTED');
     console.log('PERSISTENCE VERIFY AFTER CONTAINER RECREATE: OK');
     for(const [label,f] of Object.entries(files)){
       const db=new Better(f,{readonly:true,fileMustExist:true});
       assert.equal(db.pragma('integrity_check',{simple:true}),'ok',label+' INTEGRITY_FAILED');
       db.close();
       console.log('SQLITE INTEGRITY '+label+': OK');
     }
   }
 }
}catch(e){console.error('PERSISTENCE PROBE FAILED:',e.stack||e);process.exitCode=1;}finally{close();}
