'use strict';
// P2.2: no launcher/restart/stop side effects during isolated snapshot trials.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')
 throw Error('AUTH21_OPERATOR_SCRIPT_DISABLED_DURING_SNAPSHOT_TRIAL');
/* IA-TB Global Restart Helper.
   Process Registry is the single source for managed services, ports and startup order.
   Core remains alive; Router is restarted first, then enabled restartable services in manifest order.
*/
var fs=require('fs'),path=require('path'),child=require('child_process'),Registry=require('./service_registry'),PATHS=require('../Shared/paths'),BUILD=require('../Shared/build_info');
var ROOT=PATHS.ROOT;
PATHS.ensureAppRuntimeDirs();
var RESTART_LOG=PATHS.RuntimeLogs.restart,reg=new Registry(ROOT),errors=[];
function now(){return new Date().toISOString();}
function log(s){var line=now()+' '+s;try{fs.appendFileSync(RESTART_LOG,line+'\n','utf8');}catch(e){}console.log(line);}
function safeRoot(rel){var p=path.resolve(ROOT,rel);if(p.indexOf(ROOT+path.sep)!==0)throw new Error('PATH_REJECTED');return p;}
function port(id,fallback){try{return +reg.spec(id).port||fallback;}catch(e){return fallback;}}
function waitRouter(want,deadline,cb){
 if(Date.now()>deadline)return cb(new Error('ROUTER_TIMEOUT'));
 reg.probe('router',function(e,x){
  if(!e&&!!x.online===!!want)return cb(null,x);
  setTimeout(function(){waitRouter(want,deadline,cb);},180);
 });
}
function routerEnvironment(){
 return Object.assign({},process.env,{
  CORE_PUBLIC_PORT:String(port('core',8001)),
  IATB_INDICATOR_PORT:String(port('indicator',8012)),
  IATB_MARKET_DATA_PORT:String(port('marketdata',8013)),
  IATB_LIQUIDITY_PORT:String(port('liquidity',8014)),
  IATB_FUNDAMENTAL_PORT:String(port('fundamental',8015)),
  IATB_TRADING_ENGINE_PORT:String(port('trading',8016)),
  IATB_FIREWALL_PORT:String(port('firewall',8017)),
  IATB_STRATEGY_PORT:String(port('strategy',8018)),
  IATB_RISK_ENGINE_PORT:String(port('risk',8019)),
  IATB_PORTFOLIO_PORT:String(port('portfolio',8020)),
  IATB_SUPERVISOR_PORT:String(port('supervisor',3000)),
  ROUTER_PORT:String(port('router',8021))
 });
}
function spawnRouter(cb){
 var script=safeRoot('Core/Router/router.js'),logPath=PATHS.RuntimeLogs.router;
 if(!fs.existsSync(script))return cb(new Error('ROUTER_SCRIPT_INVALID'));
 var fd;try{fd=fs.openSync(logPath,'a');}catch(e){return cb(e);}
 var proc;try{proc=child.spawn(process.execPath,[script],{cwd:ROOT,env:routerEnvironment(),stdio:['ignore',fd,fd],detached:true});}
 catch(e){try{fs.closeSync(fd);}catch(x){}return cb(e);}
 try{fs.closeSync(fd);}catch(x){}
 proc.unref();
 waitRouter(true,Date.now()+9000,function(e,x){if(e)return cb(e);cb(null,x);});
}
function restartRouter(cb){
 reg.probe('router',function(e,x){
  if(e)return cb(e);
  function launch(){spawnRouter(cb);}
  if(!x.online)return launch();
  if(!x.pid||x.pid===process.pid)return cb(new Error('ROUTER_PID_UNSAFE'));
  try{process.kill(x.pid,'SIGTERM');}catch(k){return cb(k);}
  waitRouter(false,Date.now()+3500,function(downErr){
   if(!downErr)return launch();
   try{process.kill(x.pid,'SIGKILL');}catch(ignore){}
   waitRouter(false,Date.now()+1800,function(){launch();});
  });
 });
}
function managedOrder(){
 return reg.processRegistry.list().filter(function(m){
  return m.id!=='core'&&m.id!=='router'&&m.restartable===true&&m.enabled===true&&m.installed!==false;
 }).map(function(m){return m.id;});
}
function next(list,i,cb){
 if(i>=list.length)return cb();
 var id=list[i];log('Restart '+id+'...');
 reg.restart(id,function(e,x){
  if(e){errors.push(id+': '+e.message);log('ERREUR '+id+' : '+e.message);}
  else log('OK '+id+' PID '+(x&&x.pid||'?'));
  next(list,i+1,cb);
 });
}
log('=== REDÉMARRAGE GLOBAL IA-TB v'+BUILD.version+' ===');
log('Restart router...');
restartRouter(function(e,x){
 if(e){
  errors.push('router: '+e.message);log('ERREUR router : '+e.message);
  log('ARRÊT: aucun service dépendant ne sera redémarré sans Router sain.');
  process.exitCode=2;return setTimeout(function(){process.exit();},100);
 }
 log('OK router PID '+(x&&x.pid||'?'));
 var list=managedOrder();
 log('Ordre Process Registry: '+list.join(' -> '));
 next(list,0,function(){
  if(errors.length){log('FIN AVEC ERREURS : '+errors.join(' | '));process.exitCode=2;}
  else log('FIN OK — Router puis services redémarrés selon Process Registry.');
  setTimeout(function(){process.exit();},100);
 });
});
