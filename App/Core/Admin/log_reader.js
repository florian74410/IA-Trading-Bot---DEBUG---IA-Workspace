'use strict';
var fs=require('fs'),path=require('path'),PATHS=require('../Shared/paths');
function cleanLine(s){return String(s||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');}
function Reader(root){
 this.root=path.resolve(root);
 PATHS.ensureAppRuntimeDirs();
 var self=this,rel=function(p){return path.relative(self.root,p).replace(/\\/g,'/');};
 this.sources={
  core:rel(PATHS.RuntimeLogs.core),
  router:rel(PATHS.RuntimeLogs.router),
  ui:rel(PATHS.RuntimeLogs.ui),
  restart:rel(PATHS.RuntimeLogs.restart),
  kraken:rel(PATHS.RuntimeLogs.kraken),
  indicators:rel(PATHS.RuntimeLogs.indicators),
  marketdata:rel(PATHS.RuntimeLogs.marketdata),
  liquidity:rel(PATHS.RuntimeLogs.liquidity),
  fundamental:rel(PATHS.RuntimeLogs.fundamental),
  fundamental_sqlite:rel(PATHS.RuntimeLogs.fundamentalSqlite),
  trading:rel(PATHS.RuntimeLogs.trading),
  firewall:rel(PATHS.RuntimeLogs.firewall),
  strategy:rel(PATHS.RuntimeLogs.strategy),
  risk:rel(PATHS.RuntimeLogs.risk),
  portfolio:rel(PATHS.RuntimeLogs.portfolio)
 };
}
Reader.prototype.info=function(){var self=this,labels={core:'Core',router:'Router',ui:'UI Service',restart:'Redémarrage global',kraken:'Kraken',indicators:'Indicators',marketdata:'Market Data',liquidity:'Liquidity',fundamental:'Fundamental',fundamental_sqlite:'Fundamental SQLite',trading:'Trading Engine',firewall:'Firewall',strategy:'Strategy Engine',risk:'Risk Manager',portfolio:'Portfolio Engine'};return Object.keys(this.sources).map(function(id){var p=path.join(self.root,self.sources[id]),size=0;try{size=fs.statSync(p).size}catch(e){}return{id:id,label:labels[id]||id,sizeBytes:size};});};
Reader.prototype.resolve=function(id){id=String(id||'').toLowerCase();var rel=this.sources[id];if(!rel)throw new Error('LOG_SOURCE_INVALID');var p=path.resolve(this.root,rel);if(p.indexOf(this.root+path.sep)!==0)throw new Error('LOG_PATH_REJECTED');return{id:id,path:p,rel:rel};};
Reader.prototype.tail=function(id,lines){var x=this.resolve(id),maxLines=Math.max(20,Math.min(500,+lines||120)),buf='';try{var st=fs.statSync(x.path),take=Math.min(st.size,192*1024),fd=fs.openSync(x.path,'r'),b=Buffer.alloc(take);fs.readSync(fd,b,0,take,Math.max(0,st.size-take));fs.closeSync(fd);buf=b.toString('utf8');}catch(e){if(e.code!=='ENOENT')throw e;}var a=buf.split(/\r?\n/);if(a.length>maxLines)a=a.slice(a.length-maxLines);return{source:x.id,path:x.rel,lines:maxLines,text:a.map(cleanLine).join('\n'),sizeBytes:(function(){try{return fs.statSync(x.path).size}catch(e){return 0}})()};};
Reader.prototype.clear=function(id){var x=this.resolve(id);fs.mkdirSync(path.dirname(x.path),{recursive:true});fs.writeFileSync(x.path,'','utf8');return{ok:true,source:x.id,path:x.rel};};
module.exports=Reader;
