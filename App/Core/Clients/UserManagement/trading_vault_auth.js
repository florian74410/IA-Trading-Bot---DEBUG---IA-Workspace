'use strict';
const crypto=require('node:crypto'),{loadTradingAdminKey}=require('../auth21_trading_key_provider');
function mac(body,at,nonce,env){const key=loadTradingAdminKey({env});try{return crypto.createHmac('sha256',key).update('iatb-trading-vault-v1\n').update(JSON.stringify({body,at,nonce})).digest('hex');}finally{key.fill(0);}}
function headers(body,env=process.env){const at=Date.now(),nonce=crypto.randomBytes(16).toString('hex');return {'X-IATB-Vault-Time':String(at),'X-IATB-Vault-Nonce':nonce,'X-IATB-Vault-Signature':mac(body,at,nonce,env)};}
function verifier(env=process.env,now=Date.now){const used=new Map();return (body,h)=>{
 const at=Number(h['x-iatb-vault-time']),nonce=h['x-iatb-vault-nonce'],signature=h['x-iatb-vault-signature'],t=now();
 if(!Number.isSafeInteger(at)||at>t+1000||t-at>5000||!/^[a-f0-9]{32}$/.test(nonce||'')||!/^[a-f0-9]{64}$/.test(signature||''))return false;
 for(const [n,expires]of used)if(expires<t)used.delete(n);
 if(used.has(nonce)||used.size>=2048)return false;
 let expected;try{expected=mac(body,at,nonce,env);}catch(_){return false;}
 if(!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature)))return false;
 used.set(nonce,at+5000);return true;
 };}
module.exports={headers,verifier};
