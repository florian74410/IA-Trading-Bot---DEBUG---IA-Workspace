'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {CollectorData}=require('../Supervisor/Core/collector_data_v2_4_1'),root=path.resolve(__dirname,'..');
const policy=require('../Bank/Core/feature_policy_v2_4_1');
test('all normalized collector products have explicit CP/1 schemas and real service handlers',()=>{
 const c=new CollectorData({},root),catalog=c.catalog();assert(catalog.items.length>50);
 for(const e of catalog.items){assert(e.registered,e.action);assert(!/settings|refresh|purge|create|delete|execute|registry.query/.test(e.action),e.action);const sources={marketdata:'MarketData/market_data_service.js',fundamental:'Fundamental/Engine/fundamental_service.js',liquidity:'Liquidity/Engine/liquidity_service.js'};assert(fs.readFileSync(path.join(root,sources[e.target]),'utf8').includes(e.action),'handler '+e.action);}
});
test('Supervisor context includes collector families and keeps unavailable sources explicit',async()=>{
 const calls=[],client={async request(target,action,args){calls.push({target,action,args});if(action==='marketdata.dex.liquidity.snapshot')throw Error('upstream password=do-not-leak');return {ok:true,provider:'FIXTURE',timestamp:123,apiKey:'SECRET',sourceUrl:'https://example.invalid/?token=SECRET',events:[{actual:0}]};}};
 const c=new CollectorData(client,root),x=await c.collect({symbol:'ETHUSD',source:'KRAKEN'});assert.equal(x.degraded,true);assert.equal(x.availability.dexLiquidity,false);for(const key of ['candles','financial','microstructure','openInterest','liquidations','news','events','calendar','fedwatch','syntheses'])assert.equal(x.availability[key],true,key);assert.equal(calls.length,11);assert(!JSON.stringify(x).includes('SECRET'));assert(!JSON.stringify(x).includes('do-not-leak'));assert.equal(x.datasets.calendar.data.events[0].actual,0);assert(calls.every(x=>x.args.force!==true));
});
test('collector access rejects mutation, owner data, unknown arguments and unbounded requests before CP dispatch',async()=>{
 let calls=0;const c=new CollectorData({request(){calls++;throw Error('must not call');}},root);
 for(const input of [{target:'portfolio',action:'portfolio.snapshot'},{target:'marketdata',action:'marketdata.refresh'},{target:'marketdata',action:'marketdata.registry.query'},{target:'marketdata',action:'marketdata.candles',arguments:{symbol:'BTCUSD',timeframe:'1m',force:true}},{target:'marketdata',action:'marketdata.microstructure.snapshot',arguments:{symbol:'BTCUSD',force:1}},{target:'marketdata',action:'marketdata.microstructure.snapshot',arguments:{symbol:'BTCUSD',force:'true'}},{target:'marketdata',action:'marketdata.microstructure.history',arguments:{limit:10000}},{target:'fundamental',action:'fundamental.news.search',arguments:{file:'/etc/passwd'}}])await assert.rejects(()=>c.read(input));assert.equal(calls,0);
});
test('Auth21 Supervisor explicitly authorizes shared read APIs for a verified owner only',()=>{
 const {permission}=require('../Core/Clients/UserManagement/owner_policy');for(const a of ['supervisor.context','supervisor.data.catalog','supervisor.data.read'])assert.equal(permission('supervisor',a),'self.read');assert.equal(permission('supervisor','supervisor.execute'),null);
});
test('Bank dormant features deny paths, CP aliases and direct service entry points while transfers remain enabled',()=>{
 for(const p of ['/api/swap-bridge/quote','/api/swap-bridge/execute','/api/bank/vaults','/api/admin/bank/vaults','/api/bank/shared/create','/api/bank/loans'])assert(policy.blockedPath(p),p);
 for(const a of ['bank.vaults.create','bank.shared.create','bank.loans.issue','swap.quote','bridge.execute'])assert(policy.blockedAction(a),a);
 for(const p of ['/api/transfers/preview','/api/transfers/execute','/api/security/wallets','/api/health'])assert.equal(policy.blockedPath(p),false,p);
 const Swap=require('../Bank/Core/swap_bridge_service_v2');for(const method of ['quote','executeInternal','track'])Swap.prototype[method].call({},null,{},e=>assert.equal(e.message,'BANK_FEATURE_SUSPENDED'));assert.throws(()=>Swap.prototype.prepare.call({},null,{}),/BANK_FEATURE_SUSPENDED/);assert.throws(()=>require('../Bank/Core/vault_registry').create({}),/BANK_FEATURE_SUSPENDED/);
});
test('Finance Calendar markers retain authoritative UTC, zeros, country and source without placing date-only events',()=>{
 const api=require('../Frontend/JS/calendar_events_v2_2_5'),rows=api.fromCalendars({cme:{events:[{calendar:'FINANCE_CALENDAR',id:'cpi',date:'2026-10-21',timeLabel:'12:30 UTC',event:'CPI',countryCode:'US',consensus:0,prior:0,actual:0},{calendar:'FINANCE_CALENDAR',id:'unknown',date:'2026-10-21',event:'No time'}]}});assert.equal(rows[0].source,'FINANCE_CALENDAR');const markers=api.chartMarkers(rows);assert.equal(markers.length,1);assert.equal(markers[0].time,Date.parse('2026-10-21T12:30:00Z')/1000);assert.equal(markers[0].forecast,0);assert.equal(markers[0].previous,0);assert.equal(markers[0].actual,0);assert.equal(markers[0].countryCode,'US');assert.equal(api.filter(rows,{source:'CME'}).length,2);
});
