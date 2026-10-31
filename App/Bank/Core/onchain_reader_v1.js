'use strict';
var http=require('http'),https=require('https'),URL=require('url').URL;

var NETWORKS={
 ethereum:{id:'ethereum',name:'Ethereum',chainId:1,native:'ETH'},
 arbitrum:{id:'arbitrum',name:'Arbitrum',chainId:42161,native:'ETH'},
 polygon:{id:'polygon',name:'Polygon',chainId:137,native:'POL'},
 bnb:{id:'bnb',name:'BNB Chain',chainId:56,native:'BNB'},
 base:{id:'base',name:'Base',chainId:8453,native:'ETH'}
};

function rpc(endpoint,method,params,cb){
 if(!endpoint)return cb(new Error('RPC_NOT_CONFIGURED'));
 var u;try{u=new URL(endpoint)}catch(e){return cb(new Error('RPC_URL_INVALID'))}
 var payload=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,method:method,params:params||[]})),lib=u.protocol==='https:'?https:http;
 var req=lib.request({protocol:u.protocol,hostname:u.hostname,port:u.port||undefined,path:(u.pathname||'/')+(u.search||''),method:'POST',timeout:10000,headers:{'Content-Type':'application/json','Content-Length':payload.length}},function(res){
  var chunks=[];res.on('data',function(c){chunks.push(c)});res.on('end',function(){var o;try{o=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch(e){return cb(new Error('RPC_JSON_INVALID'))}if(o.error)return cb(new Error('RPC_ERROR:'+String(o.error.message||o.error.code)));cb(null,o.result)});
 });
 req.on('timeout',function(){req.destroy(new Error('RPC_TIMEOUT'))});req.on('error',cb);req.end(payload);
}
function bi(v){try{return BigInt(String(v||'0'))}catch(e){return 0n}}
function decimal(v,decimals,places){v=bi(v);var base=10n**BigInt(decimals),a=v/base,b=(v%base).toString().padStart(decimals,'0').slice(0,places==null?8:places).replace(/0+$/,'');return a.toString()+(b?'.'+b:'')}
function validEvm(a){return /^0x[a-fA-F0-9]{40}$/.test(String(a||''))}
function accountFor(wallet,network){return (wallet&&wallet.accounts||[]).filter(function(a){return (a.networks||[]).indexOf(network)>=0})[0]||null}
function txHashValid(h){return /^0x[a-fA-F0-9]{64}$/.test(String(h||''))}

