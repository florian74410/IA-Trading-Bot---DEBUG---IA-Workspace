'use strict';
var fs=require('fs'),path=require('path'),os=require('os');
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function compact(s){s=s||{};return{schema:s.schema||'iatb.financial.snapshot/1.0',timestamp:+s.timestamp||Date.now(),expiresAt:+s.expiresAt||0,cefi:s.cefi||null,defi:s.defi||null,meta:s.meta||{}};}
function Store(o){o=o||{};this.ttlMs=Math.max(5000,+o.ttlMs||45000);this.persistIntervalMs=Math.max(60000,+o.persistIntervalMs||900000);this.retentionMs=Math.max(3600000,+o.retentionMs||2592000000);this.maxHistory=Math.max(24,+o.maxHistory||1600);this.file=path.resolve(o.file||process.env.IATB_FINANCIAL_STORE||path.join(process.env.IATB_DATA_ROOT||path.join(os.homedir(),'IA-TB-UserData-Server'),'Shared Data','MarketData','financial_snapshots.jsonl'));this.current=null;this.history=[];this.lastPersistAt=0;this.lastError='';this.snapshotGate=o.snapshotGate||null;if(this.snapshotGate&&typeof this.snapshotGate.assertWritable!=='function')throw new Error('SNAPSHOT_GATE_INVALID');if(this.snapshotGate)this.snapshotGate.assertWritable();this._load();}
Store.prototype._load=function(){if(this.snapshotGate)this.snapshotGate.assertWritable();try{if(!fs.existsSync(this.file))return;var txt=fs.readFileSync(this.file,'utf8'),rows=txt.split(/\r?\n/).filter(Boolean),cut=Date.now()-this.retentionMs,out=[];for(var i=Math.max(0,rows.length-this.maxHistory*2);i<rows.length;i++){try{var o=JSON.parse(rows[i]);if((+o.timestamp||0)>=cut)out.push(o);}catch(e){}}if(out.length>this.maxHistory)out=out.slice(-this.maxHistory);this.history=out;if(out.length)this.current=out[out.length-1];}catch(e){this.lastError=e.message;}};
Store.prototype.get=function(){if(!this.current)return null;return clone(this.current);};
Store.prototype.freshness=function(){
 var s=this.current,now=Date.now();if(!s)return{fresh:false,cefi:{fresh:false,ageMs:null,expiresAt:null},defi:{fresh:false,ageMs:null,expiresAt:null}};
 var f=s.meta&&s.meta.freshness||{},out={};
 ['cefi','defi'].forEach(function(k){var x=f[k]||{},observed=+x.observedAt||0,expires=+x.expiresAt||0;out[k]={fresh:!!observed&&(!expires||now<=expires),ageMs:observed?Math.max(0,now-observed):null,expiresAt:expires||null,ttlMs:+x.ttlMs||null,provider:x.provider||null};});
 out.fresh=!!(s.cefi||s.defi)&&(!s.cefi||out.cefi.fresh)&&(!s.defi||out.defi.fresh);return out;
};
Store.prototype.isFresh=function(){var f=this.freshness();return f.fresh;};
Store.prototype.set=function(snapshot){if(this.snapshotGate)this.snapshotGate.assertWritable();this.current=compact(snapshot);if(Date.now()-this.lastPersistAt>=this.persistIntervalMs)this.persist(this.current);return this.get();};
Store.prototype.persist=function(snapshot){if(this.snapshotGate)this.snapshotGate.assertWritable();try{fs.mkdirSync(path.dirname(this.file),{recursive:true});var row=compact(snapshot),line=JSON.stringify(row)+'\n';fs.appendFileSync(this.file,line,'utf8');this.lastPersistAt=Date.now();this.history.push(row);if(this.history.length>this.maxHistory)this.history=this.history.slice(-this.maxHistory);this._prune();this.lastError='';}catch(e){this.lastError=e.message;}};
Store.prototype._prune=function(){if(this.snapshotGate)this.snapshotGate.assertWritable();try{var st=fs.statSync(this.file);if(st.size<16*1024*1024&&this.history.length<this.maxHistory)return;var cut=Date.now()-this.retentionMs,rows=this.history.filter(function(x){return(+x.timestamp||0)>=cut;});if(rows.length>this.maxHistory)rows=rows.slice(-this.maxHistory);var tmp=this.file+'.tmp';fs.writeFileSync(tmp,rows.map(JSON.stringify).join('\n')+(rows.length?'\n':''),'utf8');fs.renameSync(tmp,this.file);this.history=rows;}catch(e){this.lastError=e.message;}};
Store.prototype.list=function(limit,since){limit=Math.max(1,Math.min(this.maxHistory,+limit||96));since=+since||0;var rows=this.history.filter(function(x){return !since||(+x.timestamp||0)>=since;});if(rows.length>limit)rows=rows.slice(rows.length-limit);return clone(rows);};
Store.prototype.purge=function(o){if(this.snapshotGate)this.snapshotGate.assertWritable();
 o=o||{};if(String(o.confirm||'')!=='PURGE')return{ok:false,error:'PURGE_CONFIRMATION_REQUIRED'};
 var mode=String(o.mode||'EXPIRED').toUpperCase(),now=Date.now(),before=+o.before||now-this.retentionMs,removed=0,keep=[];
 if(mode==='ALL_HISTORY'){removed=this.history.length;keep=[];}
 else{keep=this.history.filter(function(x){return(+x.timestamp||0)>=before;});removed=this.history.length-keep.length;}
 try{
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  var tmp=this.file+'.tmp',txt=keep.map(JSON.stringify).join('\n')+(keep.length?'\n':'');fs.writeFileSync(tmp,txt,'utf8');fs.renameSync(tmp,this.file);
  this.history=keep;if(mode==='ALL_HISTORY')this.lastPersistAt=0;this.lastError='';
  return{ok:true,mode:mode,removed:removed,remaining:keep.length,before:mode==='ALL_HISTORY'?null:before,currentKept:!!this.current};
 }catch(e){this.lastError=e.message;return{ok:false,error:e.message,removed:0};}
};
Store.prototype.status=function(){var size=0;try{size=fs.existsSync(this.file)?fs.statSync(this.file).size:0;}catch(e){}return{ok:true,mode:'HYBRID_MEMORY_JSONL',file:this.file,sizeBytes:size,freshness:this.freshness(),ttlMs:this.ttlMs,persistIntervalMs:this.persistIntervalMs,retentionMs:this.retentionMs,maxHistory:this.maxHistory,historyEntries:this.history.length,currentTimestamp:this.current&&this.current.timestamp||null,fresh:this.isFresh(),lastPersistAt:this.lastPersistAt||null,lastError:this.lastError||null};};
module.exports=Store;