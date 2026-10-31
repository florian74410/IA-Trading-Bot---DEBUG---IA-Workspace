'use strict';
/* Auth21 inter-process capability: server-only HMAC, no browser roles or IDs.
 * An authenticated Core issues a short-lived proof for one exact operation.
 * Receiver MUST validate its expected audience, action, HTTP method, owner
 * and a replay registry before executing any side effect. Not active on GEN-1.
 */
const crypto=require('node:crypto');
const ID=/^CL[A-Za-z0-9_-]{1,64}$/;
const LABEL=/^[a-z][a-z0-9_.:-]{0,63}$/;
const ROLES=new Set(['ADMIN','USER','GUEST']);
function proofCodec({secret,now=()=>Date.now(),replayWindowMs=30000,replayStore=null}={}){
 if(!Buffer.isBuffer(secret)||secret.length<32)throw Error('AUTH21_PROOF_SECRET_REQUIRED');
 if(!Number.isSafeInteger(replayWindowMs)||replayWindowMs<1000||replayWindowMs>60000)throw Error('AUTH21_PROOF_WINDOW_INVALID');
 const used=new Map();
 const mac=s=>crypto.createHmac('sha256',secret).update('iatb-auth21-ipc-v1:').update(s).digest('base64url');
 function issue({principal,audience,operation,method,ownerClientId,action,bodyDigest}={}){
  if(!principal||!ID.test(principal.clientId)||!ROLES.has(principal.role)||
   !LABEL.test(audience)||!LABEL.test(operation)||
   !['GET','POST','PUT','PATCH','DELETE'].includes(method)||
   (ownerClientId!==null&&ownerClientId!==undefined&&!ID.test(ownerClientId))||
   (action!==undefined&&!LABEL.test(action))||
   (bodyDigest!==undefined&&!/^[a-f0-9]{64}$/.test(bodyDigest)))
   throw Error('AUTH21_PROOF_INPUT_INVALID');
  const at=now();
  if(!Number.isSafeInteger(at)||at<=0)throw Error('AUTH21_PROOF_CLOCK_INVALID');
  const payload={v:1,sub:principal.clientId,role:principal.role,aud:audience,
   op:operation,method,owner:ownerClientId||null,action:action||null,bodyDigest:bodyDigest||null,iat:at,exp:at+replayWindowMs,
   jti:crypto.randomBytes(16).toString('base64url')};
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body+'.'+mac(body);
 }
 function verify(proof,{audience,operation,method,ownerClientId,action,bodyDigest}={}){
  if(typeof proof!=='string'||proof.length>1024||!LABEL.test(audience)||
     !LABEL.test(operation)||!['GET','POST','PUT','PATCH','DELETE'].includes(method))return null;
  const parts=proof.split('.');
  if(parts.length!==2||!parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)))return null;
  const expected=mac(parts[0]),provided=parts[1];
  if(provided.length!==expected.length||
      !crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return null;
  let p;try{p=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'))}catch(_){return null}
  const t=now();
  if(p.v!==1||!ID.test(p.sub)||!ROLES.has(p.role)||p.aud!==audience||
      p.op!==operation||p.method!==method||p.owner!==(ownerClientId||null)||
      (action!==undefined&&p.action!==action)||
      (bodyDigest!==undefined&&p.bodyDigest!==bodyDigest)||
      !Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||
      p.exp-p.iat!==replayWindowMs||p.iat>t||t>=p.exp||
      typeof p.jti!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(p.jti))return null;
  const key=p.aud+':'+p.jti;
  if(used.has(key))return null;
  for(const [k,exp] of used){if(exp<=t)used.delete(k)}
  if(used.size>=2048)return null;
  if(replayStore&&(!replayStore.claim||replayStore.claim(key,p.exp,t)!==true))return null;
  used.set(key,p.exp);
  return {clientId:p.sub,role:p.role,ownerClientId:p.owner};
 }
 return {issue,verify};
}
module.exports={proofCodec};
