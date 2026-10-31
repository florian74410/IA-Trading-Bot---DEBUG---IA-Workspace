'use strict';
var Cache=require('../Cache/market_cache'),crypto=require('crypto'),Liquidations=require('../Normalizer/liquidations'),Currency=require('../Registry/currency_registry_v1');

function Collector(o){
 o=o||{};this.provider=o.provider;this.firewall=o.firewall;this.store=o.store;
 this.cache=new Cache({ttlMs:Math.max(5000,+o.cacheTtlMs||5000),maxEntries:Math.max(12,+o.maxEntries||64)});
 this.oiCache=new Cache({ttlMs:Math.max(5000,+o.oiCacheTtlMs||10000),maxEntries:Math.max(8,+o.maxEntries||64)});
 this.instrumentResolver=o.instrumentResolver;this.instrumentRows=null;this.instrumentAt=0;this.instrumentWaiters=null;this.instrumentRetryAt=0;this.rateCache=Object.create(null);this.rateWaiters=Object.create(null);this.liquidationSeen=new Map();this.liquidationPending=new Map();this.liquidationDuplicates=0;this.liquidationBuffer=[];this.maxLiquidations=Math.max(100,+o.maxLiquidations||5000);
 this.busy=Object.create(null);this.lastError='';this.lastFirewall=null;this.currencyPriceResolver=typeof o.currencyPriceResolver==='function'?o.currencyPriceResolver:null;
}
function key(symbol,source,depth){return String(source||'AUTO').toUpperCase()+'|'+String(symbol||'').toUpperCase()+'|'+Math.max(5,Math.min(100,+depth||20));}
function canonicalPair(s){s=String(s||'').toUpperCase().replace(/-SWAP$/,'').replace(/[^A-Z0-9]/g,'');var q=['USDT','USDC','USD'];for(var i=0;i<q.length;i++)if(s.length>q[i].length&&s.slice(-q[i].length)===q[i])return s.slice(0,-q[i].length)+'USD';return s;}
function envelope(raw){
 var b=raw&&raw.orderBook||{},bid=b.bids&&b.bids[0],ask=b.asks&&b.asks[0],mid=bid&&ask?(+bid.price+ +ask.price)/2:null;
 return{provider:raw.source,source:raw.source,provenance:raw.provenance||('MARKET_DATA_COLLECTOR:'+raw.source),type:'LIQUIDITY_SNAPSHOT',symbol:raw.canonicalSymbol||raw.symbol,timestamp:+raw.observedAt||Date.now(),bid:bid&&+bid.price||null,ask:ask&&+ask.price||null,price:mid,data:{orderBook:raw.orderBook,openInterest:raw.openInterest,liquidations:raw.liquidations||[]}};
}

