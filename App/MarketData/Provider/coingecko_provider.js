'use strict';
var get=require('./http_json');

function P(o){
 o=o||{};
 this.base=String(o.base||'https://api.coingecko.com/api/v3').replace(/\/$/,'');
 this.apiKey=String(o.apiKey||process.env.COINGECKO_API_KEY||'');
 this.id='COINGECKO';
 this.minIntervalMs=Math.max(300,Number(o.minIntervalMs!=null?o.minIntervalMs:process.env.IATB_COINGECKO_MIN_INTERVAL_MS)||3000);
 this.maxRetries=Math.max(0,Math.min(4,Number(o.maxRetries!=null?o.maxRetries:process.env.IATB_COINGECKO_MAX_RETRIES)||0));
 this.quotaUsage=typeof o.quotaUsage==='function'?o.quotaUsage:null;
 this.monthlyLimit=Math.max(1,Number(o.monthlyLimit||process.env.IATB_COINGECKO_MONTHLY_LIMIT)||10000);
 var reserve=o.reserve!=null?o.reserve:process.env.IATB_COINGECKO_RESERVE;this.reserve=reserve==null?2000:Math.max(0,Number(reserve)||0);
 this.queue=[];this.pending=Object.create(null);this.busy=false;this.timer=null;this.lastStartAt=0;this.cooldownUntil=0;this.lastError='';this.calls=0;this.deduplicated=0;this.lastUsage=null;
}
P.prototype._headers=function(){var h={};if(this.apiKey)h['x-cg-demo-api-key']=this.apiKey;return h;};
P.prototype._finish=function(task,e,o){
 delete this.pending[task.url];this.busy=false;this.lastError=e?e.message:'';
 try{task.waiters.forEach(function(cb){cb(e,o==null?o:JSON.parse(JSON.stringify(o)));});}finally{this._drain();}
};
P.prototype._enqueue=function(url,opts,cb){
 if(this.pending[url]){this.pending[url].waiters.push(cb);this.deduplicated++;return;}
 if(this.queue.length>=100)return cb(new Error('COINGECKO_QUEUE_FULL'));
 var task={url:url,opts:Object.assign({},opts,{telemetryProvider:'COINGECKO'}),waiters:[cb],attempt:0};
 this.pending[url]=task;this.queue.push(task);this._drain();
};
P.prototype._drain=function(){
 var self=this;if(self.busy||self.timer||!self.queue.length)return;
 self.timer=setTimeout(function(){self.timer=null;if(self.busy||!self.queue.length)return;self.busy=true;self._run(self.queue.shift());},Math.max(0,self.minIntervalMs-(Date.now()-self.lastStartAt)));
};
P.prototype._run=function(task){
 var self=this,now=Date.now(),usage=null;
 if(self.quotaUsage){try{usage=self.quotaUsage();if(!usage||usage.ok===false)throw new Error('COINGECKO_QUOTA_UNAVAILABLE');self.lastUsage=usage;self.cooldownUntil=Math.max(self.cooldownUntil,usage.cooldownUntil||0);}catch(e){return self._finish(task,e);}}
 if(now<self.cooldownUntil){var blocked=new Error('COINGECKO_COOLDOWN');blocked.retryAfterMs=self.cooldownUntil-now;return self._finish(task,blocked);}
 if(usage&&(usage.monthUsed>=Math.max(0,self.monthlyLimit-self.reserve)||usage.minuteUsed>=20))return self._finish(task,new Error('COINGECKO_LOCAL_BUDGET_EXHAUSTED'));
 self.lastStartAt=now;self.calls++;
 get(task.url,task.opts,function(e,o){
  if(e&&e.statusCode===429){self.cooldownUntil=Math.max(self.cooldownUntil,Date.now()+Math.max(900000,e.retryAfterMs||0));return self._finish(task,e);}
  if(e&&e.statusCode>=500&&task.attempt<self.maxRetries){task.attempt++;return setTimeout(function(){self._run(task);},Math.max(self.minIntervalMs,1200*task.attempt));}
  self._finish(task,e,o);
 });
};
P.prototype.search=function(query,cb){
 var url=this.base+'/search?query='+encodeURIComponent(String(query||'').trim());
 this._enqueue(url,{headers:this._headers(),timeout:15000,maxBytes:8*1024*1024},cb);
};
P.prototype.marketPage=function(page,perPage,vs,cb){
 var url=this.base+'/coins/markets?vs_currency='+encodeURIComponent(vs||'usd')+'&order=market_cap_desc&per_page='+Math.max(1,Math.min(250,+perPage||250))+'&page='+Math.max(1,+page||1)+'&sparkline=false&price_change_percentage=1h,24h,7d';
 this._enqueue(url,{headers:this._headers(),timeout:15000},cb);
};
P.prototype.coin=function(id,cb){
 var url=this.base+'/coins/'+encodeURIComponent(id)+'?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false&sparkline=false';
 this._enqueue(url,{headers:this._headers(),timeout:15000,maxBytes:12*1024*1024},cb);
};
P.prototype.global=function(cb){
 this._enqueue(this.base+'/global',{headers:this._headers(),timeout:15000},cb);
};
P.prototype.simplePrice=function(ids,vs,cb){
 var list=(Array.isArray(ids)?ids:String(ids||'bitcoin').split(',')).slice().sort().join(',');
 var url=this.base+'/simple/price?ids='+encodeURIComponent(list)+'&vs_currencies='+encodeURIComponent(vs||'usd');
 this._enqueue(url,{headers:this._headers(),timeout:15000},cb);
};
P.prototype.exchanges=function(page,perPage,cb){
 var url=this.base+'/exchanges?per_page='+Math.max(1,Math.min(250,+perPage||50))+'&page='+Math.max(1,+page||1);
 this._enqueue(url,{headers:this._headers(),timeout:15000,maxBytes:8*1024*1024},cb);
};
P.prototype.status=function(){return{id:this.id,queued:this.queue.length,busy:this.busy,minIntervalMs:this.minIntervalMs,maxRetries:this.maxRetries,lastStartAt:this.lastStartAt||null,cooldownUntil:this.cooldownUntil||null,lastError:this.lastError||null,calls:this.calls,deduplicated:this.deduplicated,monthlyLimit:this.monthlyLimit,reserve:this.reserve,usage:this.lastUsage,rawResponseCache:false};};
module.exports=P;
