'use strict';
var fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
// Auth 2.1 offline preflight ONLY. Legacy imports still initialize by default.
// This flag is intentionally not an activation path for the running server.
var PREFLIGHT_READONLY=(process.env.IATB_PATHS_PREFLIGHT_READONLY==='1');
function checkFrozenSnapshotStartup(){
 if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL!=='1'||
    process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL!=='1')return false;
 const configured=process.env.IATB_AUTH21_LOCAL_TRIAL_ROOT;
 if(!configured||!path.isAbsolute(configured))throw Error('AUTH21_STARTUP_TRIAL_ROOT_INVALID');
 const root=path.resolve(configured),temp=fs.realpathSync(os.tmpdir());
 if(!root.startsWith(temp+path.sep)||
    !path.basename(root).startsWith('iatb-auth21-core-runtime-')||
    fs.realpathSync(root)!==root)throw Error('AUTH21_STARTUP_TRIAL_ROOT_INVALID');
 const dir=path.join(root,'runtime');
 if(!fs.existsSync(dir))return false;
 const names=fs.readdirSync(dir).filter(n=>/^auth21-snapshot-[a-z0-9._-]+\.json$/i.test(n));
 for(const name of names){
  const file=path.join(dir,name),st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)
   throw Error('AUTH21_STARTUP_SNAPSHOT_JOURNAL_UNSAFE');
  let state;
  try{state=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(_){throw Error('AUTH21_STARTUP_SNAPSHOT_JOURNAL_INVALID');}
  const id=name.slice('auth21-snapshot-'.length,-'.json'.length);
  if(!state||state.writerId!==id||!Number.isSafeInteger(state.lastEpoch)||
     state.lastEpoch<0||!(state.heldEpoch===null||
       (Number.isSafeInteger(state.heldEpoch)&&state.heldEpoch===state.lastEpoch)))
   throw Error('AUTH21_STARTUP_SNAPSHOT_JOURNAL_INVALID');
  if(state.heldEpoch!==null)return true;
 }
 return false;
}
var SNAPSHOT_FROZEN_STARTUP=checkFrozenSnapshotStartup();
function assertStartupWritable(){
 if(PREFLIGHT_READONLY)throw Error('IATB_PATHS_PREFLIGHT_READONLY');
 if(SNAPSHOT_FROZEN_STARTUP)throw Error('AUTH21_FROZEN_STARTUP_READ_ONLY');
}

