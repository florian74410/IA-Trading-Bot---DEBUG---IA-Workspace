'use strict';
/*
 IA-Trading-Bot - Risk Engine v2.0
 
 Architectural rules:
 - Risk Engine is analytical only.
 - Every inter-engine exchange uses CP/1 through the Router.
 - No direct HTTP call to Market Data, Indicator, Portfolio, exchanges or Trading Engine.
 - Node.js 16 compatible, zero npm dependencies.
*/
var http=require('http'),path=require('path'),URL=require('url').URL;
var CP=require('../../Core/Communication/communication_protocol_v1');
var CPClient=require('../../Core/Communication/cp1_client');
var Risk=require('./risk_engine');
var RiskGate=require('./risk_gate').RiskGate;
var R1=require('./risk_r1_modules'),R2=require('./risk_r2_modules');
var SettingsStore=require('../../Core/Settings/sqlite_settings_store');
var BUILD=require('../../Core/Shared/build_info');

var APP_ROOT=path.resolve(__dirname,'../..');
var HOST='127.0.0.1';
var PORT=+(process.env.IATB_RISK_ENGINE_PORT||8019);
var ROUTER_PORT=+(process.env.ROUTER_PORT||8021);
var MAX_BODY=1024*1024;
var VERSION=BUILD.version;
var SETTINGS_DB=new SettingsStore(APP_ROOT);
var CP_CLIENT=new CPClient({root:APP_ROOT,routerPort:ROUTER_PORT,timeout:12000,maxBytes:4*1024*1024});
var RISK_GATE=new RiskGate({secret:CP.ensureSecret(APP_ROOT),getSettings:riskSettings,ttlMs:30000});
var DEFAULT_SETTINGS={enabled:true,defaultTimeframe:'1h',marketSamples:500,thresholds:{capitalRiskWarningPct:3,grossExposureWarningPct:100,leverageWarning:5,volatilityWarningPct:100,drawdownWarningPct:20,var95WarningPct:5},scoreWeights:{capitalAtRisk:8,grossExposure:0.20,leverage:5,volatility:0.20,drawdown:0.50},r1:{enabled:true,level:'balanced',modules:{capital:true,stopLoss:true,riskBudget:true,resize:true}},r2:{enabled:true,modules:{equity:true,drawdown:true,exposure:true,correlation:false,margin:true,stress:false,stopBudget:true,integrity:true},limits:{drawdownPct:15,assetExposurePct:40,portfolioStopRiskPct:5,marginRatioPct:130}}};
function riskSettings(){var x=SETTINGS_DB.get('risk','settings',null)||{};var o=JSON.parse(JSON.stringify(DEFAULT_SETTINGS));Object.keys(x).forEach(function(k){if(k==='thresholds'||k==='scoreWeights')Object.assign(o[k],x[k]||{});else if(k==='r1'||k==='r2'){var v=x[k]||{};Object.keys(v).forEach(function(field){if(field==='modules'||field==='limits')Object.assign(o[k][field]||{},v[field]||{});else if(field in o[k])o[k][field]=v[field];});}else if(k in o)o[k]=x[k];});return o;}
function saveRiskSettings(patch){var o=riskSettings();patch=patch||{};if(typeof patch.enabled==='boolean')o.enabled=patch.enabled;if(patch.defaultTimeframe)o.defaultTimeframe=String(patch.defaultTimeframe);if(+patch.marketSamples>=50&&+patch.marketSamples<=2000)o.marketSamples=Math.round(+patch.marketSamples);if(patch.thresholds)Object.keys(o.thresholds).forEach(function(k){if(isFinite(+patch.thresholds[k]))o.thresholds[k]=+patch.thresholds[k];});['r1','r2'].forEach(function(k){if(!patch[k]||typeof patch[k]!=='object')return;var p=patch[k];if(typeof p.enabled==='boolean')o[k].enabled=p.enabled;if(k==='r1'&&['conservative','balanced','active','aggressive'].indexOf(p.level)>=0)o[k].level=p.level;if(p.modules)Object.keys(o[k].modules).forEach(function(m){if(typeof p.modules[m]==='boolean')o[k].modules[m]=p.modules[m];});if(k==='r2'&&p.limits)Object.keys(o.r2.limits).forEach(function(m){var v=+p.limits[m];if(Number.isFinite(v)&&v>0&&v<=1000)o.r2.limits[m]=v;});});SETTINGS_DB.set('risk','settings',o);return o;}