function OnChainReader(opts){
 opts=opts||{};this.walletService=opts.walletService;this.getRpc=opts.getRpc||function(){return''};this.store=opts.store||null;this.log=opts.log||function(){};
}
OnChainReader.prototype.status=function(){
 var self=this,rpcState={};Object.keys(NETWORKS).forEach(function(n){rpcState[n]=!!String(self.getRpc(n)||'').trim()});
 return{ok:true,engine:'ONCHAIN_READER_V1',mode:'READ_ONLY',networks:Object.keys(NETWORKS),rpc:rpcState,history:{localLedger:true,externalIndexer:false,coverage:'IA_TB_RECORDED_TRANSACTIONS',complete:false}};
};
OnChainReader.prototype.identity=function(sess,walletId){
 var list=this.walletService.list(sess,false),wallet=list.filter(function(w){return String(w.id)===String(walletId||'')})[0];if(!wallet)throw new Error('WALLET_NOT_FOUND');
 return{ok:true,mode:'READ_ONLY',walletId:wallet.id,walletName:wallet.name,kind:wallet.kind,accounts:(wallet.accounts||[]).map(function(a){return{accountId:a.id,family:a.family,address:a.address||'',publicKey:a.publicKey||'',networks:(a.networks||[]).slice()};})};
};
OnChainReader.prototype.resolve=function(sess,walletId,network){
 network=String(network||'').toLowerCase();if(!NETWORKS[network])throw new Error('NETWORK_NOT_SUPPORTED');
 var list=this.walletService.list(sess,false),wallet=list.filter(function(w){return String(w.id)===String(walletId||'')})[0];if(!wallet)throw new Error('WALLET_NOT_FOUND');
 var account=accountFor(wallet,network);if(!account)throw new Error('WALLET_ACCOUNT_NOT_AVAILABLE');
 if(!validEvm(account.address))throw new Error('ADDRESS_INVALID');
 return{walletId:wallet.id,walletName:wallet.name,kind:wallet.kind,network:network,networkName:NETWORKS[network].name,chainId:NETWORKS[network].chainId,native:NETWORKS[network].native,accountId:account.id,family:account.family,address:account.address,publicKey:account.publicKey||'',networks:account.networks||[]};
};
OnChainReader.prototype.walletSnapshot=function(sess,input,cb){
 input=input||{};var self=this,ctx,endpoint;
 try{ctx=this.resolve(sess,input.walletId,input.network);endpoint=String(this.getRpc(ctx.network)||'').trim();if(!endpoint)throw new Error('RPC_NOT_CONFIGURED')}catch(e){return cb(e)}
 var out={ok:true,mode:'READ_ONLY',wallet:ctx,rpcConfigured:true,balanceNative:null,transactionCount:null,latestBlock:null};
 rpc(endpoint,'eth_getBalance',[ctx.address,'latest'],function(e,balance){if(e)return cb(e);out.balanceNative=decimal(balance,18,8);
  rpc(endpoint,'eth_getTransactionCount',[ctx.address,'latest'],function(e2,count){if(e2)return cb(e2);out.transactionCount=Number(bi(count));
   rpc(endpoint,'eth_blockNumber',[],function(e3,block){if(e3)return cb(e3);out.latestBlock=Number(bi(block));cb(null,out)});
  });
 });
};
OnChainReader.prototype.transaction=function(input,cb){
 input=input||{};var network=String(input.network||'').toLowerCase(),net=NETWORKS[network],hash=String(input.hash||'');if(!net)return cb(new Error('NETWORK_NOT_SUPPORTED'));if(!txHashValid(hash))return cb(new Error('TX_HASH_INVALID'));
 var endpoint=String(this.getRpc(network)||'').trim();if(!endpoint)return cb(new Error('RPC_NOT_CONFIGURED'));
 rpc(endpoint,'eth_getTransactionByHash',[hash],function(e,tx){if(e)return cb(e);if(!tx)return cb(new Error('TX_NOT_FOUND'));
  rpc(endpoint,'eth_getTransactionReceipt',[hash],function(e2,receipt){if(e2)return cb(e2);cb(null,{ok:true,mode:'READ_ONLY',network:network,transaction:tx,receipt:receipt||null,confirmed:!!(receipt&&receipt.blockNumber)})});
 });
};
OnChainReader.prototype.history=function(sess,input){
 input=input||{};var ctx=this.resolve(sess,input.walletId,input.network),limit=Math.max(1,Math.min(250,+input.limit||50)),address=String(ctx.address).toLowerCase(),rows=[],self=this;
 function pushTransfer(x,kind){
  if(!x)return;var s=String(x.sourceAddress||'').toLowerCase(),d=String(x.destinationAddress||'').toLowerCase();if(s!==address&&d!==address)return;
  if(String(x.network||x.sourceNetwork||'').toLowerCase()!==ctx.network&&String(x.destinationNetwork||'').toLowerCase()!==ctx.network)return;
  rows.push({timestamp:+x.timestamp||+x.updatedAt||0,type:kind,direction:d===address?'IN':'OUT',network:ctx.network,asset:x.symbol||x.sellSymbol||'',amount:x.amount||x.sellAmount||'',receivedAmount:x.buyAmount||'',sourceAddress:x.sourceAddress||'',destinationAddress:x.destinationAddress||'',txHash:x.txHash||x.originTxHash||'',status:x.status||x.lastStatus||'',provider:x.provider||'',source:'IA_TB_LEDGER'});
 }
 if(this.store){
  var th=this.store.get('bank_transfer','history',[]);if(Array.isArray(th))th.forEach(function(x){pushTransfer(x,'TRANSFER')});
  var sh=this.store.get('swap_bridge','history',[]);if(Array.isArray(sh))sh.forEach(function(x){pushTransfer(x,'SWAP_BRIDGE')});
 }
 rows.sort(function(a,b){return(b.timestamp||0)-(a.timestamp||0)});
 return{ok:true,mode:'READ_ONLY',wallet:ctx,items:rows.slice(0,limit),coverage:{localLedger:true,externalIndexer:false,complete:false,reason:'FULL_ADDRESS_HISTORY_REQUIRES_INDEXER',note:'Le RPC standard permet les lectures de solde/transaction par hash, mais pas une recherche efficace de tout l historique d une adresse.'}};
};
module.exports=OnChainReader;