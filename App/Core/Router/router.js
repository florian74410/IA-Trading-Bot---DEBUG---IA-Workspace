'use strict';
/* IA-TB Unified Router + Communication Router v2.0.0
   Router interne CP/1 : 127.0.0.1:8021 (UI séparée sur 8000).
   Les moteurs sont décrits par le Protocol Registry; les ordres Trading
   passent par la frontière Firewall avant le Trading Engine.
*/
var http=require('http'),fs=require('fs'),path=require('path'),URL=require('url').URL,CommRouter=require('../Communication/communication_router_v1'),CP=require('../Communication/communication_protocol_v1'),BUILD=require('../Shared/build_info');
var HOST='127.0.0.1';
var PORT=+(process.env.ROUTER_PORT||8021);
var CORE_HOST='127.0.0.1',CORE_PORT=+(process.env.CORE_PUBLIC_PORT||8001);
var INDICATOR_PORT=+(process.env.IATB_INDICATOR_PORT||8012);
var MARKET_DATA_HOST='127.0.0.1',MARKET_DATA_PORT=+(process.env.IATB_MARKET_DATA_PORT||8013),FIREWALL_PORT=+(process.env.IATB_FIREWALL_PORT||8017);
var LIQUIDITY_PORT=+(process.env.IATB_LIQUIDITY_PORT||8014);
var FUNDAMENTAL_PORT=+(process.env.IATB_FUNDAMENTAL_PORT||8015);
var TRADING_ENGINE_HOST='127.0.0.1',TRADING_ENGINE_PORT=+(process.env.IATB_TRADING_ENGINE_PORT||8016);
var STRATEGY_HOST='127.0.0.1',STRATEGY_PORT=+(process.env.IATB_STRATEGY_PORT||8018);
var RISK_HOST='127.0.0.1',RISK_PORT=+(process.env.IATB_RISK_ENGINE_PORT||8019);
var PORTFOLIO_PORT=+(process.env.IATB_PORTFOLIO_PORT||8020);
var SUPERVISOR_HOST='127.0.0.1',SUPERVISOR_PORT=+(process.env.IATB_SUPERVISOR_PORT||3000);
var APP_ROOT=path.resolve(__dirname,'../..'),COMM=new CommRouter(APP_ROOT);
var COMM_MAX_BODY=512*1024;

