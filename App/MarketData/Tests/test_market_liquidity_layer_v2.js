'use strict';
var path=require('path');
var ROOT=path.resolve(__dirname,'../..');
var CPClient=require('../../Core/Communication/cp1_client');
var cp=new CPClient({root:ROOT,routerPort:+(process.env.ROUTER_PORT||8021),timeout:5000,maxBytes:1024*1024});

function call(target,action){
 return new Promise(function(resolve,reject){
  cp.request(target,action,{},'summary',function(e,o){if(e)return reject(e);resolve(o||{});});
 });
}

Promise.all([
 call('marketdata','marketdata.financial.capabilities'),
 call('liquidity','liquidity.capabilities')
]).then(function(v){
 var m=v[0]||{},l=v[1]||{};
 if(!m.ok||m.aiAccess!=='READ_ONLY'||!Array.isArray(m.families))throw new Error('MARKET_CAPABILITIES_FAIL');
 if(!l.ok||l.aiAccess!=='READ_ONLY')throw new Error('LIQUIDITY_CAPABILITIES_FAIL');
 console.log('MARKET+LIQUIDITY DATA LAYER V2 PASS',m.schema,l.schema,'AI='+m.aiAccess);
}).catch(function(e){console.error(e&&e.stack||e);process.exit(1);});