var CAPABILITIES=[
  'risk.list_capabilities',
  'risk.position.analyze',
  'risk.portfolio.analyze',
  'risk.strategy.analyze',
  'risk.snapshot',
  'risk.settings.get',
  'risk.settings.set',
  'risk.gate.evaluate',
  'risk.gate.verify',
  'risk.r1.evaluate',
  'risk.r2.evaluate',
  'risk.r2.monitor'
];
var EVENTS=['risk.r2.alert'];

function json(res,code,obj){
  var b=Buffer.from(JSON.stringify(obj));
  res.writeHead(code,{
    'Content-Type':'application/json; charset=utf-8',
    'Content-Length':b.length,
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'
  });
  res.end(b);
}
function body(req,cb){
  var a=[],n=0,done=false;
  function fail(e){if(done)return;done=true;cb(e);}
  req.on('data',function(x){
    if(done)return;n+=x.length;
    if(n>MAX_BODY){try{req.destroy();}catch(_){ }return fail(new Error('RISK_PAYLOAD_TOO_LARGE'));}
    a.push(x);
  });
  req.on('end',function(){
    if(done)return;done=true;
    try{cb(null,JSON.parse(Buffer.concat(a).toString('utf8')||'{}'));}
    catch(e){cb(new Error('RISK_JSON_INVALID'));}
  });
  req.on('error',fail);
}
function routerRequest(message,cb){CP_CLIENT.requestMessage(message,cb);}
function requestMarket(symbol,timeframe,cb){
  CP_CLIENT.request('marketdata','marketdata.candles',{
    symbol:symbol,
    timeframe:timeframe,
    limit:riskSettings().marketSamples,
    force:false
  },'analysis',cb);
}
function requestIndicators(symbol,timeframe,cb){
  var q=CP.makeRequest('indicator','indicator.analyze',{
    symbol:symbol,timeframe:timeframe,force:false
  },'analysis');
  routerRequest(q,cb);
}
function requestPortfolio(cb){
  var q=CP.makeRequest('portfolio','portfolio.snapshot',{},'analysis');
  routerRequest(q,cb);
}
function parallel3(a,b,c,cb){
  var left=3,out=[null,null,null],errs=[null,null,null];
  function done(i,e,v){errs[i]=e||null;out[i]=v||null;if(--left===0)cb(errs,out);}
  a(function(e,v){done(0,e,v);});b(function(e,v){done(1,e,v);});c(function(e,v){done(2,e,v);});
}
function extractCandles(m){
  if(!m)return[];
  if(Array.isArray(m.candles))return m.candles;
  var d=m.data||{},c=d.candles||d.ohlcv;
  if(c&&c.status==='AVAILABLE'&&Array.isArray(c.value))return c.value;
  return[];
}
function buildAnalysis(args,detail,cb){
  args=args||{};
  var symbol=String(args.symbol||args.strategy&&args.strategy.symbol||args.position&&args.position.symbol||'BTCUSD').toUpperCase();
  var cfg=riskSettings();
  var timeframe=String(args.timeframe||cfg.defaultTimeframe||'1h').toLowerCase();
  parallel3(
    function(x){requestMarket(symbol,timeframe,x);},
    function(x){requestIndicators(symbol,timeframe,x);},
    function(x){requestPortfolio(x);},
    function(errs,values){
      var market=values[0]||{},indicators=values[1]||{},portfolio=values[2]||args.portfolio||{};
      var degraded=[];
      if(errs[0])degraded.push('MARKET_DATA_UNAVAILABLE:'+errs[0].message);
      if(errs[1])degraded.push('INDICATOR_UNAVAILABLE:'+errs[1].message);
      if(errs[2])degraded.push('PORTFOLIO_UNAVAILABLE:'+errs[2].message);
      if(errs[0])return cb(new Error('RISK_MARKET_DATA_REQUIRED'));
      var result=Risk.analyze({
        symbol:symbol,
        timeframe:timeframe,
        market:{symbol:symbol,timeframe:timeframe,candles:extractCandles(market)},
        indicators:indicators,
        portfolio:portfolio||{},
        position:args.position||null,
        strategy:args.strategy||null,
        settings:cfg
      });
      result.inputs={
        marketData:{available:!errs[0],via:'CP/1 Router'},
        indicators:{available:!errs[1],via:'CP/1 Router'},
        portfolio:{available:!errs[2],via:'CP/1 Router'}
      };
      result.indicatorContext=indicators&&indicators.summary?indicators.summary:null;
      result.warnings=(result.warnings||[]).concat(degraded);
      cb(null,result);
    }
  );
}

