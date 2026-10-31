'use strict';
const Core=require('./strategy_v2_core'),Stats=require('./strategy_stats_v2'),Settings=require('../../Core/Settings/sqlite_settings_store'),evaluate=require('./evaluate_strategy');
function initialState(){return {definitions:[],state:{mode:'RUNNING',startedAt:Date.now(),lastEvaluation:null,lastSignal:null},stats:{schema:1,evaluations:0,signals:0,holds:0,errors:0,last_evaluation_at:null,last_signal_at:null,by_strategy:{}},events:[]};}
function dispatch({root}){
 const storage=new Settings(root);
 return function(principal,action,args){
  const scope='strategy_owner:'+principal.clientId,key='state';
  const data=storage.get(scope,key,initialState());
  const persist=()=>storage.set(scope,key,data),stats=Object.create(Stats.prototype);stats.state=data.stats;stats.save=()=>{data.stats=stats.state;persist();};
  const registry={items:data.definitions,select(opt){const ids=opt.strategy_ids;return this.items.filter(s=>s.enabled!==false&&(!ids||ids.includes(s.strategy_id))&&s.symbol===opt.symbol&&s.timeframe===opt.timeframe);},snapshot(){return {count:this.items.length,items:this.items.map(s=>({strategy_id:s.strategy_id,name:s.name,version:s.version,symbol:s.symbol,timeframe:s.timeframe,enabled:s.enabled!==false,weight:s.weight??1,file:null,source_format:'V2'})),errors:[]};}};
  const health=()=>({ok:true,service:'IA-TB Strategy Engine v2',mode:data.state.mode,execution:'INTENTION_ONLY',strategies:data.definitions.length,lastEvaluation:data.state.lastEvaluation,lastSignal:data.state.lastSignal});
  if(action==='strategy.health')return health();
  if(action==='strategy.capabilities')return {ok:true,execution:'INTENTION_ONLY',ownerScoped:true};
  if(action==='strategy.catalog'||action==='strategy.reload')return {ok:true,catalog:registry.snapshot(),registry:registry.snapshot()};
  if(action==='strategy.stats')return {ok:true,stats:stats.snapshot()};
  if(action==='strategy.state')return {ok:true,health:health(),registry:registry.snapshot(),stats:stats.snapshot()};
  if(action==='strategy.validate')return Core.validate(args.strategy||args);
  if(action==='strategy.definition.save'){const v=Core.validate(args.strategy);if(!v.ok)throw Error('STRATEGY_INVALID');const s=v.strategy,index=data.definitions.findIndex(x=>x.strategy_id===s.strategy_id);if(index<0){if(data.definitions.length>=64)throw Error('STRATEGY_LIMIT');data.definitions.push(s);}else data.definitions[index]=s;persist();return {ok:true,strategy:s};}
  if(action==='strategy.definition.delete'){const index=data.definitions.findIndex(x=>x.strategy_id===args.strategy_id);if(index<0)throw Error('STRATEGY_NOT_FOUND');data.definitions.splice(index,1);persist();return {ok:true};}
  if(action==='strategy.pause'||action==='strategy.resume'){data.state.mode=action==='strategy.pause'?'PAUSED':'RUNNING';persist();return {ok:true,mode:data.state.mode};}
  if(action==='strategy.reset_stats')return {ok:true,stats:stats.reset()};
  if(action==='strategy.evaluate'||action==='strategy.dry_run'){
   // No fallback to browser-supplied inline strategies; only this owner's saved definitions.
   const result=evaluate({registry,stats,state:data.state,publish(type,value){data.events.push({type,data:value,at:Date.now()});data.events=data.events.slice(-100);}}, {...args,strategies:undefined});
   result.dry_run=action==='strategy.dry_run';if(result.dry_run)result.execution='NEVER_EXECUTE';persist();return result;
  }
  throw Error('OWNER_OPERATION_DENIED');
 };
}
module.exports={dispatch,initialState};
