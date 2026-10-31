'use strict';
/* IA-TB Admin Console v1.0
   Controlled administrative command surface.
   - CP/1 Engine commands are still routed by Communication Router.
   - Server commands are explicit, whitelisted actions; never a shell.
   - Read-only/command classification is enforced server-side.
*/
var fs=require('fs'),path=require('path'),DebugController=require('./debug_controller'),PATHS=require('../Shared/paths');
function plain(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}
function Console(root,admin){this.root=path.resolve(root);this.admin=admin;this.auditFile=PATHS.RuntimeLogs.core;var self=this;this.debug=new DebugController(root,admin,function(x){self.audit(x);});}
Console.prototype.serverCommands=function(){return[
 {name:'server.status',mode:'observation',description:'État synthétique du serveur IA-TB',arguments:{allowed:[]}},
 {name:'server.services',mode:'observation',description:'Liste et état des services gérés',arguments:{allowed:[]}},
 {name:'server.ports',mode:'observation',description:'Ports, services et PID',arguments:{allowed:['port']}},
 {name:'server.memory',mode:'observation',description:'Mémoire système et mémoire du Core',arguments:{allowed:[]}},
 {name:'server.cpu',mode:'observation',description:'CPU et charge système',arguments:{allowed:[]}},
 {name:'server.uptime',mode:'observation',description:'Uptime Core et système',arguments:{allowed:[]}},
 {name:'server.logs',mode:'observation',description:'Catalogue des journaux disponibles',arguments:{allowed:[]}},
 {name:'server.service.restart',mode:'command',confirm:true,description:'Redémarre un service autorisé',arguments:{allowed:['service'],required:['service']}},
 {name:'server.service.stop',mode:'command',confirm:true,description:'Arrête un service autorisé sans shell',arguments:{allowed:['service'],required:['service']}}
];};
Console.prototype.serverTarget=function(){return{id:'server',label:'Server / Core Admin',type:'ADMIN',transport:'CONTROLLED',commands:this.serverCommands()};};

Console.prototype.debugTarget=function(){var self=this;return{id:'debug',label:'Debug Control Framework',type:'ADMIN_DEBUG',transport:'CONTROLLED',commands:this.debug.actions().map(function(x){return{name:'debug.'+x.name,mode:x.mode,confirm:!!x.confirm,description:x.description,arguments:{allowed:['target','lines','level'],required:x.name==='capabilities'?[]:['target']}};})};};
Console.prototype.routerTarget=function(){return{id:'router',label:'Communication Router',type:'CORE',transport:'CP1/INTERNAL',commands:[
 {name:'router.health',mode:'observation',description:'Santé des objets enregistrés',arguments:{allowed:[]}},
 {name:'router.registry.list',mode:'observation',description:'Protocol Registry v2 complet',arguments:{allowed:[]}},
 {name:'router.capabilities',mode:'observation',description:'Capacités disponibles',arguments:{allowed:[]}},
 {name:'router.events',mode:'observation',description:'Événements CP/1 récents',arguments:{allowed:['limit','source','since']}}
]};};
Console.prototype.modeForAction=function(action){action=String(action||'');if(action.indexOf('debug.')===0){var d=this.debug.spec(action.slice(6));return d?d.mode:'forbidden';}if(action.indexOf('server.')===0){var c=this.serverCommands().filter(function(x){return x.name===action;})[0];return c?c.mode:'forbidden';}
 if(action.indexOf('router.')===0)return'observation';
 var write=/(?:\.execute$|\.cancel$|\.close_position$|\.event\.record$|\.sync$|\.set$|\.start$|\.stop$|\.restart$|\.reload$|\.clear$|\.toggle$|\.save$|\.create$|\.delete$|\.import$)/i;
 return write.test(action)?'command':'observation';};
