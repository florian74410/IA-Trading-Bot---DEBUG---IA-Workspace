'use strict';
// Genuine production Auth21 cookie/CSRF + Core -> Firewall workers -> Trading.
// All accounts, TLS material, IPC keys, ledgers and market state are disposable.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),https=require('node:https'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process'),{once}=require('node:events'),{setTimeout:delay}=require('node:timers/promises');
const Database=require('better-sqlite3'),ClientCrypto=require('../../../Core/Clients/client_crypto'),{migrate}=require('../../../Core/Clients/UserManagement/migration'),{run}=require('../../../Core/Clients/UserManagement/cli'),{UserStore}=require('../../../Core/Clients/UserManagement/store'),{Auth21AdminStore}=require('../../../Core/Clients/auth21_admin_store');
const CP=require('../../../Core/Communication/communication_protocol_v1'),{proofCodec}=require('../../../Core/Clients/auth21_ipc_proof');
const APP=path.resolve(__dirname,'../../..');
test('P3.3 real multiprocess ADMIN chain, denial matrix, key agreement, durable replay and interruptions',{timeout:120000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-p3-real-')),security=path.join(root,'Security'),database=path.join(root,'Database');fs.mkdirSync(security);fs.mkdirSync(database);
 const file=path.join(database,'clients.sqlite'),key=path.join(security,'client_master.key'),cipher=new ClientCrypto(key,{clientDbPath:file}),db=new Database(file);db.pragma('foreign_keys=ON');
 for(const f of ['001_clients_v1.sql','002_client_accounts_v1.sql'])db.exec(fs.readFileSync(path.join(APP,'Core/Clients/migrations',f),'utf8'));
 const children=new Map(),outputs=new Map();
 async function stop(name){const c=children.get(name);if(c&&c.exitCode===null&&c.signalCode===null){c.kill('SIGTERM');await once(c,'exit')}children.delete(name)}
 t.after(async()=>{for(const name of children.keys())await stop(name);db.close();fs.rmSync(root,{recursive:true,force:true})});
 await migrate(db,{backupFile:file+'.backup',keyFile:key,confirm:'MIGRATE USER MANAGEMENT V1'});
 const password='Fictional P3 isolated password 2026!',prompts=['P3','Fixture','p3admin@example.invalid','ADMIN',password,password,'CREATE FIRST ADMIN'];
 await run(['create-first-admin'],{env:{IATB_DATA_ROOT:root},check:()=>true,prompt:async()=>prompts.shift()});
 const sessions=new UserStore({db,clientCrypto:cipher}),login=await sessions.loginEmail('p3admin@example.invalid',password),manager=new Auth21AdminStore({sessionStore:sessions,authorizeLocalOperator:()=>true});
 for(const role of ['USER','GUEST'])await manager.createAccount(login.token,{firstName:role,lastName:'Fixture',email:role.toLowerCase()+'@example.invalid',username:role.toLowerCase(),password,role});
 fs.chmodSync(file,0o600);fs.writeFileSync(path.join(security,'wallet_master.key'),crypto.randomBytes(32).toString('hex'),{mode:0o600});
 const ipcFile=path.join(security,'trading_p3.key'),ipcKey=crypto.randomBytes(32);fs.writeFileSync(ipcFile,ipcKey,{mode:0o600});
 const cert=path.join(root,'localhost.crt'),tlsKey=path.join(root,'localhost.key');execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-keyout',tlsKey,'-out',cert],{stdio:'ignore'});fs.chmodSync(tlsKey,0o600);
 const used=new Set();async function port(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));if(used.has(p))return port();used.add(p);return p}
 const corePort=await port(),uiPort=await port(),fwPort=await port(),enginePort=await port(),routerPort=await port(),origin='https://localhost:'+uiPort;
 const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('IATB_'))delete env[k];
 Object.assign(env,{IATB_AUTH_MODE:'authenticated',IATB_DEPLOYMENT_MODE:'AUTHENTICATED',IATB_AUTH_ORIGIN:origin,IATB_AUTH_TLS_CERT:cert,IATB_AUTH_TLS_KEY:tlsKey,IATB_DATA_ROOT:root,IATB_RUNTIME_ROOT:path.join(root,'runtime'),IATB_STATE_ROOT:path.join(root,'state'),IATB_ANNEX_ROOT:path.join(root,'annex'),IATB_UPDATES_ROOT:path.join(root,'updates'),IATB_PORT:String(corePort),CORE_PUBLIC_PORT:String(corePort),IATB_UI_PORT:String(uiPort),IATB_FIREWALL_PORT:String(fwPort),IATB_TRADING_ENGINE_PORT:String(enginePort),ROUTER_PORT:String(routerPort),IATB_TRADING_LIVE:'0',IATB_AUTH21_TRADING_ADMIN_BRIDGE:'1',IATB_AUTH21_TRADING_IPC_KEY_FILE:ipcFile,IATB_USERDATA_USER:'fixture'});
 const entries={core:'Core/Server/server.js',gateway:'UI/Gateway/ui_service.js',firewall:'Core/Firewall/firewall_service.js',engine:'services/trading-engine/trading_service.js',router:'Core/Router/router.js'};
 function start(name,extra={}){const c=spawn(process.execPath,[path.join(APP,entries[name])],{cwd:APP,env:{...env,...extra},stdio:['ignore','pipe','pipe']});children.set(name,c);outputs.set(name,'');c.stdout.on('data',b=>outputs.set(name,outputs.get(name)+b));c.stderr.on('data',b=>outputs.set(name,outputs.get(name)+b));}
 async function request(p,route,{method='GET',body=null,headers={},secure=true}={}){const raw=body===null?'':JSON.stringify(body);return new Promise((resolve,reject)=>{const q=(secure?https:http).request({host:'127.0.0.1',port:p,servername:'localhost',ca:fs.readFileSync(cert),path:route,method,timeout:8000,headers:{Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),...headers}},r=>{let text='';r.on('data',b=>text+=b);r.on('end',()=>{let data;try{data=JSON.parse(text)}catch(_){data={}}resolve({status:r.statusCode,data,cookie:r.headers['set-cookie']?.[0]})})});q.on('error',reject);q.on('timeout',()=>q.destroy(Error('FIXTURE_REQUEST_TIMEOUT')));q.end(raw)})}
 async function ready(name,p,secure){for(let i=0;i<100;i++){if(children.get(name).exitCode!==null)assert.fail(name+' exited: '+outputs.get(name));try{const r=await request(p,secure?'/api/health':'/health',{secure});if([200,401,403,404].includes(r.status))return}catch(_){}await delay(60)}assert.fail(name+' unavailable: '+outputs.get(name))}
 start('core');await ready('core',corePort,true);for(const [name,p,secure]of [['engine',enginePort,false],['firewall',fwPort,false],['router',routerPort,false],['gateway',uiPort,true]]){start(name);await ready(name,p,secure)}
 const call=(route,options)=>request(uiPort,route,options),route='/auth21/admin/trading/command';
 async function signIn(email){const r=await call('/auth21/login',{method:'POST',body:{email,password}});assert.equal(r.status,200,JSON.stringify(r.data));return {Cookie:r.cookie.split(';')[0],'X-IATB-CSRF':r.data.csrfToken}}
 const admin=await signIn('p3admin@example.invalid'),user=await signIn('user@example.invalid'),guest=await signIn('guest@example.invalid');
 const payload=()=>({command:'STATUS',command_id:crypto.randomUUID(),timestamp:Date.now(),confirmed:true});
 const command=(b=payload(),headers=admin)=>call(route,{method:'POST',body:b,headers});
 assert.equal((await command(payload(),user)).status,403);assert.equal((await command(payload(),guest)).status,403);
 assert.equal((await command(payload(),{Cookie:admin.Cookie})).status,403);assert.equal((await command(payload(),{...admin,Origin:'https://untrusted.example.invalid'})).status,403);
 let first;for(let i=0;i<40;i++){first=await command();if(first.data.bridge?.state==='READY')break;await delay(60)}assert.equal(first.data.bridge?.state,'READY',JSON.stringify(first.data)+' '+outputs.get('firewall')+' '+outputs.get('engine'));
 assert.equal(first.data.bridge.liveAuthorized,false);assert.equal(first.data.data.security.journalDurable,true);
 const parallel=await Promise.all(Array.from({length:6},()=>command()));assert.ok(parallel.every(r=>r.data.bridge?.state==='READY'));
 for(const mutation of ['START','RESTART']){const r=await command({...payload(),command:mutation});assert.equal(r.data.data.error,'COMMAND_IMPLEMENTATION_PENDING');assert.notEqual(r.data.bridge.state,'READY')}
 for(const headers of [user,guest])assert.equal((await command({...payload(),command:'EMERGENCY_STOP'},headers)).status,403);
 const halted=await command({...payload(),command:'EMERGENCY_STOP'});assert.equal(halted.data.data.state.state,'EMERGENCY_HALTED');assert.equal(halted.data.bridge.state,'READY');
 const unavailable=await command({...payload(),command:'DRAINING_STOP',params:{stage:'PREVIEW',mode:'SAFE'}});assert.equal(unavailable.data.data.error,'BROKER_RECONCILIATION_NOT_QUALIFIED');
 assert.equal((await command({...payload(),command:'RECOVER'})).data.data.error,'RECOVERY_RECONCILIATION_NOT_QUALIFIED');
 await stop('engine');start('engine');await ready('engine',enginePort,false);assert.equal((await command()).data.data.state.state,'EMERGENCY_HALTED');
 children.get('engine').kill('SIGKILL');await once(children.get('engine'),'exit');children.delete('engine');start('engine');await ready('engine',enginePort,false);assert.equal((await command()).data.data.state.state,'EMERGENCY_HALTED');
 children.get('engine').kill('SIGINT');await once(children.get('engine'),'exit');children.delete('engine');start('engine');await ready('engine',enginePort,false);assert.equal((await command()).data.data.state.state,'EMERGENCY_HALTED');
 // A legitimate Core-issued proof cannot be re-used and cannot bypass the Firewall.
 const machine=fs.readFileSync(path.join(root,'runtime/state/security/communication_protocol_key.dat'),'utf8').trim();
 const issuer=proofCodec({secret:ipcKey}),principal={clientId:'CLp3fixture',role:'ADMIN'};
 function issue(b,codec=issuer){return codec.issue({principal,audience:'trading',operation:'admin.write',method:'POST',action:'trading.admin.command',bodyDigest:CP.hashData(b)})}
 async function cp(p,b,proof,extra={}){const msg=CP.makeRequest('trading','trading.admin.command',{...b,proof},'summary'),signature=crypto.createHmac('sha256',machine).update(JSON.stringify(msg)).digest('hex');return request(p,'/cp/v1',{secure:false,method:'POST',body:msg,headers:{'X-IATB-CP-Token':machine,'X-IATB-CP-Signature':signature,'X-IATB-FW-Signature':signature,...extra}})}
 const b=payload(),proof=issue(b);assert.equal((await cp(enginePort,b,proof)).status,403);
 assert.equal((await cp(fwPort,b,proof+'bad')).status,403);assert.equal((await cp(fwPort,{...b,command:'START'},proof)).status,403);
 const old=proofCodec({secret:ipcKey,now:()=>Date.now()-40000}),expired=payload();assert.equal((await cp(fwPort,expired,issue(expired,old))).status,403);
 const accepted=await cp(fwPort,b,proof);assert.equal(accepted.data.data.ok,true,JSON.stringify(accepted.data));
 await stop('firewall');await stop('engine');start('engine');await ready('engine',enginePort,false);start('firewall');await ready('firewall',fwPort,false);await delay(200);
 assert.equal((await cp(fwPort,b,proof)).status,403);const replay=await command(b);assert.equal(replay.data.data.error,'ADMIN_COMMAND_REPLAY');
 const wrongFile=path.join(security,'wrong.key');fs.writeFileSync(wrongFile,crypto.randomBytes(32),{mode:0o600});await stop('engine');start('engine',{IATB_AUTH21_TRADING_IPC_KEY_FILE:wrongFile});await ready('engine',enginePort,false);
 assert.equal((await command()).data.bridge.reason,'KEY_MISMATCH');await stop('engine');start('engine');await ready('engine',enginePort,false);
 await stop('firewall');start('firewall',{IATB_AUTH21_TRADING_IPC_KEY_FILE:wrongFile});await ready('firewall',fwPort,false);assert.equal((await command()).data.bridge.reason,'KEY_MISMATCH');await stop('firewall');start('firewall');await ready('firewall',fwPort,false);
 // A journal that cannot be opened must block STATUS instead of reporting READY.
 await stop('engine');const ledger=path.join(root,'User Data/fixture/trading_admin_actions.db');fs.renameSync(ledger,ledger+'.held');fs.mkdirSync(ledger);start('engine');await ready('engine',enginePort,false);const journalFailure=await command();assert.equal(journalFailure.status,503);assert.equal(journalFailure.data.bridge.state,'AUTH_UNAVAILABLE');await stop('engine');fs.rmdirSync(ledger);fs.renameSync(ledger+'.held',ledger);start('engine');await ready('engine',enginePort,false);
 fs.renameSync(ipcFile,ipcFile+'.held');assert.equal((await command()).data.bridge.state,'KEY_MISSING');fs.renameSync(ipcFile+'.held',ipcFile);
 fs.chmodSync(ipcFile,0o644);assert.equal((await command()).data.bridge.state,'KEY_INVALID');fs.chmodSync(ipcFile,0o600);
 await stop('firewall');assert.equal((await command()).data.bridge.state,'FIREWALL_UNAVAILABLE');start('firewall',{IATB_FIREWALL_ENABLED:'0'});await ready('firewall',fwPort,false);assert.equal((await command()).data.bridge.reason,'ADMIN_FIREWALL_BYPASS_DENIED');
 await stop('firewall');start('firewall');await ready('firewall',fwPort,false);await delay(200);
 await stop('engine');assert.equal((await command()).status,503);start('engine');await ready('engine',enginePort,false);
 await stop('router');assert.equal((await command()).data.bridge.state,'READY','P3 is a direct authenticated CP/1 Firewall route');
 const live=await request(enginePort,'/health',{secure:false});assert.equal(live.data.liveExecutionEnabled,false);
 db.prepare('UPDATE client_sessions SET issued_at=1,expires_at=2').run();assert.equal((await command()).status,401);
 const logText=Array.from(outputs.values()).join('\n');assert.ok(!logText.includes(ipcKey.toString('hex')));assert.ok(!logText.includes(password));
});
