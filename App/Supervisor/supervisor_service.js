'use strict';
var http=require('http'),fs=require('fs'),path=require('path');
var Adapter=require('../Core/Communication/component_cp1_adapter'),PATHS=require('../Core/Shared/paths'),SupervisorCore=require('./Core/supervisor_core'),BUILD=require('../Core/Shared/build_info');
PATHS.ensureAppRuntimeDirs();
var ROOT=PATHS.ROOT,HOST='127.0.0.1',PORT=+(process.env.IATB_SUPERVISOR_PORT||3000),ROUTER_PORT=+(process.env.ROUTER_PORT||8021),VERSION=BUILD.version;
var LOG=path.join(ROOT,'.runtime','logs','supervisor.log'),core=new SupervisorCore(ROOT);
var collectorData=new (require('./Core/collector_data_v2_4_1').CollectorData)(core.cp,ROOT);
var ACTIONS=['supervisor.data.catalog','supervisor.data.read','supervisor.user.request','supervisor.health','supervisor.capabilities','supervisor.status','supervisor.calendar','supervisor.calendar.fed','supervisor.calendar.cme','supervisor.calendar.cme.expirations','supervisor.fedwatch','supervisor.reload','supervisor.extensions','supervisor.llm.health','supervisor.context','supervisor.analyze','supervisor.indicators','supervisor.indicator.language','supervisor.indicator.validate','supervisor.indicator.create','supervisor.indicator.definition','supervisor.indicators.compute','supervisor.risk.evaluate','supervisor.reason','supervisor.structured'];
var EVENTS=['supervisor.reasoning.completed','supervisor.extension.loaded'];
function log(tag,msg){try{fs.appendFileSync(LOG,'['+new Date().toISOString()+'] ['+tag+'] '+String(msg||'').replace(/[\r\n]+/g,' ').slice(0,1000)+'\n');}catch(e){}}
function send(res,code,o){var b=Buffer.from(JSON.stringify(o));res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Content-Length':b.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(b);}
function health(){var s=core.status();return{ok:true,service:'IA-TB Supervisor',marker:'IA-TB Supervisor',version:VERSION,pid:process.pid,host:HOST,port:PORT,routerPort:ROUTER_PORT,protocol:'CP/1',role:'ORCHESTRATOR',execution:'INTENTION_ONLY',llm:s.llm,extensions:s.extensions.length,autonomousTrading:s.autonomousTrading,uptimeSec:s.uptimeSec};}
var OWNER_REQUEST=require('../Core/Clients/UserManagement/owner_receiver').receiver({root:ROOT,engine:'supervisor',dispatch:require('./Core/owner_supervisor').dispatch({root:ROOT})});
var adapter=new Adapter({root:ROOT,id:'supervisor',label:'IA Supervisor',port:PORT,routerPort:ROUTER_PORT,version:VERSION,schema:'supervisor.response/1.0',actions:ACTIONS,events:EVENTS,handlers:{
 'supervisor.user.request':function(a){return OWNER_REQUEST(a);},
 'supervisor.health':function(){return health();},
 'supervisor.capabilities':function(){return{ok:true,actions:ACTIONS,events:EVENTS,execution:'INTENTION_ONLY'};},
 'supervisor.status':function(){return core.status();},
 'supervisor.calendar':function(a){return core.calendarUpcoming(a||{});},
 'supervisor.calendar.fed':function(){return core.calendarFed();},
 'supervisor.calendar.cme':function(){return core.calendarCme();},
 'supervisor.calendar.cme.expirations':function(){return core.calendarCmeExpirations();},
 'supervisor.fedwatch':function(){return core.fedwatch();},
 'supervisor.reload':function(){var x=core.reload();log('RELOAD','provider='+x.llm.provider);return x;},
 'supervisor.extensions':function(){return{ok:true,extensions:core.extensions.snapshot()};},
 'supervisor.llm.health':function(a){return core.llm.health(a&&a.provider).then(function(x){return{ok:true,health:x};});},
 'supervisor.indicators':function(){return core.listIndicators();},
 'supervisor.indicator.language':function(){return core.indicatorLanguage();},
 'supervisor.indicator.validate':function(a){return core.validateIndicator(a&&a.source);},
 'supervisor.indicator.create':function(a){return core.createIndicator(a||{});},

 'supervisor.indicator.definition':function(a){return core.indicatorDefinition(a&&a.id);},
 'supervisor.indicators.compute':function(a){return core.computeIndicators(a||{});},
 'supervisor.risk.evaluate':function(a){return core.requestRiskApproval(a&&a.intent);},
 'supervisor.data.catalog':function(){return collectorData.catalog();},
 'supervisor.data.read':function(a){return collectorData.read(a);},
 'supervisor.context':function(a){return core.collectContext(a||{});},
 'supervisor.analyze':function(a){return core.analyze(a||{});},
 'supervisor.reason':function(a){if(!a||!String(a.prompt||'').trim())throw new Error('SUPERVISOR_PROMPT_REQUIRED');return core.reason(a).then(function(x){log('REASON','provider='+x.response.provider+' latency='+x.response.latencyMs+'ms');return x;});},
 'supervisor.structured':function(a){a=a||{};if(!String(a.prompt||'').trim())throw new Error('SUPERVISOR_PROMPT_REQUIRED');if(!a.schema||typeof a.schema!=='object')throw new Error('SUPERVISOR_SCHEMA_REQUIRED');if(String(a.prompt).length>120000||String(a.instructions||'').length>24000)throw new Error('SUPERVISOR_STRUCTURED_INPUT_TOO_LARGE');return core.structured(a).then(function(x){log('STRUCTURED','provider='+x.response.provider+' latency='+x.response.latencyMs+'ms name='+String(a.name||''));return x;});}
}});
var server=require('../Core/Clients/auth21_engine_ingress').createServer(function(req,res){var p=String(req.url||'').split('?')[0];if(adapter.handle(req,res))return;if(req.method==='GET'&&p==='/health')return send(res,200,health());return send(res,404,{ok:false,error:'NOT_FOUND'});});
server.on('error',function(e){log('FATAL',e.message);console.error('Supervisor bind error:',e.message);process.exit(30);});
server.listen(PORT,HOST,function(){log('START','port='+PORT+' protocol=CP/1 execution=INTENTION_ONLY provider='+core.llm.status().provider);adapter.maintainRegistration({initialDelayMs:700,onResult:function(ok,e,o,state){if(!ok)log('CP_REGISTER',String(e&&e.message||'failed')+' try='+state.attempts);else if(state.attempts===1)log('CP_REGISTER','OK');}});});
function stop(){log('STOP','signal received');adapter.stopRegistration();server.close(function(){process.exit(0);});setTimeout(function(){process.exit(0);},1500);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
