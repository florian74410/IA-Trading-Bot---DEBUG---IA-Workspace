'use strict';
// Authenticated UI has exactly one authority: Core's live server-side session.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),http=require('node:http');
const {configuration,tls}=require('../../Core/Clients/UserManagement/config');
function create({root,corePort,pages,findAsset}){
 const config=configuration();if(!config.enabled)return null;
 const tlsOptions=tls(config);
 function upstream(req,res,pathname){
  const headers={...req.headers,host:'localhost:'+corePort};
  for(const k of Object.keys(headers))if((k.startsWith('x-iatb-')&&k!=='x-iatb-csrf')||['connection','transfer-encoding'].includes(k))delete headers[k];
  const q=https.request({host:'127.0.0.1',port:corePort,servername:'localhost',ca:tlsOptions.cert,rejectUnauthorized:true,path:pathname,method:req.method,headers,timeout:20000},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  q.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"CORE_UNAVAILABLE"}');});q.on('timeout',()=>q.destroy());req.pipe(q);
 }
 function core(req,pathname){return new Promise((resolve,reject)=>{const q=https.get({host:'127.0.0.1',port:corePort,servername:'localhost',ca:tlsOptions.cert,path:pathname,headers:{cookie:req.headers.cookie||''},timeout:5000},r=>{let n=0,parts=[];r.on('data',b=>{n+=b.length;if(n>524288)q.destroy(Error('CORE_RESPONSE_TOO_LARGE'));else parts.push(b);});r.on('end',()=>{try{resolve({status:r.statusCode,data:JSON.parse(Buffer.concat(parts))});}catch(e){reject(e);}});});q.on('error',reject);q.on('timeout',()=>q.destroy(Error('CORE_TIMEOUT')));});}
 function file(res,rel,bootstrap){
  const abs=path.resolve(root,rel);if(!abs.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(abs,(e,data)=>{if(e){res.writeHead(404);return res.end();}
   const html=abs.endsWith('.html');
   if(html&&bootstrap){const safe=JSON.stringify(bootstrap).replace(/</g,'\\u003c');data=Buffer.from(data.toString().replace('<head>','<head><script type="application/json" id="iatb-session">'+safe+'</script><script src="/assets/user_session.js"></script>'));}
   const type=html?'text/html':abs.endsWith('.css')?'text/css':abs.endsWith('.js')?'application/javascript':abs.endsWith('.svg')?'image/svg+xml':abs.endsWith('.png')?'image/png':abs.endsWith('.json')?'application/json':'application/octet-stream';
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(data);
  });
 }
 async function handler(req,res){
  try{
   const u=new URL(req.url,config.origin),p=u.pathname;
   if(!req.socket.encrypted){res.writeHead(403);return res.end();}
   if(p==='/ui-health'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(JSON.stringify({ok:true,name:'IA-TB UI Service',authentication:'Auth21',version:require('../../Core/Shared/build_info').version,pid:process.pid}));}
   // Auth21 2.2.3: authenticated and sanitized operational states (no internal IP/port leakage).
   if((p==='/router-health'||p==='/route-health')&&req.method==='GET'){
    const me=await core(req,'/auth21/me');
    if(me.status!==200){res.writeHead(401,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end('{"error":"AUTH_REQUIRED"}');}
    return new Promise(resolve=>{
     const names=['core','router','firewall','indicators','marketData','liquidity','fundamental','risk','trading','portfolio','strategy','supervisor'];
     const q=http.get({host:'127.0.0.1',port:Number(process.env.ROUTER_PORT)||8021,path:'/router-health',timeout:3000},r=>{
      let size=0,parts=[];r.on('data',b=>{size+=b.length;if(size>65536)q.destroy();else parts.push(b);});
      r.on('end',()=>{let payload;try{payload=JSON.parse(Buffer.concat(parts).toString());}catch(_){payload=null;}
       const ok=r.statusCode===200&&payload&&payload.router===true&&payload.ok===true;
       const deps={};for(const name of names)deps[name]={ok:!!(ok&&payload.dependencies&&payload.dependencies[name]&&payload.dependencies[name].ok===true)};
       res.writeHead(ok?200:503,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
       res.end(JSON.stringify({ok:!!ok,router:!!ok,dependencies:deps}));resolve();
      });
     });q.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"ROUTER_HEALTH_UNAVAILABLE"}');}resolve();});
     q.on('timeout',()=>q.destroy());
    });
   }
   if(p==='/login'&&req.method==='GET')return file(res,'Frontend/Pages/login.html');
   if(p.startsWith('/assets/')&&['GET','HEAD'].includes(req.method)){const a=findAsset(p.slice(8));if(a)return file(res,a);res.writeHead(404);return res.end();}
   if(p.startsWith('/auth21/internal/')||p.startsWith('/api/internal/')){res.writeHead(403);return res.end();}
   if(p.startsWith('/api/')||p.startsWith('/auth21/')||p==='/ui-api/session'||p==='/ui-data/market/candles'||['/communication/v1/ui/read','/communication/v1/ui/write','/communication/v1/client/ack'].includes(p))return upstream(req,res,req.url);
   if(pages[p]&&['GET','HEAD'].includes(req.method)){
    const me=await core(req,'/auth21/me');if(me.status!==200){res.writeHead(303,{Location:'/login','Cache-Control':'no-store'});return res.end();}
    if(me.data.role==='GUEST'&&/^\/(bank|keys|portfolio|settings)(?:\/|$)/.test(p)){res.writeHead(403);return res.end();}
    if(p.startsWith('/admin')&&me.data.role!=='ADMIN'){res.writeHead(403);return res.end();}
    const [csrf,state]=await Promise.all([core(req,'/auth21/csrf'),core(req,'/auth21/browser-state')]);
    if(csrf.status!==200||state.status!==200)throw Error('SESSION_UNAVAILABLE');
    return file(res,pages[p],{...me.data,csrfToken:csrf.data.csrfToken,state:state.data.state});
   }
   res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"ROUTE_NOT_AVAILABLE"}');
  }catch(_){if(!res.headersSent)res.writeHead(503);res.end();}
 }
 return {handler,tlsOptions};
}
module.exports={create};
