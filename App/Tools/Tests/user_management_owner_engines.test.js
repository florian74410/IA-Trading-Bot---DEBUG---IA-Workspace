'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Store=require('../../Portfolio/Engine/portfolio_store'),PE=require('../../Portfolio/Engine/portfolio_engine'),{namespace}=require('../../Core/Clients/UserManagement/sqlite_namespace');
test('real canonical Portfolio SQLite ledger isolates events/trades/balances/snapshots in existing DB and preserves legacy',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-owner-portfolio-')),dbPath=path.join(root,'portfolio.sqlite');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const legacy=new Store(root,{dbPath}),a=new Store(root,{dbPath,clientId:'CLAlice'}),b=new Store(root,{dbPath,clientId:'CLBob'});t.after(()=>{legacy.close();a.close();b.close();});
 const event={event_id:'same-id',timestamp:Date.now(),event_type:'ORDER_FILLED',exchange:'FIXTURE',symbol:'BTCUSD',side:'BUY',quantity:1,price:100};
 new PE.PortfolioEngine(legacy).recordEvent({...event,event_id:'legacy'});new PE.PortfolioEngine(a).recordEvent(event);new PE.PortfolioEngine(b).recordEvent({...event,price:200});
 assert.equal(a.allEvents().length,1);assert.equal(b.allEvents().length,1);assert.equal(legacy.allEvents().length,1);assert.equal(a.allEvents()[0].price,100);assert.equal(b.allEvents()[0].price,200);a.upsertBalance({venue:'FIXTURE',asset:'USD',amount:42,value_base:42});assert.equal(b.balances().length,0);assert.equal(legacy.balances().length,0);assert.throws(()=>namespace(a.db,'../../CLBob'),/INVALID/);
});
test('actual Strategy owner dispatcher persists only own definitions, mode and canonical evaluations',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-owner-strategy-')),old=process.env.IATB_USER_DB;process.env.IATB_USER_DB=path.join(root,'settings.sqlite');t.after(()=>{if(old===undefined)delete process.env.IATB_USER_DB;else process.env.IATB_USER_DB=old;fs.rmSync(root,{recursive:true,force:true});});
 const dispatch=require('../../Strategy/Engine/owner_strategy').dispatch({root}),a={clientId:'CLAlice',role:'USER'},b={clientId:'CLBob',role:'USER'},strategy={schema_version:1,name:'Test RSI',version:'1.0',symbol:'BTCUSD',timeframe:'5m',entry:{side:'BUY',conditions:[{indicator:'RSI',operator:'<',value:30}]},risk:{leverage:2,max_position_usdt:10,stop_loss_percent:1,take_profit_percent:2}};
 const saved=dispatch(a,'strategy.definition.save',{strategy});assert(saved.strategy.strategy_id);assert.equal(dispatch(b,'strategy.catalog',{}).catalog.count,0);assert.throws(()=>dispatch(b,'strategy.definition.delete',{strategy_id:saved.strategy.strategy_id}),/NOT_FOUND/);
 const result=dispatch(a,'strategy.evaluate',{symbol:'BTCUSD',timeframe:'5m',indicators:{RSI:25}});assert.equal(result.execution,'INTENTION_ONLY');assert.equal(result.selected,1);assert.equal(dispatch(b,'strategy.stats',{}).stats.evaluations,0);assert.equal(dispatch(a,'strategy.stats',{}).stats.evaluations,1);dispatch(a,'strategy.pause',{});assert.equal(dispatch(b,'strategy.state',{}).health.mode,'RUNNING');
});
