'use strict';
// Browser-selected destinations are restricted to operator-approved HTTPS origins.
// Credentials in a URL remain encrypted in the owner's Settings namespace.
const NETWORKS=['ethereum','arbitrum','polygon','bnb','base'];
const DEFAULT_ORIGINS=['https://ethereum-rpc.publicnode.com','https://arbitrum-one-rpc.publicnode.com','https://polygon-bor-rpc.publicnode.com','https://bsc-rpc.publicnode.com','https://base-rpc.publicnode.com'];
function validate(input,env=process.env){
 if(Object.keys(input).some(k=>!['password','openaiApiKey','xBearerToken','zeroxApiKey','iatbFeeRecipient','swapBridgeRpc'].includes(k)))throw Error('INVALID_REQUEST');
 const secrets={},settings={};for(const [field,key] of Object.entries({openaiApiKey:'OPENAI_API_KEY',xBearerToken:'X_BEARER_TOKEN',zeroxApiKey:'ZEROX_API_KEY'})){if(input[field]!==undefined){if(typeof input[field]!=='string'||input[field].length>8192)throw Error('INVALID_REQUEST');secrets[key]=input[field].trim();}}
 if(input.iatbFeeRecipient!==undefined){const fee=input.iatbFeeRecipient;if(typeof fee!=='string'||fee&&!/^0x[a-fA-F0-9]{40}$/.test(fee))throw Error('INVALID_REQUEST');settings.fee_recipient=fee;}
 if(input.swapBridgeRpc!==undefined){const rpc=input.swapBridgeRpc;if(!rpc||typeof rpc!=='object'||Array.isArray(rpc)||Object.keys(rpc).some(k=>!NETWORKS.includes(k)))throw Error('INVALID_REQUEST');const allowed=new Set(DEFAULT_ORIGINS.concat(String(env.IATB_AUTH_RPC_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)));
  for(const [network,value] of Object.entries(rpc)){if(typeof value!=='string'||value.length>2048)throw Error('INVALID_REQUEST');if(value){let url;try{url=new URL(value);}catch(_){throw Error('INVALID_REQUEST');}if(url.protocol!=='https:'||url.username||url.password||url.hash||!allowed.has(url.origin))throw Error('INVALID_REQUEST');}settings['rpc_'+network]=value;}
 }
 return {secrets,settings};
}
module.exports={validate,DEFAULT_ORIGINS};
