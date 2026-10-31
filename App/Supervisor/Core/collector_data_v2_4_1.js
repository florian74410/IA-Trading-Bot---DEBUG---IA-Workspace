'use strict';
// Shared normalized collector products only. No global portfolios, credentials,
// operator settings, mutations, arbitrary URL or filesystem query.
const Registry=require('../../Core/Communication/protocol_registry_v2');
const {redact}=require('../../Core/Clients/UserManagement/public_metadata');
const ACTIONS=Object.freeze({
 marketdata:['candles','ticker','symbols','providers','catalog','asset.price','asset.resolve','registry.asset','registry.search','registry.list','financial.capabilities','financial.snapshot','financial.history','financial.ai_context','financial.storage','financial.status','derivatives.open_interest','derivatives.open_interest.history','liquidations.recent','liquidations.stats','liquidations.streams','microstructure.capabilities','microstructure.snapshot','microstructure.history','microstructure.storage','dex.liquidity.capabilities','dex.liquidity.snapshot','dex.liquidity.history'],
 fundamental:['summary','news.search','news.get','events.search','event.get','event.evidence','sources.search','source.get','feeds.search','providers.status','fedwatch.get','fedwatch.history','calendar.upcoming','calendar.fed','calendar.cme','calendar.cme.expirations','synthesis.history','context','timeline.get','timeline.context','translation.get'],
 liquidity:['context','zones']
});
class CollectorData{
 constructor(client,root){this.client=client;this.registry=new Registry(root);}
 catalog(){return {schema:'supervisor.collector-catalog/1.0',transport:'CP/1 Router only',readOnly:true,items:Object.entries(ACTIONS).flatMap(([target,names])=>names.map(n=>{const action=target+'.'+n,c=this.registry.command(target,action);return {target,action,registered:!!c,arguments:c?c.arguments:null,description:c?c.description:''};}))};}
 async read(input={}){
  const {target,action}=input,args=input.arguments||{};
  if(typeof target!=='string'||typeof action!=='string'||!Object.hasOwn(ACTIONS,target)||!ACTIONS[target].includes(String(action).slice(target.length+1))||!String(action).startsWith(target+'.'))throw Error('COLLECTOR_READ_FORBIDDEN');
  if(!args||typeof args!=='object'||Array.isArray(args)||args.force!=null&&args.force!==false||args.refresh!=null&&args.refresh!==false)throw Error('COLLECTOR_READ_ONLY');
  const error=this.registry.validateActionArgs(target,action,args);if(error)throw Error(error);
  if(JSON.stringify(args).length>16384)throw Error('COLLECTOR_ARGUMENTS_TOO_LARGE');
  for(const [key,max] of [['limit',200],['perPage',100],['depth',100],['days',90]])if(args[key]!=null&&(!Number.isSafeInteger(args[key])||args[key]<1||args[key]>max))throw Error('COLLECTOR_BOUND_INVALID');
  const data=await this.client.request(target,action,{...args},'analysis',8000);
  // Never pass provider diagnostic credentials or source endpoints to a user/LLM.
  return {schema:'supervisor.collector-read/1.0',target,action,retrievedAt:new Date().toISOString(),transport:'CP/1 Router only',data:redact(data)};
 }
 async collect(input={}){
  const symbol=String(input.symbol||'BTCUSD').toUpperCase(),timeframe=String(input.timeframe||'1h'),source=String(input.source||'AUTO');
  const specs=[
   ['candles','marketdata','candles',{symbol,timeframe,limit:100,force:false,...(source==='AUTO'?{}:{source})}],
   ['financial','marketdata','financial.ai_context',{scope:'ALL'}],
   ['microstructure','marketdata','microstructure.snapshot',{symbol,source,depth:20,force:false}],
   ['openInterest','marketdata','derivatives.open_interest',{symbol}],
   ['dexLiquidity','marketdata','dex.liquidity.snapshot',{symbol,force:false}],
   ['liquidations','marketdata','liquidations.stats',{symbol,windowMs:900000}],
   ['news','fundamental','news.search',{limit:12}],
   ['events','fundamental','events.search',{limit:30}],
   ['calendar','fundamental','calendar.upcoming',{days:14,limit:80}],
   ['fedwatch','fundamental','fedwatch.get',{}],
   ['syntheses','fundamental','synthesis.history',{limit:5}]
  ];
  const results=await Promise.all(specs.map(async([name,target,suffix,args])=>{try{const result=await this.read({target,action:target+'.'+suffix,arguments:args}),data=result.data;return {name,ok:!!data&&data.ok!==false,result,error:null};}catch(_){return {name,ok:false,result:null,error:'COLLECTOR_UNAVAILABLE'};}}));
  return {schema:'supervisor.collector-context/1.0',symbol,timeframe,generatedAt:new Date().toISOString(),transport:'CP/1 Router only',readOnly:true,degraded:results.some(r=>!r.ok),availability:Object.fromEntries(results.map(r=>[r.name,r.ok])),datasets:Object.fromEntries(results.map(r=>[r.name,r.result])),warnings:results.filter(r=>!r.ok).map(r=>r.name+':'+(r.error||'SOURCE_DEGRADED'))};
 }
}
module.exports={CollectorData,ACTIONS};
