'use strict';
/* Fundamental V3 Observability.
   Rich structured JSONL telemetry, safe for Admin/AI diagnostics.
   No Job abstraction: request_id/correlation_id link related events. */
var fs=require('fs'),path=require('path'),crypto=require('crypto');

var SECRET_KEY=/(authorization|api[_-]?key|token|secret|password|cookie|private[_-]?key|bearer|credential)/i;
var SECRET_TEXT=/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/ig;
var MAX_STRING=16000;

function iso(){return new Date().toISOString();}
function id(prefix){try{return prefix+'_'+crypto.randomBytes(8).toString('hex');}catch(e){return prefix+'_'+Date.now().toString(36);}}
function clean(v,key,depth){
 if(depth>6)return '[DEPTH_LIMIT]';
 if(SECRET_KEY.test(String(key||'')))return '[REDACTED]';
 if(v===null||typeof v==='undefined'||typeof v==='number'||typeof v==='boolean')return v;
 if(typeof v==='string')return v.replace(SECRET_TEXT,'$1[REDACTED]').slice(0,MAX_STRING);
 if(Array.isArray(v))return v.slice(0,100).map(function(x){return clean(x,'',depth+1);});
 if(typeof v==='object'){var o={};Object.keys(v).slice(0,160).forEach(function(k){o[k]=clean(v[k],k,depth+1);});return o;}
 return String(v).slice(0,MAX_STRING);
}
function Observability(opts){
 opts=opts||{};this.engine=opts.engine||'fundamental';this.version=opts.version||null;this.file=opts.file;
 this.maxRecent=Math.max(100,Math.min(5000,+opts.maxRecent||1200));this.recent=[];this.sequence=0;this.listeners=[];
 try{fs.mkdirSync(path.dirname(this.file),{recursive:true});}catch(e){}
}
Observability.prototype.emit=function(level,component,event,data){
 var row={timestamp:iso(),sequence:++this.sequence,level:String(level||'INFO').toUpperCase(),engine:this.engine,engine_version:this.version,component:String(component||'ENGINE').toUpperCase(),event:String(event||'event'),instance_id:process.pid+'@'+require('os').hostname(),pid:process.pid,data:clean(data||{},'',0)};
 this.recent.push(row);if(this.recent.length>this.maxRecent)this.recent.shift();
 try{fs.appendFileSync(this.file,JSON.stringify(row)+'\n','utf8');}catch(e){}
 this.listeners.slice().forEach(function(fn){try{fn(row);}catch(e){}});
 return row;
};
Observability.prototype.debug=function(c,e,d){return this.emit('DEBUG',c,e,d);};
Observability.prototype.info=function(c,e,d){return this.emit('INFO',c,e,d);};
Observability.prototype.warn=function(c,e,d){return this.emit('WARN',c,e,d);};
Observability.prototype.error=function(c,e,d){return this.emit('ERROR',c,e,d);};
Observability.prototype.critical=function(c,e,d){return this.emit('CRITICAL',c,e,d);};
Observability.prototype.query=function(q){q=q||{};var level=String(q.level||'').toUpperCase(),component=String(q.component||'').toUpperCase(),source=String(q.source||'').toUpperCase(),text=String(q.query||'').toLowerCase(),limit=Math.max(1,Math.min(500,+q.limit||100));return this.recent.filter(function(r){var s=JSON.stringify(r);if(level&&r.level!==level)return false;if(component&&r.component!==component)return false;if(source&&s.toUpperCase().indexOf(source)<0)return false;if(text&&s.toLowerCase().indexOf(text)<0)return false;return true;}).slice(-limit);};
Observability.prototype.history=function(q){q=q||{};var limit=Math.max(1,Math.min(1000,+q.limit||200)),rows=[];try{var txt=fs.readFileSync(this.file,'utf8'),lines=txt.split(/\r?\n/),start=Math.max(0,lines.length-Math.max(limit*12,3000));for(var i=start;i<lines.length;i++){if(!lines[i])continue;try{rows.push(JSON.parse(lines[i]));}catch(e){}}}catch(e){}var level=String(q.level||'').toUpperCase(),component=String(q.component||'').toUpperCase(),source=String(q.source||'').toUpperCase(),text=String(q.query||'').toLowerCase();return rows.filter(function(r){var x=JSON.stringify(r);if(level&&r.level!==level)return false;if(component&&r.component!==component)return false;if(source&&x.toUpperCase().indexOf(source)<0)return false;if(text&&x.toLowerCase().indexOf(text)<0)return false;return true;}).slice(-limit);};
Observability.prototype.purge=function(){var before=0;try{before=fs.statSync(this.file).size;}catch(e){}try{fs.writeFileSync(this.file,'','utf8');}catch(e){throw e;}this.recent=[];return{ok:true,deletedBytes:before};};
Observability.prototype.subscribe=function(fn){this.listeners.push(fn);var self=this;return function(){self.listeners=self.listeners.filter(function(x){return x!==fn;});};};
Observability.prototype.newCorrelation=function(prefix){return id(prefix||'fund');};
Observability.prototype.stats=function(){var counts={DEBUG:0,INFO:0,WARN:0,ERROR:0,CRITICAL:0};this.recent.forEach(function(r){counts[r.level]=(counts[r.level]||0)+1;});var size=null;try{size=fs.statSync(this.file).size;}catch(e){}return{ok:true,file:this.file,recent:this.recent.length,maxRecent:this.maxRecent,counts:counts,sizeBytes:size};};
Observability.clean=clean;
module.exports=Observability;