var ROOT=path.resolve(__dirname,'../..');
var NODE_RUNTIME=path.join(ROOT,'NodeRuntime');
var APP_RUNTIME=path.resolve(process.env.IATB_RUNTIME_ROOT||path.join(ROOT,'.runtime'));
var APP_RUNTIME_DIRS={
  root:APP_RUNTIME,
  logs:path.join(APP_RUNTIME,'logs'),
  state:path.join(APP_RUNTIME,'state'),
  database:path.join(APP_RUNTIME,'database'),
  cache:path.join(APP_RUNTIME,'cache'),
  config:path.join(APP_RUNTIME,'config'),
  pids:path.join(APP_RUNTIME,'pids'),
  updates:path.join(APP_RUNTIME,'updates')
};
var RUNTIME_LOG_FILES={
  core:path.join(APP_RUNTIME_DIRS.logs,'core.log'),router:path.join(APP_RUNTIME_DIRS.logs,'router.log'),ui:path.join(APP_RUNTIME_DIRS.logs,'ui.log'),restart:path.join(APP_RUNTIME_DIRS.logs,'restart_all.log'),kraken:path.join(APP_RUNTIME_DIRS.logs,'kraken.log'),indicators:path.join(APP_RUNTIME_DIRS.logs,'indicators.log'),marketdata:path.join(APP_RUNTIME_DIRS.logs,'market_data.log'),liquidity:path.join(APP_RUNTIME_DIRS.logs,'liquidity.log'),fundamental:path.join(APP_RUNTIME_DIRS.logs,'fundamental.log'),fundamentalSqlite:path.join(APP_RUNTIME_DIRS.logs,'fundamental_sqlite_install.log'),trading:path.join(APP_RUNTIME_DIRS.logs,'trading.log'),firewall:path.join(APP_RUNTIME_DIRS.logs,'firewall.log'),strategy:path.join(APP_RUNTIME_DIRS.logs,'strategy.log'),risk:path.join(APP_RUNTIME_DIRS.logs,'risk.log'),portfolio:path.join(APP_RUNTIME_DIRS.logs,'portfolio.log')
};
var RUNTIME_STATE_FILES={strategyStats:path.join(APP_RUNTIME_DIRS.state,'strategy','strategy_stats.json')};
var RUNTIME_LAUNCHER_DIR=path.join(APP_RUNTIME_DIRS.state,'launcher');
var RUNTIME_LAUNCHER_FILES={pending:path.join(RUNTIME_LAUNCHER_DIR,'pending_activation.dat'),state:path.join(RUNTIME_LAUNCHER_DIR,'launcher_state.dat'),control:path.join(RUNTIME_LAUNCHER_DIR,'launcher_control.dat')};
var RUNTIME_UPDATE_DIRS={root:APP_RUNTIME_DIRS.updates,inbox:path.join(APP_RUNTIME_DIRS.updates,'Inbox'),staging:path.join(APP_RUNTIME_DIRS.updates,'Staging'),backups:path.join(APP_RUNTIME_DIRS.updates,'Backups')};
var RUNTIME_SECURITY_DIR=path.join(APP_RUNTIME_DIRS.state,'security');
var RUNTIME_SECRET_FILES={internalServiceKey:path.join(RUNTIME_SECURITY_DIR,'internal_service_key.dat'),communicationProtocolKey:path.join(RUNTIME_SECURITY_DIR,'communication_protocol_key.dat')};
var DEFAULT_CONFIG={appSettings:path.join(ROOT,'Config','Defaults','app_settings.json')};

