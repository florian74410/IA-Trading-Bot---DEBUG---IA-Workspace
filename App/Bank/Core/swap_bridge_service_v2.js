'use strict';
var http=require('http'),https=require('https'),URL=require('url').URL;

var NETWORKS={
 ethereum:{id:'ethereum',name:'Ethereum',chainId:'1',family:'EVM',rpcEnv:'IATB_RPC_ETHEREUM',native:'ETH'},
 arbitrum:{id:'arbitrum',name:'Arbitrum',chainId:'42161',family:'EVM',rpcEnv:'IATB_RPC_ARBITRUM',native:'ETH'},
 polygon:{id:'polygon',name:'Polygon',chainId:'137',family:'EVM',rpcEnv:'IATB_RPC_POLYGON',native:'POL'},
 bnb:{id:'bnb',name:'BNB Chain',chainId:'56',family:'EVM',rpcEnv:'IATB_RPC_BNB',native:'BNB'},
 base:{id:'base',name:'Base',chainId:'8453',family:'EVM',rpcEnv:'IATB_RPC_BASE',native:'ETH'}
};
var TOKENS={
 USDC:{symbol:'USDC',decimals:6,addresses:{
  ethereum:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  arbitrum:'0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  polygon:'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  bnb:'0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  base:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
 }}
};

