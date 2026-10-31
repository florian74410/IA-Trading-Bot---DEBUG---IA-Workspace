'use strict';
/* Trusted LOCAL operator precondition for a future restricted OS CLI.
 * Caller still MUST present a valid Argon2id-backed ADMIN session.
 * Process env and browser/HTTP input are NEVER proof of local identity.
 * This gate does not itself execute commands or open any database.
 */
const fs=require('node:fs');
function createLocalOperatorCheck({allowedUid,stdin,processUid,ttyStat}={}){
 if(!Number.isSafeInteger(allowedUid)||allowedUid<=0)throw Error('AUTH21_OPERATOR_UID_REQUIRED');
 const input=stdin||process.stdin;
 const getUid=processUid||(()=>typeof process.getuid==='function'?process.getuid():-1);
 const stat=ttyStat||((fd)=>fs.fstatSync(fd));
 return function authorizeLocalOperator(){
  try{
   const uid=getUid();
   if(uid!==allowedUid||uid<=0||!input||input.isTTY!==true||
      !Number.isInteger(input.fd)||input.fd<0)return false;
   const descriptor=stat(input.fd);
   return Boolean(descriptor&&typeof descriptor.isCharacterDevice==='function'&&
    descriptor.isCharacterDevice()&&descriptor.uid===uid);
  }catch(_){return false}
 };
}
module.exports={createLocalOperatorCheck};
