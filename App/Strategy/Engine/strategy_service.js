'use strict';
/* IA-TB Strategy Engine v2 — service canonique
   Supervisor-ready, CP/1 only for machine-to-machine control.
   Security invariant: INTENTION_ONLY. No exchange adapter is imported here.
*/
var http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
var Adapter=require('../../Core/Communication/component_cp1_adapter'),PATHS=require('../../Core/Shared/paths'),BUILD=require('../../Core/Shared/build_info');
var Registry=require('./strategy_registry_v2'),Core=require('./strategy_v2_core'),Stats=require('./strategy_stats_v2');
PATHS.ensureAppRuntimeDirs();
var ROOT=PATHS.ROOT,HOST='127.0.0.1',PORT=+(process.env.IATB_STRATEGY_PORT||8018),ROUTER_PORT=+(process.env.ROUTER_PORT||8021),VERSION=BUILD.version,LOG=PATHS.RuntimeLogs.strategy;
var AUTH21_STRATEGY_SNAPSHOT=process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'?require('../../Core/Backup/auth21_engine_snapshot_trial').openEngineSnapshotTrial({env:process.env,engine:'strategy'}).gate:null;
var registry=new Registry(ROOT),stats=new Stats(ROOT,AUTH21_STRATEGY_SNAPSHOT?{snapshotGate:AUTH21_STRATEGY_SNAPSHOT}:{}),state={mode:'RUNNING',startedAt:Date.now(),lastEvaluation:null,lastSignal:null};
function log(tag,msg){try{fs.appendFileSync(LOG,'['+new Date().toISOString()+'] ['+tag+'] '+String(msg||'').replace(/[\r\n]+/g,' ').slice(0,900)+'\n','utf8');}catch(e){}}
function send(res,code,o){var b=Buffer.from(JSON.stringify(o));res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Content-Length':b.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(b);}
function health(){return{ok:true,service:'IA-TB Strategy Engine v2',marker:'IA-TB Strategy Engine v2',version:VERSION,pid:process.pid,port:PORT,mode:state.mode,execution:'INTENTION_ONLY',supervisorReady:true,protocol:'CP/1',strategies:registry.items.length,uptimeSec:Math.round((Date.now()-state.startedAt)/1000),lastEvaluation:state.lastEvaluation,lastSignal:state.lastSignal};}
function publish(type,data){if(adapter)adapter.publish(type,data,{schema:'strategy.event/2.0',severity:'NOTICE'},function(){});}
function evaluate(a,msg){return require('./evaluate_strategy')({registry,stats,state,publish},a,msg);}
var ACTIONS=['strategy.user.request','strategy.health','strategy.capabilities','strategy.catalog','strategy.validate','strategy.evaluate','strategy.dry_run','strategy.stats','strategy.state','strategy.reload','strategy.pause','strategy.resume','strategy.reset_stats'];
var EVENTS=['strategy.signal.generated','strategy.evaluation.completed'];
var OWNER_REQUEST=require('../../Core/Clients/UserManagement/owner_receiver').receiver({root:ROOT,engine:'strategy',dispatch:require('./owner_strategy').dispatch({root:ROOT})});
var adapter=new Adapter({root:ROOT,id:'strategy',label:'Strategy Engine v2',port:PORT,routerPort:ROUTER_PORT,version:VERSION,schema:'strategy.response/2.0',actions:ACTIONS,events:EVENTS,handlers:{
 'strategy.user.request':function(a){return OWNER_REQUEST(a);},
 'strategy.health':function(){return health();},
 'strategy.capabilities':function(){return{ok:true,actions:ACTIONS,events:EVENTS,execution:'INTENTION_ONLY',supervisorReady:true};},
 'strategy.catalog':function(){return{ok:true,catalog:registry.snapshot()};},
 'strategy.validate':function(a){var v=Core.validate(a.strategy||a);return{ok:v.ok,errors:v.errors||[],strategy:v.strategy||null};},
 'strategy.evaluate':function(a,m){return evaluate(a,m);},
 'strategy.dry_run':function(a,m){var r=evaluate(a,m);r.dry_run=true;r.execution='NEVER_EXECUTE';return r;},
 'strategy.stats':function(){return{ok:true,stats:stats.snapshot()};},
 'strategy.state':function(){return{ok:true,health:health(),registry:registry.snapshot(),stats:stats.snapshot()};},
 'strategy.reload':function(){return{ok:true,registry:registry.reload()};},
 'strategy.pause':function(){state.mode='PAUSED';return{ok:true,mode:state.mode};},
 'strategy.resume':function(){state.mode='RUNNING';return{ok:true,mode:state.mode};},
 'strategy.reset_stats':function(){return{ok:true,stats:stats.reset()};}
 }});
var server=require('../../Core/Clients/auth21_engine_ingress').createServer(function(req,res){if(adapter.handle(req,res))return;if(req.method==='GET'&&String(req.url).split('?')[0]==='/health')return send(res,200,health());return send(res,404,{ok:false,error:'NOT_FOUND'});});
server.on('error',function(e){log('FATAL',e.message);process.exit(12);});
server.listen(PORT,HOST,function(){log('START','Strategy Engine v2 port='+PORT+' protocol=CP/1 execution=INTENTION_ONLY');adapter.maintainRegistration({initialDelayMs:500,onResult:function(ok,e,o,state){if(!ok)log('CP_REGISTER',e&&e.message||'failed');else if(state.attempts===1)log('CP_REGISTER','OK');}});});
function stop(){log('STOP','signal received');adapter.stopRegistration();server.close(function(){process.exit(0);});setTimeout(function(){process.exit(0);},1200);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
