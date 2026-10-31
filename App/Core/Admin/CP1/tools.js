'use strict';
/* IA-TB CP/1 Console - Layer 3/4: read-only Common Tools. */
function arr(x){if(Array.isArray(x))return x;if(x&&Array.isArray(x.items))return x.items;if(x&&Array.isArray(x.objects))return x.objects;if(x&&Array.isArray(x.services))return x.services;return[x];}
function pathGet(o,p){if(!p)return o;var ks=String(p).split('.'),v=o;for(var i=0;i<ks.length;i++){if(v==null)return undefined;v=v[ks[i]];}return v;}
function num(v,d,min,max){v=Math.round(Number(v));if(!isFinite(v))v=d;return Math.max(min,Math.min(max,v));}
function run(name,args,input){name=String(name||'').toLowerCase();args=args||{};
 if(name==='parse')return pathGet(input,String(args.path||args.key||''));
 if(name==='grep'){var p=String(args.pattern||args.q||'').toLowerCase();if(!p)throw new Error('CP1_GREP_PATTERN_REQUIRED');return arr(input).filter(function(x){var s;try{s=typeof x==='string'?x:JSON.stringify(x);}catch(e){s=String(x);}return s.toLowerCase().indexOf(p)>=0;});}
 if(name==='filter'){var key=String(args.key||''),expected=args.value;if(!key){var keys=Object.keys(args);if(keys.length===1){key=keys[0];expected=args[key];}}if(!key)throw new Error('CP1_FILTER_KEY_REQUIRED');return arr(input).filter(function(x){var v=pathGet(x,key);return expected===undefined?!!v:String(v)===String(expected);});}
 if(name==='sort'||name==='tri'){var key=String(args.key||''),desc=String(args.order||'asc').toLowerCase()==='desc';return arr(input).slice().sort(function(a,b){var av=key?pathGet(a,key):a,bv=key?pathGet(b,key):b;if(av===bv)return 0;if(av==null)return 1;if(bv==null)return-1;return(av>bv?1:-1)*(desc?-1:1);});}
 if(name==='head')return arr(input).slice(0,num(args.n||args.limit,10,1,500));
 if(name==='tail'){var a=arr(input),n=num(args.n||args.limit,10,1,500);return a.slice(Math.max(0,a.length-n));}
 if(name==='count'||name==='wc'){if(typeof input==='string')return{name:name,count:input.split(/\r?\n/).filter(Boolean).length,chars:input.length};var a2=arr(input);return{name:name,count:a2.length};}
 if(name==='inspect'){var typ=Array.isArray(input)?'array':(input===null?'null':typeof input),keys=input&&typeof input==='object'&&!Array.isArray(input)?Object.keys(input).slice(0,128):[];return{type:typ,count:Array.isArray(input)?input.length:undefined,keys:keys,sample:Array.isArray(input)?input.slice(0,3):input};}
 throw new Error('CP1_COMMON_TOOL_UNKNOWN:'+name);
}
module.exports={run:run,pathGet:pathGet};
