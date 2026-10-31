'use strict';
function C(o){o=o||{};this.ttlMs=Math.max(3000,+o.ttlMs||10000);this.maxEntries=Math.max(8,+o.maxEntries||32);this.map=new Map();}
C.prototype.get=function(k){var x=this.map.get(k);if(!x)return null;if(Date.now()-x.at>this.ttlMs){this.map.delete(k);return null;}this.map.delete(k);this.map.set(k,x);return x.value;};
C.prototype.set=function(k,v){if(this.map.has(k))this.map.delete(k);this.map.set(k,{at:Date.now(),value:v});while(this.map.size>this.maxEntries)this.map.delete(this.map.keys().next().value);return v;};
C.prototype.clear=function(){this.map.clear()};C.prototype.stats=function(){return{entries:this.map.size,ttlMs:this.ttlMs,maxEntries:this.maxEntries}};module.exports=C;
