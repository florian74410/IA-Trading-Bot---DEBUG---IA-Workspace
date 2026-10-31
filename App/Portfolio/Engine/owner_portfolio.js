'use strict';
const Store=require('./portfolio_store'),PE=require('./portfolio_engine');
function dispatch({root,dbPath}){return function(principal,action,args){
 const store=new Store(root,{dbPath,clientId:principal.clientId});
 try{
  let settings=store.getSetting('portfolio.settings',{snapshotRefreshSec:300,pnlRefreshSec:3,exchangeSyncSec:30,equityChangeTriggerPct:1,baseCurrency:'EUR',snapshotRetention:'AUTO'});
  const engine=new PE.PortfolioEngine(store,{settings:()=>settings});
  if(action==='portfolio.health')return {ok:true,ownerScoped:true,storage:{ready:true},execution:'INTENTION_ONLY'};
  if(action==='portfolio.settings.get')return {settings};
  if(action==='portfolio.settings.set'){const patch=args.settings||args;if(Object.keys(patch).some(k=>!Object.hasOwn(settings,k)))throw Error('PORTFOLIO_SETTINGS_INVALID');const next={...settings,...patch};for(const key of ['snapshotRefreshSec','pnlRefreshSec','exchangeSyncSec','equityChangeTriggerPct'])if(!Number.isFinite(next[key])||next[key]<0||next[key]>86400)throw Error('PORTFOLIO_SETTINGS_INVALID');if(!['EUR','USD'].includes(next.baseCurrency)||next.snapshotRetention!=='AUTO')throw Error('PORTFOLIO_SETTINGS_INVALID');settings=next;store.setSetting('portfolio.settings',settings);return {settings};}
  if(action==='portfolio.overview'){const s=engine.state();return {ok:true,baseCurrency:settings.baseCurrency,updatedAt:Date.now(),snapshot:s,statistics:engine.statistics(),positions:s.positions,positionHealth:engine.positionHealth({}),trades:engine.trades(50),history:engine.history('7d'),settings};}
  if(action==='portfolio.positions')return {positions:engine.state().positions};
  if(action==='portfolio.position.health')return engine.positionHealth(args);
  if(action==='portfolio.trades')return {trades:engine.trades(args.limit||50)};
  if(action==='portfolio.trade.detail'){const trade=engine.trade(args.tradeId||args.id);if(!trade)throw Error('TRADE_NOT_FOUND');return {trade};}
  if(action==='portfolio.balances')return {balances:engine.state().balances};
  if(action==='portfolio.history')return {history:engine.history(args.range)};
  if(action==='portfolio.statistics')return engine.statistics();
  if(action==='portfolio.events')return {events:store.events(args.limit||200,args.since||0).map(r=>JSON.parse(r.payload_json))};
  if(action==='portfolio.snapshot')return engine.snapshot(false);
  throw Error('OWNER_OPERATION_DENIED');
 }finally{store.close();}
};}
module.exports={dispatch};
