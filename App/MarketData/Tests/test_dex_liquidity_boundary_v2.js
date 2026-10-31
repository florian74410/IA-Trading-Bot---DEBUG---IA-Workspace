'use strict';
// LOCAL FIXTURES ONLY: local HTTP provider + real Firewall rules/client + real SQLite.
var assert=require('assert'),test=require('node:test'),http=require('http'),fs=require('fs'),os=require('os'),path=require('path');
var temp=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-dex-boundary-'));
['RUNTIME','DATA','STATE','ANNEX','UPDATES'].forEach(function(k){process.env['IATB_'+k+'_ROOT']=path.join(temp,k);});
var Provider=require('../Provider/dexscreener_provider'),Collector=require('../Collectors/dex_liquidity_collector');
var Firewall=require('../../Core/Firewall/Protection/market_data_firewall'),Client=require('../Firewall/data_firewall_client'),Store=require('../Storage/microstructure_store');
var providerServer,firewallServer,mode='valid',firewallMode='valid',requests=0,checks=0,lastMessage,store;
function pool(address,liquidity){return{chainId:'ethereum',dexId:'uniswap',pairAddress:address,baseToken:{symbol:'WETH'},quoteToken:{symbol:'USDC'},priceUsd:'2000',liquidity:{usd:liquidity},volume:{h24:100},labels:[]};}
function json(res,code,o){res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(o));}
function listen(s){return new Promise(function(resolve){s.listen(0,'127.0.0.1',resolve);});}
function get(c,s,force){return new Promise(function(resolve,reject){c.get(s,!!force,function(e,o){if(e)reject(e);else resolve(o);});});}
function providerGet(p,s){return new Promise(function(resolve,reject){p.pairLiquidity(s,function(e,o){if(e)reject(e);else resolve(o);});});}
function setupCollector(options){return new Collector(Object.assign({provider:new Provider({base:'http://127.0.0.1:'+providerServer.address().port}),firewall:new Client({port:firewallServer.address().port}),store:store,cacheTtlMs:10000},options||{}));}
test.before(async function(){
 providerServer=http.createServer(function(req,res){requests++;
  if(mode==='error')return json(res,503,{error:'FIXTURE_PROVIDER_DOWN'});
  if(mode==='malformed')return json(res,200,{unexpected:true});
  if(mode==='partial'&&decodeURIComponent(req.url).includes('q=ETH '))return json(res,503,{error:'FIXTURE_PARTIAL'});
  if(mode==='reversed'){var reverse=pool('reverse',1000);reverse.baseToken={symbol:'USDC'};reverse.quoteToken={symbol:'WETH'};reverse.priceUsd='1';return json(res,200,{pairs:[reverse]});}
  json(res,200,{pairs:mode==='empty'?[]:[pool('one',1000),pool('two',2000),pool('one',1000)]});
 });await listen(providerServer);
 var firewall=new Firewall({duplicateWindowMs:0});
 firewallServer=http.createServer(function(req,res){var b='';req.on('data',function(c){b+=c;});req.on('end',function(){
  if(firewallMode==='timeout')return;
  if(firewallMode==='malformed'){res.end('invalid json');return;}
  checks++;var payload=JSON.parse(b);lastMessage=payload.message;
  var out=firewall.inspect(payload.message,payload.meta);
  json(res,out.decision==='REJECT'?422:200,out.decision==='REJECT'?{ok:false,error:'DATA_FIREWALL_REJECT',firewall:out}:{ok:true,decision:out.decision,reason:out.reason,firewall:out});
 });});await listen(firewallServer);
 store=new Store({file:path.join(temp,'dex.db'),persistIntervalMs:15000});assert(store.ready,store.lastError);
});
test.beforeEach(function(){mode='valid';firewallMode='valid';});
test.after(async function(){if(store)store.close();await Promise.all([providerServer,firewallServer].filter(Boolean).map(function(s){return new Promise(function(resolve){s.close(resolve);});}));fs.rmSync(temp,{recursive:true,force:true});});
test('MISS → alias HIT → forced MISS → TTL expiry; Firewall before cache/SQL; durable exact pair',async function(){
 mode='valid';var c=setupCollector(),n=requests,f=checks;
 var first=await get(c,'ETHUSDC');assert.equal(first.cache,'MISS');assert.equal(first.poolCount,2);assert.equal(first.liquidityUsd,3000);
 assert.equal(first.canonicalSymbol,'ETH/USDC');assert.equal(first.firewall.decision,'PASS');assert.equal(first.firewall.reason,'VALID');
 assert.equal(first.provenance,'DEXSCREENER:/latest/dex/search');assert.equal(lastMessage.data.pools.length,2);
 assert.equal(c.cache.stats().entries,1);assert.equal(checks,f+1);
 var hit=await get(c,'ETH/USDC');assert.equal(hit.cache,'HIT');assert.equal(requests,n+2);assert.equal(checks,f+1);
 hit.pools[0].liquidityUsd=-1;assert.equal((await get(c,'ETHUSDC')).pools[0].liquidityUsd,2000,'callers must not mutate cached data');
 assert.equal((await get(c,'ETHUSDC',true)).cache,'MISS');assert.equal(requests,n+4);
 c.cache.map.forEach(function(entry){entry.at-=10001;});
 assert.equal((await get(c,'ETHUSDC')).cache,'MISS');assert.equal(requests,n+6);
 var history=store.dexLiquidityHistory({symbol:'ETHUSDC'});assert.equal(history.count,1,'persist throttling prevents duplicate inserts');
 assert.equal(store.dexLiquidityHistory({symbol:'ETH/USD'}).count,0,'USDC must not share USD history');
 assert.equal(history.items[0].firewall.decision,'PASS');assert.equal(history.items[0].pools.length,2);
 store.close();store=new Store({file:path.join(temp,'dex.db'),persistIntervalMs:15000});
 assert.deepStrictEqual(store.dexLiquidityHistory({symbol:'ETH/USDC'}).items,history.items,'data survives connection reopen');
 assert.equal(store.status().dexLiquiditySnapshots,1);
});
test('empty, all-provider errors and malformed response are explicit, uncached and unpersisted',async function(){
 for(var scenario of [['empty','DEXSCREENER_POOLS_EMPTY'],['error','DEXSCREENER_PROVIDER_FAILED'],['malformed','DEXSCREENER_PROVIDER_FAILED']]){
  mode=scenario[0];var c=setupCollector(),before=checks,count=store.dexLiquidityHistory({}).count;
  await assert.rejects(get(c,'ETHUSDC'),{message:scenario[1]});assert.equal(c.cache.stats().entries,0);assert.equal(checks,before);assert.equal(store.dexLiquidityHistory({}).count,count);
 }
 mode='partial';var partial=await get(setupCollector(),'ETHUSDC');assert.equal(partial.partial,true);assert.equal(partial.poolCount,2);assert.equal(partial.errors.length,1);mode='valid';
});
test('actual Firewall rejects invalid pool/aggregate; no cache or SQL',async function(){
 var valid=await providerGet(new Provider({base:'http://127.0.0.1:'+providerServer.address().port}),'ETHUSDC');
 for(var mutate of [function(o){o.pools[0].liquidityUsd=-1;},function(o){o.liquidityUsd++;},function(o){o.poolCount++;},function(o){o.provenance='';},function(o){o.pools[0].volume24hUsd=-1;}]){
  var bad=JSON.parse(JSON.stringify(valid));mutate(bad);var count=store.dexLiquidityHistory({}).count;
  var c=setupCollector({provider:{pairLiquidity:function(s,cb){cb(null,bad);}}});
  await assert.rejects(get(c,'ETHUSDC'),{message:'DATA_FIREWALL_REJECT'});assert.equal(c.cache.stats().entries,0);assert.equal(store.dexLiquidityHistory({}).count,count);assert.equal(c.status().lastFirewall.decision,'REJECT');
 }
});
test('Firewall bypass, missing decision and observation rejection cannot admit data',async function(){
 var valid=await providerGet(new Provider({base:'http://127.0.0.1:'+providerServer.address().port}),'ETHUSDC');
 for(var verdict of [{ok:true},{ok:true,decision:'REJECT'},{ok:true,decision:'PASS',bypass:true,reason:'FIREWALL_BYPASS'},{ok:true,decision:'WARN',firewall:{issues:[{code:'INVALID'}]}}]){
  var c=setupCollector({provider:{pairLiquidity:function(s,cb){cb(null,valid);}},firewall:{inspect:function(msg,cb){cb(null,verdict);}}});
  await assert.rejects(get(c,'ETHUSDC'),{message:'DATA_FIREWALL_VALIDATION_REQUIRED'});assert.equal(c.cache.stats().entries,0);
 }
});
test('SQLite failure is explicit and never appears as successful cached persistence',async function(){
 var failing=new Store({file:path.join(temp,'readonly.db')});failing.native.db.pragma('query_only = ON');
 try{var c=setupCollector({store:failing});await assert.rejects(get(c,'ETHUSDC'),/DEX_LIQUIDITY_STORAGE_FAILED/);assert.equal(c.cache.stats().entries,0);assert.equal(c.status().lastFirewall.decision,'PASS');assert(c.status().storage.lastError);assert.equal(failing.dexLiquidityHistory({}).count,0);}finally{failing.close();}
});
test('storage rejects missing validation and historical throttling does not hide errors',function(){
 assert.equal(store.saveDexLiquidity({canonicalSymbol:'ETH/USDC',observedAt:Date.now()}),false);
 assert.equal(store.lastError,'DEX_LIQUIDITY_NOT_VALIDATED');
});
test('Firewall timeout and malformed JSON fail closed without cache or SQL',async function(){
 for(var scenario of [['malformed','DATA_FIREWALL_JSON_INVALID'],['timeout','DATA_FIREWALL_TIMEOUT']]){
  firewallMode=scenario[0];var c=setupCollector({firewall:new Client({port:firewallServer.address().port,timeout:1000})}),count=store.dexLiquidityHistory({}).count;
  await assert.rejects(get(c,'ETHUSDC'),{message:scenario[1]});assert.equal(c.cache.stats().entries,0);assert.equal(store.dexLiquidityHistory({}).count,count);
 }
});
test('expired data is not reused on provider failure; a failed forced refresh preserves only the prior valid HIT',async function(){
 var c=setupCollector(),valid=await get(c,'ETHUSDC');mode='error';
 await assert.rejects(get(c,'ETHUSDC',true),{message:'DEXSCREENER_PROVIDER_FAILED'});
 var hit=await get(c,'ETHUSDC');assert.equal(hit.cache,'HIT');assert.equal(hit.observedAt,valid.observedAt);
 c.cache.map.forEach(function(entry){entry.at-=10001;});
 await assert.rejects(get(c,'ETHUSDC'),{message:'DEXSCREENER_PROVIDER_FAILED'});assert.equal(c.cache.stats().entries,0);
});
test('reversed API pools do not assign stablecoin USD price to ETH',async function(){
 mode='reversed';var d=await get(setupCollector(),'ETHUSDC');assert.equal(d.poolCount,1);assert.equal(d.pools[0].base.symbol,'WETH');assert.equal(d.pools[0].priceUsd,null);assert.equal(d.weightedPriceUsd,null);
});
