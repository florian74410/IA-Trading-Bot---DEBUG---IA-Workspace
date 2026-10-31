'use strict';
var fs=require('fs'),path=require('path');
function ExtensionManager(root){this.root=root;this.dir=path.join(root,'Supervisor','Extensions');this.items={};this.reload();}
ExtensionManager.prototype.reload=function(){var out={},self=this,names=[];try{names=fs.readdirSync(this.dir);}catch(e){}names.forEach(function(n){var d=path.join(self.dir,n),m=path.join(d,'manifest.json');try{if(!fs.statSync(d).isDirectory()||!fs.existsSync(m))return;var x=JSON.parse(fs.readFileSync(m,'utf8'));if(!x.id)return;out[x.id]={id:x.id,label:x.label||x.id,version:x.version||'0',status:x.status||'UNKNOWN',owner:x.owner||'',modes:x.modes||[],path:d,manifest:x};}catch(e){out[n]={id:n,label:n,status:'ERROR',error:String(e.message||e)};}});this.items=out;return this.snapshot();};
ExtensionManager.prototype.get=function(id){return this.items[String(id||'')]||null;};
ExtensionManager.prototype.snapshot=function(){var self=this;return Object.keys(this.items).sort().map(function(k){var x=self.items[k];return{id:x.id,label:x.label,version:x.version,status:x.status,owner:x.owner,modes:x.modes,error:x.error||null};});};
module.exports=ExtensionManager;