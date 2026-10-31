'use strict';
/* IA-TB UI Service v2.0
   Dedicated graphical-interface process.
   - Serves Frontend files only.
   - Proxies Core APIs and Router channels through explicit read/write boundaries.
   - Never imports Engines/Core implementation modules.
   - IA Trading View market candles always come from Market Data Collector via
     Router; Market Data validates external ingress through the Data Firewall before distribution.
   - ADMIN Firewall editor uses an explicit ADMIN-only bridge to port 8017.
*/
var http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),URL=require('url').URL,Permissions=require('../Permissions/ui_permissions'),BUILD=require('../../Core/Shared/build_info'),CPClient=require('../../Core/Communication/cp1_client');
var ROOT=path.resolve(__dirname,'../..'),HOST='127.0.0.1';
var PORT=+(process.env.IATB_UI_PORT||8000),CORE_PORT=+(process.env.CORE_PUBLIC_PORT||8001),ROUTER_PORT=+(process.env.ROUTER_PORT||8021),FIREWALL_PORT=+(process.env.IATB_FIREWALL_PORT||8017),ROUTER_CLIENT=new CPClient({root:ROOT,routerPort:ROUTER_PORT,timeout:5000,maxBytes:512*1024});
var AUTH_MODE=String(process.env.IATB_AUTH_MODE||'disabled').toLowerCase(),BYPASS_ROLE=Permissions.normalizeRole(process.env.IATB_UI_BYPASS_ROLE||'ADMIN');
var PAGE_MAP={'/':'Frontend/Pages/app_v1.0.html','/trading':'Frontend/Pages/app_v1.0.html','/trading/':'Frontend/Pages/app_v1.0.html','/ia-trading':'Frontend/Pages/app_v1.0.html','/ia-trading/':'Frontend/Pages/app_v1.0.html','/settings':'Frontend/Pages/settings.html','/settings/':'Frontend/Pages/settings.html','/strategy':'Frontend/Pages/strategy_v2.0.html','/strategy/':'Frontend/Pages/strategy_v2.0.html','/strategies':'Frontend/Pages/strategy_v2.0.html','/strategies/':'Frontend/Pages/strategy_v2.0.html','/chart-viewer':'Frontend/Pages/chart_viewer_v1.0.html','/chart-viewer/':'Frontend/Pages/chart_viewer_v1.0.html','/charts':'Frontend/Pages/chart_viewer_v1.0.html','/portfolio':'Frontend/Pages/portfolio_v1.0.html','/portfolio/':'Frontend/Pages/portfolio_v1.0.html','/bank':'Frontend/Pages/bank_v1.0.html','/bank/':'Frontend/Pages/bank_v1.0.html','/bank/keys':'Frontend/Pages/keys_v1.0.html','/bank/keys/':'Frontend/Pages/keys_v1.0.html','/keys':'Frontend/Pages/keys_v1.0.html','/keys/':'Frontend/Pages/keys_v1.0.html','/admin/vaults':'Frontend/Pages/admin_vaults_v1.0.html','/admin/vaults/':'Frontend/Pages/admin_vaults_v1.0.html','/fundamental':'Frontend/Pages/fundamental_v3.html','/fundamental/':'Frontend/Pages/fundamental_v3.html','/statistiques':'Frontend/Pages/statistiques_v1.0.html','/statistiques/':'Frontend/Pages/statistiques_v1.0.html','/admin':'Frontend/Pages/admin_v1.0.html','/admin/':'Frontend/Pages/admin_v1.0.html'};
var ASSET_DIRS=['Frontend/JS','Frontend/CSS','Frontend/Assets','Frontend/Protocols'];
function json(res,code,obj){var b=Buffer.from(JSON.stringify(obj,null,2));res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Content-Length':b.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(b);}
function contentType(fn){if(/\.css$/i.test(fn))return'text/css; charset=utf-8';if(/\.json$/i.test(fn))return'application/json; charset=utf-8';if(/\.png$/i.test(fn))return'image/png';if(/\.jpe?g$/i.test(fn))return'image/jpeg';if(/\.svg$/i.test(fn))return'image/svg+xml';if(/\.html$/i.test(fn))return'text/html; charset=utf-8';return'application/javascript; charset=utf-8';}
function safeRead(rel,cb){var p=path.resolve(ROOT,rel);if(p.indexOf(ROOT+path.sep)!==0)return cb(new Error('UI_PATH_FORBIDDEN'));fs.readFile(p,cb);}
function serveFile(res,rel){safeRead(rel,function(e,b){if(e)return json(res,404,{ok:false,error:'UI_FILE_NOT_FOUND'});res.writeHead(200,{'Content-Type':contentType(rel),'Content-Length':b.length,'Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache','Expires':'0','X-IATB-UI-Build':'trading-ia-v2-2001','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(b);});}
function serveAdminPage(res){safeRead(PAGE_MAP['/admin'],function(e,b){if(e)return json(res,404,{ok:false,error:'UI_FILE_NOT_FOUND'});var html=b.toString('utf8'),tag='<script defer src="/assets/firewall_admin_editor.js"></script>';if(html.indexOf(tag)<0)html=html.replace('</body>',tag+'\n</body>');var out=Buffer.from(html,'utf8');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':out.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(out);});}
function findAsset(name){if(!/^[A-Za-z0-9._-]+$/.test(name))return null;for(var i=0;i<ASSET_DIRS.length;i++){var rel=ASSET_DIRS[i]+'/'+name;if(fs.existsSync(path.join(ROOT,rel)))return rel;}return null;}
function copyHeaders(src){var h={};Object.keys(src||{}).forEach(function(k){var l=k.toLowerCase();if(l==='host'||l==='connection'||l==='content-length')return;h[k]=src[k];});return h;}
function responseHeaders(src){var h={};Object.keys(src||{}).forEach(function(k){var l=k.toLowerCase();if(l==='connection'||l==='transfer-encoding'||l==='content-length')return;h[k]=src[k];});return h;}
function readJsonBody(req,max,cb){var a=[],n=0;max=max||131072;req.on('data',function(x){n+=x.length;if(n<=max)a.push(x);});req.on('end',function(){if(n>max)return cb(new Error('UI_BODY_TOO_LARGE'));try{cb(null,JSON.parse(Buffer.concat(a).toString('utf8')||'{}'));}catch(e){cb(new Error('UI_JSON_INVALID'));}});req.on('error',cb);}
function browserTlsOptions(){
 if(process.env.IATB_AUTH21_BROWSER_TRIAL!=='1')return null;
 if(!require('../../Core/Clients/auth21_service_boundary').active(process.env))
  throw Error('AUTH21_BROWSER_SANDBOX_REQUIRED');
 var preflight=require('../../Core/Backup/auth21_core_local_trial_wiring').preflightEnv(process.env);
 var base=path.join(preflight.root,'userdata','Security');
 var certFile=path.join(base,'auth21_browser_tls.crt');
 var keyFile=path.join(base,'auth21_browser_tls.key');
 for(var file of [certFile,keyFile]){
  var st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   fs.realpathSync(file)!==file)throw Error('AUTH21_BROWSER_TLS_FILE_UNSAFE');
 }
 return {cert:fs.readFileSync(certFile),key:fs.readFileSync(keyFile)};
}
var AUTH21_BROWSER_TLS=browserTlsOptions();
function proxy(req,res,port,targetPath,meta){meta=meta||{};var h=copyHeaders(req.headers),role=AUTH_MODE==='disabled'?BYPASS_ROLE:'SESSION';h.host='127.0.0.1:'+port;h['x-iatb-ui-origin']='IA-TB-UI';h['x-iatb-ui-role']=role;h['x-iatb-ui-permission']=meta.permission||'READ';var coreAuthTls=Boolean(AUTH21_BROWSER_TLS&&meta.service==='Auth21 isolated Core');
 if(coreAuthTls&&!req.socket.encrypted)return json(res,403,{error:'AUTH21_BROWSER_HTTPS_REQUIRED'});
 var q=(coreAuthTls?https:http).request({host:'127.0.0.1',port:port,path:targetPath,method:req.method,headers:h,timeout:20000,
 ...(coreAuthTls?{ca:AUTH21_BROWSER_TLS.cert,servername:'localhost',rejectUnauthorized:true}:{})},function(r){var rh=responseHeaders(r.headers);res.writeHead(r.statusCode||200,rh);r.pipe(res);});q.on('timeout',function(){q.destroy(new Error('UI_UPSTREAM_TIMEOUT'));});q.on('error',function(e){if(!res.headersSent)json(res,503,{ok:false,error:'UI_UPSTREAM_UNAVAILABLE',service:meta.service||'upstream',detail:e.message});else try{res.end();}catch(x){}});req.pipe(q);}
function currentRole(){return AUTH_MODE==='disabled'?BYPASS_ROLE:'SESSION';}
function isAdminRole(role){role=Permissions.normalizeRole(role);return role==='ADMIN'||role==='SUPERADMIN';}
function authorizePage(req,res,required,cb){if(AUTH_MODE==='disabled'){var r=BYPASS_ROLE;if(required==='ADMIN'&&!isAdminRole(r))return json(res,403,{ok:false,error:'ADMIN_REQUIRED'});return cb(r);}var h={Accept:'application/json'};if(req.headers.cookie)h.Cookie=req.headers.cookie;var q=http.get({host:'127.0.0.1',port:CORE_PORT,path:'/api/bootstrap',timeout:3000,headers:h},function(r){var a=[];r.on('data',function(c){a.push(c);});r.on('end',function(){var o={};try{o=JSON.parse(Buffer.concat(a).toString('utf8')||'{}');}catch(e){}if((r.statusCode||500)>=400||!o.authenticated)return json(res,401,{ok:false,error:'AUTH_REQUIRED'});var role=Permissions.normalizeRole(o.role||'USER');if(required==='ADMIN'&&!isAdminRole(role))return json(res,403,{ok:false,error:'ADMIN_REQUIRED'});cb(role);});});q.on('timeout',function(){q.destroy(new Error('AUTH_TIMEOUT'));});q.on('error',function(){json(res,503,{ok:false,error:'AUTH_SERVICE_UNAVAILABLE'});});}
function allowCore(req,res,p){var c=Permissions.classify(req.method,p),role=currentRole();if(AUTH_MODE==='disabled'&&!Permissions.allowed(role,c)){json(res,403,{ok:false,error:'ACCESS_DENIED',role:role,required:c.permission});return false;}return c;}
var handler=function(req,res){var u=new URL(req.url,'http://'+HOST+':'+PORT),p=u.pathname;
 if(AUTH21_BROWSER_TLS&&req.method==='GET'&&
   (p==='/'||p==='/auth21/ui'||p==='/auth21/ui.js'||p==='/auth21/ui.css')){
   var uiFiles={'/':'Frontend/Pages/auth21.html',
    '/auth21/ui':'Frontend/Pages/auth21.html',
    '/auth21/ui.js':'Frontend/JS/auth21_ui.js',
    '/auth21/ui.css':'Frontend/CSS/auth21_ui.css'};
   var rel=uiFiles[p],file=path.resolve(ROOT,rel);
   return fs.readFile(file,function(e,data){
    if(e)return json(res,404,{error:'NOT_FOUND'});
    res.writeHead(200,{'Content-Type':p.endsWith('.js')?'application/javascript; charset=utf-8':
     p.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8',
     'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
     'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
     'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
    res.end(data);
   });
  }
 var auth21Boundary=require('../../Core/Clients/auth21_service_boundary').decision(process.env,'gateway',req.method,p);
 if(auth21Boundary.intercept){if(auth21Boundary.forwardToCore)return proxy(req,res,CORE_PORT,p+u.search,{service:'Auth21 isolated Core',permission:'AUTH'});return json(res,404,{error:'NOT_FOUND'});}
 if(req.method==='GET'&&p==='/ui-health')return json(res,200,{ok:true,name:'IA-TB UI Service',version:BUILD.version,pid:process.pid,host:HOST,port:PORT,corePort:CORE_PORT,routerPort:ROUTER_PORT,firewallPort:FIREWALL_PORT,authMode:AUTH_MODE,bypassRole:AUTH_MODE==='disabled'?BYPASS_ROLE:null,separation:'UI_PROCESS_ISOLATED'});
 if(req.method==='GET'&&p==='/ui-api/session')return json(res,200,{ok:true,authenticated:AUTH_MODE!=='disabled',authMode:AUTH_MODE,role:currentRole(),permissions:{read:true,userWrite:true,adminWrite:isAdminRole(currentRole()),superAdmin:currentRole()==='SUPERADMIN'},policy:'SERVER_SIDE'});
 if(req.method==='GET'&&p==='/communication-health')return proxy(req,res,ROUTER_PORT,p+u.search,{service:'Communication Router',permission:'READ'});
 if(req.method==='GET'&&p==='/router-health')return authorizePage(req,res,'USER',function(){proxy(req,res,ROUTER_PORT,p+u.search,{service:'Router Health',permission:'READ'});});
 if(req.method==='POST'&&p==='/communication-test')return authorizePage(req,res,'USER',function(){proxy(req,res,ROUTER_PORT,p+u.search,{service:'Communication Router',permission:'READ'});});
 if(req.method==='POST'&&p==='/communication/v1/ui/read')return authorizePage(req,res,'USER',function(){proxy(req,res,ROUTER_PORT,p+u.search,{service:'Communication Router UI Read',permission:'READ'});});
 if(req.method==='POST'&&p==='/communication/v1/ui/write'){
  // Auth21 never authorizes writes through the legacy page-role check.
  // A Core-issued, action-bound interprocess proof is required before enabling this bridge.
  if(require('../../Core/Clients/auth21_service_boundary').active(process.env))
   return json(res,403,{ok:false,error:'AUTH21_BUSINESS_WRITE_NOT_AUTHORIZED'});
  return authorizePage(req,res,'USER',function(){proxy(req,res,ROUTER_PORT,p+u.search,{service:'Communication Router UI Write',permission:'WRITE'});});
 }
 if(req.method==='POST'&&p==='/communication/v1/client/ack')return authorizePage(req,res,'USER',function(){readJsonBody(req,131072,function(e,b){if(e)return json(res,400,{ok:false,error:e.message});ROUTER_CLIENT.ackClientAction(b,function(er,o){if(er)return json(res,er.statusCode||400,{ok:false,error:er.message});json(res,200,o);});});});
 if(p.indexOf('/communication/')===0)return json(res,403,{ok:false,error:'UI_COMMUNICATION_ENDPOINT_FORBIDDEN'});
 if((req.method==='GET'||req.method==='HEAD')&&PAGE_MAP[p])return authorizePage(req,res,(p==='/admin'||p==='/admin/'||p==='/admin/vaults'||p==='/admin/vaults/')?'ADMIN':'USER',function(){if(p==='/admin'||p==='/admin/')return serveAdminPage(res);serveFile(res,PAGE_MAP[p]);});
 if((req.method==='GET'||req.method==='HEAD')&&p.indexOf('/assets/')===0){var a=findAsset(p.slice('/assets/'.length));return a?serveFile(res,a):json(res,404,{ok:false,error:'UI_ASSET_NOT_FOUND'});}
 if(p.indexOf('/firewall-admin/')===0)return authorizePage(req,res,'ADMIN',function(){var sub=p.slice('/firewall-admin'.length)||'/';proxy(req,res,FIREWALL_PORT,sub+u.search,{service:'Firewall Admin',permission:'ADMIN_WRITE'});});
 // Stable browser contract for IA Trading View. Always Market Data Collector, never Core market endpoints.
 if(req.method==='GET'&&p==='/ui-data/market/candles'){var qp='/market-data/candles'+u.search;return proxy(req,res,ROUTER_PORT,qp,{service:'Market Data Collector via Router',permission:'READ'});}
 if(p.indexOf('/api/internal/')===0)return json(res,403,{ok:false,error:'UI_INTERNAL_API_FORBIDDEN'});
 if(p.indexOf('/api/')===0){var cl=allowCore(req,res,p);if(!cl)return;return proxy(req,res,CORE_PORT,p+u.search,{service:'Core API',permission:cl.permission});}
 json(res,404,{ok:false,error:'UI_ROUTE_NOT_FOUND'});
};
var UM_GATEWAY=require('./user_management_gateway').create({root:ROOT,corePort:CORE_PORT,pages:PAGE_MAP,findAsset:findAsset});
var server=UM_GATEWAY?https.createServer(UM_GATEWAY.tlsOptions,UM_GATEWAY.handler):AUTH21_BROWSER_TLS?https.createServer(AUTH21_BROWSER_TLS,handler):http.createServer(handler);
server.on('upgrade',function(req,socket){
 if(require("../../Core/Clients/auth21_service_boundary").active(process.env)){
  try{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}catch(_){socket.destroy();}
  return;
 }
 socket.destroy();
});
server.on('error',function(e){console.error('IA-TB UI Service bind error:',e&&e.message||e);process.exit(17);});
server.listen(PORT,HOST,function(){console.log('IA-TB UI Service v'+BUILD.version+' : http://'+HOST+':'+PORT);console.log('Core API interne : http://'+HOST+':'+CORE_PORT);console.log('Router interne   : http://'+HOST+':'+ROUTER_PORT);console.log('Firewall interne : http://'+HOST+':'+FIREWALL_PORT);});
function stop(){server.close(function(){process.exit(0);});setTimeout(function(){process.exit(0);},1200);}process.on('SIGINT',stop);process.on('SIGTERM',stop);
