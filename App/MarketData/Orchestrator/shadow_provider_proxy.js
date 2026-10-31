'use strict';

var crypto=require('crypto');

function canonical(v,seen){
 if(v===null)return null;
 var t=typeof v;
 if(t==='undefined')return{__type:'undefined'};
 if(t==='number'||t==='string'||t==='boolean')return v;
 if(t==='bigint')return{__type:'bigint',value:String(v)};
 if(t==='function')return{__type:'function'};
 if(Buffer.isBuffer(v))return{__type:'buffer',value:v.toString('base64')};
 if(v instanceof Date)return{__type:'date',value:v.toISOString()};
 seen=seen||[];
 if(seen.indexOf(v)>=0)return{__type:'circular'};
 seen.push(v);
 var out;
 if(Array.isArray(v))out=v.map(function(x){return canonical(x,seen);});
 else{
  out={};
  Object.keys(v).sort().forEach(function(k){out[k]=canonical(v[k],seen);});
 }
 seen.pop();return out;
}
function signature(args){
 var filtered=(args||[]).filter(function(x){return typeof x!=='function';});
 var raw;
 try{raw=JSON.stringify(canonical(filtered,[]));}catch(e){raw=String(filtered);}
 return crypto.createHash('sha256').update(raw,'utf8').digest('hex');
}
function wrap(provider,opt){
 opt=opt||{};if(!provider||!opt.orchestrator)return provider;
 var id=String(opt.provider||provider.id||'UNKNOWN').toUpperCase(),map=opt.methods||{},orchestrator=opt.orchestrator;
 return new Proxy(provider,{
  get:function(target,prop){
   var value=target[prop];if(typeof value!=='function'||!map[prop])return value;
   return function(){
    var self=this,args=Array.prototype.slice.call(arguments),cbIndex=-1;
    for(var i=args.length-1;i>=0;i--){if(typeof args[i]==='function'){cbIndex=i;break;}}
    var spec=typeof map[prop]==='function'?map[prop](args):map[prop],dataset=String(spec&&spec.dataset||prop).toUpperCase(),cost=spec&&spec.cost||1;
    var ev=orchestrator.observeStart({provider:id,dataset:dataset,signature:signature(args),cost:cost}),exec=orchestrator.execution||{},broker=orchestrator.broker;
    /* Trust boundary: raw provider responses are never served from cache here.
       Cache admission belongs after Data Firewall validation in collectors/services. */
    if(cbIndex>=0&&exec.dedup&&ev.broker.inflightDuplicate){
     var original=args[cbIndex];
     broker.join(ev.broker.key,function(resultArgs){
      var err=resultArgs&&resultArgs[0]||null;orchestrator.observeEnd(ev,err);original.apply(self,resultArgs||[new Error('DEDUP_EMPTY_RESULT')]);
     });
     return;
    }
    if(cbIndex>=0){
     var cb=args[cbIndex];
     args[cbIndex]=function(err){
      var cbArgs=Array.prototype.slice.call(arguments);
      orchestrator.observeEnd(ev,err);
      if(exec.dedup)broker.resolve(ev.broker.key,cbArgs);
      return cb.apply(this,cbArgs);
     };
    }
    try{
     var out=value.apply(target,args);
     if(cbIndex<0)orchestrator.observeEnd(ev,null);
     return out;
    }catch(e){
     if(cbIndex>=0&&exec.dedup)broker.resolve(ev.broker.key,[e]);
     orchestrator.observeEnd(ev,e);throw e;
    }
   };
  }
 });
}
wrap.signature=signature;
module.exports=wrap;
