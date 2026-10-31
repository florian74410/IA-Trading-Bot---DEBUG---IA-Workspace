'use strict';
// Reuse the canonical Mosaic validator; only persistence/ownership changes.
const Context=require('./context');
function scopedMosaics(base,store){
 const key='definitions',scope='private_mosaics';
 function records(){const value=store.get(scope,key,[]);if(!Array.isArray(value))throw Error('MOSAIC_STORAGE_INVALID');return value;}
 const own={
  sourceCatalog:()=>base.sourceCatalog(),sanitizeDefinition:x=>base.sanitizeDefinition(x),filenameFor:x=>base.filenameFor(x),
  list:()=>records(),
  getByModuleId:id=>records().find(x=>x.moduleId===id)||null,
  moduleCatalog:()=>records().map(x=>({id:x.moduleId,label:'▦ '+x.definition.title,description:x.definition.description||'Mosaïque personnalisée',custom:true,filename:x.filename})),
  runtime:()=>({strategyMetrics:{},metricsSource:'PORTFOLIO_CP1'}),
  write(input){if(Context.current().role==='GUEST')throw Error('FORBIDDEN');const definition=base.sanitizeDefinition(input),moduleId='moz:'+definition.id,item={filename:base.filenameFor(definition),moduleId,definition,mtimeMs:Date.now()},all=records(),index=all.findIndex(x=>x.moduleId===moduleId);if(index<0){if(all.length>=64)throw Error('MOSAIC_LIMIT');all.push(item);}else all[index]=item;store.set(scope,key,all);return item;},
  remove(moduleId){if(Context.current().role==='GUEST')throw Error('FORBIDDEN');const all=records(),index=all.findIndex(x=>x.moduleId===moduleId);if(index<0)throw Error('MOSAIC_NOT_FOUND');const [item]=all.splice(index,1);store.set(scope,key,all);return {ok:true,removed:moduleId,filename:item.filename};}
 };
 return new Proxy(base,{get(target,name){const owner=Context.current()?own:target,value=owner[name];return typeof value==='function'?value.bind(owner):value;}});
}
module.exports={scopedMosaics};