// Portfolio v2.4 snapshot is TRADING_ONLY: its equity field is trading PnL,
// NOT account equity. Never calculate portfolio risk percentages using this field.
function risk25PortfolioObservation(packet){
 var raw=packet&&packet.snapshot||packet||{},tradingOnly=raw.analysis_mode==='TRADING_ONLY';
 return {positions:Array.isArray(raw.positions)?raw.positions:[],equity:tradingOnly?null:raw.equity,
  peakEquity:tradingOnly?null:raw.peakEquity,
  asOf:Number.isFinite(Number(raw.timestamp))&&Number(raw.timestamp)>0&&Number.isFinite(new Date(Number(raw.timestamp)).getTime())?new Date(Number(raw.timestamp)).toISOString():raw.asOf||null,
  reconciled:!tradingOnly&&raw.reconciled===true,
  sourceMode:String(raw.analysis_mode||'UNKNOWN')};
}
var R25_MONITOR={last:null,lastPublishedAt:0,alertKey:null,busy:false,interval:null};
function r25Sample(cb){
 requestPortfolio(function(err,packet){
  var data=err?{schema:'risk.r2.snapshot/1.0',status:'UNAVAILABLE',
   alerts:[{module:'integrity',code:'PORTFOLIO_CP1_UNAVAILABLE',severity:'CRITICAL'}],
   policy:{blockAdditionalRisk:true,autoLiquidation:false},supervisor:{notify:true,alertCount:1},executable:false}
   :(function(){var cfg=riskSettings();return R2.evaluate(risk25PortfolioObservation(packet),Object.assign({},cfg.r2,{enabled:cfg.enabled&&cfg.r2.enabled}));})();
  data.sampledAt=new Date().toISOString();R25_MONITOR.last=data;
  cb(null,data);
 });
}
function r25MonitorTick(){
 var cfg=riskSettings();if(!cfg.enabled||!cfg.r2||cfg.r2.enabled===false||R25_MONITOR.busy)return;
 // Do not inspect or broadcast shared Portfolio state under Auth21 without an owner-scoped snapshot.
 if(process.env.IATB_AUTH_MODE==='authenticated')return;
 R25_MONITOR.busy=true;
 r25Sample(function(err,data){R25_MONITOR.busy=false;
  if(err||!data||!data.supervisor||!data.supervisor.notify){R25_MONITOR.alertKey=null;return;}
  var codes=(data.alerts||[]).filter(function(x){return x.severity==='HIGH'||x.severity==='CRITICAL';}).map(function(x){return x.code;}).sort();
  var key=codes.join('|'),now=Date.now();
  if(!key)return;
  if(key===R25_MONITOR.alertKey)return;
  R25_MONITOR.alertKey=key;R25_MONITOR.lastPublishedAt=now;
  CP_CLIENT.publish('risk','risk.r2.alert',{status:data.status,alerts:(data.alerts||[]).map(function(a){return{module:a.module,code:a.code,severity:a.severity};}),
   policy:data.policy,sampledAt:data.sampledAt,reviewOnly:true},{schema:'risk.r2.alert/1.0'},function(e){
   if(e)console.warn('Risk R2 event publish:',String(e.message||e).slice(0,120));
  });
 });
}

