'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
// Replace only external HTTP; exercise the provider, collector, real Firewall and SQLite.
const transport=require.resolve('../Provider/http_json');
require(transport);
const original=require.cache[transport].exports;
require.cache[transport].exports=function(url,options,cb){
 if(url.includes('/Depth'))return cb(null,{result:{XXBTZUSD:{bids:[['81441.3','1.773',1792202493]],asks:[['81441.4','0.001',1792202492]]}}});
 if(url.includes('/depth'))return cb(null,{bids:[['81441.3','1']],asks:[['81441.4','1']]});
 if(url.includes('/openInterest'))return cb(null,{openInterest:'0'});
 cb(new Error('UNEXPECTED_FIXTURE_URL'));
};
const Provider=require('../Provider/microstructure_provider');
const Collector=require('../Collectors/microstructure_collector');
const Store=require('../Storage/microstructure_store');
const Firewall=require('../../Core/Firewall/Protection/market_data_firewall');
const fw=new Firewall({enabled:true,mode:'PROTECTION',rules:{duplicateProtection:false}});
function get(p,source){return new Promise((resolve,reject)=>p.getSnapshot('BTCUSD',source,20,(e,x)=>e?reject(e):resolve(x)));}
test('Kraken absent OI passes real Firewall and persists a snapshot',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-missing-oi-'));
 const store=new Store({file:path.join(dir,'microstructure.db')});
 try{
  assert.equal(store.ready,true,store.lastError);
  const collector=new Collector({provider:new Provider(),store,firewall:{inspect(msg,cb){
   const result=fw.inspect(msg,{});
   if(result.decision==='REJECT')return cb(new Error(JSON.stringify(result.issues)));
   cb(null,result);
  }}});
  const raw=await new Promise((resolve,reject)=>collector.snapshot('BTCUSD','KRAKEN',20,true,(e,x)=>e?reject(e):resolve(x)));
  assert.equal(raw.openInterest.available,false);
  assert.equal(raw.openInterest.value,null);
  assert.equal(raw.openInterest.notional,null);
  assert.equal(raw.openInterest.markPrice,81441.35);
  assert.equal(store.status().snapshots,1);
  assert.equal(store.history({}).items.length,1);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('genuine zero OI remains zero with a positive book mid price',async()=>{
 const raw=await get(new Provider(),'BINANCE_FUTURES');
 assert.equal(raw.openInterest.available,true);
 assert.equal(raw.openInterest.value,0);
 assert.equal(raw.openInterest.markPrice,81441.35);
 assert.equal(raw.openInterest.notional,0);
});
test('Firewall still rejects an available OI with a zero mark price',()=>{
 const result=fw.inspect({provider:'KRAKEN',source:'KRAKEN',provenance:'FIXTURE',type:'LIQUIDITY_SNAPSHOT',symbol:'XBTUSD',timestamp:Date.now(),bid:100,ask:101,data:{orderBook:{bids:[{price:100,size:1}],asks:[{price:101,size:1}]},openInterest:{available:true,value:0,markPrice:0}}},{});
 assert.equal(result.decision,'REJECT');
 assert(result.issues.some(x=>x.code==='OPEN_INTEREST_MARK_INVALID'));
});
test.after(()=>{require.cache[transport].exports=original;});
