'use strict';
// Exercise the actual HTTP Router and CP/1 routing against a local Market Data fixture.
// No Internet, running Engines, Docker stack or user data required.
var assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
var http=require('http'),crypto=require('crypto'),Module=require('module');
var temp=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-ui-dex-'));
['RUNTIME','DATA','STATE','ANNEX','UPDATES'].forEach(function(k){process.env['IATB_'+k+'_ROOT']=path.join(temp,k);});
var Router=require('../communication_router_v1'),CP=require('../communication_protocol_v1');
var Collector=require('../../../MarketData/Collectors/dex_liquidity_collector');
var root=path.resolve(__dirname,'../../..'),server,engine,received=[],inspections=0;
var snapshot={ok:true,symbol:'ETHUSD',canonicalSymbol:'ETHUSD',provider:'DEXSCREENER',
 provenance:'LOCAL_TEST_FIXTURE',observedAt:Date.now(),weightedPriceUsd:2000,
 liquidityUsd:100000,volume24hUsd:50000,poolCount:1,chains:['ethereum'],dexes:['uniswap'],
 pools:[{pairAddress:'fixture-pool',liquidityUsd:100000}]};
var collector=new Collector({provider:{pairLiquidity:function(symbol,cb){cb(null,Object.assign({},snapshot,{symbol:symbol,canonicalSymbol:symbol}));}},
 firewall:{inspect:function(msg,cb){inspections++;assert.equal(msg.type,'MARKET_ANALYTICS');
  if(msg.symbol==='BADUSD')return cb(new Error('DATA_FIREWALL_REJECT_TEST'));
  cb(null,{decision:'PASS'});}}});
function listen(s){return new Promise(function(resolve,reject){s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});}
function close(s){return s&&s.listening?new Promise(function(resolve){s.close(resolve);}):Promise.resolve();}
function post(body,raw){return new Promise(function(resolve,reject){var q=http.request({host:'127.0.0.1',port:server.address().port,path:'/communication/v1/ui/read',method:'POST',headers:{'Content-Type':'application/json'}},function(r){var b='';r.on('data',function(c){b+=c;});r.on('end',function(){resolve({status:r.statusCode,body:JSON.parse(b)});});});q.on('error',reject);q.end(raw||JSON.stringify(body));});}
async function main(){
 engine=http.createServer(function(req,res){var body='';req.on('data',function(c){body+=c;});req.on('end',function(){
  assert.equal(req.url,'/cp/v1');
  var token=CP.ensureSecret(root);
  assert.equal(req.headers['x-iatb-cp-token'],token);
  assert.equal(req.headers['x-iatb-cp-signature'],crypto.createHmac('sha256',token).update(body).digest('hex'));
  var q=JSON.parse(body);received.push(q);assert.deepStrictEqual(q.caller,{type:'UI',role:'READ_ONLY'});
  if(q.action!=='marketdata.dex.liquidity.snapshot'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(CP.makeResponse(q,'OK',{ok:true,args:q.arguments})));}
  collector.get(q.arguments.symbol,!!q.arguments.force,function(e,data){res.writeHead(e?403:200,{'Content-Type':'application/json'});res.end(JSON.stringify(e?{ok:false,error:e.message}:CP.makeResponse(q,'OK',data)));});
 });});
 await listen(engine);
 function TestRouter(appRoot){var router=new Router(appRoot);router.registry.marketdata.port=engine.address().port;return router;}
 var filename=path.join(root,'Core/Router/router.js'),m=new Module(filename,module);
 m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 var originalRequire=m.require.bind(m);
 m.require=function(id){
  if(id==='../Communication/communication_router_v1')return TestRouter;
  if(id==='http')return Object.assign({},http,{createServer:function(handler){server=http.createServer(handler);var originalListen=server.listen;server.listen=function(){return originalListen.call(server,0,'127.0.0.1');};return server;}});
  return originalRequire(id);
 };
 var listeners=['SIGINT','SIGTERM'].map(function(event){return process.listeners(event);});
 try{
  m._compile(fs.readFileSync(filename,'utf8'),filename);
  await new Promise(function(resolve){server.once('listening',resolve);});
  var action='marketdata.dex.liquidity.snapshot';
  for(var args of [{symbol:'ETHUSD',force:false},{symbol:'BTCUSD',force:false},{symbol:'ETHUSD',force:true}]){
   var out=await post({target:'marketdata',action:action,arguments:args});
   assert.equal(out.status,200);assert.equal(out.body.status,'OK');
   assert.equal(out.body.data.poolCount,1);assert.equal(out.body.data.firewall.decision,'PASS');
   assert.deepStrictEqual(received[received.length-1].arguments,args);
  }
  for(var read of [
   ['marketdata.derivatives.open_interest',{symbol:'BTCUSD'}],
   ['marketdata.liquidations.stats',{symbol:'BTCUSD',windowMs:86400000}],
   ['marketdata.liquidations.streams',{}],
   ['marketdata.financial.snapshot',{force:false,staleWhileRevalidate:true}]
  ]){var allowed=await post({target:'marketdata',action:read[0],arguments:read[1]});assert.equal(allowed.status,200);assert.deepStrictEqual(allowed.body.data.args,read[1]);}
  for(var forbiddenArgs of [
   ['marketdata.derivatives.open_interest',{symbol:'BTCUSD',sources:['UNDECLARED']}],
   ['marketdata.liquidations.stats',{symbol:'BTCUSD',url:'https://invalid'}],
   ['marketdata.liquidations.streams',{enabled:true}]
  ]){var no=await post({target:'marketdata',action:forbiddenArgs[0],arguments:forbiddenArgs[1]});assert.equal(no.status,403);assert.equal(no.body.error,'UI_ARGUMENTS_DENY');}
  var before=received.length;
  for(var extra of ['url','provider','settings','limit']){
   var denied=await post({target:'marketdata',action:action,arguments:Object.assign({symbol:'ETHUSD',force:false},{[extra]:'forbidden'})});
   assert.equal(denied.status,403);assert.equal(denied.body.error,'UI_ARGUMENTS_DENY');
  }
  for(var forbidden of ['marketdata.settings.set','marketdata.cache.clear','marketdata.dex.liquidity.history','marketdata.dex.liquidity.snapshot.evil','trading.order.place']){
   var rejected=await post({target:'marketdata',action:forbidden,arguments:{}});
   assert.equal(rejected.status,403);assert.equal(rejected.body.error,'UI_READ_DENY');
  }
  var missing=await post({target:'marketdata',action:action,arguments:{force:false}});
  assert.equal(missing.status,400);assert.equal(received.length,before);
  var blocked=await post({target:'marketdata',action:action,arguments:{symbol:'BADUSD',force:true}});
  assert.equal(blocked.status,400);assert.equal(blocked.body.error,'DATA_FIREWALL_REJECT_TEST');
  assert.equal(inspections,4);
  console.log('UI DEX liquidity HTTP / CP1 / signed transport / deny / Firewall propagation: OK');
 }finally{
  ['SIGINT','SIGTERM'].forEach(function(event,i){process.listeners(event).forEach(function(fn){if(listeners[i].indexOf(fn)<0)process.removeListener(event,fn);});});
 }
}
main().catch(function(e){console.error(e);process.exitCode=1;}).finally(async function(){await close(server);await close(engine);fs.rmSync(temp,{recursive:true,force:true});});
