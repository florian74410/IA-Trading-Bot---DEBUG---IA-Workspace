'use strict';

var v8=require('v8');

function cloneArgs(args){
 try{return v8.deserialize(v8.serialize(Array.prototype.slice.call(args||[])));}catch(e){return null;}
}
function estimateArgs(args){
 try{return v8.serialize(Array.prototype.slice.call(args||[])).length;}catch(e){return 0;}
}
function Broker(o){
 o=o||{};this.mode=String(o.mode||'SHADOW').toUpperCase();this.inflight=Object.create(null);this.lastSuccess=Object.create(null);
 this.responseCache=Object.create(null);this.waiters=Object.create(null);
 this.maxCacheEntries=Math.max(8,+o.maxCacheEntries||128);this.maxCacheBytes=Math.max(1024*1024,+o.maxCacheBytes||64*1024*1024);this.cacheBytes=0;
 this.stats={observed:0,dedupOpportunities:0,cacheOpportunities:0,cacheHitsServed:0,dedupServed:0,cacheStores:0,cacheEvictions:0,cloneFailures:0};
}
Broker.prototype.key=function(req){return[String(req.provider||'').toUpperCase(),String(req.dataset||'').toUpperCase(),String(req.signature||'')].join('|');};
Broker.prototype.before=function(req,policy){
 var now=Date.now(),k=this.key(req),last=this.lastSuccess[k]||0,ttl=Math.max(0,+policy.cacheTtlMs||0),inflight=!!this.inflight[k],cacheFresh=ttl>0&&last>0&&now-last<ttl;
 this.stats.observed++;
 if(inflight)this.stats.dedupOpportunities++;
 if(cacheFresh)this.stats.cacheOpportunities++;
 if(!inflight)this.inflight[k]={startedAt:now,active:1,observedRequests:1};else{this.inflight[k].active++;this.inflight[k].observedRequests++;}
 return{key:k,inflightDuplicate:inflight,wouldCacheHit:cacheFresh,cacheAgeMs:last?now-last:null,cacheTtlMs:ttl};
};
Broker.prototype.after=function(key,ok){
 if(ok)this.lastSuccess[key]=Date.now();
 var x=this.inflight[key];if(!x)return;x.active=Math.max(0,(+x.active||1)-1);if(x.active===0)delete this.inflight[key];
};
Broker.prototype.cacheGet=function(key,ttl){
 var x=this.responseCache[key],now=Date.now();ttl=Math.max(0,+ttl||0);
 if(!x)return null;
 if(!ttl||now-x.at>=ttl){this.cacheBytes=Math.max(0,this.cacheBytes-(x.bytes||0));delete this.responseCache[key];return null;}
 var out=cloneArgs(x.args);
 if(!out){this.stats.cloneFailures++;return null;}
 x.lastAccessAt=now;this.stats.cacheHitsServed++;return out;
};
Broker.prototype._evict=function(){
 var keys=Object.keys(this.responseCache),self=this;
 keys.sort(function(a,b){return(self.responseCache[a].lastAccessAt||self.responseCache[a].at)-(self.responseCache[b].lastAccessAt||self.responseCache[b].at);});
 while((keys.length>this.maxCacheEntries||this.cacheBytes>this.maxCacheBytes)&&keys.length){
  var k=keys.shift(),x=this.responseCache[k];if(!x)continue;this.cacheBytes=Math.max(0,this.cacheBytes-(x.bytes||0));delete this.responseCache[k];this.stats.cacheEvictions++;
 }
};
Broker.prototype.cachePut=function(key,args,ttl){
 ttl=Math.max(0,+ttl||0);if(!ttl||!args||args[0])return false;
 var stored=cloneArgs(args);if(!stored){this.stats.cloneFailures++;return false;}
 var bytes=estimateArgs(stored);if(!bytes||bytes>this.maxCacheBytes)return false;
 var old=this.responseCache[key];if(old)this.cacheBytes=Math.max(0,this.cacheBytes-(old.bytes||0));
 this.responseCache[key]={at:Date.now(),lastAccessAt:Date.now(),args:stored,bytes:bytes};this.cacheBytes+=bytes;this.stats.cacheStores++;this._evict();return true;
};
Broker.prototype.join=function(key,fn){
 if(!this.waiters[key])this.waiters[key]=[];this.waiters[key].push(fn);this.stats.dedupServed++;
};
Broker.prototype.resolve=function(key,args){
 var q=this.waiters[key]||[];delete this.waiters[key];
 q.forEach(function(fn){
  var isolated=cloneArgs(args);
  if(!isolated){this.stats.cloneFailures++;isolated=[new Error('DEDUP_CLONE_FAILED')];}
  try{fn(isolated);}catch(e){}
 },this);
 return q.length;
};
Broker.prototype.status=function(){return{mode:this.mode,stats:Object.assign({},this.stats),inflight:Object.keys(this.inflight).length,cacheKeys:Object.keys(this.lastSuccess).length,responseCacheEntries:Object.keys(this.responseCache).length,responseCacheBytes:this.cacheBytes,responseCacheMaxBytes:this.maxCacheBytes,responseCacheMaxEntries:this.maxCacheEntries,dedupWaiters:Object.keys(this.waiters).reduce(function(z,k){return z+(this.waiters[k]||[]).length;}.bind(this),0)};};

module.exports=Broker;