function sendJson(res,code,obj){var b=Buffer.from(JSON.stringify(obj,null,2));res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Content-Length':b.length,'Cache-Control':'no-store'});res.end(b);}
function readJsonBody(req,limit,cb){var a=[],n=0,done=false;limit=limit||COMM_MAX_BODY;function fail(e){if(done)return;done=true;cb(e);}req.on('data',function(c){if(done)return;n+=c.length;if(n>limit){try{req.destroy();}catch(x){}return fail(new Error('COMM_PAYLOAD_TOO_LARGE'));}a.push(c);});req.on('end',function(){if(done)return;done=true;try{cb(null,JSON.parse(Buffer.concat(a).toString('utf8')||'{}'));}catch(e){cb(new Error('COMM_JSON_INVALID'));}});req.on('error',fail);}
function communicationRegister(req,res){var token=String(req.headers['x-iatb-cp-token']||'');if(!COMM.verifyToken(token))return sendJson(res,403,{ok:false,error:'CP_AUTH_FAILED'});readJsonBody(req,131072,function(e,b){if(e)return sendJson(res,400,{ok:false,error:e.message});try{var x=COMM.register(b);sendJson(res,200,{ok:true,protocol:CP.PROTOCOL,engine:{id:x.id,label:x.label,port:x.port,capabilities:x.capabilities,events:x.events||[],lastSeen:x.lastSeen}});}catch(er){sendJson(res,400,{ok:false,error:er.message});}});}

var UI_READ_ACTIONS={
 'indicator.settings.get':1,
 'indicator.registry.status':1,
 'indicator.list_indicators':1,
 'indicator.compute_batch':1,
 'indicator.compute_batch_data':1,
 'indicator.analyze':1,
 'indicator.definition.get':1,
 'indicator.definition.validate':1,
 'indicator.language.info':1,
 'indicator.language.validate':1,
 'firewall.events':1,
 'firewall.status':1,
 'fundamental.ai_summary.state':1,
 'fundamental.health':1,
 'fundamental.summary':1,
 'fundamental.news.search':1,
 'fundamental.sources.search':1,
 'fundamental.source.get':1,
 'fundamental.feeds.search':1,
 'fundamental.providers.status':1,
 'fundamental.synthesis.history':1,
 'fundamental.fedwatch.get':1,
 'fundamental.calendar.upcoming':1,
 'fundamental.diagnostic.feed':1,
 'fundamental.logs.recent':1,
 'strategy.health':1,
 'strategy.capabilities':1,
 'strategy.catalog':1,
 'strategy.stats':1,
 'strategy.state':1,
 'portfolio.overview':1,
 'portfolio.positions':1,
 'portfolio.position.health':1,
 'portfolio.trades':1,
 'portfolio.trade.detail':1,
 'portfolio.statistics':1,
 'portfolio.history':1,
 'portfolio.events':1,
 'liquidity.zones':1,
 'marketdata.health':1,
 'marketdata.asset.price':1,
 'marketdata.catalog':1,
 'marketdata.asset.resolve':1,
 'marketdata.symbols':1,
 'marketdata.ticker':1,
 'marketdata.provider.test':1,
 'trading.account.positions':1,
 'trading.account.orders':1,
 'trading.account.balances':1,
 'marketdata.providers':1,
 'marketdata.settings.get':1,
 'marketdata.registry.status':1,
 'marketdata.registry.search':1,
 'marketdata.registry.list':1,
 'marketdata.registry.asset':1,
 'marketdata.registry.query':1,
 'marketdata.financial.snapshot':1,
 'marketdata.financial.history':1,
 'marketdata.financial.storage':1,
 'marketdata.dex.liquidity.snapshot':1,
 'marketdata.derivatives.open_interest':1,
 'marketdata.liquidations.stats':1,
 'marketdata.liquidations.streams':1
};
function communicationUiRead(req,res){
 readJsonBody(req,65536,function(e,b){
  if(e)return sendJson(res,400,{ok:false,error:e.message});
  b=b&&typeof b==='object'?b:{};
  var target=String(b.target||'').toLowerCase(),action=String(b.action||'');
  if(!UI_READ_ACTIONS[action]||(['strategy','marketdata','portfolio','liquidity','indicator','fundamental','firewall','trading'].indexOf(target)<0))return sendJson(res,403,{ok:false,error:'UI_READ_DENY',caller:{type:'UI',role:'READ_ONLY'}});
  var args=b.arguments&&typeof b.arguments==='object'&&!Array.isArray(b.arguments)?b.arguments:{};
  if(target==='strategy'&&Object.keys(args).length)return sendJson(res,403,{ok:false,error:'UI_ARGUMENTS_DENY',caller:{type:'UI',role:'READ_ONLY'}});if(target==='firewall'){var fwa={'firewall.events':{audience:1,limit:1,since:1},'firewall.status':{}}[action]||{},fwks=Object.keys(args);for(var fwi=0;fwi<fwks.length;fwi++)if(!fwa[fwks[fwi]])return sendJson(res,403,{ok:false,error:'UI_ARGUMENTS_DENY',caller:{type:'UI',role:'READ_ONLY'}});}if(target==='fundamental'){var fa={
 'fundamental.ai_summary.state':{},
 'fundamental.health':{},
 'fundamental.summary':{},
 'fundamental.news.search':{query:1,asset:1,category:1,source:1,feed:1,minGrade:1,grade:1,minReliability:1,minImportance:1,since:1,until:1,sort:1,lang:1,limit:1},
 'fundamental.sources.search':{query:1,domain:1,enabled:1,limit:1},
 'fundamental.source.get':{code:1,source:1},
 'fundamental.feeds.search':{source:1,provider:1,enabled:1,limit:1},
 'fundamental.providers.status':{},
 'fundamental.synthesis.history':{eventId:1,event_id:1,scope:1,limit:1},
 'fundamental.fedwatch.get':{},
 'fundamental.calendar.upcoming':{days:1,country:1,impact:1,limit:1},
 'fundamental.diagnostic.feed':{feedId:1,id:1},
 'fundamental.logs.recent':{level:1,component:1,source:1,query:1,q:1,limit:1}
}[action]||{},fks=Object.keys(args);for(var fi=0;fi<fks.length;fi++)if(!fa[fks[fi]])return sendJson(res,403,{ok:false,error:'UI_ARGUMENTS_DENY',caller:{type:'UI',role:'READ_ONLY'}});}if(target==='liquidity'){var la={'liquidity.zones':{symbol:1,timeframe:1,limit:1}}[action]||{},lks=Object.keys(args);for(var li=0;li<lks.length;li++)if(!la[lks[li]])return sendJson(res,403,{ok:false,error:'UI_ARGUMENTS_DENY',caller:{type:'UI',role:'READ_ONLY'}});}if(target==='marketdata'){var ma={
 'marketdata.health':{},
 'marketdata.asset.price':{symbol:1,currency:1},
 'marketdata.catalog':{query:1,page:1,perPage:1},
 'marketdata.asset.resolve':{id:1,network:1},
 'marketdata.symbols':{source:1,exchange:1,query:1,q:1,limit:1},
 'marketdata.ticker':{symbol:1,source:1,exchange:1},
 'marketdata.provider.test':{provider:1,source:1,exchange:1},
 'marketdata.providers':{},
 'marketdata.settings.get':{},
 'marketdata.registry.status':{},
 'marketdata.registry.search':{term:1,query:1,limit:1},
 'marketdata.registry.list':{offset:1,limit:1,term:1},
 'marketdata.registry.asset':{id:1,symbol:1,name:1,term:1,detail:1},
 'marketdata.registry.query':{action:1,arguments:1,args:1},
 'marketdata.financial.snapshot':{force:1,staleWhileRevalidate:1},
 'marketdata.financial.history':{family:1,limit:1,since:1},
 'marketdata.financial.storage':{},
 'marketdata.dex.liquidity.snapshot':{symbol:1,force:1},
 'marketdata.derivatives.open_interest':{symbol:1},
 'marketdata.liquidations.stats':{symbol:1,windowMs:1},
 'marketdata.liquidations.streams':{}
}[action]||{},mks=Object.keys(args);for(var mi=0;mi<mks.length;mi++)if(!ma[mks[mi]])return sendJson(res,403,{ok:false,error:'UI_ARGUMENTS_DENY',caller:{type:'UI',role:'READ_ONLY'}});}if(target==='trading'){var ta={'trading.account.positions':{exchange:1,address:1,account:1,chain:1},'trading.account.orders':{exchange:1,address:1,account:1,chain:1},'trading.account.balances':{exchange:1,address:1,account:1,chain:1}}[action]||{},tks=Object.keys(args);for(var ti=0;ti<tks.length;ti++)if(!ta[tks[ti]])return sendJson(res,403,{ok:false,error:'UI_ARGUMENTS_DENY',caller:{type:'UI',role:'READ_ONLY'}});}if(target==='portfolio'){var pa={'portfolio.positions':{},'portfolio.statistics':{},'portfolio.position.health':{tradeId:1,walletId:1,symbol:1,exchange:1},'portfolio.trades':{limit:1},'portfolio.trade.detail':{tradeId:1,id:1},'portfolio.history':{range:1},'portfolio.events':{limit:1,since:1}}[action]||{},pks=Object.keys(args);for(var pi=0;pi<pks.length;pi++)if(!pa[pks[pi]])return sendJson(res,403,{ok:false,error:'UI_ARGUMENTS_DENY',caller:{type:'UI',role:'READ_ONLY'}});}
  var q=CP.makeRequest(target,action,args,'summary');q.caller={type:'UI',role:'READ_ONLY'};
  COMM.route(q,function(er,o){if(er)return sendJson(res,400,{ok:false,error:er.message,protocol:CP.PROTOCOL,caller:{type:'UI',role:'READ_ONLY'}});sendJson(res,200,o);});
 });
}

var UI_WRITE_ACTIONS={
 indicator:{
  'indicator.settings.set':{settings:1,refreshMs:1,enabled:1},
  'indicator.registry.reload':{},
  'indicator.definition.create':{definition:1,overwrite:1},
  'indicator.language.create':{source:1,overwrite:1},
  'indicator.custom.delete':{id:1}
 },
 marketdata:{
  'marketdata.settings.set':{settings:1},
  'marketdata.registry.refresh':{},
  'marketdata.cache.clear':{}
 },
 fundamental:{
  'fundamental.collect':{all:1,eventLimit:1},
  'fundamental.provider.test':{feedId:1,id:1},
  'fundamental.feed.test_draft':{feed:1},
  'fundamental.feed.create':{feed:1},
  'fundamental.feed.update':{feedId:1,feed:1},
  'fundamental.feed.toggle':{feedId:1,enabled:1},
  'fundamental.feed.delete':{feedId:1},
  'fundamental.news.purge':{},
  'fundamental.fedwatch.refresh':{},
  'fundamental.ai_summary.generate':{force:1},
  'fundamental.translate':{itemId:1,id:1,lang:1}
 }
};
function communicationUiWrite(req,res){
 // No legacy UI role/headers may confer Auth21 business-write authority.
 // Reject until the Core can issue a signed proof bound to this exact action.
 if(require('../Clients/auth21_service_boundary').active(process.env))
  return sendJson(res,403,{ok:false,error:'AUTH21_BUSINESS_WRITE_PROOF_REQUIRED'});
 readJsonBody(req,262144,function(e,b){
  if(e)return sendJson(res,400,{ok:false,error:e.message});
  b=b&&typeof b==='object'?b:{};
  var target=String(b.target||'').toLowerCase(),action=String(b.action||''),allowed=UI_WRITE_ACTIONS[target]&&UI_WRITE_ACTIONS[target][action];
  if(!allowed)return sendJson(res,403,{ok:false,error:'UI_WRITE_DENY',caller:{type:'UI',role:'WRITE'}});
  var args=b.arguments&&typeof b.arguments==='object'&&!Array.isArray(b.arguments)?b.arguments:{},keys=Object.keys(args);
  for(var i=0;i<keys.length;i++)if(!allowed[keys[i]])return sendJson(res,403,{ok:false,error:'UI_ARGUMENTS_DENY',caller:{type:'UI',role:'WRITE'}});
  var q=CP.makeRequest(target,action,args,'summary');q.caller={type:'UI',role:'WRITE'};
  COMM.route(q,function(er,o){if(er)return sendJson(res,400,{ok:false,error:er.message,protocol:CP.PROTOCOL,caller:{type:'UI',role:'WRITE'}});sendJson(res,200,o);});
 });
}

function communicationRequest(req,res){var token=String(req.headers['x-iatb-cp-token']||'');if(!COMM.verifyToken(token))return sendJson(res,403,{ok:false,error:'CP_AUTH_FAILED'});readJsonBody(req,COMM_MAX_BODY,function(e,b){if(e)return sendJson(res,400,{ok:false,error:e.message});COMM.route(b,function(er,o){if(er)return sendJson(res,400,{ok:false,error:er.message,protocol:CP.PROTOCOL});sendJson(res,200,o);});});}
function communicationEvent(req,res){var token=String(req.headers['x-iatb-cp-token']||'');if(!COMM.verifyToken(token))return sendJson(res,403,{ok:false,error:'CP_AUTH_FAILED'});readJsonBody(req,COMM_MAX_BODY,function(e,b){if(e)return sendJson(res,400,{ok:false,error:e.message});try{var ev=COMM.publishEvent(b);sendJson(res,200,{ok:true,protocol:CP.PROTOCOL,event_id:ev.event_id,accepted:true});}catch(er){sendJson(res,400,{ok:false,error:er.message,protocol:CP.PROTOCOL});}});}
function communicationEvents(req,u,res){var token=String(req.headers['x-iatb-cp-token']||'');if(!COMM.verifyToken(token))return sendJson(res,403,{ok:false,error:'CP_AUTH_FAILED'});sendJson(res,200,COMM.listEvents({since:+u.searchParams.get('since')||0,limit:+u.searchParams.get('limit')||50,source:u.searchParams.get('source')||''}));}

function communicationCapabilities(req,res){var token=String(req.headers['x-iatb-cp-token']||'');if(!COMM.verifyToken(token))return sendJson(res,403,{ok:false,error:'CP_AUTH_FAILED'});sendJson(res,200,COMM.capabilities());}
function communicationRegistry(req,res,id){var token=String(req.headers['x-iatb-cp-token']||'');if(!COMM.verifyToken(token))return sendJson(res,403,{ok:false,error:'CP_AUTH_FAILED'});if(id){var x=COMM.protocolRegistry.get(id);return x?sendJson(res,200,{ok:true,schema:'iatb.protocol-registry/2.0',object:x}):sendJson(res,404,{ok:false,error:'PROTOCOL_REGISTRY_OBJECT_NOT_FOUND'});}sendJson(res,200,COMM.protocolRegistrySnapshot());}
function communicationPlanClient(req,res){var token=String(req.headers['x-iatb-cp-token']||'');if(!COMM.verifyToken(token))return sendJson(res,403,{ok:false,error:'CP_AUTH_FAILED'});readJsonBody(req,131072,function(e,b){if(e)return sendJson(res,400,{ok:false,error:e.message});try{sendJson(res,200,{ok:true,action:COMM.planClientAction(b.action,b.arguments||{},b.meta||{})});}catch(er){sendJson(res,400,{ok:false,error:er.message});}});}
function communicationAckClient(req,res){var token=String(req.headers['x-iatb-cp-token']||'');if(!COMM.verifyToken(token))return sendJson(res,403,{ok:false,error:'CP_AUTH_FAILED'});readJsonBody(req,131072,function(e,b){if(e)return sendJson(res,400,{ok:false,error:e.message});try{sendJson(res,200,{ok:true,ack:COMM.ackClientAction(b)});}catch(er){sendJson(res,400,{ok:false,error:er.message});}});}
function communicationRuntime(req,res){var token=String(req.headers['x-iatb-cp-token']||'');if(!COMM.verifyToken(token))return sendJson(res,403,{ok:false,error:'CP_AUTH_FAILED'});sendJson(res,200,{ok:true,protocol:CP.PROTOCOL,runtime:COMM.runtimeSnapshot()});}
function communicationTest(res){var q=CP.makeRequest('indicator','indicator.list_capabilities',{},'summary');COMM.route(q,function(e,o){if(e)return sendJson(res,503,{ok:false,protocol:CP.PROTOCOL,error:e.message});sendJson(res,200,{ok:true,protocol:CP.PROTOCOL,message:'Communication Router -> Indicator Engine : OK',request_id:q.request_id,response:o});});}
function proxyError(res,label,err){if(res.headersSent){try{res.end();}catch(e){}return;}sendJson(res,503,{ok:false,service:label,error:label+' indisponible',detail:String(err&&err.message||err||'connexion impossible')});}
function copyHeaders(src){var h={};Object.keys(src||{}).forEach(function(k){if(k.toLowerCase()==='host'||k.toLowerCase()==='connection')return;h[k]=src[k];});return h;}
function responseHeaders(h){var out={};Object.keys(h||{}).forEach(function(k){var l=k.toLowerCase();if(l==='connection'||l==='transfer-encoding'||l==='content-length')return;out[k]=h[k];});return out;}
function proxy(req,res,targetHost,targetPort,targetPath,opts){opts=opts||{};var headers=copyHeaders(req.headers);headers.host=targetHost+':'+targetPort;var p=http.request({host:targetHost,port:targetPort,path:targetPath,method:req.method,headers:headers,timeout:15000},function(pr){var rh=responseHeaders(pr.headers);res.writeHead(pr.statusCode||200,rh);pr.pipe(res);});p.on('timeout',function(){p.destroy(new Error('timeout'));});p.on('error',function(e){proxyError(res,opts.label||'Service',e);});req.pipe(p);}
function probe(port,pathname,cb){var done=false,tls=process.env.IATB_AUTH_MODE==='authenticated'&&port===CORE_PORT,req=(tls?require('https'):http).get({host:'127.0.0.1',port:port,path:pathname,timeout:1000,...(tls?{servername:'localhost',ca:fs.readFileSync(process.env.IATB_AUTH_TLS_CERT)}:{})},function(r){r.resume();r.on('end',function(){if(done)return;done=true;cb(null,r.statusCode);});});req.on('timeout',function(){req.destroy();});req.on('error',function(e){if(done)return;done=true;cb(e);});}
function routerHealth(res){
 var specs=[['core',CORE_PORT,'/api/health'],['router',PORT,'/router-health-internal'],['firewall',FIREWALL_PORT,'/health'],['indicators',INDICATOR_PORT,'/health'],['marketData',MARKET_DATA_PORT,'/health'],['liquidity',LIQUIDITY_PORT,'/health'],['fundamental',FUNDAMENTAL_PORT,'/health'],['risk',RISK_PORT,'/health'],['trading',TRADING_ENGINE_PORT,'/health'],['portfolio',PORTFOLIO_PORT,'/health'],['strategy',STRATEGY_PORT,'/health'],['supervisor',SUPERVISOR_PORT,'/health']],out={},left=specs.length,finished=false;
 function finish(){if(finished)return;finished=true;sendJson(res,200,{ok:true,router:true,version:BUILD.version,communicationProtocol:'CP/1',pid:process.pid,host:HOST,port:PORT,core:out.core||{ok:false,port:CORE_PORT,status:0,error:'pending'},indicators:out.indicators||{ok:false,port:INDICATOR_PORT,status:0,error:'pending'},marketData:out.marketData||{ok:false,port:MARKET_DATA_PORT,status:0,error:'pending'},liquidity:out.liquidity||{ok:false,port:LIQUIDITY_PORT,status:0,error:'pending'},fundamental:out.fundamental||{ok:false,port:FUNDAMENTAL_PORT,status:0,error:'pending'},trading:out.trading||{ok:false,port:TRADING_ENGINE_PORT,status:0,error:'pending'},strategy:out.strategy||{ok:false,port:STRATEGY_PORT,status:0,error:'pending'},risk:out.risk||{ok:false,port:RISK_PORT,status:0,error:'pending'},portfolio:out.portfolio||{ok:false,port:PORTFOLIO_PORT,status:0,error:'pending'},supervisor:out.supervisor||{ok:false,port:SUPERVISOR_PORT,status:0,error:'pending'},firewall:out.firewall||{ok:false,port:FIREWALL_PORT,status:0,error:'pending'},dependencies:out});}
 specs.forEach(function(sp){probe(sp[1],sp[2],function(e,code){out[sp[0]]={ok:!e&&code===200,port:sp[1],status:code||0,error:e?e.message:''};if(--left===0)finish();});});
 setTimeout(finish,850);
}

var AUTH21_IPC_ROUTER_PROBE=process.env.IATB_AUTH21_IPC_PROBE_TRIAL==='1'?require('../Clients/auth21_ipc_probe').createRouterProbe({env:process.env,root:process.env.IATB_AUTH21_LOCAL_TRIAL_ROOT}):null;
var AUTH21_IPC_ROUTER_READ=process.env.IATB_AUTH21_IPC_PROBE_TRIAL==='1'?require('../Clients/auth21_ipc_probe').createRouterReadOnlyCapabilities({env:process.env,root:process.env.IATB_AUTH21_LOCAL_TRIAL_ROOT}):null;
var AUTH21_ROUTER_GUARDED_READ=process.env.IATB_AUTH21_IPC_PROBE_TRIAL==='1'?require('../Clients/auth21_router_service_read').createRouterRead({env:process.env,root:process.env.IATB_AUTH21_LOCAL_TRIAL_ROOT}):null;
var AUTH21_BUSINESS_FORWARD=process.env.IATB_AUTH21_BUSINESS_TRIAL==='1'?
 require('../Clients/auth21_router_business_forward').createForward({env:process.env,ports:{indicators:INDICATOR_PORT,marketdata:MARKET_DATA_PORT,
 fundamental:FUNDAMENTAL_PORT,portfolio:PORTFOLIO_PORT,strategy:STRATEGY_PORT}}):null;
var server=http.createServer(function(req,res){var u=new URL(req.url,'http://'+HOST+':'+PORT),p=u.pathname;
 var auth21Boundary=require('../Clients/auth21_service_boundary').decision(process.env,'router',req.method,p);
 if(auth21Boundary.intercept&&
 require('../Clients/auth21_business_actions').contract(p)&&AUTH21_BUSINESS_FORWARD)return AUTH21_BUSINESS_FORWARD(req,res);
 if(auth21Boundary.intercept&&p==='/auth21/ipc/probe'&&AUTH21_IPC_ROUTER_PROBE)return AUTH21_IPC_ROUTER_PROBE(req,res);
 if(auth21Boundary.intercept&&p==='/auth21/ipc/capabilities'&&AUTH21_IPC_ROUTER_READ)return AUTH21_IPC_ROUTER_READ(req,res);
 if(auth21Boundary.intercept&&p==='/auth21/ipc/router-read'&&AUTH21_ROUTER_GUARDED_READ)return AUTH21_ROUTER_GUARDED_READ(req,res);
 if(auth21Boundary.intercept)return sendJson(res,404,{error:'NOT_FOUND'});
 if(p==='/router-health-internal')return sendJson(res,200,{ok:true,router:true,pid:process.pid,port:PORT,version:BUILD.version});
 if(p==='/router-health')return routerHealth(res);
 if(req.method==='GET'&&p==='/communication-health')return COMM.health(function(e,o){if(e)return sendJson(res,503,{ok:false,error:e.message});sendJson(res,200,o);});
 if(req.method==='POST'&&p==='/communication-test')return communicationTest(res);
 if(req.method==='POST'&&p==='/communication/v1/register')return communicationRegister(req,res);
 if(req.method==='POST'&&p==='/communication/v1/request')return communicationRequest(req,res);
 if(req.method==='POST'&&p==='/communication/v1/ui/read')return communicationUiRead(req,res);
 if(req.method==='POST'&&p==='/communication/v1/ui/write')return communicationUiWrite(req,res);
 if(req.method==='POST'&&p==='/communication/v1/event')return communicationEvent(req,res);
 if(req.method==='GET'&&p==='/communication/v1/events')return communicationEvents(req,u,res);
 if(req.method==='GET'&&p==='/communication/v1/capabilities')return communicationCapabilities(req,res);
 if(req.method==='GET'&&p==='/communication/v1/registry')return communicationRegistry(req,res,'');
 if(req.method==='GET'&&p.indexOf('/communication/v1/registry/')===0)return communicationRegistry(req,res,decodeURIComponent(p.slice('/communication/v1/registry/'.length)));
 if(req.method==='POST'&&p==='/communication/v1/client/plan')return communicationPlanClient(req,res);
 if(req.method==='POST'&&p==='/communication/v1/client/ack')return communicationAckClient(req,res);
 if(req.method==='GET'&&p==='/communication/v1/runtime')return communicationRuntime(req,res);
 if(req.method==='GET'&&p==='/market-data/candles')return proxy(req,res,MARKET_DATA_HOST,MARKET_DATA_PORT,'/candles'+u.search,{label:'Market Data Candles · firewall validated at ingestion'});
 return proxy(req,res,CORE_HOST,CORE_PORT,u.pathname+u.search,{label:'IA-TB Core'});
});
server.on('upgrade',function(req,socket){
 if(process.env.IATB_AUTH_MODE==='authenticated'||require("../Clients/auth21_service_boundary").active(process.env)){
  try{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}catch(_){socket.destroy();}
  return;
 }
 socket.destroy();
});
server.on('error',function(e){console.error('IA-TB Router bind error:',e&&e.message||e);process.exit(13);});server.listen(PORT,HOST,function(){console.log('IA-TB Communication Router v'+BUILD.version+' : http://'+HOST+':'+PORT);
console.log('Communication Protocol: CP/1 (canal Supervisor authentifie)');console.log('Core interne      : http://'+CORE_HOST+':'+CORE_PORT);console.log('Market Data       : http://'+MARKET_DATA_HOST+':'+MARKET_DATA_PORT);
console.log('Trading Engine    : http://'+TRADING_ENGINE_HOST+':'+TRADING_ENGINE_PORT);console.log('Strategy Engine   : http://'+STRATEGY_HOST+':'+STRATEGY_PORT);});
function stop(){server.close(function(){process.exit(0);});setTimeout(function(){process.exit(0);},1200);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