var PERSISTENT_ROOT=path.resolve(process.env.IATB_DATA_ROOT||path.join(os.homedir(),'IA-TB-UserData-Server'));
var LEGACY_STATE_ROOT=path.resolve(process.env.IATB_STATE_ROOT||ROOT);
var MUTABLE_ANNEX_ROOT=path.resolve(process.env.IATB_ANNEX_ROOT||path.join(ROOT,'Annexes'));
var MUTABLE_UPDATES_ROOT=path.resolve(process.env.IATB_UPDATES_ROOT||path.join(ROOT,'Updates'));
var SHARED_DATA=path.join(PERSISTENT_ROOT,'Shared Data'),FUNDAMENTAL_DATA=path.join(SHARED_DATA,'Fundamental'),CLIENT_DATABASE_DIR=path.join(PERSISTENT_ROOT,'Database'),CLIENT_SECURITY_DIR=path.join(PERSISTENT_ROOT,'Security');
var PERSISTENT_DATA={root:PERSISTENT_ROOT,shared:SHARED_DATA,fundamental:FUNDAMENTAL_DATA,fundamentalDb:path.join(FUNDAMENTAL_DATA,'fundamental.db'),clientDatabaseDir:CLIENT_DATABASE_DIR,clientDb:path.join(CLIENT_DATABASE_DIR,'clients.sqlite'),clientSecurityDir:CLIENT_SECURITY_DIR,clientMasterKey:path.join(CLIENT_SECURITY_DIR,'client_master.key'),walletMasterKey:path.join(CLIENT_SECURITY_DIR,'wallet_master.key')};
function ensureAppRuntimeDirs(){
  assertStartupWritable();
  Object.keys(APP_RUNTIME_DIRS).forEach(function(k){try{fs.mkdirSync(APP_RUNTIME_DIRS[k],{recursive:true});}catch(e){}});
  try{fs.mkdirSync(RUNTIME_LAUNCHER_DIR,{recursive:true});}catch(e){}
  try{fs.mkdirSync(RUNTIME_SECURITY_DIR,{recursive:true});}catch(e){}
  Object.keys(RUNTIME_UPDATE_DIRS).forEach(function(k){try{fs.mkdirSync(RUNTIME_UPDATE_DIRS[k],{recursive:true});}catch(e){}});
  return APP_RUNTIME_DIRS;
}
function copyTree(src,dst){
  fs.readdirSync(src).forEach(function(name){var a=path.join(src,name),b=path.join(dst,name),st=fs.lstatSync(a);if(st.isDirectory()){if(!fs.existsSync(b))fs.mkdirSync(b,{recursive:true});copyTree(a,b);try{fs.rmdirSync(a);}catch(e){}}else if(!fs.existsSync(b)){try{fs.renameSync(a,b);}catch(e){fs.copyFileSync(a,b);fs.unlinkSync(a);}}});
}
function ensureUpdateRuntimeDirs(){
  assertStartupWritable();
  fs.mkdirSync(RUNTIME_UPDATE_DIRS.root,{recursive:true});
  fs.mkdirSync(RUNTIME_UPDATE_DIRS.inbox,{recursive:true});
  fs.mkdirSync(RUNTIME_UPDATE_DIRS.staging,{recursive:true});
  fs.mkdirSync(RUNTIME_UPDATE_DIRS.backups,{recursive:true});
}
function validSecretFile(file){try{return /^[a-f0-9]{64}$/i.test(String(fs.readFileSync(file,'utf8')||'').trim());}catch(e){return false;}}
function ensureRuntimeSecret(target,legacy,errorCode,compatibilityLink){
  assertStartupWritable();
  ensureAppRuntimeDirs();
  if(!validSecretFile(target)&&legacy&&validSecretFile(legacy)){try{fs.renameSync(legacy,target);}catch(e){try{fs.copyFileSync(legacy,target);fs.unlinkSync(legacy);}catch(x){}}}
  if(!validSecretFile(target)){
    // Publish only complete bytes. Concurrent Engines must never see the empty
    // file created by open(O_EXCL) before its writer has finished write().
    // link() is atomic and does not replace an existing key or another winner.
    var temporary=target+'.'+crypto.randomBytes(12).toString('hex')+'.tmp';
    try{
      fs.writeFileSync(temporary,crypto.randomBytes(32).toString('hex'),{encoding:'utf8',mode:384,flag:'wx'});
      var keyFd=fs.openSync(temporary,'r');try{fs.fsyncSync(keyFd);}finally{fs.closeSync(keyFd);}
      try{fs.linkSync(temporary,target);}catch(e){if(e.code!=='EEXIST')throw e;}
      var dirFd=fs.openSync(path.dirname(target),'r');try{fs.fsyncSync(dirFd);}finally{fs.closeSync(dirFd);}
    }finally{try{fs.unlinkSync(temporary);}catch(e){}}
    if(!validSecretFile(target))throw new Error(errorCode);
  }
  try{fs.chmodSync(target,384);}catch(e){}
  if(legacy&&compatibilityLink){try{if(fs.existsSync(legacy)||fs.lstatSync(legacy).isSymbolicLink())fs.unlinkSync(legacy);}catch(e){}try{fs.mkdirSync(path.dirname(legacy),{recursive:true});fs.symlinkSync(path.relative(path.dirname(legacy),target),legacy);}catch(e){}}
  return target;
}
function ensureInternalServiceRuntimeKey(){return ensureRuntimeSecret(RUNTIME_SECRET_FILES.internalServiceKey,null,'INTERNAL_SERVICE_KEY_UNAVAILABLE',false);}
function ensureCommunicationProtocolRuntimeKey(){return ensureRuntimeSecret(RUNTIME_SECRET_FILES.communicationProtocolKey,null,'CP_SECRET_UNAVAILABLE',false);}
if(!PREFLIGHT_READONLY&&!SNAPSHOT_FROZEN_STARTUP){ensureAppRuntimeDirs();ensureUpdateRuntimeDirs();ensureInternalServiceRuntimeKey();ensureCommunicationProtocolRuntimeKey();}
module.exports={
  preflightReadOnly:PREFLIGHT_READONLY,
  ROOT:ROOT,NodeRuntime:NODE_RUNTIME,AppRuntime:APP_RUNTIME_DIRS,RuntimeLogs:RUNTIME_LOG_FILES,RuntimeState:RUNTIME_STATE_FILES,RuntimeLauncher:RUNTIME_LAUNCHER_FILES,RuntimeUpdates:RUNTIME_UPDATE_DIRS,RuntimeSecrets:RUNTIME_SECRET_FILES,Defaults:DEFAULT_CONFIG,PersistentData:PERSISTENT_DATA,ensureAppRuntimeDirs:ensureAppRuntimeDirs,ensureUpdateRuntimeDirs:ensureUpdateRuntimeDirs,ensureInternalServiceRuntimeKey:ensureInternalServiceRuntimeKey,ensureCommunicationProtocolRuntimeKey:ensureCommunicationProtocolRuntimeKey,
  Frontend:{app:path.join(ROOT,'Frontend','Pages','app_v1.0.html'),chartViewer:path.join(ROOT,'Frontend','Pages','chart_viewer_v1.0.html'),portfolio:path.join(ROOT,'Frontend','Pages','portfolio_v1.0.html'),bank:path.join(ROOT,'Frontend','Pages','bank_v1.0.html'),adminVaults:path.join(ROOT,'Frontend','Pages','admin_vaults_v1.0.html'),fundamental:path.join(ROOT,'Frontend','Pages','fundamental_v3.html'),admin:path.join(ROOT,'Frontend','Pages','admin_v1.0.html'),assets:{chart:path.join(ROOT,'Frontend','JS','chart_controller_native_v1.2.js'),mosaic:path.join(ROOT,'Frontend','JS','mosaic_controller_v2.9.js'),customMosaic:path.join(ROOT,'Frontend','JS','custom_mosaic_v1.0.js'),updateUI:path.join(ROOT,'Frontend','JS','update_ui_v1.0.js'),mosaicCSS:path.join(ROOT,'Frontend','CSS','mosaic_v2.9.css'),aiProtocol:path.join(ROOT,'Frontend','Protocols','ai_command_protocol_v1.0.json'),adminJS:path.join(ROOT,'Frontend','JS','admin_controller_v1.0.js'),adminCSS:path.join(ROOT,'Frontend','CSS','admin_v1.0.css'),portfolioJS:path.join(ROOT,'Frontend','JS','portfolio_controller_v1.0.js'),portfolioCSS:path.join(ROOT,'Frontend','CSS','portfolio_v1.0.css'),fundamentalJS:path.join(ROOT,'Frontend','JS','fundamental_controller_v3.js'),fundamentalCSS:path.join(ROOT,'Frontend','CSS','fundamental_v3.css')}},
  Data:{config:path.join(LEGACY_STATE_ROOT,'config_v1.0.dat'),logs:RUNTIME_LOG_FILES.core,user:path.join(LEGACY_STATE_ROOT,'user.dat'),vault:path.join(LEGACY_STATE_ROOT,'secrets_v2.dat'),aiSettings:path.join(LEGACY_STATE_ROOT,'ai_settings_v2.dat')},Annexes:MUTABLE_ANNEX_ROOT,Strategies:path.join(MUTABLE_ANNEX_ROOT,'Strategies'),Updates:MUTABLE_UPDATES_ROOT,ReleasePointer:path.join(MUTABLE_UPDATES_ROOT,'current_release.dat'),LauncherControl:RUNTIME_LAUNCHER_FILES.control,Kraken:path.join(ROOT,'AddOns','Kraken')
};
