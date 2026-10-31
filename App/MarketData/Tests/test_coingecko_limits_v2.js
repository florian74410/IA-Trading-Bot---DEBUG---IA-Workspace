'use strict';
// Local HTTP/SQLite fixtures only. Never contact CoinGecko or alter GEN-1 telemetry.
var test=require('node:test'),assert=require('assert'),http=require('http'),fs=require('fs'),os=require('os'),path=require('path');
var temp=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-cg-'));
['RUNTIME','DATA','STATE','ANNEX','UPDATES'].forEach(function(k){process.env['IATB_'+k+'_ROOT']=path.join(temp,k);});
var Provider=require('../Provider/coingecko_provider'),Telemetry=require('../Storage/api_telemetry_store'),Financial=require('../Financial/financial_collector'),Settings=require('../Config/market_data_settings');
var server,url,calls=0,mode='ok';
test.before(async function(){server=http.createServer(function(req,res){calls++;if(mode==='429'){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'120'});return res.end('{"error":"fixture limited"}');}if(mode==='503'){res.writeHead(503,{'Content-Type':'application/json'});return res.end('{}');}res.setHeader('Content-Type','application/json');setTimeout(function(){res.end('{"data":{"value":42}}');},30);});await new Promise(function(done){server.listen(0,'127.0.0.1',done);});url='http://127.0.0.1:'+server.address().port;});
test.after(async function(){await new Promise(function(done){server.close(done);});fs.rmSync(temp,{recursive:true,force:true});});
test.beforeEach(function(){mode='ok';});
function read(p,method){return new Promise(function(resolve,reject){p[method||'global'](function(e,o){if(e)reject(e);else resolve(o);});});}
test('queued/in-flight requests deduplicate, results do not share mutable state; no raw cache',async function(){
 var p=new Provider({base:url,minIntervalMs:300,maxRetries:0}),before=calls;
 var out=await Promise.all([read(p),read(p),read(p)]);assert.equal(calls,before+1);assert.equal(p.status().deduplicated,2);
 out[0].data.value=0;assert.equal(out[1].data.value,42);await read(p);assert.equal(calls,before+2);assert.equal(p.status().rawResponseCache,false);assert.equal(p.maxRetries,0);
});
test('429 preserves Retry-After, blocks all endpoints and never loops automatic retries',async function(){
 mode='429';var p=new Provider({base:url,minIntervalMs:300,maxRetries:4}),before=calls;
 await assert.rejects(read(p),function(e){return e.statusCode===429&&e.retryAfterMs===120000;});
 assert(p.status().cooldownUntil>=Date.now()+119000);await assert.rejects(read(p,'global'),{message:'COINGECKO_COOLDOWN'});
 assert.equal(calls,before+1);assert.equal(p.status().queued,0);
});
test('zero retries is respected for provider failures; persisted budget exhaustion prevents HTTP',async function(){
 mode='503';var p=new Provider({base:url,minIntervalMs:300,maxRetries:0}),before=calls;
 await assert.rejects(read(p));assert.equal(calls,before+1);
 p=new Provider({base:url,monthlyLimit:10,reserve:2,quotaUsage:function(){return{ok:true,monthUsed:8,minuteUsed:0};}});
 await assert.rejects(read(p),{message:'COINGECKO_LOCAL_BUDGET_EXHAUSTED'});assert.equal(calls,before+1);
 p=new Provider({base:url,quotaUsage:function(){return{ok:false};}});await assert.rejects(read(p),{message:'COINGECKO_QUOTA_UNAVAILABLE'});assert.equal(calls,before+1);
});
test('SQLite counts HTTP attempts once, including failures, and retains budget/cooldown on reopen',function(){
 var file=path.join(temp,'telemetry.db'),s=new Telemetry({file:file}),now=Date.now();
 [{requestId:'one',phase:'HTTP_START'},{requestId:'one',phase:'HTTP_END',statusCode:200},{requestId:'two',phase:'HTTP_START'},{requestId:'two',phase:'HTTP_END',statusCode:429,completedAt:now,meta:{quotaHeaders:{'retry-after':'120'}}}].forEach(function(row){s.save(Object.assign({timestamp:now,provider:'COINGECKO'},row));});
 assert.equal(s.coingeckoUsage().monthUsed,2);assert.equal(s.coingeckoUsage().minuteUsed,2);s.close();s=new Telemetry({file:file});assert.equal(s.coingeckoUsage().monthUsed,2);assert(s.coingeckoUsage().cooldownUntil>=now+120000);s.close();
});
test('legacy fast settings are clamped; failed refresh preserves prior CeFi instead of new zero fields',async function(){
 var cfg=Settings.sanitize({coingecko:{registryRefreshMs:60000},financial:{cefiTtlMs:45000}});assert(cfg.coingecko.registryRefreshMs>=1800000);assert(cfg.financial.cefiTtlMs>=1800000);
 var c=new Financial({coingecko:{global:function(cb){cb(new Error('HTTP_429'));},marketPage:function(p,n,v,cb){cb(null,[{symbol:'btc',current_price:1}]);}},store:{get:function(){return{cefi:{global:{marketCapUsd:100},assets:[]}};}}});
 await assert.rejects(new Promise(function(resolve,reject){c._cefi(function(e,o){if(e)reject(e);else resolve(o);});}),/COINGECKO_REFRESH_FAILED/);
});
test('exchange enrichment reaches Data Firewall before cache admission',async function(){
 var c=new Financial({coingecko:{exchanges:function(p,n,cb){cb(null,[{id:'fixture',name:'Fixture'}]);}},firewall:{inspect:function(msg,cb){cb(new Error('DATA_FIREWALL_REJECT'));}}});
 c._runCefiEnrichment();assert.equal(c.cefiEnrichment.data,null);assert.equal(c.cefiEnrichment.lastError,'DATA_FIREWALL_REJECT');
});

test('refreshing exchange coverage never triggers redundant global/market calls when prior coverage exists',function(){
 var refreshes=0,c=new Financial({coingecko:{exchanges:function(p,n,cb){cb(null,[{id:'current'}]);}},store:{get:function(){return{cefi:{exchanges:[{id:'existing'}]}};}},firewall:{inspect:function(msg,cb){cb(null,{decision:'PASS'});}}});
 c.refresh=function(){refreshes++;};c._runCefiEnrichment();assert.equal(refreshes,0);assert(c.cefiEnrichment.at>0);
 var saved=c.cefiEnrichment.data;c.coingecko.exchanges=function(p,n,cb){cb(null,{error:'malformed fixture'});};c._runCefiEnrichment();assert.strictEqual(c.cefiEnrichment.data,saved);assert.equal(c.cefiEnrichment.lastError,'COINGECKO_EXCHANGES_EMPTY_OR_INVALID');
});
