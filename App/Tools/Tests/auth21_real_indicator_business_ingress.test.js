'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),crypto=require('node:crypto');
const {once}=require('node:events');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const {createCoreBusinessIssuer}=require('../../Core/Clients/auth21_core_business_issuer');
const {openEngineSnapshotTrial}=require('../../Core/Backup/auth21_engine_snapshot_trial');
const {createServer}=require('../../Core/Clients/auth21_engine_ingress');
test('real HTTP Indicator business route validates Core-issued capability, ownership, digest and freeze',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'.iatb-auth21-core-local-trial'),'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n',{mode:0o600});
 const security=path.join(root,'userdata','Security');
 fs.mkdirSync(security,{recursive:true,mode:0o700});
 const secret=crypto.randomBytes(32);
 fs.writeFileSync(path.join(security,'auth21_ipc.key'),secret,{mode:0o600});
 const env={IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',IATB_AUTH21_CORE_AUTH_TRIAL:'1',
  IATB_DEBUG_MODE:'1',IATB_DEBUG_BOOTSTRAP:'0',IATB_AUTH21_BUSINESS_TRIAL:'1',
  IATB_AUTH21_IPC_PROBE_TRIAL:'1',IATB_TRADING_LIVE:'0',IATB_AUTH21_LOCAL_TRIAL_ROOT:root};
 for(const [key,dir] of [['RUNTIME','runtime'],['DATA','userdata'],['ANNEX','annexes'],
  ['UPDATES','updates'],['STATE','legacy']])env['IATB_'+key+'_ROOT']=path.join(root,dir);
 const gate=openEngineSnapshotTrial({env,engine:'indicators'}).gate;
 const sessions={verifySession:token=>token==='admin'?{clientId:'CLAlice',role:'ADMIN'}:
  token==='user'?{clientId:'CLBob',role:'USER'}:null};
 const issuer=createCoreBusinessIssuer({sessions,codec:proofCodec({secret}),env});
 let legacyCalls=0;
 const server=createServer((req,res)=>{legacyCalls++;res.end('legacy')},env);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port;
 async function request(route,raw,proof,headers={}){
  return new Promise((resolve,reject)=>{
   const req=http.request({hostname:'127.0.0.1',port,path:route,method:'POST',
    headers:{'Content-Length':Buffer.byteLength(raw),
     ...(proof?{'X-IATB-Auth21-Proof':proof}:{}),...headers}},res=>{
      let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));
    });req.on('error',reject);req.end(raw);
  });
 }
 const route='/auth21/business/indicator/settings';
 const raw=JSON.stringify({enabled:true,refreshMs:5000});
 const digest=crypto.createHash('sha256').update(raw).digest('hex');
 const issue=(token='admin',d=digest)=>issuer.issueForService({token,action:'indicator.settings.set',bodyDigest:d});
 assert.equal(issue('user'),null);
 assert.equal(issue('missing'),null);
 assert.equal((await request(route,raw,null)).status,403);
 assert.equal((await request('/cp/v1',raw,issue())).status,403);
 assert.equal((await request(route,raw,issue(),{Origin:'https://attacker.example'})).status,403);
 assert.equal((await request(route,raw,issue(),{'X-Client-Id':'CLBob',Cookie:'session=forged'})).status,403);
 assert.equal((await request(route,raw,issue('admin','0'.repeat(64)))).status,403);
 const verified=await request(route,raw,issue());
 assert.equal(verified.status,200);
 assert.equal(verified.body.settings.enabled,true);
 assert.equal((await request(route,raw,issue())).status,200);
 const file=path.join(root,'runtime','auth21-business','indicator-settings.fixture.json');
 assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).refreshMs,5000);
 assert.equal((await request(route,raw,issue('admin','0'.repeat(64)))).status,403);
 gate.prepare(1);
 assert.equal((await request(route,raw,issue())).status,409);
 assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).refreshMs,5000);
 gate.abort(1);
 assert.equal((await request(route,raw,issue())).status,200);
 assert.equal(legacyCalls,0);
});
