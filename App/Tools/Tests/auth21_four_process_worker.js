'use strict';
/* Isolated fixture server only; launched as a child process by the test. */
const http=require('node:http');
const crypto=require('node:crypto');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const business=require('../../Core/Clients/auth21_business_capability');
const {createWriter}=require('../../Core/Clients/auth21_indicator_fixture_writer');
const role=process.env.AUTH21_FIXTURE_ROLE;
const root=process.env.AUTH21_FIXTURE_DIR;
const secret=Buffer.from(process.env.AUTH21_FIXTURE_SECRET||'','hex');
if(!['gateway','core','router','indicator'].includes(role)||!root||secret.length!==32)process.exit(2);
const codec=proofCodec({secret});
const target=()=>Number(process.env['AUTH21_FIXTURE_'+({gateway:'CORE',core:'ROUTER',router:'INDICATOR'}[role])+'_PORT']);
const writer=role==='indicator'?createWriter({root,codec}):null;
const respond=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(obj))};
function forward(res,body,headers){
 const port=target();
 if(!port)return respond(res,503,{error:'NO_TARGET'});
 const data=JSON.stringify(body);
 const q=http.request({hostname:'127.0.0.1',port,path:'/write',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(data),...headers},timeout:2500},r=>{
  let s='';r.on('data',b=>s+=b);r.on('end',()=>{res.writeHead(r.statusCode,{'content-type':'application/json'});res.end(s)});
 });
 q.once('error',()=>respond(res,503,{error:'UPSTREAM_FAILED'}));q.end(data);
}
const sessions={verifySession:t=>{
 if(t==='admin')return {clientId:'CLadmin1',role:'ADMIN'};
 if(t==='user')return {clientId:'CLuser1',role:'USER'};
 if(t==='guest')return {clientId:'CLguest1',role:'GUEST'};
 return null;
}};
const server=http.createServer((req,res)=>{
 if(req.method!=='POST'||req.url!=='/write')return respond(res,404,{error:'NOT_FOUND'});
 let chunks=[],size=0;
 req.on('data',b=>{size+=b.length;if(size<=2048)chunks.push(b)});
 req.on('end',()=>{
  if(size>2048)return respond(res,413,{error:'TOO_LARGE'});
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch(_){return respond(res,400,{error:'BAD_JSON'})}
  if(!body||typeof body!=='object'||!body.settings)return respond(res,400,{error:'BAD_INPUT'});
  const settings=body.settings;
  const bodyDigest=crypto.createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
  if(Object.keys(settings).sort().join(',')!=='enabled,refreshMs'||typeof settings.enabled!=='boolean'||
   !Number.isSafeInteger(settings.refreshMs)||settings.refreshMs<1000||settings.refreshMs>60000)
   return respond(res,400,{error:'BAD_SETTINGS'});
  if(role==='gateway'){
   const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
   return forward(res,body,{'authorization':'Bearer '+token});
  }
  if(role==='core'){
   const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
   const proof=business.issue({sessions,token,codec,action:'indicator.settings.set',bodyDigest});
   if(!proof)return respond(res,403,{error:'FORBIDDEN'});
   return forward(res,body,{'x-iatb-auth21-proof':proof});
  }
  const proof=req.headers['x-iatb-auth21-proof'];
  if(role==='router'){
   if(!business.verify({codec,proof,action:'indicator.settings.set',bodyDigest}).allowed)return respond(res,403,{error:'FORBIDDEN'});
   return forward(res,body,{'x-iatb-auth21-proof':proof});
  }
  const result=writer.write({proof,settings,bodyDigest});
  return respond(res,result.ok?200:403,result);
 });
});
server.listen(0,'127.0.0.1',()=>process.send({ok:true,port:server.address().port}));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
