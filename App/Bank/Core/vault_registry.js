'use strict';
var fs=require('fs'),path=require('path'),crypto=require('crypto'),PATHS=require('../../Core/Shared/paths');
var DIR=path.join(PATHS.PersistentData.root,'Bank'),FILE=path.join(DIR,'vault_registry.json');
var NETWORKS={
 ARBITRUM:{family:'EVM',chainId:42161,gmx:true,assets:['USDC','USDT','ETH','WBTC']},
 AVALANCHE:{family:'EVM',chainId:43114,gmx:true,assets:['USDC','USDT','AVAX','WBTC']},
 ETHEREUM:{family:'EVM',chainId:1,gmx:false,assets:['USDC','USDT','ETH','WBTC']},
 POLYGON:{family:'EVM',chainId:137,gmx:false,assets:['USDC','USDT','POL','WBTC']},
 BITCOIN:{family:'BITCOIN',chainId:null,gmx:false,assets:['BTC']}
};
function ensure(){if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1')return;fs.mkdirSync(DIR,{recursive:true});if(!fs.existsSync(FILE))fs.writeFileSync(FILE,JSON.stringify({version:1,vaults:[]},null,2),'utf8');}
function read(){ensure();try{var x=JSON.parse(fs.readFileSync(FILE,'utf8'));if(!x||!Array.isArray(x.vaults))throw new Error('BANK_REGISTRY_INVALID');return x;}catch(e){return{version:1,vaults:[]};}}
function write(x){if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1')throw Error('AUTH21_VAULT_DISABLED_DURING_SNAPSHOT_TRIAL');ensure();var tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(x,null,2),'utf8');fs.renameSync(tmp,FILE);}
function cleanName(v){v=String(v||'').trim();if(v.length<2||v.length>64)throw new Error('VAULT_NAME_INVALID');return v;}
function create(input){if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1')throw Error('AUTH21_VAULT_DISABLED_DURING_SNAPSHOT_TRIAL');require('./feature_policy_v2_4_1').assertEnabled('vaults');input=input||{};var network=String(input.network||'').toUpperCase(),n=NETWORKS[network];if(!n)throw new Error('VAULT_NETWORK_UNSUPPORTED');var asset=String(input.asset||'').toUpperCase();if(n.assets.indexOf(asset)<0)throw new Error('VAULT_ASSET_UNSUPPORTED');var settlementHour=Math.max(0,Math.min(23,Math.floor(+input.settlementHour||0))),windowMinutes=Math.max(15,Math.min(180,Math.floor(+input.settlementWindowMinutes||60)));var now=new Date().toISOString(),id='vault_'+crypto.randomBytes(8).toString('hex');var v={id:id,name:cleanName(input.name),network:network,family:n.family,chainId:n.chainId,asset:asset,gmxCompatible:n.gmx,status:'DRAFT',contractAddress:null,strategy:{id:String(input.strategyId||'').trim().slice(0,96)||null},fees:{managementBps:Math.max(0,Math.min(10000,Math.floor(+input.managementBps||0))),performanceBps:Math.max(0,Math.min(10000,Math.floor(+input.performanceBps||0)))},settlement:{everyHours:24,hourUTC:settlementHour,windowMinutes:windowMinutes},walletPolicy:{strategyWallet:'EPHEMERAL',privateKeyExposure:'ADMIN_EXPLICIT_ONLY',deleteOnlyAfterFundsRecovered:true,rotateOnStrategyEnd:true},accounting:{model:'SHARES',nav:null,totalShares:null,availableLiquidity:null,allocatedCapital:null},createdAt:now,updatedAt:now};var db=read();db.vaults.push(v);write(db);return v;}
function list(){return read().vaults;}
function publicList(){return list().map(function(v){return{id:v.id,name:v.name,network:v.network,family:v.family,chainId:v.chainId,asset:v.asset,gmxCompatible:v.gmxCompatible,status:v.status,contractAddress:v.contractAddress,strategy:v.strategy,fees:v.fees,settlement:v.settlement,accounting:v.accounting,createdAt:v.createdAt,updatedAt:v.updatedAt};});}
module.exports={NETWORKS:NETWORKS,list:list,publicList:publicList,create:create};
