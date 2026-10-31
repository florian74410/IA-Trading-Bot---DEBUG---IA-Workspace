'use strict';
/* DEBUG-only, loopback-only, signed Core -> Engine snapshot barrier.
 * Never dispatches business actions and never accepts browser-origin identity.
 */
const crypto=require('node:crypto');
const {proofCodec}=require('../Clients/auth21_ipc_proof');
const {loadTrialSecret}=require('../Clients/auth21_ipc_keyfile');
const {preflightEnv}=require('./auth21_core_local_trial_wiring');
const COMMANDS=new Set(['prepare','release','abort']);
function createSnapshotControl({env,trial}={}){
 if(!env||env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL!=='1'||!trial||!trial.gate)
  throw Error('AUTH21_SNAPSHOT_CONTROL_DISABLED');
 if(preflightEnv(env).root!==trial.root)throw Error('AUTH21_SNAPSHOT_ROOT_MISMATCH');
 const codec=proofCodec({secret:loadTrialSecret({env,root:trial.root})});
 return function snapshotControl(req,res){
  const finish=(code,obj)=>{
   res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Connection':'close'});
   res.end(JSON.stringify(obj));
  };
  const peer=req.socket&&req.socket.remoteAddress;
  if(req.method!=='POST'||req.url!=='/auth21/snapshot/control'||
      !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer))
   return finish(403,{error:'FORBIDDEN'});
  const chunks=[];let count=0;
  req.on('data',part=>{
   count+=part.length;
   if(count>4096){req.destroy();return;}
   chunks.push(part);
  });
  req.on('end',()=>{
   if(count>4096)return;
   const raw=Buffer.concat(chunks);
   let body;
   try{body=JSON.parse(raw.toString('utf8'));}catch(_){return finish(403,{error:'FORBIDDEN'});}
   if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).sort().join(',')!=='command,epoch,writerId'||
       !COMMANDS.has(body.command)||body.writerId!==trial.engine||
       !Number.isSafeInteger(body.epoch)||body.epoch<1)
    return finish(403,{error:'FORBIDDEN'});
   const proof=req.headers['x-iatb-auth21-proof'];
   const bodyDigest=crypto.createHash('sha256').update(raw).digest('hex');
   const principal=codec.verify(proof,{audience:trial.engine,operation:'snapshot.control',
    method:'POST',ownerClientId:null,action:'snapshot.'+body.command,bodyDigest});
   if(!principal||principal.clientId!=='CLcore'||principal.role!=='ADMIN')
    return finish(403,{error:'FORBIDDEN'});
   try{
    const result=body.command==='prepare'?trial.gate.prepare(body.epoch):
      (body.command==='release'?trial.gate.release(body.epoch):trial.gate.abort(body.epoch));
    return finish(200,{ok:true,writerId:trial.engine,epoch:body.epoch,command:body.command,
      pending:result&&result.pending===0?0:null});
   }catch(e){const cause=String(e&&e.message||'');return finish(409,{error:'SNAPSHOT_WRITER_NOT_READY',cause:/^SNAPSHOT_[A-Z_]+$/.test(cause)?cause:'INTERNAL'});}
  });
  req.on('error',()=>{if(!res.writableEnded)finish(400,{error:'INVALID_REQUEST'});});
 };
}
module.exports={createSnapshotControl};
