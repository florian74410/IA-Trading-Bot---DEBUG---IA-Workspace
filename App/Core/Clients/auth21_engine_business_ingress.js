'use strict';
/* Real Engine HTTP ingress with an opt-in sandbox persistence adapter.
 * Proof verified by the receiving Engine; writes never touch live resources.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {preflightEnv}=require('../Backup/auth21_core_local_trial_wiring');
const {loadTrialSecret}=require('./auth21_ipc_keyfile');
const {proofCodec}=require('./auth21_ipc_proof');
const business=require('./auth21_business_capability');
const {contract,validate}=require('./auth21_business_actions');
const {createWriter}=require('./auth21_indicator_fixture_writer');
function openBusinessIngress({env,businessHandlers=null}={}){
 if(!env||env.IATB_AUTH21_BUSINESS_TRIAL!=='1'||
    env.IATB_AUTH21_IPC_PROBE_TRIAL!=='1'||env.IATB_TRADING_LIVE==='1')
  throw Error('AUTH21_BUSINESS_TRIAL_DISABLED');
 const {root}=preflightEnv(env);
 const trial=require('../Backup/auth21_engine_snapshot_trial').currentEngineSnapshotTrial();
 if(!trial||trial.root!==root||!['indicators','marketdata','fundamental','portfolio','strategy'].includes(trial.engine))
  throw Error('AUTH21_BUSINESS_WRITER_NOT_BOUND');
 const codec=proofCodec({secret:loadTrialSecret({env,root}),
  replayStore:require('./auth21_durable_business_replay').createDurableReplay({root,engine:trial.engine})});
 const directory=path.join(root,'runtime','auth21-business');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 if(fs.lstatSync(directory).isSymbolicLink())throw Error('AUTH21_BUSINESS_SYMLINK');
 const indicatorWriter=trial.engine==='indicators'?createWriter({root:directory,codec}):null;
 const send=(res,status,obj)=>{
  if(res.writableEnded)return;
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Connection':'close'});
  res.end(JSON.stringify(obj));
 };
 function persist(rule,input,principal){
  if(rule.action==='indicator.settings.set')throw Error('AUTH21_INDICATOR_USES_OWN_WRITER');
  if(rule.action==='marketdata.settings.set'){
   const expected=path.join(root,'runtime','config','market_data_settings.json');
   if(env.IATB_MARKET_SETTINGS!==expected)
    throw Error('AUTH21_MARKETDATA_SETTINGS_OUTSIDE_TRIAL');
   const settings=require('../../MarketData/Config/market_data_settings');
   if(path.resolve(settings.file)!==expected)throw Error('AUTH21_MARKETDATA_SETTINGS_OUTSIDE_TRIAL');
   settings.setSnapshotGate(trial.gate);
   const updated=settings.save({...settings.load(),refreshMs:input.refreshMs});
   if(updated.refreshMs!==input.refreshMs)throw Error('AUTH21_MARKETDATA_SETTINGS_SAVE_INVALID');
  }
  if(rule.action==='fundamental.feed.create'){
   const PATHS=require('../Shared/paths');
   const file=path.resolve(PATHS.PersistentData.fundamentalDb);
   const allowed=path.join(root,'userdata')+path.sep;
   if(!file.startsWith(allowed))throw Error('AUTH21_FUNDAMENTAL_DB_OUTSIDE_TRIAL');
   const parsed=new URL(input.feedUrl);
   if(parsed.username||parsed.password||parsed.port||!parsed.hostname.includes('.'))
    throw Error('AUTH21_FEED_HOST_INVALID');
   const Storage=require('../../Fundamental/Engine/database');
   const store=new Storage({snapshotGate:trial.gate});
   try{
    const id=crypto.createHash('sha256').update(input.feedUrl).digest('hex').slice(0,12).toUpperCase();
    store.createFeed({provider:'RSS',endpoint:input.feedUrl,
     label:'Auth21 '+parsed.hostname,
     newSource:{code:'AUTH21_'+id,name:'Auth21 '+parsed.hostname,grade:'C',
      sourceType:'MEDIA',country:'INT'},enabled:false});
   }finally{store.close();}
  }
  if(rule.action==='portfolio.preference.set'){
   const base=path.join(root,'userdata','User Data');
   const db=env.IATB_PORTFOLIO_DB&&path.resolve(env.IATB_PORTFOLIO_DB);
   if(!db||!db.startsWith(base+path.sep)||!db.endsWith('.db'))
    throw Error('AUTH21_PORTFOLIO_DB_OUTSIDE_TRIAL');
   const Store=require('../../Portfolio/Engine/portfolio_store');
   const store=new Store(path.join(root,'App'),
     {dbPath:db,username:'fixture',snapshotGate:trial.gate});
   try{store.setSetting('auth21.preference.'+principal.clientId+'.'+input.key,input.value);}
   finally{store.close();}
  }
  if(rule.action==='strategy.preference.set'){
   const configured=String(env.IATB_USERDATA_USER||'fixture');
   if(!/^[A-Za-z0-9._-]{1,64}$/.test(configured))
    throw Error('AUTH21_STRATEGY_USER_INVALID');
   const expected=path.join(root,'userdata','User Data',configured,'user_data.db');
   if(env.IATB_USER_DB!==undefined&&path.resolve(env.IATB_USER_DB)!==expected)
    throw Error('AUTH21_STRATEGY_DB_OUTSIDE_TRIAL');
   const Store=require('../Settings/sqlite_settings_store');
   const settings=new Store(path.join(root,'App'),{
    dbPath:expected,username:configured,snapshotGate:trial.gate});
   try{
    if(!settings.ready)throw Error('AUTH21_STRATEGY_SETTINGS_UNAVAILABLE');
    settings.set('auth21.strategy.'+principal.clientId,input.key,input.value);
   }finally{if(settings.native)settings.native.close();}
  }
  let filename;
  if(rule.owner)filename=rule.engine+'-'+principal.clientId+'-'+input.key+'.fixture.json';
  else if(rule.action==='marketdata.settings.set')filename='marketdata-settings.fixture.json';
  else filename='fundamental-feed.fixture.json';
  const target=path.join(directory,filename);
  const temp=path.join(directory,'.auth21-'+crypto.randomBytes(12).toString('hex')+'.tmp');
  const value={action:rule.action,clientId:principal.clientId,
    ownerClientId:rule.owner?principal.clientId:null,settings:input};
  try{
   fs.writeFileSync(temp,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
   fs.renameSync(temp,target);
  }finally{try{fs.unlinkSync(temp);}catch(_){}}
  return {ok:true,action:rule.action,ownerClientId:value.ownerClientId};
 }
 return function handler(req,res){
  const rule=contract(req.url);
  if(!rule||rule.engine!==trial.engine||req.method!==(rule.method||'POST')||
    !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket&&req.socket.remoteAddress)||
    req.headers.origin||req.headers.cookie||req.headers.authorization)
   return send(res,403,{error:'AUTH21_BUSINESS_DENIED'});
  if(rule.method==='GET'){
   if(req.headers['transfer-encoding']||
      (req.headers['content-length']!==undefined&&String(req.headers['content-length'])!=='0'))
    return send(res,400,{error:'INVALID_REQUEST'});
   const proof=req.headers['x-iatb-auth21-proof'];
   if(typeof proof!=='string')return send(res,403,{error:'AUTH21_BUSINESS_DENIED'});
   const digest=crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
   let access;
   try{trial.gate.assertWritable();access=business.verify({codec,proof,action:rule.action,bodyDigest:digest});}
   catch(_){return send(res,409,{error:'AUTH21_BUSINESS_WRITE_BLOCKED'});}
   if(!access.allowed)return send(res,403,{error:'AUTH21_BUSINESS_DENIED'});
   return send(res,200,{ok:true,action:rule.action,readOnly:true,
    providers:['BINANCE','KRAKEN','OKX','GMX']});
  }
  let bytes=0,parts=[],failed=false;
  req.on('data',chunk=>{
   bytes+=chunk.length;
   if(bytes>2048){failed=true;req.destroy();return;}
   parts.push(chunk);
  });
  req.on('end',()=>{
   if(failed)return;
   const raw=Buffer.concat(parts),digest=crypto.createHash('sha256').update(raw).digest('hex');
   let input;
   try{input=JSON.parse(raw.toString('utf8'));}
   catch(_){return send(res,400,{error:'INVALID_JSON'});}
   if(!validate(rule,input))return send(res,400,{error:'INVALID_SETTINGS'});
   const proof=req.headers['x-iatb-auth21-proof'];
   if(typeof proof!=='string')return send(res,403,{error:'AUTH21_BUSINESS_DENIED'});
   try{
    trial.gate.assertWritable();
    if(businessHandlers&&Object.hasOwn(businessHandlers,rule.action)){
     const checked=business.verify({codec,proof,action:rule.action,
      ownerClientId:rule.owner?input.ownerClientId:null,bodyDigest:digest});
     if(!checked.allowed)return send(res,403,{error:'AUTH21_BUSINESS_DENIED'});
     const result=businessHandlers[rule.action](input,checked);
     if(!result||result.ok!==true)return send(res,409,{error:'AUTH21_ENGINE_BUSINESS_HANDLER_FAILED'});
     return send(res,200,result);
    }
    if(indicatorWriter){
     const result=indicatorWriter.write({proof,settings:input,bodyDigest:digest});
     return send(res,result.ok?200:403,result);
    }
    const verified=business.verify({codec,proof,action:rule.action,
      ownerClientId:rule.owner?input.ownerClientId:null,bodyDigest:digest});
    if(!verified.allowed)return send(res,403,{error:'AUTH21_BUSINESS_DENIED'});
    return send(res,200,persist(rule,input,verified));
   }catch(error){
    if(env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1')
     process.stderr.write('[AUTH21_ISOLATED_WRITE_FAILURE] '+String(error.code||error.message||'UNKNOWN').slice(0,120)+'\n');
    return send(res,409,{error:'AUTH21_BUSINESS_WRITE_BLOCKED'});
   }
  });
  req.on('error',()=>{if(!res.writableEnded)send(res,400,{error:'INVALID_REQUEST'});});
 };
}
module.exports={openBusinessIngress};
