'use strict';
/* Four independent loopback HTTP processes, isolated test fixture only.
 * No production listeners, engine settings, wallet, or trading operations.
 */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),{fork}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const worker=path.join(__dirname,'auth21_four_process_worker.js');
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
async function launch(role,extra){
 const child=fork(worker,[],{env:{...process.env,AUTH21_FIXTURE_ROLE:role,...extra},stdio:['ignore','pipe','pipe','ipc']});
 return await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('WORKER_START_TIMEOUT')),8000);
  child.once('message',m=>{clearTimeout(timeout);if(m.ok)resolve({child,port:m.port});else reject(Error(m.error))});
  child.once('exit',c=>{clearTimeout(timeout);reject(Error('WORKER_EXIT_'+c))});
 });
}
function request(port,body,headers={}){
 return new Promise((resolve,reject)=>{
  const payload=JSON.stringify(body);
  const q=http.request({host:'127.0.0.1',port,path:'/write',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(payload),...headers},timeout:3000},r=>{
   let data='';r.on('data',c=>data+=c);r.on('end',()=>resolve({code:r.statusCode,body:JSON.parse(data)}));
  });q.once('error',reject);q.end(payload);
 });
}
test('four real loopback HTTP processes persist one authorized write and reject other users',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'auth21-four-http-'));
 const secret=randomBytes(32).toString('hex');
 const base={AUTH21_FIXTURE_DIR:root,AUTH21_FIXTURE_SECRET:secret};
 const started=[];
 t.after(async()=>{
  for(const w of started)w.child.kill('SIGTERM');
  await wait(120);
  fs.rmSync(root,{recursive:true,force:true});
 });
 for(const role of ['indicator','router','core','gateway']){
  const w=await launch(role,base);started.push(w);
  base['AUTH21_FIXTURE_'+role.toUpperCase()+'_PORT']=String(w.port);
 }
 const gw=started[3].port;
 const before={enabled:false,refreshMs:5000};
 const data={enabled:true,refreshMs:8000};
 assert.deepEqual((await request(gw,{settings:data},{authorization:'Bearer admin'})).code,200);
 const file=path.join(root,'indicator-settings.fixture.json');
 assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),data);
 for(const identity of ['user','guest','invalid']){
  const r=await request(gw,{settings:before},{authorization:'Bearer '+identity});
  assert.equal(r.code,403);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),data);
 }
 assert.equal((await request(started[0].port,{settings:before})).code,403);
 assert.equal((await request(gw,{settings:{enabled:true,refreshMs:-1}},{authorization:'Bearer admin'})).code,400);
 assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),data);
 assert.equal((await request(gw,{settings:before},{authorization:'Bearer admin'})).code,200);
 assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),before);
});
