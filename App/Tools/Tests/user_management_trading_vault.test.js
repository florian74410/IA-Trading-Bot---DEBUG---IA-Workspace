'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const Database=require('better-sqlite3'),ClientCrypto=require('../../Core/Clients/client_crypto');
const {migrate}=require('../../Core/Clients/UserManagement/migration'),{UserStore}=require('../../Core/Clients/UserManagement/store');
const {run}=require('../../Core/Clients/UserManagement/cli'),{Auth21AdminStore}=require('../../Core/Clients/auth21_admin_store');
const {configuration}=require('../../Core/Clients/UserManagement/config');
const PASSWORD='Fictional test password 2026!';
async function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-um-test-'));fs.mkdirSync(path.join(root,'Security'));fs.mkdirSync(path.join(root,'Database'));const file=path.join(root,'Database','clients.sqlite'),key=path.join(root,'Security','client_master.key'),cipher=new ClientCrypto(key,{clientDbPath:file}),db=new Database(file);db.pragma('foreign_keys=ON');for(const name of ['001_clients_v1.sql','002_client_accounts_v1.sql'])db.exec(fs.readFileSync(path.resolve(__dirname,'../../Core/Clients/migrations',name),'utf8'));t.after(()=>{if(db.open)db.close();fs.rmSync(root,{recursive:true,force:true});});await migrate(db,{backupFile:file+'.backup',keyFile:key,confirm:'MIGRATE USER MANAGEMENT V1'});const prompts=['Admin','Test','admin@example.invalid','ADMIN',PASSWORD,PASSWORD,'CREATE FIRST ADMIN'];const admin=await run(['create-first-admin'],{env:{IATB_DATA_ROOT:root},check:()=>true,prompt:async()=>prompts.shift()});let now=1900000000;const sessions=new UserStore({db,clientCrypto:cipher,nowSeconds:()=>now});const login=await sessions.loginEmail('admin@example.invalid',PASSWORD);const manager=new Auth21AdminStore({sessionStore:sessions,authorizeLocalOperator:()=>true});return {root,file,key,cipher,db,sessions,login,manager,admin,advance:n=>now+=n};}
async function account(f,name,role='USER'){const x=await f.manager.createAccount(f.login.token,{firstName:name,lastName:'Test',email:name+'@example.invalid',username:name,password:PASSWORD,role});return {...x,...await f.sessions.loginEmail(name+'@example.invalid',PASSWORD)};}
const {TradingVault}=require('../../Core/Clients/UserManagement/trading_vault');
const {createVaultClient}=require('../../services/trading-engine/vault-client');
const {Wallet,utils}=require('ethers');
const {signTypedData,typedDigest}=require('../../Bank/Core/dex_wallet_signer');
const config={id:'binance-main',exchange:'BINANCE',markets:['SPOT'],actions:['execute','cancel','close'],enabled:true,default:true,credentials:{apiKey:'TEST_KEY_ONLY',apiSecret:'TEST_SECRET_ONLY'}};
const intent={exchange:'BINANCE',market_type:'SPOT',symbol:'BTC/USDT',side:'BUY',quantity:'1',risk_approval_id:'risk-fixture',client_order_id:'iatb-fixture-1'};
test('vault stores encrypted multi-owner assignments; scoped TLS client obtains only selected credential',async t=>{
 const f=await fixture(t),alice=await account(f,'alice'),bob=await account(f,'bobby'),vault=new TradingVault({sessions:f.sessions});
 await vault.save(alice.token,config);assert.deepEqual(vault.list(bob.token),[]);
 const row=f.db.prepare('SELECT payload_enc FROM um_secrets WHERE client_id=?').get(alice.clientId);assert(!row.payload_enc.includes('TEST_SECRET_ONLY'));
 const grant=await vault.issue(alice.token,intent,'execute');assert(!JSON.stringify(grant).includes('TEST_KEY_ONLY'));
 const client=createVaultClient({request:b=>vault.access(b)}),bound=await client.bind({...intent,metadata:{account_ticket:grant.ticket}},'execute');
 assert.equal((await bound.secretProvider.get('BINANCE')).apiKey,'TEST_KEY_ONLY');
 await assert.rejects(bound.secretProvider.get('BINANCE'),/REPLAY/);
 await assert.rejects(client.bind({...intent,metadata:{account_ticket:grant.ticket}},'execute'),/REPLAY/);
 await assert.rejects(vault.issue(bob.token,intent,'execute'),/NOT_ASSIGNED/);
});
test('ticket binds exact order and expires; revoked sessions and rotated assignments cannot release credentials',async t=>{
 const f=await fixture(t);let now=1000;const vault=new TradingVault({sessions:f.sessions,now:()=>now});await vault.save(f.login.token,config);
 const grant=await vault.issue(f.login.token,intent,'execute'),payload={ticket:grant.ticket,intent,action:'execute',operation:'bind'};
 await assert.rejects(vault.access({...payload,intent:{...intent,quantity:'2'}}),/INVALID/);
 await vault.access(payload);await vault.save(f.login.token,{...config,credentials:{apiKey:'ROTATED',apiSecret:'ROTATED_SECRET'}});
 await assert.rejects(vault.access({...payload,operation:'credentials',exchange:'BINANCE'}),/REVOKED/);
 const exp=await vault.issue(f.login.token,intent,'execute');now+=30001;await assert.rejects(vault.access({...payload,ticket:exp.ticket}),/INVALID/);
 const rev=await vault.issue(f.login.token,intent,'execute');f.sessions.revokeSession(f.login.token);await assert.rejects(vault.access({...payload,ticket:rev.ticket}),/UNAUTHORIZED/);
});
test('invalid and ambiguous registry changes do not rotate secrets; broker of an existing ID cannot change',async t=>{
 const f=await fixture(t),vault=new TradingVault({sessions:f.sessions});await vault.save(f.login.token,config);
 await assert.rejects(vault.save(f.login.token,{...config,id:'second'}),/AMBIGUOUS/);
 assert.equal(Object.keys(f.sessions.secrets(f.login.token)).length,1);
 await assert.rejects(vault.save(f.login.token,{...config,exchange:'KRAKEN'}),/IMMUTABLE/);
 const guest=await account(f,'guest','GUEST');await assert.rejects(vault.save(guest.token,config),/UNAUTHORIZED/);
});
test('internal EVM signer creates verifiable EIP712 signature without exporting key or broadcasting',async t=>{
 const f=await fixture(t),wallet=Wallet.createRandom(),key=wallet.privateKey;
 const BankWallet=require('../../Bank/Core/wallet_service_v2');let records=[];
 const ws=new BankWallet(f.root,{get:()=>records,set:(s,k,v)=>{records=v;}},{resolveSession:()=>({clientId:f.login.clientId})},{keyFile:path.join(f.root,'wallet.key')});
 records=[{id:'W0001',clientId:f.login.clientId,accounts:[{id:'evm',family:'EVM',address:wallet.address,networks:['arbitrum'],secretEnvelope:ws._enc(JSON.stringify({privateKey:key}))}]}];
 const vault=new TradingVault({sessions:f.sessions,walletAccess:async(token,fn)=>fn(ws,{auth21:true,clientId:f.login.clientId})});
 const contract='0x'+'1'.repeat(40),record=await vault.save(f.login.token,{id:'gmx-wallet',exchange:'GMX',markets:['PERPETUAL'],actions:['execute','cancel','close'],enabled:true,default:true,chain:'arbitrum',walletRef:'W0001',walletAccountId:'evm',contracts:[contract]});
 const typed={domain:{name:'Fixture DEX',version:'1',chainId:42161,verifyingContract:contract},types:{Order:[{name:'amount',type:'uint256'}]},primaryType:'Order',message:{amount:'123'}},digest=typedDigest(typed);
 const signed=await vault.sign(f.login.token,{account:record.id,typedData:typed,digest,confirmed:true});
 assert.equal(utils.verifyTypedData(typed.domain,typed.types,typed.message,signed.signature),wallet.address);assert(!JSON.stringify(signed).includes(key));
 await assert.rejects(vault.sign(f.login.token,{account:record.id,typedData:{...typed,message:{amount:'999'}},digest,confirmed:true}),/CONFIRMATION/);
 const wrong={...typed,domain:{...typed.domain,chainId:43114}};await assert.rejects(vault.sign(f.login.token,{account:record.id,typedData:wrong,digest:typedDigest(wrong),confirmed:true}),/SCOPE/);
 records[0].accounts[0].secretEnvelope=null;await assert.rejects(vault.sign(f.login.token,{account:record.id,typedData:typed,digest,confirmed:true}),/UNAVAILABLE/);
});
test('signer checks revocation before releasing signature',async()=>{
 const w=Wallet.createRandom(),contract='0x'+'1'.repeat(40),typed={domain:{chainId:42161,verifyingContract:contract},types:{Order:[{name:'amount',type:'uint256'}]},message:{amount:'1'}};let checks=0;
 await assert.rejects(signTypedData({walletService:{list:()=>[{id:'W1',accounts:[{id:'evm',family:'EVM',networks:['arbitrum'],hasSecret:true,address:w.address}]}],reveal:()=>({privateKey:w.privateKey})},session:{},account:{walletRef:'W1',walletAccountId:'evm',address:w.address,chain:'arbitrum',contracts:[contract]},typedData:typed,approvedDigest:typedDigest(typed),authorize:async()=>++checks<3}),/REVOKED/);
});
test('real HTTPS account routes enforce password, CSRF, origin, owner isolation and internal machine authentication',async t=>{
 const f=await fixture(t),https=require('node:https'),{once}=require('node:events'),{execFileSync}=require('node:child_process'),{createHandler}=require('../../Core/Clients/UserManagement/http');
 const key=path.join(f.root,'tls.key'),cert=path.join(f.root,'tls.crt');execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-keyout',key,'-out',cert],{stdio:'ignore'});
 const origin='https://localhost:34567',vault=new TradingVault({sessions:f.sessions}),handler=createHandler({sessions:f.sessions,origin,secret:crypto.randomBytes(32),tradingVault:vault});
 const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},handler);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 async function call(route,method='GET',body=null,headers={}){const raw=body===null?'':JSON.stringify(body);return new Promise((resolve,reject)=>{const q=https.request({host:'127.0.0.1',port:server.address().port,path:route,method,ca:fs.readFileSync(cert),servername:'localhost',headers:{Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),...headers}},r=>{let data='';r.on('data',b=>data+=b);r.on('end',()=>resolve({status:r.statusCode,data:JSON.parse(data),cookie:r.headers['set-cookie']?.[0]}));});q.on('error',reject);q.end(raw);});}
 const login=await call('/auth21/login','POST',{email:'admin@example.invalid',password:PASSWORD}),headers={Cookie:login.cookie.split(';')[0],'X-IATB-CSRF':login.data.csrfToken};
 assert.equal((await call('/auth21/trading/accounts')).status,401);
 assert.equal((await call('/auth21/trading/accounts','PUT',{...config,password:PASSWORD},{Cookie:headers.Cookie})).status,403);
 assert.equal((await call('/auth21/trading/accounts','PUT',config,headers)).status,428);
 assert.equal((await call('/auth21/trading/accounts','PUT',{...config,password:PASSWORD},headers)).status,200);
 const listed=await call('/auth21/trading/accounts','GET',null,headers);assert.equal(listed.data.accounts.length,1);assert(!JSON.stringify(listed).includes('TEST_SECRET_ONLY'));
 assert.equal((await call('/auth21/trading/accounts','GET',null,{...headers,Origin:'https://evil.invalid'})).status,403);
 assert.equal((await call('/auth21/internal/trading-access','POST',{},headers)).status,403);
 const grant=await vault.issue(f.login.token,intent,'execute'),cp=require('../../Core/Communication/communication_protocol_v1');
 const ipc=path.join(f.root,'Security','trading-ipc.key');fs.writeFileSync(ipc,crypto.randomBytes(32),{mode:0o600});const oldKey=process.env.IATB_AUTH21_TRADING_IPC_KEY_FILE,oldRoot=process.env.IATB_AUTH21_TRADING_IPC_KEY_ROOT;process.env.IATB_AUTH21_TRADING_IPC_KEY_FILE=ipc;process.env.IATB_AUTH21_TRADING_IPC_KEY_ROOT=path.dirname(ipc);t.after(()=>{for(const [k,v]of [['IATB_AUTH21_TRADING_IPC_KEY_FILE',oldKey],['IATB_AUTH21_TRADING_IPC_KEY_ROOT',oldRoot]])if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const remote=createVaultClient({root:f.root,env:{...process.env,CORE_PUBLIC_PORT:server.address().port,IATB_AUTH_TLS_CERT:cert}});
 // Shared CP authentication alone cannot authorize secret release.
 assert.equal((await call('/auth21/internal/trading-access','POST',{ticket:grant.ticket,intent,action:'execute',operation:'bind'},{'X-IATB-CP-Token':cp.ensureSecret(f.root)})).status,403);
 const b=await remote.bind({...intent,metadata:{account_ticket:grant.ticket}},'execute');assert.equal((await b.secretProvider.get('BINANCE')).apiKey,'TEST_KEY_ONLY');
 const engine=new (require('../../services/trading-engine/trading-engine').TradingEngine)({accountRouting:remote,lifecycle:{canExecute:()=>true,snapshot:()=>({generation:1}),submit:(o,fn)=>fn()}});
 engine.registerExecutor('BINANCE',{execute:async(o,ctx)=>{assert.equal(o.account,'binance-main');assert.equal((await ctx.secretProvider.get('BINANCE')).apiKey,'TEST_KEY_ONLY');return {ok:true,status:'SIMULATED'};}});
 const next=await vault.issue(f.login.token,intent,'execute');const result=await engine.execute({...intent,metadata:{account_ticket:next.ticket}});assert.equal(result.account_identity.owner,f.login.clientId);assert.equal(result.status,'SIMULATED');

});
test('vault machine proof is domain-bound, fresh, exact-body and single-use',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vault-proof-')),key=path.join(dir,'ipc.key');fs.writeFileSync(key,crypto.randomBytes(32),{mode:0o600});t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const env={IATB_AUTH21_TRADING_IPC_KEY_FILE:key,IATB_AUTH21_TRADING_IPC_KEY_ROOT:dir},auth=require('../../Core/Clients/UserManagement/trading_vault_auth'),body={operation:'bind',ticket:'fixture'};
 const lower=h=>Object.fromEntries(Object.entries(h).map(([k,v])=>[k.toLowerCase(),v]));const h=lower(auth.headers(body,env)),verify=auth.verifier(env);
 assert.equal(verify({...body,operation:'credentials'},h),false);assert.equal(verify(body,h),true);assert.equal(verify(body,h),false);
 assert.equal(auth.verifier(env,()=>Date.now()+6000)(body,lower(auth.headers(body,env))),false);
 fs.writeFileSync(key,crypto.randomBytes(32),{mode:0o600});assert.equal(auth.verifier(env)(body,h),false);
});
