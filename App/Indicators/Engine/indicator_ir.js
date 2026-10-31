'use strict';
/* IA-TB Indicator IR v1.0 - declarative, deterministic, no eval/network/fs. */
var MAX_STEPS=64,MAX_NODES=128,PRIMITIVES={add:1,sub:1,mul:1,div:1,abs:1,min:1,max:1,scale:1,shift:1,source:1,constant:1};
function arr(n,v){var a=new Array(n),i;for(i=0;i<n;i++)a[i]=v;return a;}
function scalarSeries(n,v){return arr(n,+v);}
function finite(v){v=+v;return isFinite(v)?v:null;}
function binary(a,b,fn){var n=Math.max(a.length,b.length),o=arr(n,null),i,x,y;for(i=0;i<n;i++){x=finite(a[i]);y=finite(b[i]);if(x!=null&&y!=null)o[i]=fn(x,y);}return o;}
function unary(a,fn){var o=arr(a.length,null),i,x;for(i=0;i<a.length;i++){x=finite(a[i]);if(x!=null)o[i]=fn(x);}return o;}
function shift(a,n){n=Math.max(0,Math.round(+n||0));var o=arr(a.length,null),i;for(i=n;i<a.length;i++)o[i]=a[i-n];return o;}
function validate(def,safeNative,known,allowUnknown){var e=[],ir=def&&def.engine&&def.engine.ir;if(!ir||ir.version!=='1.0'||!Array.isArray(ir.steps)||!ir.outputs)return{ok:false,errors:['engine.ir v1.0 requis']};if(ir.steps.length>MAX_STEPS)e.push('IR: maximum '+MAX_STEPS+' etapes');var ids=Object.create(null);ir.steps.forEach(function(x,i){if(!x||!/^[_a-z][_a-z0-9]{0,63}$/i.test(String(x.id||'')))e.push('IR step '+i+': id invalide');if(ids[x.id])e.push('IR step '+i+': id duplique');ids[x.id]=1;var op=String(x.op||'').toLowerCase();if(!safeNative[op]&&!PRIMITIVES[op]&&!allowUnknown&&!(known&&known[op]))e.push('IR step '+i+': operation interdite '+op);});Object.keys(ir.outputs||{}).forEach(function(k){if(!ids[ir.outputs[k]])e.push('IR output '+k+': reference inconnue');});return{ok:!e.length,errors:e};}
function execute(def,c,p,native,source,resolver,context){var ir=def.engine.ir,ctx=Object.create(null),nodes=0;
 function ref(v){if(Array.isArray(v))return v;if(typeof v==='number')return scalarSeries(c.length,v);if(typeof v==='string'){if(ctx[v])return ctx[v];if(v.indexOf('$param.')===0)return scalarSeries(c.length,p[v.slice(7)]);if(v.indexOf('$source.')===0)return source(c,v.slice(8));}throw new Error('IR_REFERENCE_INVALID:'+v);}
 ir.steps.forEach(function(st){if(++nodes>MAX_NODES)throw new Error('IR_NODE_LIMIT');var op=String(st.op).toLowerCase(),a=st.args||{},x,y,tmp;
   if(op==='source')ctx[st.id]=source(c,String(a.name||'close'));
   else if(op==='constant')ctx[st.id]=scalarSeries(c.length,+a.value);
   else if(op==='add'||op==='sub'||op==='mul'||op==='div'||op==='min'||op==='max'){x=ref(a.a);y=ref(a.b);ctx[st.id]=binary(x,y,op==='add'?function(q,w){return q+w}:op==='sub'?function(q,w){return q-w}:op==='mul'?function(q,w){return q*w}:op==='div'?function(q,w){return w===0?null:q/w}:op==='min'?Math.min:Math.max);}
   else if(op==='abs')ctx[st.id]=unary(ref(a.input),Math.abs);
   else if(op==='scale')ctx[st.id]=unary(ref(a.input),function(q){return q*(+a.factor||0)});
   else if(op==='shift')ctx[st.id]=shift(ref(a.input),a.periods);
   else {var child={id:def.id,name:def.name,inputs:def.inputs||{},outputs:def.outputs||{},engine:{operation:op}},pp={};Object.keys(a).forEach(function(k){var v=a[k];if(typeof v==='string'&&v.indexOf('$param.')===0)pp[k]=p[v.slice(7)];else pp[k]=v;});tmp=(resolver&&context&&!context.safeNative[op])?resolver(op,c,pp,context):native(child,c,pp,resolver,context);var pick=String(st.output||Object.keys(tmp)[0]);if(!tmp[pick])throw new Error('IR_OUTPUT_MISSING:'+st.id+'.'+pick);ctx[st.id]=tmp[pick];}
 });
 var out={};Object.keys(ir.outputs).forEach(function(k){out[k]=ctx[ir.outputs[k]];});return out;
}
module.exports={validate:validate,execute:execute,MAX_STEPS:MAX_STEPS,MAX_NODES:MAX_NODES,PRIMITIVES:PRIMITIVES};
