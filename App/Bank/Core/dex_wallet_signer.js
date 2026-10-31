'use strict';
const {Wallet,utils}=require('ethers');
const CHAINS=Object.freeze({arbitrum:42161,avalanche:43114});
function typedDigest(typed){
 if(!typed||!typed.domain||!typed.types||!typed.message||typeof typed.message!=='object')throw Error('DEX_TYPED_DATA_INVALID');
 const types={...typed.types};delete types.EIP712Domain;
 if(typed.primaryType&&utils._TypedDataEncoder.getPrimaryType(types)!==typed.primaryType)throw Error('DEX_PRIMARY_TYPE_INVALID');
 return utils._TypedDataEncoder.hash(typed.domain,types,typed.message);
}
// Signs only an exact owner-approved digest. No broadcast, generic eth_sign,
// key export, unlimited delegated signer or approval inferred from a connection.
async function signTypedData({walletService,session,account,typedData,approvedDigest,authorize}){
 const typed=JSON.parse(JSON.stringify(typedData)),digest=typedDigest(typed);
 if(typeof authorize!=='function'||await authorize()!==true)throw Error('DEX_SIGNATURE_UNAUTHORIZED');
 if(digest!==approvedDigest||Number(typed.domain.chainId)!==CHAINS[account.chain]||
    !Array.isArray(account.contracts)||!account.contracts.some(a=>a.toLowerCase()===String(typed.domain.verifyingContract||'').toLowerCase()))throw Error('DEX_SIGNATURE_SCOPE_MISMATCH');
 const wallets=walletService.list(session,false),wallet=wallets.find(w=>w.id===account.walletRef);
 const wa=wallet?.accounts?.find(a=>a.id===account.walletAccountId&&a.family==='EVM'&&a.networks?.includes(account.chain)&&a.hasSecret===true);
 if(!wa||String(wa.address).toLowerCase()!==account.address.toLowerCase())throw Error('DEX_WALLET_UNAVAILABLE');
 let secret,signer;
 try{
  secret=walletService.reveal(session,account.walletRef,account.walletAccountId);
  signer=new Wallet(secret.privateKey);
  if(signer.address.toLowerCase()!==account.address.toLowerCase())throw Error('DEX_SIGNER_ADDRESS_MISMATCH');
  if(await authorize()!==true)throw Error('DEX_SIGNATURE_REVOKED');
  const types={...typed.types};delete types.EIP712Domain;
  const signature=await signer._signTypedData(typed.domain,types,typed.message);
  if(await authorize()!==true)throw Error('DEX_SIGNATURE_REVOKED');
  return {signature,digest,address:signer.address,chainId:CHAINS[account.chain]};
 }finally{if(secret){secret.privateKey='';secret.recovery='';}secret=null;signer=null;}
}
module.exports={signTypedData,typedDigest,CHAINS};
