'use strict';
const fs=require('node:fs'),path=require('node:path'),Database=require('better-sqlite3');
const {Auth21AdminStore}=require('../auth21_admin_store'),{UserStore}=require('./store');
const ClientCrypto=require('../client_crypto'),{migrate}=require('./migration');
const HELP=`IA-TB users — administration locale Auth21\nusage: node App/CLI/users.js <help|migrate|create-first-admin|list|show|create|set-role|enable|disable|reset-password|revoke-sessions|import-legacy-vault|import-legacy-portfolio|import-legacy-setting|import-legacy-definition|audit> [clientId] [ADMIN|USER|GUEST]\nIATB_DATA_ROOT désigne la racine existante. Mots de passe demandés sur TTY, jamais en argument.\nMigration exige arrêt des writers et sauvegarde ; aucun changement automatique au démarrage.\n`;
async function promptSecret(label){
 const input=process.stdin;if(!input.isTTY||!input.setRawMode)throw Error('LOCAL_TTY_REQUIRED');
 return new Promise((resolve,reject)=>{let value='';const decoder=new (require('node:string_decoder').StringDecoder)('utf8');const raw=input.isRaw;input.setRawMode(true);process.stdout.write(label+': ');function done(err){input.off('data',data);input.setRawMode(!!raw);input.pause();process.stdout.write('\n');err?reject(err):resolve(value);}function data(buf){for(const ch of decoder.write(buf)){if(ch==='\u0003'||ch==='\u0004')return done(Error('CANCELLED'));if(ch==='\r'||ch==='\n')return done();if(ch==='\u007f'||ch==='\b')value=Array.from(value).slice(0,-1).join('');else if(ch.codePointAt(0)<32||value.length>=1024)return done(Error('INPUT_INVALID'));else value+=ch;}}input.on('data',data);input.resume();});
}
function paths(env){if(!env.IATB_DATA_ROOT||!path.isAbsolute(env.IATB_DATA_ROOT))throw Error('EXISTING_DATA_ROOT_REQUIRED');const root=fs.realpathSync(env.IATB_DATA_ROOT);return {root,db:path.join(root,'Database','clients.sqlite'),key:path.join(root,'Security','client_master.key')};}
function localOperator(files){
 const uid=process.getuid?.(),st=fs.lstatSync(files.db),tty=fs.fstatSync(0);
 if(!process.stdin.isTTY||!tty.isCharacterDevice()||uid!==st.uid||tty.uid!==uid||uid===0)throw Error('LOCAL_OWNER_TTY_REQUIRED');
 for(const f of [files.db,files.key]){const s=fs.lstatSync(f);if(!s.isFile()||s.isSymbolicLink()||fs.realpathSync(f)!==f||s.uid!==uid||s.mode&0o077)throw Error('LOCAL_FILE_PERMISSIONS');}
 return true;
}
async function run(argv,{env=process.env,prompt=promptSecret,check=localOperator}={}){
 const [verb,...args]=argv;
 if(verb==='help'||!verb)return {help:HELP};
 const arity={migrate:0,'create-first-admin':0,list:0,show:1,create:0,'set-role':2,enable:1,disable:1,'reset-password':1,'revoke-sessions':1,'import-legacy-vault':1,'import-legacy-portfolio':1,'import-legacy-setting':1,'import-legacy-definition':1,audit:0};
 if(!Object.hasOwn(arity,verb)||args.length!==arity[verb]||args.some(x=>typeof x!=='string'||x.length>64)||args[0]&&!/^CL[A-Za-z0-9_-]{1,64}$/.test(args[0]))throw Error('CLI_ARGUMENT_INVALID');
 if(verb==='set-role'&&!['ADMIN','USER','GUEST'].includes(args[1]))throw Error('CLI_ROLE_INVALID');
 const f=paths(env);check(f);
 const db=new Database(f.db,{fileMustExist:true});db.pragma('foreign_keys=ON');db.pragma('busy_timeout=5000');let sessions,login;
 try{
  if(verb==='migrate'){
   if(await prompt('Confirmer writers arrêtés : MIGRATE USER MANAGEMENT V1')!=='MIGRATE USER MANAGEMENT V1')throw Error('MIGRATION_CONFIRMATION_REQUIRED');
   return await migrate(db,{backupFile:f.db+'.before-um-'+Date.now(),keyFile:f.key,confirm:'MIGRATE USER MANAGEMENT V1'});
  }
  const cipher=new ClientCrypto(f.key,{clientDbPath:f.db});sessions=new UserStore({db,clientCrypto:cipher});
  if(verb==='create-first-admin'){
   if(db.prepare("SELECT COUNT(*) AS n FROM client_accounts a JOIN clients c ON a.client_id=c.client_id WHERE role='ADMIN' AND enabled=1 AND c.status='ACTIVE'").get().n)throw Error('ADMIN_ALREADY_EXISTS');
   const firstName=await prompt('Prénom'),lastName=await prompt('Nom'),email=await prompt('Email'),username=await prompt('Identifiant CLI'),password=await prompt('Nouveau mot de passe');if(password!==await prompt('Confirmer mot de passe'))throw Error('PASSWORD_MISMATCH');
   const hash=await require('../password_hasher_v2').hashNewPassword(password),id='CL'+require('node:crypto').randomBytes(12).toString('hex').toUpperCase(),now=new Date().toISOString();
   if(!require('./store').identity(email)||!firstName||firstName.length>80||lastName.length>80||!/^[A-Za-z0-9._-]{3,64}$/.test(username))throw Error('IDENTITY_INVALID');
   if(await prompt('Confirmer CREATE FIRST ADMIN')!=='CREATE FIRST ADMIN')throw Error('CONFIRMATION_REQUIRED');
   return db.transaction(()=>{check(f);if(db.prepare("SELECT 1 FROM client_accounts a JOIN clients c USING(client_id) WHERE a.role='ADMIN' AND a.enabled=1 AND c.status='ACTIVE'").get())throw Error('ADMIN_ALREADY_EXISTS');db.prepare("INSERT INTO clients VALUES(?,?,?,?,?,?,'ACTIVE',1,?,?)").run(id,cipher.externalHash('um:'+id),cipher.seal(firstName),cipher.seal(lastName),cipher.seal(email.trim().toLowerCase()),cipher.lookupHash(email.trim().toLowerCase()),now,now);db.prepare("INSERT INTO client_accounts(client_id,username_enc,username_hash,password_salt,password_hash,password_iterations,role,enabled,created_at,updated_at,password_algo,password_params_json) VALUES(?,?,?,'',?,0,'ADMIN',1,?,?,'ARGON2ID','{}')").run(id,cipher.seal(username.toUpperCase()),cipher.lookupHash('username:'+username.toUpperCase()),hash,now,now);sessions.audit(id,'FIRST_ADMIN_CREATED');return {clientId:id,role:'ADMIN'};}).immediate();
  }
  const email=await prompt('Email ADMIN'),password=await prompt('Mot de passe ADMIN');login=await sessions.loginEmail(email,password,'local-cli');if(!login||login.role!=='ADMIN')throw Error('ADMIN_AUTH_REQUIRED');
  const manager=new Auth21AdminStore({sessionStore:sessions,authorizeLocalOperator:()=>check(f)});
  if(verb==='list')return manager.listAccounts(login.token);
  if(verb==='show'){const row=manager.listAccounts(login.token).find(x=>x.clientId===args[0]);if(!row)throw Error('NOT_FOUND');const identity=db.prepare('SELECT first_name_enc,last_name_enc,email_enc FROM clients WHERE client_id=?').get(args[0]),account=db.prepare('SELECT username_enc FROM client_accounts WHERE client_id=?').get(args[0]);return {...row,firstName:cipher.open(identity.first_name_enc),lastName:cipher.open(identity.last_name_enc),email:cipher.open(identity.email_enc),username:cipher.open(account.username_enc)};}
  if(verb==='audit'){manager.audit(login.token,{limit:1});return db.prepare('SELECT id,client_id AS clientId,actor_client_id AS actorClientId,action,result,created_at AS createdAt FROM client_security_audit ORDER BY id DESC LIMIT 100').all();}
  if(verb==='reset-password'&&await prompt('Les secrets du nouveau coffre utilisateur sont conservés. Un ancien coffre global lié au mot de passe ne peut pas être récupéré par ce reset. Confirmer ACKNOWLEDGE LEGACY VAULT')!=='ACKNOWLEDGE LEGACY VAULT')throw Error('LEGACY_VAULT_ACK_REQUIRED');
  if(await prompt('Confirmer '+verb)!=='CONFIRM '+verb)throw Error('CONFIRMATION_REQUIRED');
  if(['import-legacy-portfolio','import-legacy-setting','import-legacy-definition'].includes(verb)){
   if(await prompt('Confirmer writers arrêtés et attribution explicite : IMPORT LEGACY OWNER')!=='IMPORT LEGACY OWNER')throw Error('LEGACY_OFFLINE_CONFIRMATION_REQUIRED');
   const authorize=()=>{check(f);const current=sessions.verifyHashedSession(require('node:crypto').createHash('sha256').update(Buffer.from(login.token,'base64url')).digest('hex')),target=db.prepare('SELECT a.role,a.enabled,c.status FROM client_accounts a JOIN clients c USING(client_id) WHERE client_id=?').get(args[0]);if(!current||current.role!=='ADMIN')throw Error('ADMIN_AUTH_REQUIRED');if(!target||target.role==='GUEST'||target.enabled!==1||target.status!=='ACTIVE')throw Error('LEGACY_TARGET_INVALID');};
   const kind=verb==='import-legacy-definition'?await prompt('Type exact INDICATOR, STRATEGY ou MOSAIC'):null;
   const file=verb==='import-legacy-definition'&&kind==='INDICATOR'?f.db:verb==='import-legacy-portfolio'?env.IATB_PORTFOLIO_DB:env.IATB_USER_DB;require('./legacy_data').safeFile(file);const options={file,backupFile:file+'.before-owner-'+Date.now()+'-'+require('node:crypto').randomBytes(4).toString('hex'),target:args[0],authorize,cipher,walletKeyFile:path.join(f.root,'Security','wallet_master.key'),kind,sourceFile:env.IATB_LEGACY_DEFINITION};
   if(verb==='import-legacy-setting'){options.scope=await prompt('Scope historique exact');options.key=await prompt('Clé historique exacte');}
   const result=await require('./legacy_data')[verb==='import-legacy-definition'?'importDefinition':verb==='import-legacy-portfolio'?'importPortfolio':'importSetting'](options);sessions.audit(args[0],'LEGACY_OWNER_DATA_IMPORTED');return result;
  }
  if(verb==='import-legacy-vault'){const p=await prompt('Mot de passe original du coffre global');const result=await require('./legacy_vault').importVault({db,cipher,actor:()=>{check(f);if(!sessions.verifySession(login.token)||sessions.verifySession(login.token).role!=='ADMIN')throw Error('ADMIN_AUTH_REQUIRED');},target:args[0],file:env.IATB_LEGACY_VAULT,password:p});sessions.audit(args[0],'LEGACY_VAULT_IMPORTED');return result;}
  if(verb==='set-role')return manager.changeRole(login.token,args[0],args[1]);
  if(verb==='enable'||verb==='disable')return manager.setEnabled(login.token,args[0],verb==='enable');
  if(verb==='revoke-sessions'){if(!manager.listAccounts(login.token).some(x=>x.clientId===args[0]))throw Error('NOT_FOUND');const n=sessions.revokeAllFor(args[0]);sessions.audit(args[0],'ADMIN_SESSIONS_REVOKED');return {revoked:n};}
  if(verb==='reset-password'){const p=await prompt('Nouveau mot de passe');if(p!==await prompt('Confirmer mot de passe'))throw Error('PASSWORD_MISMATCH');return await manager.resetPassword(login.token,args[0],p);}
  if(verb==='create'){const info={};for(const field of ['firstName','lastName','email','username','role','password'])info[field]=await prompt(field);if(info.password!==await prompt('Confirmer mot de passe'))throw Error('PASSWORD_MISMATCH');return await manager.createAccount(login.token,info);}
 }finally{if(login?.token&&sessions)sessions.revokeSession(login.token);db.close();}
}
async function main(){try{const result=await run(process.argv.slice(2));console.log(result.help||JSON.stringify(result,null,2));}catch(e){console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'USER_CLI_FAILED');process.exitCode=1;}}
module.exports={run,main,promptSecret,paths,localOperator};