function cpAction(m,cb){
  var a=m.arguments||{};
  if(m.action==='risk.r1.evaluate'){var c1=riskSettings();return cb(null,R1.evaluate(a.intent||{},Object.assign({},c1.r1,{enabled:c1.enabled&&c1.r1.enabled}),a.context||{}));}
  if(m.action==='risk.r2.evaluate'){var c2=riskSettings();return cb(null,R2.evaluate(a.snapshot||{},Object.assign({},c2.r2,{enabled:c2.enabled&&c2.r2.enabled})));}
  if(m.action==='risk.r2.monitor')return r25Sample(cb);
  if(m.action==='risk.gate.evaluate'){try{return cb(null,RISK_GATE.evaluate(a.intent||a));}catch(e){return cb(e);}}
  if(m.action==='risk.gate.verify'){try{return cb(null,RISK_GATE.verify(a.risk_approval_id,a.intent||{},a.consume===true));}catch(e){return cb(e);}}
  if(m.action==='risk.settings.get')return cb(null,{schema:'risk.settings/1.0',settings:riskSettings(),storage:SETTINGS_DB.status()});
  if(m.action==='risk.settings.set'){try{return cb(null,{schema:'risk.settings/1.0',settings:saveRiskSettings(a),storage:SETTINGS_DB.status()});}catch(e){return cb(e);}}
  if(m.action==='risk.list_capabilities')
    return cb(null,{schema:'risk.capabilities/0.1',engine:'risk',protocol:'CP/1',capabilities:CAPABILITIES.slice(),events:EVENTS.slice(),analyticalOnly:true});
  if(m.action==='risk.position.analyze')
    return buildAnalysis({symbol:a.symbol,timeframe:a.timeframe,position:a.position,portfolio:a.portfolio},m.detail,cb);
  if(m.action==='risk.strategy.analyze')
    return buildAnalysis({symbol:a.symbol,timeframe:a.timeframe,strategy:a.strategy,portfolio:a.portfolio},m.detail,cb);
  if(m.action==='risk.portfolio.analyze')
    return buildAnalysis({symbol:a.symbol,timeframe:a.timeframe,portfolio:a.portfolio},m.detail,cb);
  if(m.action==='risk.snapshot')
    return buildAnalysis(a,m.detail,cb);
  cb(new Error('CP_ACTION_FORBIDDEN'));
}
function handleCP(req,res){
  var token=String(req.headers['x-iatb-cp-token']||'');
  if(!CP.verifyToken(APP_ROOT,token))return json(res,403,{ok:false,error:'CP_AUTH_FAILED'});
  body(req,function(e,m){
    if(e)return json(res,400,{ok:false,error:e.message});
    var allow=Object.create(null);CAPABILITIES.forEach(function(x){allow[x]=1;});
    var v=CP.validateRequest(m,allow);
    if(!v.ok)return json(res,400,{ok:false,error:v.errors[0],errors:v.errors});
    if(v.target!=='risk')return json(res,404,{ok:false,error:'CP_TARGET_INVALID'});
    var started=Date.now();
    cpAction(m,function(x,d){
      if(x)return json(res,400,CP.makeResponse(m,'ERROR',{error:String(x.message||x).slice(0,240)},{
        engine:'risk',action:m.action,schema:'cp.error/1.0',duration_ms:Date.now()-started
      }));
      var degraded=(d.warnings||[]).some(function(w){return /_UNAVAILABLE:/.test(w);});
      json(res,200,CP.makeResponse(m,degraded?'DEGRADED':'OK',d,{
        engine:'risk',action:m.action,schema:d.schema||'risk.analysis/1.0',
        duration_ms:Date.now()-started,warnings:d.warnings||[]
      }));
    });
  });
}
function registrationDescriptor(){return{
  id:'risk',label:'Risk Engine',host:'127.0.0.1',port:PORT,cpPath:'/cp/v1',healthPath:'/health',
  version:VERSION,schemaVersion:'risk.analysis/1.0',capabilities:CAPABILITIES,events:EVENTS
};}

var srv=require('../../Core/Clients/auth21_engine_ingress').createServer(function(req,res){
  var u=new URL(req.url,'http://'+HOST+':'+PORT);
  if(require('../../Core/Clients/auth21_service_boundary').decision(process.env,'engine',req.method,u.pathname).intercept)return json(res,404,{error:'NOT_FOUND'});
  if(req.method==='GET'&&u.pathname==='/health')return json(res,200,{
    ok:true,service:'IA-TB Risk Engine',engine:'risk',version:VERSION,
    protocol:'CP/1',analyticalOnly:true,pid:process.pid,host:HOST,port:PORT,
    routerPort:ROUTER_PORT,capabilities:CAPABILITIES,events:EVENTS,settings:riskSettings(),settingsStorage:SETTINGS_DB.status()
  });
  if(req.method==='POST'&&u.pathname==='/cp/v1')return handleCP(req,res);
  return json(res,404,{ok:false,error:'NOT_FOUND'});
});
srv.on('error',function(e){console.error('Risk Engine bind error:',e&&e.message||e);process.exit(19);});
var registrationHandle=null;
srv.listen(PORT,HOST,function(){
  console.log('IA-TB Risk Engine v'+VERSION+' http://'+HOST+':'+PORT+' CP/1');
  registrationHandle=CP_CLIENT.maintainRegistration(registrationDescriptor(),{initialDelayMs:900});
  R25_MONITOR.interval=setInterval(r25MonitorTick,30000);R25_MONITOR.interval.unref();
  setTimeout(r25MonitorTick,5000).unref();
});
function stop(){if(R25_MONITOR.interval)clearInterval(R25_MONITOR.interval);if(registrationHandle)registrationHandle.stop();srv.close(function(){process.exit(0);});setTimeout(function(){process.exit(0);},1200);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
