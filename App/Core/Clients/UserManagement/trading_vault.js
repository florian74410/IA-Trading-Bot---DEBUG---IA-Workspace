'use strict';
const crypto=require('node:crypto');
const {AccountRouting}=require('../../../services/trading-engine/account-routing');
const {normalizeOrderIntent,normalizeCancelIntent}=require('../../../services/trading-engine/trading-engine');
const {typedDigest,signTypedData}=require('../../../Bank/Core/dex_wallet_signer');
const CP=require('../../Communication/communication_protocol_v1');
const ACTIONS=new Set(['execute','cancel','close']);
const MARKETS={BINANCE:['SPOT','FUTURES_USDM'],KRAKEN:['SPOT','MARGIN'],OKX:['SPOT','SWAP','FUTURES'],GMX:['PERPETUAL']};
function canonical(intent,action){
 if(!ACTIONS.has(action))throw Error('TRADING_ACTION_INVALID');
 let o=JSON.parse(JSON.stringify(intent));for(const k of Object.keys(o))if(o[k]===null)delete o[k];
 if(action==='close'){if(!['LONG','SHORT'].includes(o.position_side))throw Error('TRADING_POSITION_SIDE_INVALID');o.side=o.position_side==='LONG'?'SELL':'BUY';o.order_type='MARKET';o.reduce_only=true;}
 if(action!=='cancel'&&!o.client_order_id)throw Error('TRADING_CLIENT_ORDER_ID_REQUIRED');
 o=action==='cancel'?normalizeCancelIntent(o):normalizeOrderIntent(o);delete o.request_id;
 if(o.metadata)delete o.metadata.account_ticket;
 return o;
}
class TradingVault {
 constructor({sessions,walletAccess=null,now=Date.now}){this.sessions=sessions;this.walletAccess=walletAccess;this.now=now;this.tickets=new Map();}
 principal(token){const p=this.sessions.verifySession(token);if(!p||!['ADMIN','USER'].includes(p.role))throw Error('TRADING_ACCOUNT_UNAUTHORIZED');return p;}
 list(token){this.principal(token);const rows=JSON.parse(this.sessions.getPreference(token,'trading','accounts')||'[]');if(!Array.isArray(rows))throw Error('TRADING_ACCOUNT_REGISTRY_INVALID');return rows;}
 async save(token,input){
  const p=this.principal(token);if(!input||Object.keys(input).some(k=>!['id','exchange','markets','actions','enabled','default','chain','walletRef','walletAccountId','contracts','credentials'].includes(k)))throw Error('INVALID_REQUEST');
  if(!/^[a-z][a-z0-9_-]{0,39}$/.test(input.id||'')||!Object.hasOwn(MARKETS,input.exchange)||!Array.isArray(input.markets)||!input.markets.length||input.markets.some(m=>!MARKETS[input.exchange].includes(m))||!Array.isArray(input.actions)||!input.actions.length||input.actions.some(a=>!ACTIONS.has(a))||typeof input.enabled!=='boolean'||typeof input.default!=='boolean')throw Error('INVALID_REQUEST');
  let pendingCredentials=null;const rows=this.list(token);if(rows.some(a=>a.id===input.id&&a.exchange!==input.exchange))throw Error('TRADING_ACCOUNT_BROKER_IMMUTABLE');const record={id:input.id,owner:p.clientId,exchange:input.exchange,markets:[...new Set(input.markets)],actions:[...new Set(input.actions)],enabled:input.enabled,default:input.default,kind:input.exchange==='GMX'?'DEX':'CEX',revision:crypto.randomUUID()};
  if(record.kind==='CEX'){
   if(input.chain||input.walletRef||input.walletAccountId||input.contracts)throw Error('INVALID_REQUEST');
   record.credentialRef='TRADE_'+crypto.createHash('sha256').update(record.id).digest('hex').slice(0,24).toUpperCase();
   const credentials=input.credentials;
   if(credentials){if(Object.keys(credentials).some(k=>!['apiKey','apiSecret','passphrase'].includes(k))||['apiKey','apiSecret'].some(k=>typeof credentials[k]!=='string'||!credentials[k]||credentials[k].length>2048)||credentials.passphrase!==undefined&&(typeof credentials.passphrase!=='string'||credentials.passphrase.length>2048)||record.exchange==='OKX'&&!credentials.passphrase)throw Error('TRADING_CREDENTIALS_INCOMPLETE');}
   const existing=this.sessions.secrets(token)[record.credentialRef];
   if(!credentials&&!existing)throw Error('TRADING_CREDENTIALS_INCOMPLETE');
   if(credentials)pendingCredentials={[record.credentialRef]:JSON.stringify(credentials)};
  }else{
   if(input.credentials||!['arbitrum','avalanche'].includes(input.chain)||typeof input.walletRef!=='string'||typeof input.walletAccountId!=='string'||!Array.isArray(input.contracts)||!input.contracts.length||input.contracts.length>8||input.contracts.some(a=>!/^0x[0-9a-fA-F]{40}$/.test(a)))throw Error('INVALID_REQUEST');
   if(!this.walletAccess)throw Error('TRADING_WALLET_UNAVAILABLE');
   const wallets=await this.walletAccess(token,(ws,sess)=>ws.list(sess,false));
   const wallet=wallets.find(w=>w.id===input.walletRef),wa=wallet?.accounts?.find(a=>a.id===input.walletAccountId&&a.family==='EVM'&&a.networks?.includes(input.chain)&&a.hasSecret===true);
   if(!wa)throw Error('TRADING_WALLET_UNAVAILABLE');
   Object.assign(record,{chain:input.chain,walletRef:input.walletRef,walletAccountId:input.walletAccountId,address:wa.address,contracts:input.contracts});
  }
  const next=rows.filter(a=>a.id!==record.id);if(next.length>=32)throw Error('TRADING_ACCOUNT_LIMIT');
  if(record.enabled&&record.default&&next.some(a=>a.enabled&&a.default&&a.exchange===record.exchange&&a.chain===record.chain&&a.markets.some(m=>record.markets.includes(m))&&a.actions.some(x=>record.actions.includes(x))))throw Error('TRADING_ACCOUNT_AMBIGUOUS');
  next.push(record);this.sessions.db.transaction(()=>{this.principal(token);if(CP.hashData(this.list(token))!==CP.hashData(rows))throw Error('TRADING_ACCOUNT_CONCURRENT_UPDATE');if(pendingCredentials)this.sessions.setSecrets(token,pendingCredentials);this.sessions.setPreference(token,'trading','accounts',JSON.stringify(next));}).immediate();return record;
 }
 routing(token,expected,action){return new AccountRouting({
  authorize:async ({intent,action:a})=>a===action&&CP.hashData(canonical(intent,a))===CP.hashData(expected)?this.principal(token):null,
  listAccounts:async()=>this.list(token),
  readCredentials:async(p,ref)=>{if(this.principal(token).clientId!==p.clientId)throw Error('TRADING_ACCOUNT_UNAUTHORIZED');const raw=this.sessions.secrets(token)[ref];if(!raw)throw Error('TRADING_CREDENTIALS_INCOMPLETE');return JSON.parse(raw);},
  walletSigner:async()=>{throw Error('DEX_PREPARED_POLICY_REQUIRED');}
 });}
 async issue(token,intent,action){
  const normalized=canonical(intent,action),binding=await this.routing(token,normalized,action).bind(normalized,action);
  for(const [id,t]of this.tickets)if(t.expires<=this.now())this.tickets.delete(id);
  if(this.tickets.size>=256)throw Error('TRADING_TICKET_LIMIT');
  const ticket=crypto.randomBytes(32).toString('base64url');
  this.tickets.set(ticket,{token,intent:normalized,action,account:binding.identity.id,revision:this.list(token).find(a=>a.id===binding.identity.id).revision,expires:this.now()+30000,claimed:false,credentialRead:false});
  return {ticket,account:binding.identity,expiresInMs:30000};
 }
 async access({ticket,intent,action,operation,exchange}){
  const t=this.tickets.get(ticket);if(!t||t.expires<=this.now()||t.action!==action||CP.hashData(canonical(intent,action))!==CP.hashData(t.intent))throw Error('TRADING_TICKET_INVALID');
  const record=this.list(t.token).find(a=>a.id===t.account);if(!record||record.revision!==t.revision)throw Error('TRADING_ACCOUNT_REVOKED');
  if(operation==='bind'){if(t.claimed)throw Error('TRADING_TICKET_REPLAY');t.claimed=true;}else if(!t.claimed)throw Error('TRADING_TICKET_UNCLAIMED');
  const b=await this.routing(t.token,t.intent,action).bind(t.intent,action);
  if(operation==='bind')return {identity:b.identity,account:b.account,kind:record.kind};
  if(operation==='credentials'&&record.kind==='CEX'){if(t.credentialRead)throw Error('TRADING_CREDENTIAL_REPLAY');t.credentialRead=true;return {credentials:await b.secretProvider.get(exchange)};}
  throw Error('TRADING_ACCESS_OPERATION_DENIED');
 }
 async sign(token,input){
  if(!input||Object.keys(input).some(k=>!['account','typedData','digest','confirmed'].includes(k))||input.confirmed!==true||typedDigest(input.typedData)!==input.digest)throw Error('DEX_SIGNATURE_CONFIRMATION_REQUIRED');
  const p=this.principal(token),record=this.list(token).find(a=>a.id===input.account&&a.kind==='DEX'&&a.enabled);
  if(!record||!this.walletAccess)throw Error('TRADING_WALLET_UNAVAILABLE');
  const authorize=async()=>this.principal(token).clientId===p.clientId&&this.list(token).some(a=>a.id===record.id&&a.enabled&&a.revision===record.revision);
  return this.walletAccess(token,(ws,sess)=>signTypedData({walletService:ws,session:sess,account:record,typedData:input.typedData,approvedDigest:input.digest,authorize}));
 }
}
module.exports={TradingVault,canonical};