Console.prototype.requiresConfirmation=function(action){action=String(action||'');if(action.indexOf('debug.')===0){var d=this.debug.spec(action.slice(6));return !!(d&&d.confirm);}if(action.indexOf('server.')===0){var c=this.serverCommands().filter(function(x){return x.name===action;})[0];return !!(c&&c.confirm);}return this.modeForAction(action)==='command';};
Console.prototype.validateArgs=function(spec,args){args=plain(args)?args:{};spec=spec||{};var allowed=Array.isArray(spec.allowed)?spec.allowed:[],required=Array.isArray(spec.required)?spec.required:[],allow={};allowed.forEach(function(k){allow[k]=1;});var ks=Object.keys(args);for(var i=0;i<ks.length;i++)if(!allow[ks[i]])throw new Error('ADMIN_CONSOLE_ARGUMENT_FORBIDDEN:'+ks[i]);for(i=0;i<required.length;i++)if(args[required[i]]==null||args[required[i]]==='')throw new Error('ADMIN_CONSOLE_ARGUMENT_REQUIRED:'+required[i]);return args;};
Console.prototype.audit=function(entry){try{var line='['+new Date().toISOString()+'] [ADMIN_CONSOLE] '+String(entry||'').replace(/[\r\n]+/g,' ').slice(0,900)+'\n';fs.appendFileSync(this.auditFile,line,'utf8');}catch(e){}};
Console.prototype.executeServer=function(action,args,cb){var self=this,cmd=this.serverCommands().filter(function(x){return x.name===action;})[0];if(!cmd)return cb(new Error('ADMIN_CONSOLE_COMMAND_FORBIDDEN'));try{args=this.validateArgs(cmd.arguments,args);}catch(e){return cb(e);}var sys=this.admin.system();
 if(action==='server.status')return this.admin.snapshot(function(e,o){if(e)return cb(e);cb(null,{version:o.version,system:o.system,processRegistry:o.processRegistry,services:(o.services||[]).map(function(s){return{id:s.id,label:s.label,online:s.online,port:s.port,pid:s.pid,enabled:s.enabled};})});});
 if(action==='server.services')return this.admin.services.status(function(e,a){if(e)return cb(e);cb(null,{services:a});});
 if(action==='server.ports')return this.admin.services.status(function(e,a){if(e)return cb(e);var p=+args.port||0,rows=(a||[]).map(function(s){return{service:s.id,label:s.label,port:s.port,pid:s.pid,online:s.online,enabled:s.enabled};});if(p)rows=rows.filter(function(x){return+x.port===p;});cb(null,{port:p||null,services:rows});});
 if(action==='server.memory')return cb(null,{totalMemoryMB:sys.totalMemoryMB,freeMemoryMB:sys.freeMemoryMB,coreRssMB:sys.coreRssMB,coreHeapMB:sys.coreHeapMB});
 if(action==='server.cpu')return cb(null,{cpuCount:sys.cpuCount,loadAvg:sys.loadAvg,platform:sys.platform,arch:sys.arch});
 if(action==='server.uptime')return cb(null,{coreUptimeSec:sys.coreUptimeSec,systemUptimeSec:sys.systemUptimeSec});
 if(action==='server.logs')return cb(null,{logs:this.admin.logs.info()});
 if(action==='server.service.restart')return this.admin.services.restart(String(args.service||'').toLowerCase(),function(e,o){if(e)return cb(e);cb(null,{service:o,action:'restart'});});
 if(action==='server.service.stop')return this.admin.services.stop(String(args.service||'').toLowerCase(),function(e,o){if(e)return cb(e);cb(null,{service:o,action:'stop'});});
 cb(new Error('ADMIN_CONSOLE_COMMAND_FORBIDDEN'));
};
module.exports=Console;

Console.prototype.executeDebug=function(action,args,ctx,cb){if(action.indexOf('debug.')!==0)return cb(new Error('DEBUG_COMMAND_INVALID'));return this.debug.run(action.slice(6),args,ctx,cb);};
