'use strict';
/* Auth 2.1 Core boundary: explicit isolated handler only, default deny legacy.
 * No imports from server.js, legacy session(), Wallet or CP/1.
 * Deliberately not activated without independent runtime proof.
 */
const {createAuth21HttpHandler}=require('./auth21_http_boundary');
function deny(res,status,error){
 if(res.writableEnded)return;
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify({error}));
}
function createIsolatedCoreGate({sessions,browserSessions=null,allowedBrowserOrigin=null,ipcCodec=null,coreBusiness=null,tradingAdminBridge=null}={}){
 const auth=createAuth21HttpHandler({sessions,browserSessions,allowedBrowserOrigin,ipcCodec});
 return async function isolatedCoreGate(req,res){
  let pathname;
  try{pathname=new URL(req.url,'http://localhost').pathname}
  catch(_){deny(res,404,'NOT_FOUND');return}
  if(pathname==='/auth21/admin/trading/command'&&tradingAdminBridge)return tradingAdminBridge(req,res);
  if(require('./auth21_business_actions').contract(pathname)&&coreBusiness)
   return coreBusiness(req,res);
  // Auth boundary rechecks path, query string, method and bearer itself.
  if(['/auth21/login','/auth21/me','/auth21/state','/auth21/lock','/auth21/csrf','/auth21/logout','/auth21/preferences','/auth21/activity','/auth21/unlock','/auth21/ipc/probe-proof'].includes(pathname)){
   await auth(req,res);return;
  }
  // No legacy cookie, localBypass, active_client_id, recovery, setup, admin,
  // trading, Wallet, CP/1, static pages or server diagnostics in this mode.
  deny(res,404,'NOT_FOUND');
 };
}
/** Attach native SQLite sessions to the Core-local DEBUG sandbox only.
 * Never auto-migrate or generate an encryption key. All other routes denied.
 */
function openCoreAuthTrial({root,clientCrypto,snapshotGate,env,browserSessions=null,allowedBrowserOrigin=null}={}){
 const fs=require('node:fs'),path=require('node:path');
 const allowed=require('../Backup/auth21_core_local_trial_wiring').preflightEnv(env||process.env);
 if(root!==allowed.root)throw Error('AUTH21_CORE_TRIAL_ROOT_MISMATCH');
 if(typeof root!=='string'||!clientCrypto||!snapshotGate)throw Error('AUTH21_CORE_TRIAL_REQUIRED');
 const dbFile=path.join(root,'userdata','Database','clients.sqlite');
 const keyFile=path.join(root,'userdata','Security','client_master.key');
 for(const file of [dbFile,keyFile]){
  const real=fs.realpathSync(file),stat=fs.lstatSync(file);
  if(real!==file||!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
   throw Error('AUTH21_CORE_TRIAL_FILE_UNSAFE');
 }
 if(clientCrypto.keyFile!==keyFile)throw Error('AUTH21_CORE_TRIAL_KEY_MISMATCH');
 const Database=require('better-sqlite3');
 const {Auth21SessionStore}=require('./auth21_session_store');
 const db=new Database(dbFile,{fileMustExist:true});
 try{
  db.pragma('foreign_keys=ON');
  if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)
   throw Error('AUTH21_CORE_TRIAL_DB_INTEGRITY');
  const sessions=new Auth21SessionStore({db,clientCrypto,snapshotGate,idleLockSeconds:300});
  const runtimeEnv=env||process.env;
  // Browser cookie mode must use a directly TLS-encrypted Core connection.
  // Never trust forwarded-proto or a browser-provided header as TLS evidence.
  if(runtimeEnv.IATB_AUTH21_BROWSER_TRIAL==='1'){
   if(browserSessions||allowedBrowserOrigin)
    throw Error('AUTH21_BROWSER_CONFIG_CONFLICT');
   if(runtimeEnv.IATB_AUTH21_BROWSER_ORIGIN!==undefined &&
      !/^https:\/\/[^/@]+$/.test(runtimeEnv.IATB_AUTH21_BROWSER_ORIGIN))
    throw Error('AUTH21_BROWSER_ORIGIN_INVALID');
   const origin=runtimeEnv.IATB_AUTH21_BROWSER_ORIGIN;
   if(!origin)throw Error('AUTH21_BROWSER_ORIGIN_REQUIRED');
   const key=require('./auth21_ipc_keyfile').loadTrialSecret({env:runtimeEnv,root});
   browserSessions=require('./auth21_browser_cookie').createBrowserSession({
    secret:key,origin});
   allowedBrowserOrigin=origin;
  }
  const ipcCodec=runtimeEnv.IATB_AUTH21_IPC_PROBE_TRIAL==='1'?
   require('./auth21_ipc_proof').proofCodec({secret:require('./auth21_ipc_keyfile').loadTrialSecret({env:runtimeEnv,root})}):null;
  // Core-internal capability issuer uses this real SQLite-backed session store.
  // It is never exposed through the HTTP handler or sent to the browser.
  const businessIssuer=ipcCodec?require('./auth21_core_business_issuer').createCoreBusinessIssuer({sessions,codec:ipcCodec,env:runtimeEnv}):null;
  const coreBusiness=businessIssuer&&runtimeEnv.IATB_AUTH21_BUSINESS_TRIAL==='1'?
   require('./auth21_core_business_http').createCoreBusinessHttp({sessions,codec:ipcCodec,
    routerPort:Number(runtimeEnv.ROUTER_PORT),env:runtimeEnv,browserSessions}):null;
  const tradingAdminBridge=runtimeEnv.IATB_AUTH21_TRADING_ADMIN_BRIDGE==='1'?
   require('./auth21_trading_admin_bridge').createTradingAdminBridge({sessions,env:runtimeEnv,browserSessions,port:Number(runtimeEnv.IATB_FIREWALL_PORT||8017)}):null;
  return {handler:createIsolatedCoreGate({sessions,browserSessions,allowedBrowserOrigin,ipcCodec,coreBusiness,tradingAdminBridge}),businessIssuer,close(){db.close()}};
 }catch(error){db.close();throw error}
}
module.exports={createIsolatedCoreGate,openCoreAuthTrial};
