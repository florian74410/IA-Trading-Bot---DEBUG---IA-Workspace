'use strict';
/* IA-TB v1.8.11 — Unified Admin Debug Control Framework v1.
   Active debugging without arbitrary shell. All actions are whitelisted and audited. */
var fs=require('fs'),path=require('path');
function DebugController(root,admin,consoleAudit){this.root=path.resolve(root);this.admin=admin;this.audit=consoleAudit||function(){};this.sessions=Object.create(null);}
DebugController.prototype.targets=function(){var a=['server','client','router'];try{this.admin.services.refresh();a=a.concat(Object.keys(this.admin.services.services));}catch(e){}return a.filter(function(x,i,z){return z.indexOf(x)===i;});};
DebugController.prototype.actions=function(){return[
 {name:'capabilities',mode:'observation',description:'Liste les cibles et actions Debug disponibles'},
 {name:'status',mode:'observation',description:'État runtime détaillé de la cible'},
 {name:'health',mode:'observation',description:'Health-check actif de la cible'},
 {name:'self-test',mode:'observation',description:'Test actif non destructif de disponibilité'},
 {name:'metrics',mode:'observation',description:'Métriques runtime disponibles'},
 {name:'dependencies',mode:'observation',description:'Dépendances déclarées du composant'},
 {name:'dump-state',mode:'observation',description:'Capture contrôlée de l’état du composant'},
 {name:'errors',mode:'observation',description:'Dernières erreurs du journal associé'},
 {name:'logs',mode:'observation',description:'Dernières lignes du journal associé'},
 {name:'trace-status',mode:'observation',description:'État de la session de trace'},
 {name:'start',mode:'command',confirm:true,description:'Démarre un service géré arrêté'},
 {name:'stop',mode:'command',confirm:true,description:'Arrête un service géré autorisé'},
 {name:'restart',mode:'command',confirm:true,description:'Redémarre uniquement le composant ciblé'},
 {name:'trace-on',mode:'command',description:'Active une session de trace Admin ciblée'},
 {name:'trace-off',mode:'command',description:'Désactive la session de trace ciblée'},
 {name:'reset-safe',mode:'command',confirm:true,description:'Redémarrage sûr du composant, sans suppression de données'}
 ];};
DebugController.prototype.spec=function(action){return this.actions().filter(function(x){return x.name===action;})[0]||null;};
DebugController.prototype.logId=function(target){var map={server:'core',router:'router',trading:'trading',indicators:'indicators',marketdata:'marketdata',liquidity:'liquidity',fundamental:'fundamental',firewall:'firewall',risk:'risk'};return map[target]||target;};
DebugController.prototype.probe=function(target,cb){if(target==='server')return this.admin.snapshot(cb);if(target==='client')return cb(null,{target:'client',note:'Client browser: état actif remonté par la console; aucune exécution shell.',serverVersion:this.admin.version});if(target==='router')return this.admin.services.probe('router',cb);this.admin.services.probe(target,cb);};
DebugController.prototype.run=function(action,args,ctx,cb){var self=this;args=args&&typeof args==='object'?args:{};var target=String(args.target||'').toLowerCase();if(action==='capabilities')return cb(null,{framework:'Debug Control Framework v1',syntax:'debug <target> <action> [key=value]',shell:false,targets:this.targets(),actions:this.actions()});if(!target||this.targets().indexOf(target)<0)return cb(new Error('DEBUG_TARGET_INVALID'));
 function audit(ok,extra){self.audit('[DEBUG] target='+target+' action='+action+' status='+(ok?'OK':'ERROR')+(extra?' '+extra:''));}
 if(action==='status'||action==='health'||action==='self-test'||action==='dump-state')return this.probe(target,function(e,o){audit(!e,e&&e.message);cb(e,{target:target,action:action,at:new Date().toISOString(),state:o||null});});
 if(action==='metrics')return this.probe(target,function(e,o){if(e)return cb(e);cb(null,{target:target,system:target==='server'?self.admin.system():null,health:o&&o.health||o||null});});
 if(action==='dependencies'){try{if(target==='server'||target==='client')return cb(null,{target:target,dependencies:[]});var s=self.admin.services.spec(target);return cb(null,{target:target,dependencies:s.dependencies||[],optionalDependencies:s.optionalDependencies||[]});}catch(e){return cb(e);}}
 if(action==='logs'||action==='errors'){try{var x=self.admin.logs.tail(self.logId(target),Math.max(20,Math.min(500,+args.lines||120)));if(action==='errors')x.text=x.text.split(/\r?\n/).filter(function(l){return /error|exception|failed|refus|reject|timeout/i.test(l);}).slice(-100).join('\n');return cb(null,x);}catch(e){return cb(e);}}
 if(action==='trace-status')return cb(null,{target:target,active:!!this.sessions[target],session:this.sessions[target]||null});
 if(action==='trace-on'){this.sessions[target]={startedAt:new Date().toISOString(),level:String(args.level||'debug').slice(0,16)};audit(true,'level='+this.sessions[target].level);return cb(null,{target:target,trace:true,session:this.sessions[target]});}
 if(action==='trace-off'){var old=this.sessions[target]||null;delete this.sessions[target];audit(true);return cb(null,{target:target,trace:false,previous:old});}
 if(target==='server'||target==='client'||target==='router')return cb(new Error('DEBUG_ACTION_NOT_ALLOWED_FOR_TARGET'));
 if(action==='start')return this.admin.services.setProcessEnabled(target,true,function(e,o){audit(!e,e&&e.message);cb(e,o);});
 if(action==='stop')return this.admin.services.stop(target,function(e,o){audit(!e,e&&e.message);cb(e,o);});
 if(action==='restart'||action==='reset-safe')return this.admin.services.restart(target,function(e,o){audit(!e,e&&e.message);cb(e,o);});
 cb(new Error('DEBUG_ACTION_UNSUPPORTED'));
};
module.exports=DebugController;
