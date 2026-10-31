'use strict';
var fs=require('fs'),path=require('path');
var ROOT=__dirname,BASE=path.join(ROOT,'exchange_catalog.json'),CUSTOM=path.join(ROOT,'Custom');
var TYPES={CEX:1,DEX:1,DEX_AGGREGATOR:1,DATA:1};
function plain(x){return x&&typeof x==='object'&&!Array.isArray(x);}
function clean(d,sourceFile,custom){
 if(!plain(d))return null;
 var id=String(d.id||'').trim().toUpperCase(),type=String(d.type||'').trim().toUpperCase(),mod=String(d.module||'').trim();
 if(!/^[A-Z][A-Z0-9_-]{1,31}$/.test(id)||!TYPES[type]||!/^\.\/[A-Za-z0-9_./-]+$/.test(mod)||mod.indexOf('..')>=0)return null;
 var caps=(Array.isArray(d.capabilities)?d.capabilities:[]).map(function(x){return String(x||'').toLowerCase();}).filter(function(x,i,a){return/^[a-z][a-z0-9_-]{1,31}$/.test(x)&&a.indexOf(x)===i;});
 if(!caps.length)return null;
 return{id:id,label:String(d.label||id).slice(0,80),type:type,module:mod,capabilities:caps,settingsKey:String(d.settingsKey||id).toUpperCase(),transport:String(d.transport||'REST').toUpperCase(),defaultEnabled:d.defaultEnabled!==false,custom:!!custom,sourceFile:sourceFile};
}
function readJson(p){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){return null;}}
function load(){
 var out={},base=readJson(BASE),rows=base&&Array.isArray(base.providers)?base.providers:[];
 rows.forEach(function(d){var x=clean(d,path.basename(BASE),false);if(x)out[x.id]=x;});
 try{fs.readdirSync(CUSTOM).filter(function(n){return/\.provider\.json$/i.test(n);}).sort().forEach(function(n){var d=readJson(path.join(CUSTOM,n)),x=clean(d,n,true);if(x)out[x.id]=x;});}catch(e){}
 return Object.keys(out).sort(function(a,b){return a.localeCompare(b);}).map(function(k){return out[k];});
}
function map(){var o={};load().forEach(function(x){o[x.id]=x;});return o;}
function candleIds(){return load().filter(function(x){return x.capabilities.indexOf('candles')>=0;}).map(function(x){return x.id;});}
module.exports={load:load,map:map,candleIds:candleIds,baseFile:BASE,customDir:CUSTOM};
