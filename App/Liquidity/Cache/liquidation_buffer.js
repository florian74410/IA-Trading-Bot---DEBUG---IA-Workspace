'use strict';
function B(o){o=o||{};this.max=Math.max(100,Math.min(5000,+o.max||1000));this.rows=[];}
B.prototype.add=function(e){this.rows.push(e);if(this.rows.length>this.max)this.rows.splice(0,this.rows.length-this.max);return e;};
B.prototype.get=function(symbol,source){symbol=String(symbol||'').toUpperCase();source=String(source||'').toUpperCase();return this.rows.filter(function(e){return(!symbol||String(e.symbol||'').toUpperCase()===symbol)&&(!source||String(e.source||'').toUpperCase()===source)});};
B.prototype.clear=function(){this.rows.length=0;};B.prototype.stats=function(){return{entries:this.rows.length,maxEntries:this.max};};module.exports=B;