function BI(v){try{return BigInt(String(v||'0'))}catch(e){return 0n}}
function units(text,decimals){
 text=String(text==null?'':text).trim();
 if(!/^\d+(?:\.\d+)?$/.test(text))throw new Error('AMOUNT_INVALID');
 var p=text.split('.'),a=p[0]||'0',b=(p[1]||'').slice(0,decimals);
 while(b.length<decimals)b+='0';
 return BI(a)*10n**BigInt(decimals)+BI(b||'0');
}
function decimal(v,decimals,places){
 v=BI(v);var base=10n**BigInt(decimals),a=v/base,b=(v%base).toString().padStart(decimals,'0');
 b=b.slice(0,places==null?Math.min(decimals,6):places).replace(/0+$/,'');
 return a.toString()+(b?'.'+b:'');
}
function validEvm(a){return /^0x[a-fA-F0-9]{40}$/.test(String(a||''))}
function qs(o){return Object.keys(o).filter(function(k){return o[k]!==undefined&&o[k]!==null&&o[k]!==''}).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(String(o[k]))}).join('&')}
function getJSON(url,headers,cb,timeout){
 var u;try{u=new URL(url)}catch(e){return cb(new Error('URL_INVALID'))}
 var lib=u.protocol==='https:'?https:http,req=lib.request({protocol:u.protocol,hostname:u.hostname,port:u.port||undefined,path:u.pathname+u.search,method:'GET',timeout:timeout||12000,headers:headers||{}},function(res){
  var a=[],n=0;res.on('data',function(c){n+=c.length;if(n<4194304)a.push(c)});
  res.on('end',function(){var o,t=Buffer.concat(a).toString('utf8');try{o=JSON.parse(t)}catch(e){return cb(new Error('JSON_INVALID'))}
   if(res.statusCode<200||res.statusCode>299){var er=new Error((o&&o.message)||(o&&o.reason)||(o&&o.error)||('HTTP_'+res.statusCode));er.statusCode=res.statusCode;er.payload=o;return cb(er)}
   cb(null,o,res.headers);
  });
 });req.on('timeout',function(){req.destroy(new Error('REQUEST_TIMEOUT'))});req.on('error',cb);req.end();
}
function rpc(endpoint,method,params,cb){
 if(!endpoint)return cb(new Error('RPC_NOT_CONFIGURED'));
 var u;try{u=new URL(endpoint)}catch(e){return cb(new Error('RPC_URL_INVALID'))}
 var payload=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,method:method,params:params||[]})),lib=u.protocol==='https:'?https:http;
 var req=lib.request({protocol:u.protocol,hostname:u.hostname,port:u.port||undefined,path:(u.pathname||'/')+(u.search||''),method:'POST',timeout:10000,headers:{'Content-Type':'application/json','Content-Length':payload.length}},function(res){
  var a=[];res.on('data',function(c){a.push(c)});res.on('end',function(){var o;try{o=JSON.parse(Buffer.concat(a).toString('utf8'))}catch(e){return cb(new Error('RPC_JSON_INVALID'))}
   if(o.error)return cb(new Error('RPC_ERROR:'+String(o.error.message||o.error.code)));cb(null,o.result);
  });
 });req.on('timeout',function(){req.destroy(new Error('RPC_TIMEOUT'))});req.on('error',cb);req.end(payload);
}
function sumFee(fees){
 fees=fees||{};var total=0n;
 function add(x){if(!x)return;if(Array.isArray(x))return x.forEach(add);if(x.amount!==undefined)total+=BI(x.amount)}
 add(fees.integratorFees||fees.integratorFee);add(fees.zeroExFee);return total;
}
function providerOf(q){
 var names=[];(q.steps||[]).forEach(function(s){var n=s.provider||s.bridge||s.source;if(n&&names.indexOf(n)<0)names.push(n)});
 return names.join(' + ')||'0x';
}
function accountFor(wallet,network){
 var a=(wallet&&wallet.accounts||[]).filter(function(x){return (x.networks||[]).indexOf(network)>=0})[0];
 return a||null;
}
function approvalData(spender,amount){
 if(!validEvm(spender))return null;
 var sig='095ea7b3',addr=String(spender).toLowerCase().replace(/^0x/,'').padStart(64,'0'),amt=BI(amount).toString(16).padStart(64,'0');
 return'0x'+sig+addr+amt;
}
function SwapBridgeService(opts){
 opts=opts||{};this.walletService=opts.walletService;this.getSecret=opts.getSecret||function(){return''};this.notify=opts.notify||function(){};this.log=opts.log||function(){};
 this.getFeeRecipient=opts.getFeeRecipient||function(){return''};this.getRpc=opts.getRpc||function(){return''};this.cache=Object.create(null);this.feeBps=100;this.feeRate=.01;this.quoteTtlMs=45000;
}
SwapBridgeService.prototype._apiKey=function(sess){return String(this.getSecret(sess,'ZEROX_API_KEY')||(sess&&sess.auth21?'':process.env.ZEROX_API_KEY)||'').trim()};
SwapBridgeService.prototype._feeRecipient=function(){return String(this.getFeeRecipient()||process.env.IATB_FEE_RECIPIENT||'').trim()};
SwapBridgeService.prototype._rpc=function(network){var n=NETWORKS[network];return n?String(this.getRpc(network)||(process.env.IATB_AUTH_MODE==='authenticated'?'':process.env[n.rpcEnv])||'').trim():''};
SwapBridgeService.prototype.status=function(sess){

 var signer=false;try{var ep=require('ethers');signer=!!(ep&&ep.Wallet&&ep.providers&&ep.providers.JsonRpcProvider)}catch(e){}return{ok:true,engine:'SWAP_BRIDGE_V2',provider:'0x Cross-Chain',feeBps:this.feeBps,feePercent:1,apiConfigured:!!this._apiKey(sess),feeRecipientConfigured:validEvm(this._feeRecipient()),internalSignerReady:signer,rpc:Object.keys(NETWORKS).reduce(function(o,k){o[k]=!!String(this._rpc(k)||'').trim();return o}.bind(this),{})};
};
SwapBridgeService.prototype.testProvider=function(sess,cb){var key=this._apiKey(sess);if(!key)return cb(new Error('ZEROX_API_KEY_MISSING'));var started=Date.now();getJSON('https://api.0x.org/cross-chain/sources',{'0x-api-key':key,'0x-version':'v2','Accept':'application/json'},function(e,o){if(e)return cb(e);var count=Array.isArray(o)?o.length:(o&&Array.isArray(o.sources)?o.sources.length:0);cb(null,{ok:true,provider:'0x Cross-Chain',latencyMs:Date.now()-started,sources:count,raw:o});},15000);};
SwapBridgeService.prototype._context=function(sess,input){
 input=input||{};var sourceNetwork=String(input.sourceNetwork||'').toLowerCase(),destNetwork=String(input.destNetwork||'').toLowerCase(),sn=NETWORKS[sourceNetwork],dn=NETWORKS[destNetwork];
 if(!sn||!dn)throw new Error('NETWORK_NOT_SUPPORTED_YET');
 var sellSymbol=String(input.sellSymbol||'USDC').toUpperCase(),buySymbol=String(input.buySymbol||'USDC').toUpperCase(),sell=TOKENS[sellSymbol],buy=TOKENS[buySymbol];
 if(!sell||!buy||!sell.addresses[sourceNetwork]||!buy.addresses[destNetwork])throw new Error('TOKEN_ROUTE_NOT_SUPPORTED');
 var wallets=this.walletService.list(sess,false),sw=wallets.filter(function(w){return String(w.id)===String(input.sourceWalletId||'')})[0],dw=wallets.filter(function(w){return String(w.id)===String(input.destWalletId||'')})[0];
 if(!sw)throw new Error('SOURCE_WALLET_NOT_FOUND');if(!dw)throw new Error('DESTINATION_WALLET_NOT_FOUND');
 var sa=accountFor(sw,sourceNetwork),da=accountFor(dw,destNetwork);if(!sa)throw new Error('SOURCE_ADDRESS_NOT_AVAILABLE');if(!da)throw new Error('DESTINATION_ADDRESS_NOT_AVAILABLE');
 if(!validEvm(sa.address)||!validEvm(da.address))throw new Error('ADDRESS_INVALID');
 var raw=units(input.amount,sell.decimals);if(raw<=0n)throw new Error('AMOUNT_INVALID');
 var nominalFee=raw*BigInt(this.feeBps)/10000n;
 return{sourceNetwork:sourceNetwork,destNetwork:destNetwork,sn:sn,dn:dn,sellSymbol:sellSymbol,buySymbol:buySymbol,sell:sell,buy:buy,amountRaw:raw,amount:String(input.amount),nominalFeeRaw:nominalFee,sourceWallet:sw,destWallet:dw,sourceWalletId:sw.id,destWalletId:dw.id,sourceAccountId:sa.id,destAccountId:da.id,sourceAddress:sa.address,destAddress:da.address,slippageBps:Math.max(1,Math.min(1000,+input.slippageBps||10))};
};
SwapBridgeService.prototype.quote=function(sess,input,cb){return cb(new Error('BANK_FEATURE_SUSPENDED'));/* dormant implementation */
 var self=this,ctx,key,feeRecipient;
 try{ctx=this._context(sess,input);key=this._apiKey(sess);feeRecipient=this._feeRecipient();if(!key)throw new Error('ZEROX_API_KEY_MISSING');if(!validEvm(feeRecipient))throw new Error('IATB_FEE_RECIPIENT_MISSING')}catch(e){return cb(e)}
 var params={originChain:ctx.sn.chainId,destinationChain:ctx.dn.chainId,sellToken:ctx.sell.addresses[ctx.sourceNetwork],buyToken:ctx.buy.addresses[ctx.destNetwork],sellAmount:ctx.amountRaw.toString(),originAddress:ctx.sourceAddress,destinationAddress:ctx.destAddress,sortQuotesBy:'price',maxNumQuotes:5,slippageBps:ctx.slippageBps,feeBps:self.feeBps,feeRecipient:feeRecipient};
 getJSON('https://api.0x.org/cross-chain/quotes?'+qs(params),{'0x-api-key':key,'0x-version':'v2','Accept':'application/json'},function(err,o){
  if(err)return cb(err);if(!o||o.liquidityAvailable===false||!Array.isArray(o.quotes)||!o.quotes.length)return cb(new Error('NO_ROUTE_AVAILABLE'));
  var rpcUrl=self._rpc(ctx.sourceNetwork);
  function build(nativeHex){
   var nativeBalance=nativeHex?BI(nativeHex):null,routes=o.quotes.map(function(q,i){
    var issue=q.issues||{},bal=issue.balance||o.issues&&o.issues.balance||null,allow=issue.allowance||o.issues&&o.issues.allowance||null,
        gas=BI(q.gasCosts&&q.gasCosts.totalNetworkFee),value=BI(q.transaction&&q.transaction.details&&q.transaction.details.value),
        requiredNative=gas+value,tokenEnough=!bal||BI(bal.actual)>=BI(bal.expected),gasEnough=nativeBalance===null?null:nativeBalance>=requiredNative,
        feeRaw=sumFee(q.fees),integrator=q.fees&&(q.fees.integratorFees||q.fees.integratorFee),iatbApplied=!!integrator;
    var sellRaw=BI(q.sellAmount||ctx.amountRaw),buyRaw=BI(q.buyAmount||'0'),effectiveLoss=(ctx.sellSymbol===ctx.buySymbol&&ctx.sell.decimals===ctx.buy.decimals&&sellRaw>=buyRaw)?sellRaw-buyRaw:feeRaw;
    return{id:String(q.quoteId||('route-'+i)),quoteId:String(q.quoteId||''),provider:providerOf(q),sellAmountRaw:sellRaw.toString(),buyAmountRaw:buyRaw.toString(),minBuyAmountRaw:String(q.minBuyAmount||'0'),sellAmount:decimal(sellRaw,ctx.sell.decimals,6),buyAmount:decimal(buyRaw,ctx.buy.decimals,6),minBuyAmount:decimal(q.minBuyAmount||0,ctx.buy.decimals,6),effectiveLossRaw:effectiveLoss.toString(),effectiveLoss:decimal(effectiveLoss,ctx.sell.decimals,6),feeInputRaw:feeRaw.toString(),feeInput:decimal(feeRaw,ctx.sell.decimals,6),iatbFeeRaw:ctx.nominalFeeRaw.toString(),iatbFee:decimal(ctx.nominalFeeRaw,ctx.sell.decimals,6),gasNativeRaw:gas.toString(),txValueRaw:value.toString(),requiredNativeRaw:requiredNative.toString(),nativeBalanceRaw:nativeBalance===null?null:nativeBalance.toString(),estimatedTimeSeconds:+q.estimatedTimeSeconds||0,needsAllowance:!!allow,allowance:allow||null,balanceIssue:bal||null,simulationIncomplete:issue.simulationIncomplete===true,tokenEnough:tokenEnough,gasVerified:nativeBalance!==null,gasEnough:gasEnough,iatbFeeApplied:iatbApplied,transaction:q.transaction||null,steps:q.steps||[],fees:q.fees||{},canPrepare:tokenEnough&&gasEnough===true&&iatbApplied&&issue.simulationIncomplete!==true};
   });
   function sortCopy(fn){return routes.slice().sort(fn).map(function(x){return x.id})}
   var bestOutput=sortCopy(function(a,b){var A=BI(a.buyAmountRaw),B=BI(b.buyAmountRaw);return A===B?0:(A>B?-1:1)}),
       cheapest=sortCopy(function(a,b){var A=BI(a.effectiveLossRaw),B=BI(b.effectiveLossRaw);if(A!==B)return A<B?-1:1;A=BI(a.requiredNativeRaw);B=BI(b.requiredNativeRaw);return A===B?0:(A<B?-1:1)}),
       fastest=routes.slice().sort(function(a,b){return(a.estimatedTimeSeconds||999999)-(b.estimatedTimeSeconds||999999)}).map(function(x){return x.id}),
       rank={};
   [bestOutput,cheapest,fastest].forEach(function(arr){arr.forEach(function(id,i){rank[id]=(rank[id]||0)+i})});
   var recommended=routes.slice().sort(function(a,b){return(rank[a.id]||0)-(rank[b.id]||0)}).map(function(x){return x.id});
   routes.forEach(function(r){self.cache[r.id]={ownerClientId:sess&&sess.auth21?self.walletService.clientService.resolveSession(sess).clientId:null,ts:Date.now(),ctx:ctx,route:r,zid:o.zid||'',originChainId:o.originChainId||ctx.sn.chainId,destinationChainId:o.destinationChainId||ctx.dn.chainId};});
   cb(null,{ok:true,engine:'SWAP_BRIDGE_V2',fee:{percent:1,bps:self.feeBps,recipient:feeRecipient,nominalAmount:decimal(ctx.nominalFeeRaw,ctx.sell.decimals,6),symbol:ctx.sellSymbol},preflight:{addressValid:true,sourceAddress:ctx.sourceAddress,destinationAddress:ctx.destAddress,rpcConfigured:!!rpcUrl,nativeBalanceRaw:nativeBalance===null?null:nativeBalance.toString()},routes:routes,ranking:{recommended:recommended,bestOutput:bestOutput,cheapest:cheapest,fastest:fastest},expiresInMs:self.quoteTtlMs});
  }
  if(!rpcUrl)return build(null);
  rpc(rpcUrl,'eth_getBalance',[ctx.sourceAddress,'latest'],function(re,balance){if(re){self.log('SWAP_BRIDGE','RPC preflight failed',re.message);return build(null)}build(balance)});
 },15000);
};
SwapBridgeService.prototype.prepare=function(sess,input){require('./feature_policy_v2_4_1').assertEnabled('swap');
 input=input||{};var id=String(input.routeId||input.quoteId||''),x=this.cache[id];if(!x||sess&&sess.auth21&&x.ownerClientId!==this.walletService.clientService.resolveSession(sess).clientId)throw new Error('QUOTE_NOT_FOUND');if(Date.now()-x.ts>this.quoteTtlMs){delete this.cache[id];throw new Error('QUOTE_EXPIRED')}
 var r=x.route,ctx=x.ctx;if(!r.tokenEnough)throw new Error('INSUFFICIENT_TOKEN_BALANCE');if(!r.gasVerified)throw new Error('GAS_NOT_VERIFIED');if(!r.gasEnough)throw new Error('INSUFFICIENT_GAS_BALANCE');if(!r.iatbFeeApplied)throw new Error('IATB_FEE_NOT_APPLIED');if(r.simulationIncomplete)throw new Error('SIMULATION_INCOMPLETE');
 var approval=null;if(r.needsAllowance&&r.allowance&&validEvm(r.allowance.spender))approval={to:ctx.sell.addresses[ctx.sourceNetwork],data:approvalData(r.allowance.spender,ctx.amountRaw),value:'0',chainId:ctx.sn.chainId,spender:r.allowance.spender,amount:ctx.amountRaw.toString()};
 var signerReady=false;try{var ep=require('ethers');signerReady=!!(ep&&ep.Wallet&&ep.providers&&ep.providers.JsonRpcProvider)}catch(e){}
 return{ok:true,stage:'SIGNATURE_REQUIRED',signatureRequired:true,routeId:id,quoteId:r.quoteId,provider:r.provider,sourceAddress:ctx.sourceAddress,destinationAddress:ctx.destAddress,sourceNetwork:ctx.sourceNetwork,destinationNetwork:ctx.destNetwork,sellSymbol:ctx.sellSymbol,buySymbol:ctx.buySymbol,sellAmount:ctx.amount,buyAmount:r.buyAmount,minBuyAmount:r.minBuyAmount,fee:{percent:1,bps:this.feeBps,amount:r.iatbFee,symbol:ctx.sellSymbol},approval:approval,transaction:r.transaction,estimatedTimeSeconds:r.estimatedTimeSeconds,signer:{internal:signerReady,eip1193:true,reason:signerReady?'IA-TB Bank signer ready.':'Ethers signer runtime missing.'}};
};
SwapBridgeService.prototype.executeInternal=function(sess,input,cb){return cb(new Error('BANK_FEATURE_SUSPENDED'));/* dormant implementation */
 input=input||{};var self=this,prepared,password=String(input.password||'');if(input.confirmed!==true)return cb(new Error('SIGNATURE_CONFIRMATION_REQUIRED'));
 try{prepared=this.prepare(sess,input);var x=this.cache[String(input.routeId||input.quoteId||'')],ctx=x&&x.ctx;if(!ctx)throw new Error('QUOTE_NOT_FOUND');var client=this.walletService.clientService.resolveSession(sess),auth=this.walletService.clientService.accountByClientId(client.clientId);if(auth&&!this.walletService.clientService.verifyPassword(client.clientId,password))throw new Error('WALLET_PASSWORD_INVALID');if(!auth&&password.length<8)throw new Error('WALLET_PASSWORD_REQUIRED');var rpcUrl=this._rpc(ctx.sourceNetwork);if(!rpcUrl)throw new Error('RPC_NOT_CONFIGURED');var ethers=require('ethers'),secret=this.walletService.reveal(sess,ctx.sourceWalletId,ctx.sourceAccountId),pk=String(secret.privateKey||'');if(!pk)throw new Error('WALLET_SECRET_NOT_STORED');var provider=new ethers.providers.JsonRpcProvider(rpcUrl,+ctx.sn.chainId),wallet=new ethers.Wallet(pk,provider);pk='';password='';if(wallet.address.toLowerCase()!==String(ctx.sourceAddress).toLowerCase())throw new Error('SIGNER_ADDRESS_MISMATCH');
  function reqFrom(d){d=d&&d.details||d||{};var q={to:d.to,data:d.data||'0x',value:ethers.BigNumber.from(String(d.value||'0'))};if(d.gas)q.gasLimit=ethers.BigNumber.from(String(d.gas));if(d.gasPrice)q.gasPrice=ethers.BigNumber.from(String(d.gasPrice));if(d.maxFeePerGas)q.maxFeePerGas=ethers.BigNumber.from(String(d.maxFeePerGas));if(d.maxPriorityFeePerGas)q.maxPriorityFeePerGas=ethers.BigNumber.from(String(d.maxPriorityFeePerGas));return q}
  var chain=Promise.resolve(),approvalHash='';
  if(prepared.approval)chain=chain.then(function(){return wallet.sendTransaction(reqFrom(prepared.approval))}).then(function(t){approvalHash=t.hash;self.log('SWAP_BRIDGE','ERC20 approval submitted',t.hash);return t.wait(1)});
  chain.then(function(){return wallet.sendTransaction(reqFrom(prepared.transaction))}).then(function(t){self.log('SWAP_BRIDGE','Origin transaction submitted',t.hash);return t.wait(1).then(function(){return t})}).then(function(t){secret=null;wallet=null;provider=null;cb(null,{ok:true,stage:'ORIGIN_CONFIRMED',approvalTxHash:approvalHash||null,originTxHash:t.hash,quoteId:prepared.quoteId,provider:prepared.provider,sourceNetwork:prepared.sourceNetwork,destinationNetwork:prepared.destinationNetwork,sellSymbol:prepared.sellSymbol,buySymbol:prepared.buySymbol,sellAmount:prepared.sellAmount,buyAmount:prepared.buyAmount,fee:prepared.fee,estimatedTimeSeconds:prepared.estimatedTimeSeconds})}).catch(function(e){secret=null;wallet=null;provider=null;cb(e)});
 }catch(e){password='';return cb(e)}
};
SwapBridgeService.prototype.track=function(sess,input,cb){return cb(new Error('BANK_FEATURE_SUSPENDED'));/* dormant implementation */
 input=input||{};var key=this._apiKey(sess),originNetwork=String(input.originNetwork||'').toLowerCase(),n=NETWORKS[originNetwork],tx=String(input.originTxHash||''),qid=String(input.quoteId||'');
 if(!key)return cb(new Error('ZEROX_API_KEY_MISSING'));if(!n)return cb(new Error('ORIGIN_NETWORK_INVALID'));if(!/^0x[a-fA-F0-9]{64}$/.test(tx))return cb(new Error('TX_HASH_INVALID'));
 getJSON('https://api.0x.org/cross-chain/status?'+qs({originChain:n.chainId,originTxHash:tx,quoteId:qid}),{'0x-api-key':key,'0x-version':'v2','Accept':'application/json'},function(e,o){if(e)return cb(e);cb(null,{ok:true,status:o.status||'unknown',bridge:o.bridge||null,transactions:o.transactions||[],steps:o.steps||[],failure:o.failure||null,raw:o})},12000);
};
module.exports=SwapBridgeService;
