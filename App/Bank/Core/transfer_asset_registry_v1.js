'use strict';

var NETWORKS={
 bitcoin:{id:'bitcoin',name:'Bitcoin',family:'BITCOIN',module:'BITCOIN',nativeSymbol:'BTC',nativeCoinId:'bitcoin',decimals:8,chainId:null},
 ethereum:{id:'ethereum',name:'Ethereum',family:'EVM',module:'ERC20',nativeSymbol:'ETH',nativeCoinId:'ethereum',decimals:18,chainId:1},
 arbitrum:{id:'arbitrum',name:'Arbitrum',family:'EVM',module:'ERC20',nativeSymbol:'ETH',nativeCoinId:'ethereum',decimals:18,chainId:42161},
 polygon:{id:'polygon',name:'Polygon',family:'EVM',module:'ERC20',nativeSymbol:'POL',nativeCoinId:'polygon-ecosystem-token',decimals:18,chainId:137},
 bnb:{id:'bnb',name:'BNB Chain',family:'EVM',module:'ERC20',nativeSymbol:'BNB',nativeCoinId:'binancecoin',decimals:18,chainId:56},
 base:{id:'base',name:'Base',family:'EVM',module:'ERC20',nativeSymbol:'ETH',nativeCoinId:'ethereum',decimals:18,chainId:8453},
 solana:{id:'solana',name:'Solana',family:'SOLANA',module:'SOLANA',nativeSymbol:'SOL',nativeCoinId:'solana',decimals:9,chainId:null}
};

function get(network){return NETWORKS[String(network||'').trim().toLowerCase()]||null;}
function list(){return Object.keys(NETWORKS).map(function(k){return Object.assign({},NETWORKS[k]);});}
function assets(network){
 var n=get(network);if(!n)return[];
 if(n.family==='EVM')return[
  {id:n.nativeCoinId,symbol:n.nativeSymbol,type:'NATIVE',network:n.id,transferable:true,dynamic:false,decimals:n.decimals},
  {id:'erc20-resolved',symbol:'ERC20',type:'ERC20',network:n.id,transferable:true,dynamic:true,resolver:'COINGECKO_PLATFORM_CONTRACT'}
 ];
 if(n.family==='BITCOIN')return[{id:'bitcoin',symbol:'BTC',type:'NATIVE',network:'bitcoin',transferable:true,dynamic:false,decimals:8}];
 if(n.family==='SOLANA')return[{id:'solana',symbol:'SOL',type:'NATIVE',network:'solana',transferable:true,dynamic:false,decimals:9}];
 return[];
}
function coinAllowed(network,coinId,tokenAddress){
 var n=get(network),id=String(coinId||'').trim();if(!n)return false;
 if(id===n.nativeCoinId)return true;
 if(n.family==='EVM')return /^0x[a-fA-F0-9]{40}$/.test(String(tokenAddress||''));
 return false;
}
function publicConfig(network){
 if(network){var n=get(network);return n?{network:Object.assign({},n),assets:assets(n.id)}:null;}
 return{networks:list().map(function(n){return{network:n,assets:assets(n.id)}})};
}
module.exports={NETWORKS:NETWORKS,get:get,list:list,assets:assets,coinAllowed:coinAllowed,publicConfig:publicConfig};
