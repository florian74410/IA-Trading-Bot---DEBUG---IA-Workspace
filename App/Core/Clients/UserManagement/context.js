'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const local=new AsyncLocalStorage();
function current(){return local.getStore()||null;}
function run(value,fn){return local.run(Object.freeze(value),fn);}
function scopedSettings(store,cipher){
 const scope=s=>{const c=current();return c?'user:'+c.clientId+':'+s:s;};
 return new Proxy(store,{get(target,k){
  if(k==='get')return(s,key,def)=>{const raw=target.get(scope(s),key,null);if(raw==null)return def;return current()?JSON.parse(cipher.open(raw)):raw;};
  if(k==='set')return(s,key,v)=>target.set(scope(s),key,current()?cipher.seal(JSON.stringify(v)):v);
  if(k==='listKeys')return s=>target.listKeys(scope(s));
  if(k==='getRaw'||k==='setRaw')throw Error('SCOPED_RAW_ACCESS_FORBIDDEN');
  const v=Reflect.get(target,k);return typeof v==='function'?v.bind(target):v;
 }});
}
module.exports={current,run,scopedSettings};
