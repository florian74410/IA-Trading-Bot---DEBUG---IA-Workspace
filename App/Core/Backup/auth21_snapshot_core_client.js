'use strict';
/* Core-only signed snapshot barrier client for isolated loopback service nodes.
 * This is a building block for coordinated capture, not a snapshot itself.
 */
const http=require('node:http'),crypto=require('node:crypto');
const {preflightEnv}=require('./auth21_core_local_trial_wiring');
const {loadTrialSecret}=require('../Clients/auth21_ipc_keyfile');
const {proofCodec}=require('../Clients/auth21_ipc_proof');
const ENGINES=new Set(['portfolio','marketdata','fundamental','trading','indicators','strategy']);
const COMMANDS=new Set(['prepare','release','abort']);
function createSnapshotCoreClient({env,root,timeoutMs=3000}={}){
 if(!env||env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL!=='1'||
    preflightEnv(env).root!==root||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)
  throw Error('AUTH21_SNAPSHOT_CORE_TRIAL_INVALID');
 const codec=proofCodec({secret:loadTrialSecret({env,root})});
 function send({engine,port,command,epoch}={}){
  if(!ENGINES.has(engine)||!COMMANDS.has(command)||
      !Number.isSafeInteger(port)||port<1024||port>65535||
      !Number.isSafeInteger(epoch)||epoch<1)throw Error('AUTH21_SNAPSHOT_COMMAND_INVALID');
  const body=Buffer.from(JSON.stringify({command,epoch,writerId:engine}));
  const proof=codec.issue({principal:{clientId:'CLcore',role:'ADMIN'},
   audience:engine,operation:'snapshot.control',method:'POST',ownerClientId:null,
   action:'snapshot.'+command,
   bodyDigest:crypto.createHash('sha256').update(body).digest('hex')});
  return new Promise((resolve,reject)=>{
   const request=http.request({hostname:'127.0.0.1',port,path:'/auth21/snapshot/control',
    method:'POST',timeout:timeoutMs,headers:{'Content-Type':'application/json',
     'Content-Length':body.length,'X-IATB-Auth21-Proof':proof}},res=>{
    let n=0;const chunks=[];
    res.on('data',part=>{n+=part.length;if(n>4096){request.destroy(Error('SNAPSHOT_RESPONSE_TOO_BIG'));return;}chunks.push(part);});
    res.on('end',()=>{
     let answer;try{answer=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(_){return reject(Error('SNAPSHOT_RESPONSE_INVALID'));}
     if(res.statusCode!==200||answer.ok!==true||answer.command!==command||
        answer.writerId!==engine||answer.epoch!==epoch)
      return reject(Error('SNAPSHOT_REMOTE_REJECTED:'+engine+':'+command+':HTTP'+res.statusCode+':'+(/^[A-Z_]{1,48}$/.test(String(answer.cause||''))?answer.cause:'UNSPECIFIED')));
     if(command==='prepare'&&answer.pending!==0)return reject(Error('SNAPSHOT_INVALID_ACK'));
     resolve({epoch,writerId:engine,pending:command==='prepare'?0:null});
    });
   });
   request.on('timeout',()=>request.destroy(Error('SNAPSHOT_REMOTE_TIMEOUT')));
   request.on('error',reject);
   request.end(body);
  });
 }
 function participant(engine,port){
  return {prepare:epoch=>send({engine,port,command:'prepare',epoch}),
   release:epoch=>send({engine,port,command:'release',epoch}),
   abort:epoch=>send({engine,port,command:'abort',epoch})};
 }
 return {send,participant};
}
module.exports={createSnapshotCoreClient,ENGINES};
