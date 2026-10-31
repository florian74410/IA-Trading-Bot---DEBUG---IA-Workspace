'use strict';
var Cache=require('../Cache/market_cache'),Symbols=require('../Normalizer/symbols');
function C(o){o=o||{};this.provider=o.provider;this.firewall=o.firewall;this.store=o.store;this.cache=new Cache({ttlMs:Math.max(10000,+o.cacheTtlMs||30000),maxEntries:Math.max(8,+o.maxEntries||48)});this.lastError='';this.lastFirewall=null;}
function key(s){return Symbols.canonical(s);}
function clone(o){return JSON.parse(JSON.stringify(o));}
C.prototype.get=function(symbol,force,cb){
 var self=this,k=key(symbol),hit=!force&&self.cache.get(k);if(hit)return cb(null,Object.assign(clone(hit),{cache:'HIT'}));
 self.provider.pairLiquidity(symbol,function(e,o){if(e){self.lastError=e.message;return cb(e);}if(!o||typeof o!=='object'){self.lastError='DEXSCREENER_RESPONSE_INVALID';return cb(new Error(self.lastError));}o=clone(o);var msg={provider:'DEXSCREENER',source:'DEXSCREENER',provenance:o.provenance,type:'MARKET_ANALYTICS',symbol:o.canonicalSymbol||o.symbol,timestamp:o.observedAt,price:o.weightedPriceUsd,data:o};
  self.firewall.inspect(msg,function(fe,fw){
   if(fe){self.lastError=fe.message;self.lastFirewall=fe.firewall||null;return cb(fe);}
   var check=fw&&fw.firewall||fw;
   if(!fw||fw.ok===false||['PASS','WARN'].indexOf(fw.decision)<0||fw.bypass||/BYPASS|DISABLED|WOULD_REJECT/.test(fw.reason||'')||(check.issues&&check.issues.length)){
    self.lastError='DATA_FIREWALL_VALIDATION_REQUIRED';self.lastFirewall=check||null;return cb(new Error(self.lastError));
   }
   o.firewall={decision:fw.decision,reason:fw.reason||null,checkedAt:check.checkedAt||Date.now()};o.cache='MISS';self.lastFirewall=o.firewall;
   if(self.store&&self.store.saveDexLiquidity){
    try{var saved=self.store.saveDexLiquidity(o);if(saved===false&&(self.store.ready===false||self.store.lastError))throw new Error(self.store.lastError||'SQL_UNAVAILABLE');}
    catch(se){self.lastError='DEX_LIQUIDITY_STORAGE_FAILED:'+se.message;return cb(new Error(self.lastError));}
   }
   self.cache.set(k,clone(o));self.lastError='';cb(null,o);
  });
 });
};
C.prototype.history=function(o){return this.store&&this.store.dexLiquidityHistory?this.store.dexLiquidityHistory(o):{ok:false,error:'DEX_LIQUIDITY_HISTORY_DISABLED',items:[]};};
C.prototype.clear=function(){this.cache.clear();};
C.prototype.status=function(){return{ok:!this.lastError,provider:'DEXSCREENER',cache:this.cache.stats(),lastError:this.lastError||null,lastFirewall:this.lastFirewall,storage:this.store&&this.store.status?this.store.status():null};};
module.exports=C;