function normalizeOiRows(self,rows,cb){
 rows=Array.isArray(rows)?rows:[];if(!rows.length)return cb(null,{valid:[],rejected:[]});
 var valid=[],rejected=[],left=rows.length,rates=Object.create(null),waiting=Object.create(null);
 function finish(x){if(x.ok)valid.push(x.row);else rejected.push({source:x.row&&x.row.source||'UNKNOWN',error:x.error||'OI_NORMALIZATION_FAILED'});if(--left===0)cb(null,{valid:valid,rejected:rejected});}
 function rate(asset,done){
  asset=String(asset||'').toUpperCase();
  if(asset==='USD')return done(null,1,{source:'DIRECT_USD'});
  if(rates[asset])return done(null,rates[asset].value,rates[asset].meta);
  if(waiting[asset]){waiting[asset].push(done);return;}
  waiting[asset]=[done];
  if(!self.currencyPriceResolver){var q=waiting[asset].splice(0);delete waiting[asset];q.forEach(function(fn){fn(new Error('CURRENCY_PRICE_RESOLVER_UNAVAILABLE'));});return;}
  self.currencyPriceResolver(asset,function(e,o){
   var value=o&&isFinite(+o.value)&&+o.value>0?+o.value:null,meta=o||null,q=waiting[asset]||[];delete waiting[asset];
   if(!e&&value!=null)rates[asset]={value:value,meta:meta};
   q.forEach(function(fn){fn(e||(!value?new Error('CURRENCY_USD_PRICE_UNAVAILABLE:'+asset):null),value,meta);});
  });
 }
 rows.forEach(function(row){
  var unit=String(row.notionalSourceUnit||(row.openInterestNotionalUsd!=null?'USD':'')).toUpperCase(),amount=row.notionalSourceValue!=null?+row.notionalSourceValue:+row.openInterestNotionalUsd;
  if(!unit||!isFinite(amount)||amount<0)return finish({ok:false,row:row,error:'OI_SOURCE_NOTIONAL_INVALID'});
  var resolved=Currency.resolve(unit);
  if(!resolved)return finish({ok:false,row:row,error:'OI_CURRENCY_UNREGISTERED:'+unit});
  rate(unit,function(e,px,meta){
   if(e)return finish({ok:false,row:row,error:e.message});
   var usd=amount*px;if(!isFinite(usd)||usd<0)return finish({ok:false,row:row,error:'OI_NORMALIZED_USD_INVALID'});
   row.openInterestNotionalUsd=usd;
   row.normalizationStatus='NORMALIZED';
   row.normalizationReceipt=Currency.receipt(unit,amount,unit,px,usd);
   row.normalizationPriceSource=meta&&meta.source||meta&&meta.provider||null;
   finish({ok:true,row:row});
  });
 });
}
Collector.prototype.snapshot=function(symbol,source,depth,force,cb){
 var self=this,k=key(symbol,source,depth),hit=!force&&self.cache.get(k);if(hit)return cb(null,Object.assign({},hit,{cache:'HIT'}));
 if(self.busy[k]){var waited=0,t=setInterval(function(){waited+=50;var h=self.cache.get(k);if(h){clearInterval(t);return cb(null,Object.assign({},h,{cache:'WAIT_HIT'}));}if(waited>=12000){clearInterval(t);cb(new Error('MICROSTRUCTURE_REFRESH_BUSY_TIMEOUT'));}},50);return;}
 self.busy[k]=1;
 self.provider.getSnapshot(symbol,source,depth,function(e,raw){
  if(e){delete self.busy[k];self.lastError=e.message;return cb(e);}
  self.firewall.inspect(envelope(raw),function(fe,fw){
   delete self.busy[k];if(fe){self.lastError=fe.message;self.lastFirewall=fe.firewall||null;return cb(fe);}
   raw.firewall={decision:fw.decision||'PASS',reason:fw.reason||null,checkedAt:fw.firewall&&fw.firewall.checkedAt||Date.now()};
   raw.cache='MISS';self.cache.set(k,raw);if(self.store)self.store.saveSnapshot(raw,fw);self.lastError='';self.lastFirewall=raw.firewall;cb(null,raw);
  });
 });
};
Collector.prototype.openInterestAggregate=function(symbol,sources,cb){
 var self=this,src=Array.isArray(sources)&&sources.length?sources.slice().sort():[],k=String(symbol||'').toUpperCase()+'|'+src.join(','),hit=self.oiCache.get(k);if(hit)return cb(null,Object.assign({},hit,{cache:'HIT'}));self.provider.aggregateOpenInterest(symbol,sources,function(e,o){
  if(e)return cb(e);var rows=o&&o.venues||[],firewallValid=[],firewallRejected=[],left=rows.length;
  if(!left)return cb(null,o);
  rows.forEach(function(x){
   var msg={provider:x.source,source:x.source,provenance:x.provenance||('MARKET_DATA_COLLECTOR:'+x.source),type:'OPEN_INTEREST',symbol:x.canonicalSymbol||symbol,timestamp:+x.observedAt||Date.now(),price:x.markPrice||null,data:{openInterest:x}};
   self.firewall.inspect(msg,function(fe,fw){
    if(fe)firewallRejected.push({source:x.source,error:fe.message});else{x.firewall={decision:fw.decision||'PASS',reason:fw.reason||null};firewallValid.push(x);}
    if(--left)return;
    normalizeOiRows(self,firewallValid,function(ne,norm){
     if(ne)return cb(ne);
     var valid=norm.valid||[],normalizationRejected=norm.rejected||[],total=0,cex=0,dex=0;
     valid.forEach(function(v){var n=isFinite(+v.openInterestNotionalUsd)?+v.openInterestNotionalUsd:0;total+=n;if(String(v.venueType||'').toUpperCase()==='DEX')dex+=n;else cex+=n;});
     var missing=(o.coverage&&o.coverage.missing||[]).slice();
     firewallRejected.forEach(function(v){missing.push({source:v.source,error:v.error,stage:'FIREWALL'});});
     normalizationRejected.forEach(function(v){missing.push({source:v.source,error:v.error,stage:'CURRENCY_NORMALIZATION'});});
     var out={ok:true,schema:'marketdata.open_interest.aggregate/1.1',symbol:o.symbol||symbol,scope:'CONNECTED_PERPETUAL_VENUES',coveredOpenInterestUsd:total,cexOpenInterestUsd:cex,dexOpenInterestUsd:dex,venueCount:valid.length,venues:valid.sort(function(a,b){return(+b.openInterestNotionalUsd||0)-(+a.openInterestNotionalUsd||0)}),coverage:{requested:o.coverage&&o.coverage.requested||[],received:valid.map(function(v){return v.source;}),missing:missing,complete:missing.length===0,label:'COVERED_NOT_GLOBAL'},currencyNormalization:{registry:'CURRENCY_REGISTRY_V1',strict:true,assumeStableEqualsFiat:false},observedAt:Date.now()};
     out.cache='MISS';self.oiCache.set(k,out);if(self.store&&self.store.saveOpenInterest)self.store.saveOpenInterest(out);cb(null,out);
    });
   });
  });
 });
};
function checked(fw){var x=fw&&fw.firewall||fw;return !!fw&&['PASS','WARN'].indexOf(fw.decision)>=0&&!fw.bypass&&!/BYPASS|DISABLED|WOULD_REJECT/.test(fw.reason||'')&&!(x.issues&&x.issues.length);}
Collector.prototype._instrument=function(id,cb){
 var self=this;
 function select(e){if(e)return cb(e);var found=(self.instrumentRows||[]).filter(function(x){return x.instId===id;})[0];cb(found?null:new Error('CONTRACT_METADATA_UNAVAILABLE'),found);}
 if(self.instrumentRows&&Date.now()-self.instrumentAt<86400000)return select();
 if(self.instrumentWaiters){self.instrumentWaiters.push(select);return;}
 if(!self.instrumentResolver||Date.now()<self.instrumentRetryAt)return cb(new Error('CONTRACT_METADATA_UNAVAILABLE'));
 self.instrumentWaiters=[select];
 function finish(e){var waits=self.instrumentWaiters;self.instrumentWaiters=null;if(e)self.instrumentRetryAt=Date.now()+60000;waits.forEach(function(fn){fn(e);});}
 self.instrumentResolver(function(e,rows){if(e)return finish(e);if(!Array.isArray(rows)||!rows.length)return finish(new Error('CONTRACT_METADATA_INVALID'));
  self.firewall.inspect({provider:'OKX',source:'OKX',provenance:'OKX:/api/v5/public/instruments',type:'MARKET_ANALYTICS',symbol:'SWAP',timestamp:Date.now(),data:{instruments:rows}},function(fe,fw){
   if(fe||!checked(fw))return finish(fe||new Error('CONTRACT_METADATA_FIREWALL_REQUIRED'));self.instrumentRows=rows;self.instrumentAt=Date.now();finish();
  });
 });
};
Collector.prototype._liquidationRate=function(unit,cb){
 var self=this;if(unit==='USD')return cb(null,1,{source:'USD_UNIT',updatedAt:null});
 if(!Currency.resolve(unit)||!self.currencyPriceResolver)return cb(new Error('LIQUIDATION_USD_RATE_UNAVAILABLE:'+unit));
 var hit=self.rateCache[unit];if(hit&&Date.now()-hit.at<60000)return cb(hit.error,hit.value,hit.meta);
 if(self.rateWaiters[unit]){self.rateWaiters[unit].push(cb);return;}self.rateWaiters[unit]=[cb];
 self.currencyPriceResolver(unit,function(e,row){var value=row&&row.value!=null&&isFinite(+row.value)&&+row.value>0?+row.value:null;
  e=e||(!value||row.ok===false?new Error('LIQUIDATION_USD_RATE_UNAVAILABLE:'+unit):null);self.rateCache[unit]={at:Date.now(),error:e,value:value,meta:row};
  var waits=self.rateWaiters[unit];delete self.rateWaiters[unit];waits.forEach(function(fn){fn(e,value,row);});
 });
};
Collector.prototype._normalizeLiquidation=function(x,cb){
 var self=this;x.notionalUsd=null;x.normalizationStatus='UNAVAILABLE';
 function unknown(reason){x.normalizationError=reason;cb(null,x);}
 function convert(amount,unit){
  if(!(amount>0)||!isFinite(amount)||!unit)return unknown('LIQUIDATION_SOURCE_AMOUNT_UNAVAILABLE');
  x.notionalSourceValue=amount;x.notionalSourceUnit=unit;
  self._liquidationRate(unit,function(e,rate,meta){if(e)return unknown(e.message);var usd=amount*rate;if(!isFinite(usd))return unknown('LIQUIDATION_USD_INVALID');
   x.notionalUsd=usd;x.normalizationStatus='NORMALIZED';x.normalizationError=null;x.normalizationReceipt=Currency.receipt(unit,amount,unit,rate,usd);x.normalizationReceipt.priceSource=meta&&meta.source||null;x.normalizationReceipt.priceObservedAt=meta&&meta.updatedAt||null;cb(null,x);
  });
 }
 if(x.priceBasis==='ORDER_PRICE_ONLY')return unknown('EXECUTION_PRICE_UNAVAILABLE');
 if(x.quantityUnit==='BASE'){if(!(x.quantity>0))return unknown(x.normalizationError||'EXECUTED_SIZE_UNAVAILABLE');return convert(x.quantity*x.price,Liquidations.quote(x.venueSymbol));}
 if(x.quantityUnit!=='CONTRACT'||x.provider!=='OKX')return unknown('LIQUIDATION_CONTRACT_UNSUPPORTED');
 self._instrument(x.instrumentId,function(e,m){
  if(e)return unknown(e.message);var val=+m.ctVal,base=String(m.instId).split('-')[0],unit=String(m.ctValCcy||'').toUpperCase(),type=String(m.ctType||'').toLowerCase();
  if(!(val>0)||!isFinite(val)||(m.ctMult&&+m.ctMult!==1))return unknown('CONTRACT_VALUE_OR_MULTIPLIER_UNSUPPORTED');
  x.contract={instId:m.instId,ctVal:val,ctValCcy:unit,ctType:type,provenance:'OKX:/api/v5/public/instruments',checkedAt:self.instrumentAt};
  if(type==='inverse'&&unit==='USD')return convert(x.quantity*val,'USD');
  if(type==='linear'&&unit===base)return convert(x.quantity*val*x.price,Liquidations.quote(m.instId));
  unknown('CONTRACT_CURRENCY_UNSUPPORTED');
 });
};
Collector.prototype.acceptLiquidation=function(event,cb){
 var self=this,e=event||{},ts=+(e.timestamp||e.time||0);if(ts>0&&ts<1e12)ts*=1000;
 var x={provider:String(e.provider||e.source||'').toUpperCase(),source:String(e.provider||e.source||'').toUpperCase(),provenance:String(e.provenance||''),symbol:canonicalPair(e.symbol),venueSymbol:String(e.symbol||'').toUpperCase(),side:String(e.side||'').toUpperCase(),price:+e.price,quantity:+(e.quantity!=null?e.quantity:e.size),quantityUnit:String(e.quantityUnit||'UNKNOWN').toUpperCase(),notionalUsd:null,timestamp:Math.round(ts),providerEventId:e.providerEventId?String(e.providerEventId).slice(0,160):null,instrumentId:e.instrumentId||null,instrumentFamily:e.instrumentFamily||null,priceBasis:e.priceBasis||null,raw:e.raw||null,normalizationError:e.normalizationError||null};
 x.eventKey=crypto.createHash('sha256').update([x.provider,x.venueSymbol,x.providerEventId||[x.timestamp,x.side,x.price,x.quantity,x.quantityUnit].join('|')].join('|')).digest('hex');
 if(self.liquidationSeen.has(x.eventKey)){self.liquidationDuplicates++;return cb&&cb(null,Object.assign({},x,{duplicate:true}));}
 if(self.liquidationPending.has(x.eventKey)){self.liquidationPending.get(x.eventKey).push(cb);return;}
 try{if(self.store&&self.store.hasLiquidation&&self.store.hasLiquidation(x)){self.liquidationDuplicates++;return cb&&cb(null,Object.assign({},x,{duplicate:true}));}}catch(se){return cb&&cb(se);}
 self.liquidationPending.set(x.eventKey,[cb]);
 function finish(err,out){var waits=self.liquidationPending.get(x.eventKey)||[];self.liquidationPending.delete(x.eventKey);waits.forEach(function(fn,i){if(i&&!err)self.liquidationDuplicates++;if(fn)fn(err,i&&!err?Object.assign({},out,{duplicate:true}):out);});}
 function inspect(done){self.firewall.inspect({provider:x.provider,source:x.source,provenance:x.provenance,type:'LIQUIDATION',symbol:x.symbol,timestamp:x.timestamp,price:x.price,data:x},function(fe,fw){if(fe)return done(fe);if(!checked(fw))return done(new Error('LIQUIDATION_FIREWALL_REQUIRED'));x.firewall={decision:fw.decision,reason:fw.reason||null,checkedAt:fw.firewall&&fw.firewall.checkedAt||Date.now()};done();});}
 inspect(function(fe){if(fe)return finish(fe);self._normalizeLiquidation(x,function(ne){if(ne)return finish(ne);inspect(function(finalError){
  if(finalError)return finish(finalError);
  if(self.store){try{var saved=self.store.saveLiquidation(x);if(saved===false){if(self.store.lastError)throw new Error(self.store.lastError);return finish(null,Object.assign({},x,{duplicate:true}));}}catch(se){return finish(new Error('LIQUIDATION_STORAGE_FAILED:'+se.message));}}
  self.liquidationSeen.set(x.eventKey,x.timestamp);while(self.liquidationSeen.size>self.maxLiquidations*2)self.liquidationSeen.delete(self.liquidationSeen.keys().next().value);
  self.liquidationBuffer.push(x);if(self.liquidationBuffer.length>self.maxLiquidations)self.liquidationBuffer.shift();self.lastFirewall=x.firewall;finish(null,x);
 });});});
};
Collector.prototype.recentLiquidations=function(o){
 o=o||{};var now=Date.now(),since=Math.max(0,+o.since||now-Math.max(60000,+o.windowMs||900000)),symbol=canonicalPair(o.symbol),provider=String(o.provider||o.source||'').toUpperCase(),limit=Math.max(1,Math.min(5000,+o.limit||500));
 var a=this.liquidationBuffer.slice(),storageError=null;
 if(this.store){var db=this.store.liquidations({symbol:symbol,provider:provider,limit:limit,since:since});if(db.ok)a=a.concat(db.items);else storageError=db.error;}
 var seen=Object.create(null);a=a.filter(function(x){var id=x.eventKey||JSON.stringify([x.provider,x.providerEventId,x.symbol,x.timestamp,x.price,x.quantity]);if(seen[id])return false;seen[id]=1;return x.timestamp>=since&&x.timestamp<=now&&(!symbol||x.symbol===symbol)&&(!provider||provider==='AUTO'||x.provider===provider);}).sort(function(x,y){return x.timestamp-y.timestamp;});
 if(a.length>limit)a=a.slice(-limit);return{ok:true,schema:'marketdata.liquidations/1.0',items:a,count:a.length,since:since,to:now,storageError:storageError};
};
Collector.prototype.openInterestHistory=function(o){return this.store&&this.store.openInterestHistory?this.store.openInterestHistory(o):{ok:false,error:'OPEN_INTEREST_HISTORY_DISABLED',items:[]};};
Collector.prototype.liquidationStats=function(o){
 o=o||{};if(this.store&&this.store.liquidationStats)return this.store.liquidationStats(Object.assign({},o,{symbol:canonicalPair(o.symbol)}));
 var now=Date.now(),windowMs=Math.max(60000,Math.min(86400000,+o.windowMs||86400000)),rows=this.liquidationBuffer.filter(function(x){return x.timestamp>=now-windowMs&&x.timestamp<=now&&(!o.symbol||x.symbol===canonicalPair(o.symbol))&&(!o.source||x.provider===String(o.source).toUpperCase());}),known=0,sum=0,providers={},long={count:0,coveredNotionalUsd:0},short={count:0,coveredNotionalUsd:0};
 rows.forEach(function(x){var p=providers[x.provider]||(providers[x.provider]={provider:x.provider,count:0,knownEvents:0,observedNotionalUsd:null}),side=x.side==='LONG'?long:short;p.count++;side.count++;
  if(x.normalizationStatus==='NORMALIZED'&&x.normalizationReceipt&&x.notionalUsd!=null&&isFinite(+x.notionalUsd)&&+x.notionalUsd>=0){known++;sum+=+x.notionalUsd;side.coveredNotionalUsd+=+x.notionalUsd;p.knownEvents++;p.observedNotionalUsd=(p.observedNotionalUsd||0)+ +x.notionalUsd;}});
 return{ok:true,schema:'marketdata.liquidations.stats/1.1',symbol:canonicalPair(o.symbol),windowMs:windowMs,since:now-windowMs,to:now,count:rows.length,totalNotionalUsd:rows.length&&known===rows.length?sum:null,coveredNotionalUsd:known?sum:null,long:long,short:short,imbalance:sum?(long.coveredNotionalUsd-short.coveredNotionalUsd)/sum:0,byProvider:Object.keys(providers).map(function(k){return providers[k];}),coverage:{label:'OBSERVED_NOT_GLOBAL',providers:Object.keys(providers),notionalKnownEvents:known,notionalUnknownEvents:rows.length-known,notionalComplete:known===rows.length,storage:'MEMORY_ONLY',truncated:rows.length===this.maxLiquidations}};
};
Collector.prototype.history=function(o){return this.store?this.store.history(o):{ok:false,error:'MICROSTRUCTURE_STORE_DISABLED',items:[]};};
Collector.prototype.storage=function(){return this.store?this.store.status():{ok:false,mode:'DISABLED'};};
Collector.prototype.clear=function(){this.cache.clear();this.oiCache.clear();this.liquidationBuffer=[];return this.status();};
Collector.prototype.status=function(){return{ok:!this.lastError,cache:this.cache.stats(),openInterestCache:this.oiCache.stats(),providers:this.provider&&this.provider.list?this.provider.list():[],storage:this.storage(),liquidationBuffer:this.liquidationBuffer.length,liquidationDuplicates:this.liquidationDuplicates,lastError:this.lastError||null,lastFirewall:this.lastFirewall};};
module.exports=Collector;
