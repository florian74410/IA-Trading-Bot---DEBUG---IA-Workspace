'use strict';
const crypto=require('node:crypto');
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
function createBrowserSession({secret,origin}={}){
 if(!Buffer.isBuffer(secret)||secret.length<32||typeof origin!=='string'||!/^https:\/\/[^/@]+$/.test(origin))
  throw Error('AUTH21_COOKIE_CONFIG_INVALID');
 const originUrl=new URL(origin);
 function csrf(token){
  if(!TOKEN.test(token))return null;
  return crypto.createHmac('sha256',secret).update('auth21:csrf:v1:').update(token).digest('base64url');
 }
 function cookie(token){return '__Host-iatb21='+token+'; Secure; HttpOnly; SameSite=Strict; Path=/';}
 const expire='__Host-iatb21=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
 function parse(req){
  const value=req.headers.cookie;
  if(typeof value!=='string'||value.length>4096)return null;
  const all=value.split(';').map(v=>v.trim()).filter(v=>v.startsWith('__Host-iatb21='));
  if(all.length!==1)return null;
  const token=all[0].slice('__Host-iatb21='.length);
  return TOKEN.test(token)?token:null;
 }
 function validate(req,token){
  const supplied=req.headers['x-iatb-csrf'];
  const expected=csrf(token);
  if(!expected||typeof supplied!=='string'||supplied.length!==expected.length)return false;
  return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(supplied));
 }
 function originAllowed(req){
  if(req.socket?.encrypted!==true)return false;
  // Browsers normally omit Origin on same-origin GET fetches.
  // Every mutation still demands the exact HTTPS Origin and a CSRF token.
  if(req.method==='GET'&&req.headers.origin===undefined)return true;
  return req.headers.origin===originUrl.origin;
 }
 return {csrf,cookie,expire,parse,validate,originAllowed,origin};
}
module.exports={createBrowserSession};
