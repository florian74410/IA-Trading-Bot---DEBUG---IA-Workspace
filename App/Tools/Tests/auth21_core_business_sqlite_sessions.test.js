'use strict';
/* Real SQLite v3 + Argon2 ADMIN -> Core business proof -> signed Router fixture.
 * Explicit isolated fixture, not a production account migration.
 */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const http=require('node:http'),crypto=require('node:crypto');
const {once}=require('node:events');
const Database=require('better-sqlite3');
const ClientCrypto=require('../../Core/Clients/client_crypto');
const {Auth21SessionStore}=require('../../Core/Clients/auth21_session_store');
const {Auth21FirstAdminTrial}=require('../../Core/Clients/auth21_first_admin_trial');
const {migrateFixture}=require('../CI/auth21_v3_migration_trial');
const {createCoreBusinessHttp}=require('../../Core/Clients/auth21_core_business_http');
const {proofCodec}=require('../../Core/Clients/auth21_ipc_proof');
const business=require('../../Core/Clients/auth21_business_capability');
const PASS='SYNTHETIC_ONLY_AUTH21_ADMIN_TEST_2026!';
async function request(port,route,raw='',headers={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,path:route,method:'POST',
   headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),...headers}},res=>{
    let data='';res.on('data',x=>data+=x);res.on('end',()=>resolve({status:res.statusCode,body:data}));
   });req.on('error',reject);req.end(raw);
 });
}
test('SQLite ADMIN login authorizes exact signed business write; revocation immediately denies next operation',
 {timeout:35000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-v3-'));
 const file=path.join(root,'clients.sqlite'),keyFile=path.join(root,'client_master.key');
 const cipher=new ClientCrypto(keyFile,{clientDbPath:file});
 const db=new Database(file);db.pragma('foreign_keys=ON');
 t.after(()=>{if(db.open)db.close();fs.rmSync(root,{recursive:true,force:true});});
 for(const name of ['001_clients_v1.sql','002_client_accounts_v1.sql'])
  db.exec(fs.readFileSync(path.resolve(__dirname,'../../Core/Clients/migrations',name),'utf8'));
 await migrateFixture(db,{fixtureRoot:root});
 const manager=new Auth21FirstAdminTrial({db,fixtureRoot:root,clientCrypto:cipher,
  authorizeLocalOperator:()=>true});
 const account=await manager.createFirstAdmin({identity:{firstName:'Fiction',lastName:'Only',
   email:'synthetic@example.invalid'},username:'SYNTHETIC_ADMIN',password:PASS,
  confirmation:'CREATE FIRST ADMIN ON FIXTURE'});
 assert.equal(account.role,'ADMIN');
 const sessions=new Auth21SessionStore({db,clientCrypto:cipher,idleLockSeconds:300});
 const secret=crypto.randomBytes(32),codec=proofCodec({secret});
 const router=http.createServer((req,res)=>{
  let chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
   const raw=Buffer.concat(chunks),digest=crypto.createHash('sha256').update(raw).digest('hex');
   const received=business.verify({codec:proofCodec({secret}),proof:req.headers['x-iatb-auth21-proof'],
    action:'indicator.settings.set',bodyDigest:digest});
   res.writeHead(received.allowed?200:403,{'Content-Type':'application/json'});
   res.end(JSON.stringify(received.allowed?{ok:true}:{error:'DENIED'}));
  });
 });
 router.listen(0,'127.0.0.1');await once(router,'listening');
 t.after(()=>new Promise(resolve=>router.close(resolve)));
 const env={IATB_AUTH21_CORE_AUTH_TRIAL:'1',IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1',
  IATB_DEBUG_MODE:'1',IATB_AUTH21_BUSINESS_TRIAL:'1',IATB_AUTH21_IPC_PROBE_TRIAL:'1',
  IATB_TRADING_LIVE:'0'};
 const core=http.createServer(createCoreBusinessHttp({sessions,codec,routerPort:router.address().port,env}));
 core.listen(0,'127.0.0.1');await once(core,'listening');
 t.after(()=>new Promise(resolve=>core.close(resolve)));
 const login=await sessions.loginWithPassword(account.clientId,PASS);
 assert.equal(login.role,'ADMIN');
 const bearer={Authorization:'Bearer '+login.token};
 const route='/auth21/business/indicator/settings';
 const raw=JSON.stringify({enabled:true,refreshMs:5000});
 assert.equal((await request(core.address().port,route,raw,bearer)).status,200);
 // Every new Core proof must depend on a currently active session.
 const changed=await sessions.loginWithPassword(account.clientId,PASS);
 assert.equal(changed.role,'ADMIN');
 // Last ADMIN downgrade MUST fail at the database layer.
 assert.throws(()=>db.prepare("UPDATE client_accounts SET role='USER',updated_at=? WHERE client_id=?")
  .run(new Date().toISOString(),account.clientId),/LAST_ACTIVE_ADMIN_REQUIRED/);
 // Independently invalidate all existing sessions by changing account security version.
 db.prepare('UPDATE clients SET security_version=security_version+1 WHERE client_id=?')
  .run(account.clientId);
 assert.equal((await request(core.address().port,route,raw,
  {Authorization:'Bearer '+changed.token})).status,403);
 assert.equal(sessions.revokeSession(login.token),true);
 assert.equal((await request(core.address().port,route,raw,bearer)).status,403);
 assert.equal((await request(core.address().port,route,raw,{Authorization:'Bearer '+crypto.randomBytes(32).toString('base64url')})).status,403);
});
