'use strict';
/* IA-TB Indicator Engine v1.12.0
   Pure local computation. No network, no eval, no arbitrary JavaScript.
   Node.js 16 compatible, zero npm dependencies.
*/
var crypto=require('crypto'),IR=require('./indicator_ir'); // IR is private runtime representation; external clients use IIL.

function num(v){v=+v;return isFinite(v)?v:null;}
function clone(o){return JSON.parse(JSON.stringify(o));}
function arr(n,v){var a=new Array(n),i;for(i=0;i<n;i++)a[i]=v;return a;}
function lastFinite(a){for(var i=a.length-1;i>=0;i--)if(a[i]!=null&&isFinite(a[i]))return a[i];return null;}
function hashObj(o){return crypto.createHash('sha256').update(JSON.stringify(o||{})).digest('hex').slice(0,16);}
function normalizeCandles(input){
  if(!Array.isArray(input))throw new Error('candles doit etre un tableau');
  var out=[],seen=Object.create(null),i,c,t,o,h,l,cl,v;
  for(i=0;i<input.length;i++){
    c=input[i];
    if(Array.isArray(c)){t=num(c[0]);o=num(c[1]);h=num(c[2]);l=num(c[3]);cl=num(c[4]);v=c.length>5?num(c[5]):null;}
    else if(c&&typeof c==='object'){t=num(c.time!=null?c.time:c.timestamp);o=num(c.open);h=num(c.high);l=num(c.low);cl=num(c.close);v=c.volume==null?null:num(c.volume);}
    else continue;
    if(t==null||o==null||h==null||l==null||cl==null)continue;
    if(t<100000000000)t*=1000;
    t=Math.round(t);
    if(seen[t])continue;
    if(h<l||h<Math.max(o,cl)||l>Math.min(o,cl))continue;
    seen[t]=1;out.push({time:t,open:o,high:h,low:l,close:cl,volume:v});
  }
  out.sort(function(a,b){return a.time-b.time;});
  return out;
}
function source(candles,name){var a=[],i;name=String(name||'close').toLowerCase();for(i=0;i<candles.length;i++)a.push(num(candles[i][name]));return a;}
function hasRealVolume(c){for(var i=0;i<c.length;i++)if(c[i].volume!=null&&isFinite(c[i].volume)&&c[i].volume>0)return true;return false;}
function sma(s,p){var n=s.length,o=arr(n,null),sum=0,q=[],valid=0,i,v;for(i=0;i<n;i++){v=num(s[i]);q.push(v);if(v!=null){sum+=v;valid++;}if(q.length>p){v=q.shift();if(v!=null){sum-=v;valid--;}}if(q.length===p&&valid===p)o[i]=sum/p;}return o;}
function ema(s,p){var n=s.length,o=arr(n,null),alpha=2/(p+1),seed=0,count=0,e=null,i,v;for(i=0;i<n;i++){v=num(s[i]);if(v==null)continue;if(e==null){seed+=v;count++;if(count===p){e=seed/p;o[i]=e;}}else{e=(v-e)*alpha+e;o[i]=e;}}return o;}
function wma(s,p){var n=s.length,o=arr(n,null),den=p*(p+1)/2,i,j,sum;for(i=p-1;i<n;i++){sum=0;for(j=0;j<p;j++){if(s[i-p+1+j]==null){sum=null;break;}sum+=s[i-p+1+j]*(j+1);}if(sum!=null)o[i]=sum/den;}return o;}
function stddev(s,p,mean){var n=s.length,o=arr(n,null),i,j,m,d,sum;mean=mean||sma(s,p);for(i=p-1;i<n;i++){m=mean[i];if(m==null)continue;sum=0;for(j=i-p+1;j<=i;j++){if(s[j]==null){sum=null;break;}d=s[j]-m;sum+=d*d;}if(sum!=null)o[i]=Math.sqrt(sum/p);}return o;}
function rsi(s,p){var n=s.length,o=arr(n,null),g=0,l=0,ag=null,al=null,i,d;for(i=1;i<n;i++){if(s[i]==null||s[i-1]==null)continue;d=s[i]-s[i-1];if(i<=p){g+=Math.max(d,0);l+=Math.max(-d,0);if(i===p){ag=g/p;al=l/p;o[i]=al===0?100:100-(100/(1+ag/al));}}else if(ag!=null){ag=(ag*(p-1)+Math.max(d,0))/p;al=(al*(p-1)+Math.max(-d,0))/p;o[i]=al===0?100:100-(100/(1+ag/al));}}return o;}
function trueRange(c){var o=arr(c.length,null),i,pc;for(i=0;i<c.length;i++){pc=i?c[i-1].close:c[i].close;o[i]=Math.max(c[i].high-c[i].low,Math.abs(c[i].high-pc),Math.abs(c[i].low-pc));}return o;}
function wilder(s,p){var n=s.length,o=arr(n,null),sum=0,w=null,count=0,i,v;for(i=0;i<n;i++){v=s[i];if(v==null||!isFinite(v))continue;if(w==null){sum+=v;count++;if(count===p){w=sum/p;o[i]=w;}}else{w=(w*(p-1)+v)/p;o[i]=w;}}return o;}
function atr(c,p){return wilder(trueRange(c),p);}
function macd(s,fast,slow,signal){var ef=ema(s,fast),es=ema(s,slow),m=arr(s.length,null),i;for(i=0;i<s.length;i++)if(ef[i]!=null&&es[i]!=null)m[i]=ef[i]-es[i];var sg=ema(m,signal),h=arr(s.length,null);for(i=0;i<s.length;i++)if(m[i]!=null&&sg[i]!=null)h[i]=m[i]-sg[i];return{macd:m,signal:sg,histogram:h};}
function bollinger(s,p,k){var m=sma(s,p),sd=stddev(s,p,m),u=arr(s.length,null),l=arr(s.length,null),i;for(i=0;i<s.length;i++)if(m[i]!=null&&sd[i]!=null){u[i]=m[i]+k*sd[i];l[i]=m[i]-k*sd[i];}return{upper:u,middle:m,lower:l};}
function roc(s,p){var o=arr(s.length,null),i,b;for(i=p;i<s.length;i++){b=s[i-p];if(b!=null&&b!==0&&s[i]!=null)o[i]=(s[i]-b)/b*100;}return o;}
function stochastic(c,kp,ks,dp){var raw=arr(c.length,null),i,j,hh,ll;for(i=kp-1;i<c.length;i++){hh=-Infinity;ll=Infinity;for(j=i-kp+1;j<=i;j++){hh=Math.max(hh,c[j].high);ll=Math.min(ll,c[j].low);}raw[i]=hh===ll?50:(c[i].close-ll)/(hh-ll)*100;}var k=ks>1?sma(raw,ks):raw,d=sma(k,dp);return{k:k,d:d};}
function stochRsi(s,rp,sp,ks,dp){var r=rsi(s,rp),raw=arr(s.length,null),i,j,hh,ll;for(i=0;i<s.length;i++){if(i<sp-1||r[i]==null)continue;hh=-Infinity;ll=Infinity;for(j=i-sp+1;j<=i;j++){if(r[j]==null){hh=null;break;}hh=Math.max(hh,r[j]);ll=Math.min(ll,r[j]);}if(hh!=null)raw[i]=hh===ll?50:(r[i]-ll)/(hh-ll)*100;}var k=ks>1?sma(raw,ks):raw,d=sma(k,dp);return{k:k,d:d};}
function cci(c,p,constant){var tp=[],i,j,m,dev,sum,o=arr(c.length,null);for(i=0;i<c.length;i++)tp.push((c[i].high+c[i].low+c[i].close)/3);m=sma(tp,p);for(i=p-1;i<c.length;i++){if(m[i]==null)continue;sum=0;for(j=i-p+1;j<=i;j++)sum+=Math.abs(tp[j]-m[i]);dev=sum/p;o[i]=dev===0?0:(tp[i]-m[i])/(constant*dev);}return o;}
function obv(c){var o=arr(c.length,null),v=0,i;if(!c.length)return o;o[0]=0;for(i=1;i<c.length;i++){if(c[i].close>c[i-1].close)v+=c[i].volume||0;else if(c[i].close<c[i-1].close)v-=c[i].volume||0;o[i]=v;}return o;}
function mfi(c,p){var tp=[],mf=[],pos=[],neg=[],o=arr(c.length,null),i,j,ps,ns;for(i=0;i<c.length;i++){tp[i]=(c[i].high+c[i].low+c[i].close)/3;mf[i]=tp[i]*(c[i].volume||0);pos[i]=i&&tp[i]>tp[i-1]?mf[i]:0;neg[i]=i&&tp[i]<tp[i-1]?mf[i]:0;}for(i=p;i<c.length;i++){ps=0;ns=0;for(j=i-p+1;j<=i;j++){ps+=pos[j];ns+=neg[j];}o[i]=ns===0?100:100-(100/(1+ps/ns));}return o;}
function vwma(s,vol,p){var o=arr(s.length,null),i,j,sv,vv;for(i=p-1;i<s.length;i++){sv=0;vv=0;for(j=i-p+1;j<=i;j++){if(s[j]==null||vol[j]==null){vv=0;break;}sv+=s[j]*vol[j];vv+=vol[j];}if(vv>0)o[i]=sv/vv;}return o;}
function anchorKey(ts,anchor){var d=new Date(ts),a=String(anchor||'session').toLowerCase();if(a==='month')return d.getUTCFullYear()+'-'+d.getUTCMonth();if(a==='week'){var day=(d.getUTCDay()+6)%7,mid=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-day*86400000;return String(mid);}return d.getUTCFullYear()+'-'+d.getUTCMonth()+'-'+d.getUTCDate();}
function vwap(c,anchor){var o=arr(c.length,null),pv=0,v=0,key=null,i,tp,k;for(i=0;i<c.length;i++){k=anchorKey(c[i].time,anchor);if(k!==key){key=k;pv=0;v=0;}tp=(c[i].high+c[i].low+c[i].close)/3;pv+=tp*(c[i].volume||0);v+=(c[i].volume||0);if(v>0)o[i]=pv/v;}return o;}
function hma(s,p){var half=Math.max(1,Math.floor(p/2)),root=Math.max(1,Math.round(Math.sqrt(p))),a=wma(s,half),b=wma(s,p),d=arr(s.length,null),i;for(i=0;i<s.length;i++)if(a[i]!=null&&b[i]!=null)d[i]=2*a[i]-b[i];return wma(d,root);}
function williamsR(c,p){var o=arr(c.length,null),i,j,hh,ll;for(i=p-1;i<c.length;i++){hh=-Infinity;ll=Infinity;for(j=i-p+1;j<=i;j++){hh=Math.max(hh,c[j].high);ll=Math.min(ll,c[j].low);}o[i]=hh===ll?0:(hh-c[i].close)/(hh-ll)*-100;}return o;}
function adx(c,p){var n=c.length,tr=trueRange(c),plus=arr(n,0),minus=arr(n,0),i,up,dn;for(i=1;i<n;i++){up=c[i].high-c[i-1].high;dn=c[i-1].low-c[i].low;plus[i]=(up>dn&&up>0)?up:0;minus[i]=(dn>up&&dn>0)?dn:0;}var atrs=wilder(tr,p),ps=wilder(plus,p),ms=wilder(minus,p),pdi=arr(n,null),mdi=arr(n,null),dx=arr(n,null);for(i=0;i<n;i++)if(atrs[i]!=null&&atrs[i]!==0&&ps[i]!=null&&ms[i]!=null){pdi[i]=100*ps[i]/atrs[i];mdi[i]=100*ms[i]/atrs[i];var den=pdi[i]+mdi[i];dx[i]=den===0?0:100*Math.abs(pdi[i]-mdi[i])/den;}return{adx:wilder(dx,p),plus_di:pdi,minus_di:mdi};}
function psar(c,step,maxaf){var n=c.length,o=arr(n,null),dir=arr(n,null);if(n<2)return{value:o,direction:dir};var bull=c[1].close>=c[0].close,af=step,ep=bull?Math.max(c[0].high,c[1].high):Math.min(c[0].low,c[1].low),sar=bull?Math.min(c[0].low,c[1].low):Math.max(c[0].high,c[1].high),i,next;for(i=1;i<n;i++){next=sar+af*(ep-sar);if(bull){if(i>=2)next=Math.min(next,c[i-1].low,c[i-2].low);else next=Math.min(next,c[i-1].low);if(c[i].low<next){bull=false;next=ep;ep=c[i].low;af=step;}else if(c[i].high>ep){ep=c[i].high;af=Math.min(maxaf,af+step);}}else{if(i>=2)next=Math.max(next,c[i-1].high,c[i-2].high);else next=Math.max(next,c[i-1].high);if(c[i].high>next){bull=true;next=ep;ep=c[i].high;af=step;}else if(c[i].low<ep){ep=c[i].low;af=Math.min(maxaf,af+step);}}sar=next;o[i]=sar;dir[i]=bull?1:-1;}return{value:o,direction:dir};}
function supertrend(c,p,mult){var n=c.length,a=atr(c,p),upper=arr(n,null),lower=arr(n,null),st=arr(n,null),dir=arr(n,null),i,mid,bu,bl;for(i=0;i<n;i++){if(a[i]==null)continue;mid=(c[i].high+c[i].low)/2;bu=mid+mult*a[i];bl=mid-mult*a[i];if(i===0||upper[i-1]==null){upper[i]=bu;lower[i]=bl;}else{upper[i]=(bu<upper[i-1]||c[i-1].close>upper[i-1])?bu:upper[i-1];lower[i]=(bl>lower[i-1]||c[i-1].close<lower[i-1])?bl:lower[i-1];}if(i===0||st[i-1]==null){st[i]=upper[i];dir[i]=-1;}else if(st[i-1]===upper[i-1]){if(c[i].close<=upper[i]){st[i]=upper[i];dir[i]=-1;}else{st[i]=lower[i];dir[i]=1;}}else{if(c[i].close>=lower[i]){st[i]=lower[i];dir[i]=1;}else{st[i]=upper[i];dir[i]=-1;}}}return{value:st,direction:dir};}
function ichimoku(c,conv,base,spanb,disp){var n=c.length,conversion=arr(n,null),baseline=arr(n,null),sa=arr(n,null),sb=arr(n,null),lag=arr(n,null),i,j,hh,ll;function midAt(idx,p){if(idx<p-1)return null;hh=-Infinity;ll=Infinity;for(j=idx-p+1;j<=idx;j++){hh=Math.max(hh,c[j].high);ll=Math.min(ll,c[j].low);}return(hh+ll)/2;}for(i=0;i<n;i++){conversion[i]=midAt(i,conv);baseline[i]=midAt(i,base);if(conversion[i]!=null&&baseline[i]!=null&&i+disp<n)sa[i+disp]=(conversion[i]+baseline[i])/2;var m=midAt(i,spanb);if(m!=null&&i+disp<n)sb[i+disp]=m;if(i-disp>=0)lag[i-disp]=c[i].close;}return{conversion:conversion,base:baseline,span_a:sa,span_b:sb,lagging:lag};}
function operation(def){if(def&&def.engine&&def.engine.ir)return'ir';return String(def&&def.engine&&def.engine.operation||def&&def.id||'').toLowerCase();}
function periods(def,params){var p=params||{},op=operation(def);function g(k,d){var x=+p[k];return isFinite(x)&&x>0?Math.round(x):d;}if(op==='macd')return g('slow_period',26)+g('signal_period',9)+5;if(op==='ichimoku_cloud')return g('span_b_period',52)+g('displacement',26)+5;if(op==='stochastic_rsi')return g('rsi_period',14)+g('stoch_period',14)+g('d_period',3)+8;if(op==='adx')return g('period',14)*2+5;if(op==='supertrend')return g('atr_period',10)+5;if(op==='parabolic_sar'||op==='obv'||op==='vwap')return 5;var keys=['period','k_period','span_b_period'];for(var i=0;i<keys.length;i++)if(p[keys[i]]!=null)return g(keys[i],20)+5;if(def.inputs){for(var k in def.inputs)if(def.inputs[k]&&def.inputs[k].type==='integer'&&/period/i.test(k))return g(k,def.inputs[k].default||20)+5;}return 10;}
function resolveParams(def,params){params=params||{};var out={},k,s,v;for(k in def.inputs){s=def.inputs[k]||{};if(s.type==='series'){v=String(params[k]!=null?params[k]:s.default||k).toLowerCase();if(Array.isArray(s.allowed)&&s.allowed.indexOf(v)<0)v=String(s.default||k);out[k]=v;continue;}v=params[k]!=null?params[k]:s.default;if(s.type==='integer'){v=Math.round(+v);if(!isFinite(v))v=s.default;if(s.min!=null)v=Math.max(s.min,v);if(s.max!=null)v=Math.min(s.max,v);}else if(s.type==='number'){v=+v;if(!isFinite(v))v=s.default;if(s.min!=null)v=Math.max(s.min,v);if(s.max!=null)v=Math.min(s.max,v);}else if(s.type==='enum'){v=String(v);if(Array.isArray(s.allowed)&&s.allowed.indexOf(v)<0)v=s.default;}out[k]=v;}return out;}
function computeNative(def,c,p,resolver,context){if(def&&def.engine&&def.engine.ir)return IR.execute(def,c,p,computeNative,source,resolver,context);var op=operation(def),s,vol;
  if(op==='liquidity_heatmap'){var ext=new Error('Liquidity HeatMap est calcule par Liquidity Engine');ext.code='EXTERNAL_ENGINE_REQUIRED';throw ext;}
  if(['mfi','obv','vwap','vwma'].indexOf(op)>=0&&!hasRealVolume(c)){var er=new Error((def.id||op)+' exige des donnees de volume reelles');er.code='VOLUME_REQUIRED';throw er;}
  switch(op){
    case'sma':s=source(c,p.source);return{value:sma(s,p.period)};
    case'ema':s=source(c,p.source);return{value:ema(s,p.period)};
    case'rsi':s=source(c,p.source);return{value:rsi(s,p.period)};
    case'macd':s=source(c,p.source);return macd(s,p.fast_period,p.slow_period,p.signal_period);
    case'atr':return{value:atr(c,p.period)};
    case'bollinger_bands':s=source(c,p.source);return bollinger(s,p.period,p.stddev);
    case'roc':s=source(c,p.source);return{value:roc(s,p.period)};
    case'stochastic':return stochastic(c,p.k_period,p.k_smoothing,p.d_period);
    case'stochastic_rsi':s=source(c,p.source);return stochRsi(s,p.rsi_period,p.stoch_period,p.k_smoothing,p.d_period);
    case'cci':return{value:cci(c,p.period,p.constant)};
    case'obv':return{value:obv(c)};
    case'mfi':return{value:mfi(c,p.period)};
    case'vwap':return{value:vwap(c,p.anchor)};
    case'vwma':s=source(c,p.source);vol=source(c,p.volume||'volume');return{value:vwma(s,vol,p.period)};
    case'hma':s=source(c,p.source);return{value:hma(s,p.period)};
    case'williams_r':return{value:williamsR(c,p.period)};
    case'adx':return adx(c,p.period);
    case'parabolic_sar':return psar(c,p.step,p.maximum);
    case'supertrend':return supertrend(c,p.atr_period,p.multiplier);
    case'ichimoku_cloud':return ichimoku(c,p.conversion_period,p.base_period,p.span_b_period,p.displacement);
    default:throw new Error('Operation native inconnue: '+op);
  }
}
function latestMap(values){var o={},k;for(k in values)o[k]=lastFinite(values[k]||[]);return o;}
function compute(def,candles,params,registry,context){var c=context&&context.normalized?candles:normalizeCandles(candles),p=resolveParams(def,params),need=periods(def,p),values;context=context||{normalized:true,depth:0,stack:Object.create(null),memo:Object.create(null),safeNative:registry&&registry.safeNative||null};if(!context.safeNative)context.safeNative={adx:1,atr:1,bollinger_bands:1,cci:1,ema:1,hma:1,ichimoku_cloud:1,liquidity_heatmap:1,macd:1,mfi:1,obv:1,parabolic_sar:1,roc:1,rsi:1,sma:1,stochastic:1,stochastic_rsi:1,supertrend:1,vwap:1,vwma:1,williams_r:1};if(!c.length)return{id:def.id,name:def.name,operation:operation(def),state:'INVALID',reason:'NO_DATA',requiredCandles:need,candleCount:0,params:p,values:{},latest:{},times:[],display:clone(def.display||{}),outputs:clone(def.outputs||{})};if(context.depth>16){var de=new Error('INDICATOR_DEPENDENCY_DEPTH');de.code='INDICATOR_DEPENDENCY_DEPTH';throw de;}if(context.stack[def.id]){var ce=new Error('INDICATOR_DEPENDENCY_CYCLE:'+def.id);ce.code='INDICATOR_DEPENDENCY_CYCLE';throw ce;}context.stack[def.id]=1;function resolver(id,cc,pp,ctx){var key=id+'|'+hashObj(pp);if(ctx.memo[key])return ctx.memo[key];var child=registry&&registry.get(id);if(!child)throw new Error('INDICATOR_DEPENDENCY_MISSING:'+id);var childCtx={normalized:true,depth:ctx.depth+1,stack:ctx.stack,memo:ctx.memo,safeNative:ctx.safeNative};var rr=compute(child,cc,pp,registry,childCtx);ctx.memo[key]=rr.values;return rr.values;}try{values=computeNative(def,c,p,resolver,context);}finally{delete context.stack[def.id];}return{id:def.id,name:def.name,operation:operation(def),state:c.length>=need?'READY':'WARMING',requiredCandles:need,candleCount:c.length,params:p,values:values,latest:latestMap(values),times:c.map(function(x){return x.time;}),lastTimestamp:c[c.length-1].time,display:clone(def.display||{}),outputs:clone(def.outputs||{})};}
function computeBatch(registry,candles,requests){if(!Array.isArray(requests))throw new Error('requests doit etre un tableau');if(requests.length>32){var er=new Error('Maximum 32 indicateurs simultanes');er.code='MAX_INDICATORS';throw er;}var c=normalizeCandles(candles),ctx={normalized:true,depth:0,stack:Object.create(null),memo:Object.create(null),safeNative:registry.safeNative||{}},out=[],i,r,d;for(i=0;i<requests.length;i++){r=requests[i]||{};try{d=registry.get(r.id);if(!d)throw new Error('Indicateur inconnu: '+r.id);out.push({ok:true,result:compute(d,c,r.params||{},registry,ctx)});}catch(e){out.push({ok:false,id:r.id,error:e.message,code:e.code||'COMPUTE_ERROR'});}}return out;}
function Runtime(registry,opt){this.registry=registry;this.sessions=Object.create(null);this.maxCandles=Math.max(100,Math.min((opt&&opt.maxCandles)||600,1200));this.maxSessions=Math.max(2,Math.min((opt&&opt.maxSessions)||16,50));}
Runtime.prototype._touch=function(k){var s=this.sessions[k];if(s)s.touched=Date.now();return s;};
Runtime.prototype._evict=function(){var self=this,keys=Object.keys(this.sessions);if(keys.length<=this.maxSessions)return;keys.sort(function(a,b){return self.sessions[a].touched-self.sessions[b].touched;});while(keys.length>this.maxSessions)delete this.sessions[keys.shift()];};
Runtime.prototype.update=function(key,candles,requests){key=String(key||'default').slice(0,180);var incoming=normalizeCandles(candles),s=this.sessions[key]||{candles:[],snapshot:null,touched:0};if(incoming.length===1&&s.candles.length&&incoming[0].time>=s.candles[s.candles.length-1].time){var last=s.candles[s.candles.length-1];if(incoming[0].time===last.time)s.candles[s.candles.length-1]=incoming[0];else s.candles.push(incoming[0]);}else s.candles=incoming;if(s.candles.length>this.maxCandles)s.candles=s.candles.slice(-this.maxCandles);s.snapshot={key:key,updatedAt:new Date().toISOString(),candleCount:s.candles.length,lastTimestamp:s.candles.length?s.candles[s.candles.length-1].time:null,results:computeBatch(this.registry,s.candles,requests||[])};s.touched=Date.now();this.sessions[key]=s;this._evict();return clone(s.snapshot);};
Runtime.prototype.get=function(key){var s=this._touch(String(key||'default').slice(0,180));return s&&s.snapshot?clone(s.snapshot):null;};
Runtime.prototype.clear=function(key){if(key==null)this.sessions=Object.create(null);else delete this.sessions[String(key).slice(0,180)];};
module.exports={normalizeCandles:normalizeCandles,resolveParams:resolveParams,compute:compute,computeBatch:computeBatch,Runtime:Runtime,hashObj:hashObj,_math:{sma:sma,ema:ema,wma:wma,rsi:rsi,atr:atr,wilder:wilder}};
