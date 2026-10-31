'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {AccountRouting}=require('../account-routing');
const {TradingEngine}=require('../trading-engine');
const base={id:'binance-main',owner:'alice',exchange:'BINANCE',kind:'CEX',markets:['SPOT'],actions:['execute','cancel','close'],default:true,enabled:true,credentialRef:'vault-ref'};
const intent={exchange:'BINANCE',market_type:'SPOT',symbol:'BTC/USDT',side:'BUY',quantity:'1',risk_approval_id:'risk-1'};
function setup(rows=[{...base}],overrides={}){
 let reads=0;
 const router=new AccountRouting({authorize:async ({proof})=>proof==='trusted'?{clientId:'alice',role:'USER'}:null,listAccounts:async()=>rows,readCredentials:async(p,ref)=>{reads++;assert.equal(p.clientId,'alice');assert.equal(ref,'vault-ref');return {apiKey:'fixture',apiSecret:'fixture-secret'};},...overrides});
 return {router,reads:()=>reads};
}
test('CEX selection binds owner, market and broker; public identity contains no secret',async()=>{
 const s=setup(),b=await s.router.bind(intent,'execute','trusted');assert.equal(b.account,'binance-main');assert.equal(s.reads(),0);
 assert.equal((await b.secretProvider.get('BINANCE')).apiKey,'fixture');assert.equal(s.reads(),1);
 assert.equal(JSON.stringify(b.identity).includes('vault-ref'),false);
 await assert.rejects(b.secretProvider.get('OKX'),/SCOPE_MISMATCH/);
});
test('reject missing authorization, other owner, disabled, wrong market, ambiguous default and inline credentials',async()=>{
 await assert.rejects(setup().router.bind(intent,'execute','forged'),/UNAUTHORIZED/);
 for(const patch of [{owner:'bob'},{enabled:false},{markets:['FUTURES_USDM']},{default:false},{actions:['cancel']}])await assert.rejects(setup([{...base,...patch}]).router.bind(intent,'execute','trusted'),/NOT_ASSIGNED/);
 await assert.rejects(setup([{...base},{...base,id:'second'}]).router.bind(intent,'execute','trusted'),/AMBIGUOUS/);
 await assert.rejects(setup().router.bind({...intent,account:{apiKey:'injected'}},'execute','trusted'),/REFERENCE_INVALID/);
});
test('explicit account selects among multiple assigned accounts without fallback',async()=>{
 const s=setup([{...base},{...base,id:'second'}]);
 assert.equal((await s.router.bind({...intent,account:'second'},'execute','trusted')).account,'second');
 await assert.rejects(s.router.bind({...intent,account:'missing'},'execute','trusted'),/NOT_ASSIGNED/);
});
test('revocation and credential rotation invalidate prior binding before reading secrets',async()=>{
 const rows=[{...base}],s=setup(rows),b=await s.router.bind(intent,'execute','trusted');rows[0].credentialRef='rotated';
 await assert.rejects(b.secretProvider.get('BINANCE'),/REVOKED/);assert.equal(s.reads(),0);
});
test('GMX selects wallet by explicit chain and passes only bound signer',async()=>{
 const address='0x'+'a'.repeat(40);let signs=0;
 const s=setup([{...base,id:'wallet',exchange:'GMX',kind:'DEX',chain:'arbitrum',address,walletRef:'W0001',markets:['PERPETUAL']}],{walletSigner:async()=>({signGmxPreparedOrder:async()=>{signs++;return 'signed-fixture';}})});
 const order={...intent,exchange:'GMX',market_type:'PERPETUAL',chain:'arbitrum'};
 const b=await s.router.bind(order,'execute','trusted');assert.equal(b.account,address);
 await assert.rejects(s.router.bind({...order,chain:null},'execute','trusted'),/CHAIN_REQUIRED/);
 await assert.rejects(b.walletSigner.signGmxPreparedOrder({}, {chain:'avalanche',order:{account:address}}),/SCOPE_MISMATCH/);
 assert.equal(await b.walletSigner.signGmxPreparedOrder({}, {chain:'arbitrum',order:{account:address}}),'signed-fixture');assert.equal(signs,1);
});
test('engine uses routing for execution and cancellation and rechecks halt after asynchronous resolution',async()=>{
 const s=setup();let running=true,calls=0;
 const e=new TradingEngine({accountRouting:s.router,lifecycle:{canExecute:()=>running,snapshot:()=>({generation:1}),submit:(o,send)=>send()}});
 const execute=async(o,c)=>{calls++;assert.equal(o.account,'binance-main');assert.equal((await c.secretProvider.get('BINANCE')).apiKey,'fixture');return {ok:true};};
 e.registerExecutor('BINANCE',{execute,cancel:execute});
 await e.execute(intent,{accountProof:'trusted'});await e.cancel({...intent,exchange_order_id:'order-1'},{accountProof:'trusted'});assert.equal(calls,2);
 await assert.rejects(e.execute(intent,{accountProof:'untrusted'}),/UNAUTHORIZED/);
 e.accountRouting={bind:async()=>{running=false;return {account:'binance-main'};}};
 await assert.rejects(e.execute(intent),/RUNTIME_LOCKED/);assert.equal(calls,2);
});
