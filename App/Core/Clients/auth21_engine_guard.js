'use strict';
/* Common Auth21 Engine authorization gate. Pure service-side middleware contract.
 * Engine services must explicitly mount this at their REAL ingress before it protects routes.
 * No trading LIVE, Wallet or arbitrary writes. Never trusts browser-provided role/owner.
 */
const crypto=require('node:crypto');
const {active}=require('./auth21_service_boundary');
const {authorizeInterprocess}=require('./auth21_rbac_guard');
const ENGINES=Object.freeze([
 'indicator','marketdata','liquidity','fundamental','trading','firewall',
 'strategy','risk','portfolio','kraken','supervisor','router'
]);
const KNOWN=new Set(ENGINES);
const READ_ACTIONS=Object.freeze({
 indicator:['indicator.read'],marketdata:['marketdata.read'],
 liquidity:['liquidity.read'],fundamental:['fundamental.read'],
 trading:['trading.read'],firewall:['firewall.read'],strategy:['strategy.read'],
 risk:['risk.read'],portfolio:['portfolio.read'],kraken:['kraken.read'],
 supervisor:['supervisor.read'],router:['router.read']
});
function digest(body){
 if(!Buffer.isBuffer(body))throw Error('AUTH21_ENGINE_RAW_BODY_REQUIRED');
 return crypto.createHash('sha256').update(body).digest('hex');
}
function createEngineGuard({env,codec,engine}={}){
 if(!active(env)||!KNOWN.has(engine)||!codec||typeof codec.verify!=='function')
  throw Error('AUTH21_ENGINE_GUARD_CONFIG_REQUIRED');
 return function check({proof,action,method,rawBody,ownerClientId}={}){
  if(typeof action!=='string'||!READ_ACTIONS[engine].includes(action))
   return {allowed:false,reason:'ACTION_DENIED'};
  if(method!=='GET'||(rawBody!==undefined&&(!Buffer.isBuffer(rawBody)||rawBody.length!==0)))
   return {allowed:false,reason:'METHOD_DENIED'};
  if(typeof proof!=='string')return {allowed:false,reason:'PROOF_REQUIRED'};
  // Service-specific audience AND action, scoped server-side; read-only by design.
  return authorizeInterprocess({codec,proof,audience:engine,operation:'shared.read',
   method:'GET',ownerClientId:null,action});
 };
}
module.exports={ENGINES,createEngineGuard,digest};
