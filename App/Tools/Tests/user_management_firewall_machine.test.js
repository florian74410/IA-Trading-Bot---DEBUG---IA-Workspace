'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{once}=require('node:events');
test('authenticated Firewall machine ingress requires the token and exact body signature',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-firewall-auth-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const listener=net.createServer().listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 const env={...process.env,IATB_AUTH_MODE:'authenticated',IATB_FIREWALL_ENABLED:'1',IATB_FIREWALL_PORT:String(port),IATB_DATA_ROOT:path.join(root,'data'),IATB_RUNTIME_ROOT:path.join(root,'runtime'),IATB_STATE_ROOT:path.join(root,'state'),IATB_ANNEX_ROOT:path.join(root,'annex'),IATB_UPDATES_ROOT:path.join(root,'updates')};
 let output='';const child=spawn(process.execPath,[path.resolve(__dirname,'../../Core/Firewall/firewall_service.js')],{env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}});
 function call(route,body=null,headers={}){return new Promise((resolve,reject)=>{const raw=body===null?'':JSON.stringify(body),q=http.request({host:'127.0.0.1',port,path:route,method:body===null?'GET':'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),...headers}},r=>{let data='';r.on('data',b=>data+=b);r.on('end',()=>resolve({status:r.statusCode,data:JSON.parse(data)}));});q.on('error',reject);q.end(raw);});}
 let ready=false;for(let i=0;i<100;i++){try{if((await call('/health')).status===200){ready=true;break;}}catch(_){}await new Promise(r=>setTimeout(r,30));}assert(ready,output);
 // Key is generated only under this fictional fixture's runtime directory.
 function find(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory()){const found=find(p);if(found)return found;}else if(/^[a-f0-9]{64}$/i.test(fs.readFileSync(p,'utf8').trim()))return p;}}
 const token=fs.readFileSync(find(env.IATB_RUNTIME_ROOT),'utf8').trim(),body={};
 assert.equal((await call('/api/data/inspect',body)).status,403);
 assert.equal((await call('/api/data/inspect',body,{'X-IATB-CP-Token':token})).status,400);
 const signed={'X-IATB-CP-Token':token,'X-IATB-CP-Signature':crypto.createHmac('sha256',token).update(JSON.stringify(body)).digest('hex')};
 assert.equal((await call('/api/data/inspect',{message:{provider:'ALTERED'}},signed)).status,400);
 assert.equal((await call('/api/data/inspect',body,signed)).data.error,'MESSAGE_REQUIRED');
 assert.equal((await call('/api/thread/stop',body,signed)).data.error,'ADMIN_CAPABILITY_REQUIRED');
 assert.equal((await call('/unknown',body,signed)).status,403);
});
