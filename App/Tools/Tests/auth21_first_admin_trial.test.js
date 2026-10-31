'use strict';
/* Auth 2.1 — OFFLINE first ADMIN and legacy DEBUG identity review.
 * No production DB, no actual user credentials, no real wallet, no API.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
const ClientCrypto=require('../../Core/Clients/client_crypto');
const {Auth21SessionStore}=require('../../Core/Clients/auth21_session_store');
const {Auth21AdminStore}=require('../../Core/Clients/auth21_admin_store');
const {Auth21FirstAdminTrial}=require('../../Core/Clients/auth21_first_admin_trial');
const {migrateFixture}=require('../CI/auth21_v3_migration_trial');
const {LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');

const PASS='FICTIONAL_FIRST_ADMIN_PASSWORD_2026$';
const USERNAME='OVERKILL_TEST';
const OLD_DIR=path.resolve(__dirname,'../../Core/Clients/migrations');
function fixture(t,{gate=null,allowed=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-v3-'));
 const file=path.join(root,'test.sqlite');
 const keyFile=path.join(root,'client_master.key');
 const cipher=new ClientCrypto(keyFile,{clientDbPath:file});
 const db=new Database(file);
 db.pragma('foreign_keys=ON');
 for(const name of ['001_clients_v1.sql','002_client_accounts_v1.sql']){
  db.exec(fs.readFileSync(path.join(OLD_DIR,name),'utf8'));
 }
 const f={root,file,keyFile,db,cipher,gate,permission:{allowed}};
 t.after(()=>{if(f.db.open)f.db.close();fs.rmSync(root,{recursive:true,force:true});});
 return f;
}
function addClient(f,id,origin='manual',status='ACTIVE'){
 const now='2026-10-14T00:00:00Z';
 f.db.prepare([
  'INSERT INTO clients(client_id,external_ref_hash,first_name_enc,email_enc,',
  'status,security_version,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)'
 ].join(' ')).run(id,
  f.cipher.externalHash(origin==='debug'?'debug-user:'+USERNAME:'fixture:'+id),
  f.cipher.seal('Fictional'),f.cipher.seal('test-'+id+'@example.invalid'),status,now,now);
}
function addLogin(f,id,role='SUPERADMIN',username=USERNAME){
 const now='2026-10-14T00:00:00Z';
 const salt=crypto.randomBytes(16).toString('hex');
 const digest=crypto.pbkdf2Sync(PASS,salt,180000,32,'sha256').toString('hex');
 f.db.prepare([
  'INSERT INTO client_accounts(client_id,username_enc,username_hash,password_hash,',
  'password_salt,password_iterations,role,enabled,created_at,updated_at)',
  'VALUES(?,?,?,?,?,?,?,?,?,?)'
 ].join(' ')).run(id,f.cipher.seal(username),f.cipher.lookupHash('username:'+username),
  digest,salt,180000,role,1,now,now);
}
function prep(f){
 return migrateFixture(f.db,{fixtureRoot:f.root}).then(()=>new Auth21FirstAdminTrial({
  db:f.db,fixtureRoot:f.root,clientCrypto:f.cipher,snapshotGate:f.gate,
  authorizeLocalOperator:()=>f.permission.allowed
 }));
}
function options(other={}){
 return {identity:{firstName:'Only',lastName:'Fiction',email:'only-fiction@example.invalid'},
  username:USERNAME,password:PASS,confirmation:'CREATE FIRST ADMIN ON FIXTURE',...other};
}
function adminCount(f){
 return f.db.prepare([
  "SELECT COUNT(*) AS n FROM client_accounts a JOIN clients c USING(client_id)",
  "WHERE role='ADMIN' AND enabled=1 AND status='ACTIVE'"
 ].join(' ')).get().n;
}
function snapshot(f,id){
 return {
  client:f.db.prepare('SELECT * FROM clients WHERE client_id=?').get(id),
  account:f.db.prepare('SELECT * FROM client_accounts WHERE client_id=?').get(id),
  wallets:f.db.prepare('SELECT * FROM client_wallets WHERE client_id=?').all(id)
 };
}

test('review is read-only and never automatically retires DEBUG credentials',async t=>{
 const f=fixture(t);addClient(f,'CL000001','debug');addLogin(f,'CL000001');
 f.db.prepare('INSERT INTO client_wallets(client_id,wallet_id,created_at) VALUES(?,?,?)')
  .run('CL000001','FICTIONAL_PUBLIC_WALLET_LINK','2026-10-14');
 const manager=await prep(f);
 const original=snapshot(f,'CL000001');
 const review=manager.review();
 assert.equal(review.activeAdmins,0);
 assert.deepEqual(review.legacyCandidates,[{
  clientId:'CL000001',role:'SUPERADMIN',enabled:true,status:'ACTIVE',walletLinks:1,
  origin:'VERIFIED_DEBUG_BOOTSTRAP',recommendedAction:'REVIEW_AND_REQUEST_EXPLICIT_APPROVAL'
 }]);
 assert.equal(review.safeForAutomaticReset,false);
 assert.deepEqual(snapshot(f,'CL000001'),original);
 assert.equal(fs.existsSync(path.join(f.root,'pre-first-admin.sqlite')),false);
});
test('unknown SUPERADMIN provenance is never assumed DEBUG',async t=>{
 const f=fixture(t);addClient(f,'CL000001','manual');addLogin(f,'CL000001');
 const m=await prep(f);
 assert.equal(m.review().legacyCandidates[0].origin,'UNVERIFIED_SUPERADMIN');
 assert.equal(m.review().legacyCandidates[0].recommendedAction,'MANUAL_PROVENANCE_REVIEW');
});
test('read-only legacy review requires independent trusted local authorization',async t=>{
 const f=fixture(t,{allowed:false});addClient(f,'CL000001','debug');addLogin(f,'CL000001');
 const m=await prep(f);
 assert.throws(()=>m.review(),/AUTH21_LOCAL_OPERATOR_DENIED/);
 assert.equal(adminCount(f),0);
});
test('manual first ADMIN creates new client identity, strong Argon2id and restorable SQLite backup',async t=>{
 const f=fixture(t);const m=await prep(f);
 const result=await m.createFirstAdmin(options());
 assert.equal(result.role,'ADMIN');
 assert.equal(result.createdIdentity,true);
 assert.equal(result.convertedLegacy,false);
 assert.equal(adminCount(f),1);
 assert.equal(result.clientId.startsWith('CL'),true);
 assert.equal(fs.existsSync(result.backupFile),true);
 const original=new Database(result.backupFile,{readonly:true,fileMustExist:true});
 try{
  assert.equal(original.pragma('integrity_check',{simple:true}),'ok');
  assert.equal(original.prepare('SELECT count(*) AS n FROM client_accounts').get().n,0);
 }finally{original.close();}
 const a=f.db.prepare('SELECT password_algo AS algo,password_hash AS digest FROM client_accounts').get();
 assert.equal(a.algo,'ARGON2ID');assert.match(a.digest,/^\$argon2id\$/);
 const s=new Auth21SessionStore({db:f.db,clientCrypto:f.cipher,nowSeconds:()=>1900000000});
 assert.equal((await s.loginWithPassword(result.clientId,PASS)).role,'ADMIN');
 const audits=f.db.prepare('SELECT action,detail_enc FROM client_security_audit').all();
 assert.deepEqual(audits,[{action:'FIRST_ADMIN_MANUAL_BOOTSTRAP',detail_enc:''},{action:'SESSION_ISSUED',detail_enc:''}]);
});
test('first ADMIN on existing client without login preserves same identity and wallet links',async t=>{
 const f=fixture(t);addClient(f,'CL000023');
 f.db.prepare('INSERT INTO client_wallets(client_id,wallet_id,created_at) VALUES(?,?,?)')
  .run('CL000023','PUBLIC_WALLET_FIXTURE','2026-10-14');
 const before=snapshot(f,'CL000023').client;const m=await prep(f);
 const r=await m.createFirstAdmin({clientId:'CL000023',username:USERNAME,password:PASS,
  confirmation:'CREATE FIRST ADMIN ON FIXTURE'});
 assert.equal(r.clientId,'CL000023');assert.equal(r.createdIdentity,false);
 assert.deepEqual(snapshot(f,'CL000023').client,before);
 assert.equal(snapshot(f,'CL000023').wallets.length,1);
 assert.equal(adminCount(f),1);
});
test('legacy SUPERADMIN requires affirmative conversion selection, no implicit promotion',async t=>{
 const f=fixture(t);addClient(f,'CL000001','debug');addLogin(f,'CL000001');
 const m=await prep(f);const original=snapshot(f,'CL000001');
 await assert.rejects(()=>m.createFirstAdmin({clientId:'CL000001',username:USERNAME,password:PASS,
  confirmation:'CREATE FIRST ADMIN ON FIXTURE'}),/AUTH21_BOOTSTRAP_EXISTING_LOGIN_REQUIRES_REVIEW/);
 assert.deepEqual(snapshot(f,'CL000001'),original);
 assert.equal(adminCount(f),0);
});
test('explicit legacy SUPERADMIN conversion only affects credentials and role, never identity/wallets',async t=>{
 const f=fixture(t);addClient(f,'CL000001','debug');addLogin(f,'CL000001');
 f.db.prepare('INSERT INTO client_wallets(client_id,wallet_id,created_at) VALUES(?,?,?)')
  .run('CL000001','FICTIONAL_REFERENCE','2026-10-14');
 const before=snapshot(f,'CL000001').client;
 const m=await prep(f);const r=await m.createFirstAdmin({
  clientId:'CL000001',username:USERNAME,password:PASS,convertLegacy:true,
  confirmation:'CREATE FIRST ADMIN ON FIXTURE'
 });
 assert.equal(r.convertedLegacy,true);assert.equal(adminCount(f),1);
 assert.deepEqual(snapshot(f,'CL000001').client.first_name_enc,before.first_name_enc);
 assert.equal(snapshot(f,'CL000001').wallets.length,1);
 assert.equal(f.db.prepare('SELECT password_algo AS x FROM client_accounts').get().x,'ARGON2ID');
 const s=new Auth21SessionStore({db:f.db,clientCrypto:f.cipher,nowSeconds:()=>1900000000});
 assert.ok(await s.loginWithPassword('CL000001',PASS));
});
test('legacy conversion refuses wrong username and does not rewrite existing login',async t=>{
 const f=fixture(t);addClient(f,'CL000001','debug');addLogin(f,'CL000001');
 const m=await prep(f);const before=snapshot(f,'CL000001');
 await assert.rejects(()=>m.createFirstAdmin({clientId:'CL000001',username:'OTHERADMIN',
  password:PASS,convertLegacy:true,confirmation:'CREATE FIRST ADMIN ON FIXTURE'}),
 /AUTH21_BOOTSTRAP_USERNAME_MISMATCH/);
 assert.deepEqual(snapshot(f,'CL000001'),before);
});
test('explicit approval, non-empty password and all identity fields are mandatory',async t=>{
 const f=fixture(t);const m=await prep(f);
 await assert.rejects(()=>m.createFirstAdmin(options({confirmation:'YES'})),/AUTH21_BOOTSTRAP_APPROVAL_REQUIRED/);
 await assert.rejects(()=>m.createFirstAdmin(options({password:'123'})),/AUTH_PASSWORD_LENGTH_INVALID/);
 await assert.rejects(()=>m.createFirstAdmin(options({identity:{firstName:'A'}})),/AUTH21_BOOTSTRAP_IDENTITY_REQUIRED/);
 await assert.rejects(()=>m.createFirstAdmin(options({username:'a'})),/AUTH21_ADMIN_USERNAME_INVALID/);
 assert.equal(adminCount(f),0);
 assert.equal(fs.existsSync(path.join(f.root,'pre-first-admin.sqlite')),false);
});
test('first ADMIN refuses new account when an active ADMIN already exists',async t=>{
 const f=fixture(t);const m=await prep(f);await m.createFirstAdmin(options());
 await assert.rejects(()=>m.createFirstAdmin(options({username:'ANOTHER_ADMIN',
  identity:{firstName:'Another',lastName:'Fake',email:'another@example.invalid'}})),
 /AUTH21_FIRST_ADMIN_ALREADY_EXISTS/);
 assert.equal(adminCount(f),1);
});
test('operator approval revoked during Argon2 calculation prevents ADMIN creation',async t=>{
 const f=fixture(t);const m=await prep(f);
 const pending=m.createFirstAdmin(options());
 f.permission.allowed=false;
 await assert.rejects(()=>pending,/AUTH21_LOCAL_OPERATOR_DENIED/);
 assert.equal(adminCount(f),0);
});
test('snapshot writer blocks first ADMIN after asynchronous hash with no mutations',async t=>{
 const gate=new LocalSnapshotWriter('clients');const f=fixture(t,{gate});
 const m=await prep(f);const pending=m.createFirstAdmin(options());
 gate.prepare(1);
 await assert.rejects(()=>pending,/SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(adminCount(f),0);
 gate.abort(1);
});
test('audit insertion failure atomically rolls back new identity and login',async t=>{
 const f=fixture(t);const m=await prep(f);
 f.db.exec("CREATE TRIGGER fail_bootstrap_audit BEFORE INSERT ON client_security_audit WHEN NEW.action='FIRST_ADMIN_MANUAL_BOOTSTRAP' BEGIN SELECT RAISE(ABORT,'FICTIONAL_AUDIT_ERROR'); END;");
 await assert.rejects(()=>m.createFirstAdmin(options()),/FICTIONAL_AUDIT_ERROR/);
 assert.equal(adminCount(f),0);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM clients').get().n,0);
 assert.equal(fs.existsSync(path.join(f.root,'pre-first-admin.sqlite')),true);
});
test('concurrent password reset of legacy account refuses bootstrap promotion',async t=>{
 const f=fixture(t);addClient(f,'CL000001','debug');addLogin(f,'CL000001');
 const m=await prep(f);const before=snapshot(f,'CL000001');
 await assert.rejects(()=>m.createFirstAdmin({
  clientId:'CL000001',username:USERNAME,password:PASS,convertLegacy:true,
  confirmation:'CREATE FIRST ADMIN ON FIXTURE',
  hooks:{beforeCommit(db){db.prepare("UPDATE client_accounts SET password_hash='FAKE_RESET' WHERE client_id='CL000001'").run();}}
 }),/AUTH21_BOOTSTRAP_STALE_(?:CLIENT|ACCOUNT)/);
 assert.equal(adminCount(f),0);
 assert.equal(f.db.prepare('SELECT password_hash AS x FROM client_accounts').get().x,'FAKE_RESET');
 assert.notEqual(before.account.password_hash,'FAKE_RESET');
});
test('fake DB outside temporary fixture is rejected before any login logic',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-bad-dir-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'random.sqlite');const db=new Database(file);
 t.after(()=>{if(db.open)db.close();});
 assert.throws(()=>new Auth21FirstAdminTrial({db,fixtureRoot:root,
  authorizeLocalOperator:()=>true,clientCrypto:{}}),/AUTH21_FIXTURE_ONLY/);
});
test('database opened without original fixture master key is rejected',async t=>{
 const f=fixture(t);await migrateFixture(f.db,{fixtureRoot:f.root});
 const foreign=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-other-key-'));
 t.after(()=>fs.rmSync(foreign,{recursive:true,force:true}));
 const foreignKey=path.join(foreign,'client_master.key');
 fs.writeFileSync(foreignKey,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 const key=new ClientCrypto(foreignKey,{clientDbPath:f.file});
 assert.throws(()=>new Auth21FirstAdminTrial({db:f.db,fixtureRoot:f.root,
  authorizeLocalOperator:()=>true,clientCrypto:key}),/AUTH21_FIXTURE_KEY_REQUIRED/);
});
test('missing or disabled selected existing client fails closed',async t=>{
 const f=fixture(t);addClient(f,'CL000001','manual','DISABLED');
 const m=await prep(f);
 await assert.rejects(()=>m.createFirstAdmin({clientId:'CL000001',username:USERNAME,
  password:PASS,confirmation:'CREATE FIRST ADMIN ON FIXTURE'}),/AUTH21_BOOTSTRAP_CLIENT_UNAVAILABLE/);
 await assert.rejects(()=>m.createFirstAdmin({clientId:'CL009999',username:USERNAME,
  password:PASS,confirmation:'CREATE FIRST ADMIN ON FIXTURE'}),/AUTH21_BOOTSTRAP_CLIENT_UNAVAILABLE/);
 assert.equal(adminCount(f),0);
});

async function transitionFixture(f){
 addClient(f,'CL000001','debug');addLogin(f,'CL000001');
 f.db.prepare('INSERT INTO client_wallets(client_id,wallet_id,created_at) VALUES(?,?,?)')
  .run('CL000001','WALLET_PUBLIC_REFERENCE_TEST','2026-10-14');
 const bootstrap=await prep(f);
 const actor=await bootstrap.createFirstAdmin(options({
  username:'NEW_ADMIN_USER',
  identity:{firstName:'Next',lastName:'Administrator',email:'new.admin@example.invalid'}
 }));
 const sessions=new Auth21SessionStore({
  db:f.db,clientCrypto:f.cipher,snapshotGate:f.gate,nowSeconds:()=>1900000000
 });
 const adminStore=new Auth21AdminStore({
  sessionStore:sessions,authorizeLocalOperator:()=>f.permission.allowed,
  snapshotGate:f.gate
 });
 const auth=await sessions.loginWithPassword(actor.clientId,PASS);
 assert.ok(auth);
 return {bootstrap,sessions,adminStore,adminToken:auth.token,actor};
}
test('approved per-client DEBUG login retirement saves backup without deleting identity or wallet link',async t=>{
 const f=fixture(t);
 const {bootstrap,adminStore,adminToken,actor}=await transitionFixture(f);
 const old=snapshot(f,'CL000001');
 assert.equal(bootstrap.review().legacyCandidates.length,1);
 const result=await bootstrap.retireLegacyDebugLoginFixture({
  adminStore,adminToken,targetClientId:'CL000001',
  confirmation:'RETIRE DEBUG LOGIN ON FIXTURE: CL000001'
 });
 assert.equal(result.loginRetired,true);
 assert.equal(result.clientId,'CL000001');
 assert.equal(result.identityPreserved,true);
 assert.equal(adminCount(f),1);
 const afterward=snapshot(f,'CL000001');
 assert.deepEqual(afterward.client,old.client);
 assert.deepEqual(afterward.wallets,old.wallets);
 assert.equal(afterward.account,undefined);
 assert.equal(fs.existsSync(result.backupFile),true);
 const before=new Database(result.backupFile,{readonly:true,fileMustExist:true});
 try{
  assert.equal(before.prepare("SELECT COUNT(*) AS n FROM client_accounts WHERE client_id='CL000001'").get().n,1);
  assert.equal(before.prepare("SELECT COUNT(*) AS n FROM client_accounts WHERE role='ADMIN'").get().n,1);
 }finally{before.close();}
 const log=f.db.prepare("SELECT action,actor_client_id AS actor,detail_enc AS details FROM client_security_audit WHERE action='LEGACY_DEBUG_LOGIN_RETIRED'").get();
 assert.deepEqual(log,{action:'LEGACY_DEBUG_LOGIN_RETIRED',actor:actor.clientId,details:''});
});
test('without per-client confirmation or admin proof legacy DEBUG login stays intact',async t=>{
 const f=fixture(t);const {bootstrap,adminStore,adminToken,sessions}=await transitionFixture(f);
 await assert.rejects(()=>bootstrap.retireLegacyDebugLoginFixture({adminStore,adminToken,targetClientId:'CL000001',
  confirmation:'yes'}),/AUTH21_DEBUG_RESET_APPROVAL_REQUIRED/);
 await assert.rejects(()=>bootstrap.retireLegacyDebugLoginFixture({adminStore,adminToken:'BAD_TOKEN',targetClientId:'CL000001',
  confirmation:'RETIRE DEBUG LOGIN ON FIXTURE: CL000001'}),/AUTH21_ADMIN_FORBIDDEN/);
 sessions.revokeSession(adminToken);
 await assert.rejects(()=>bootstrap.retireLegacyDebugLoginFixture({adminStore,adminToken,targetClientId:'CL000001',
  confirmation:'RETIRE DEBUG LOGIN ON FIXTURE: CL000001'}),/AUTH21_ADMIN_FORBIDDEN/);
 assert.ok(snapshot(f,'CL000001').account);
 assert.equal(fs.existsSync(path.join(f.root,'pre-legacy-debug-CL000001.sqlite')),false);
});
test('unknown provenance SUPERADMIN login cannot be removed by DEBUG transition',async t=>{
 const f=fixture(t);const {bootstrap,adminStore,adminToken}=await transitionFixture(f);
 addClient(f,'CL000002','manual');addLogin(f,'CL000002','SUPERADMIN','MANUAL_SUPER');
 await assert.rejects(()=>bootstrap.retireLegacyDebugLoginFixture({
  adminStore,adminToken,targetClientId:'CL000002',
  confirmation:'RETIRE DEBUG LOGIN ON FIXTURE: CL000002'
 }),/AUTH21_DEBUG_PROVENANCE_UNVERIFIED/);
 assert.ok(snapshot(f,'CL000002').account);
});
test('concurrent DEBUG password reset aborts retirement and preserves new password hash',async t=>{
 const f=fixture(t);const {bootstrap,adminStore,adminToken}=await transitionFixture(f);
 await assert.rejects(()=>bootstrap.retireLegacyDebugLoginFixture({
  adminStore,adminToken,targetClientId:'CL000001',
  confirmation:'RETIRE DEBUG LOGIN ON FIXTURE: CL000001',
  hooks:{beforeCommit(db){
   db.prepare("UPDATE client_accounts SET password_hash='NEW_FAKE_HASH' WHERE client_id='CL000001'").run();
  }}
 }),/AUTH21_DEBUG_(?:CLIENT_STALE|ACCOUNT_STALE)/);
 assert.equal(f.db.prepare("SELECT password_hash AS h FROM client_accounts WHERE client_id='CL000001'").get().h,'NEW_FAKE_HASH');
 assert.equal(adminCount(f),1);
});
test('audit failure rolls back DEBUG login retirement while preserving ADMIN account',async t=>{
 const f=fixture(t);const {bootstrap,adminStore,adminToken}=await transitionFixture(f);
 f.db.exec("CREATE TRIGGER fail_debug_audit BEFORE INSERT ON client_security_audit WHEN NEW.action='LEGACY_DEBUG_LOGIN_RETIRED' BEGIN SELECT RAISE(ABORT,'FIXTURE_AUDIT_REJECT'); END;");
 await assert.rejects(()=>bootstrap.retireLegacyDebugLoginFixture({
  adminStore,adminToken,targetClientId:'CL000001',
  confirmation:'RETIRE DEBUG LOGIN ON FIXTURE: CL000001'
 }),/FIXTURE_AUDIT_REJECT/);
 assert.ok(snapshot(f,'CL000001').account);
 assert.equal(adminCount(f),1);
});
test('second attempt cannot repeat a retired login or reuse its backup',async t=>{
 const f=fixture(t);const {bootstrap,adminStore,adminToken}=await transitionFixture(f);
 const args={adminStore,adminToken,targetClientId:'CL000001',
  confirmation:'RETIRE DEBUG LOGIN ON FIXTURE: CL000001'};
 await bootstrap.retireLegacyDebugLoginFixture(args);
 await assert.rejects(()=>bootstrap.retireLegacyDebugLoginFixture(args),/AUTH21_DEBUG_PROVENANCE_UNVERIFIED/);
 assert.equal(adminCount(f),1);
});

test('concurrent profile mutation prevents elevation of a selected existing client',async t=>{
 const f=fixture(t);addClient(f,'CL000001','manual');const m=await prep(f);
 await assert.rejects(()=>m.createFirstAdmin({
  clientId:'CL000001',username:USERNAME,password:PASS,
  confirmation:'CREATE FIRST ADMIN ON FIXTURE',
  hooks:{beforeCommit(db){db.prepare("UPDATE clients SET email_enc='CHANGED_EXTERNALLY' WHERE client_id='CL000001'").run();}}
 }),/AUTH21_BOOTSTRAP_STALE_CLIENT/);
 assert.equal(adminCount(f),0);
 assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM client_accounts WHERE client_id='CL000001'").get().n,0);
});
test('concurrent profile mutation prevents retirement of an old DEBUG login',async t=>{
 const f=fixture(t);const {bootstrap,adminStore,adminToken}=await transitionFixture(f);
 await assert.rejects(()=>bootstrap.retireLegacyDebugLoginFixture({
  adminStore,adminToken,targetClientId:'CL000001',
  confirmation:'RETIRE DEBUG LOGIN ON FIXTURE: CL000001',
  hooks:{beforeCommit(db){db.prepare("UPDATE clients SET first_name_enc='CHANGED_EXTERNALLY' WHERE client_id='CL000001'").run();}}
 }),/AUTH21_DEBUG_CLIENT_STALE/);
 assert.ok(snapshot(f,'CL000001').account);
 assert.equal(adminCount(f),1);
});
test('legacy username lookup hash mismatch blocks unauthorized first ADMIN conversion',async t=>{
 const f=fixture(t);addClient(f,'CL000001','debug');addLogin(f,'CL000001');
 f.db.prepare("UPDATE client_accounts SET username_hash='INCONSISTENT_INDEX' WHERE client_id='CL000001'").run();
 const m=await prep(f);
 await assert.rejects(()=>m.createFirstAdmin({
  clientId:'CL000001',username:USERNAME,password:PASS,convertLegacy:true,
  confirmation:'CREATE FIRST ADMIN ON FIXTURE'
 }),/AUTH21_BOOTSTRAP_LEGACY_USERNAME_INDEX_INVALID/);
 assert.equal(adminCount(f),0);
});
