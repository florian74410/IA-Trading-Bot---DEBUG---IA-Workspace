'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{validate}=require('../../Core/Clients/UserManagement/settings_policy');
test('personal API settings accept only explicit HTTPS RPC origins and never browser identity',()=>{
 const input={password:'fictional',openaiApiKey:'fixture',iatbFeeRecipient:'',swapBridgeRpc:{ethereum:'https://ethereum-rpc.publicnode.com/private-key'}};
 assert.equal(validate(input,{}).secrets.OPENAI_API_KEY,'fixture');
 for(const url of ['http://ethereum-rpc.publicnode.com','https://localhost','https://127.0.0.1','https://169.254.169.254','https://ethereum-rpc.publicnode.com.evil.test','https://user:pass@ethereum-rpc.publicnode.com','https://ethereum-rpc.publicnode.com/#fragment'])assert.throws(()=>validate({...input,swapBridgeRpc:{ethereum:url}},{}),/INVALID_REQUEST/);
 assert.throws(()=>validate({...input,clientId:'CLVictim'},{}),/INVALID_REQUEST/);
 assert.throws(()=>validate({...input,swapBridgeRpc:[]},{}),/INVALID_REQUEST/);
 assert.equal(validate({...input,swapBridgeRpc:{base:'https://operator-approved.example/rpc'}},{IATB_AUTH_RPC_ORIGINS:'https://operator-approved.example'}).settings.rpc_base,'https://operator-approved.example/rpc');
});

test('authenticated Swap Bridge never falls back to an operator RPC credential',()=>{
 const Swap=require('../../Bank/Core/swap_bridge_service_v2'),saved={mode:process.env.IATB_AUTH_MODE,rpc:process.env.IATB_RPC_ETHEREUM};try{process.env.IATB_RPC_ETHEREUM='https://operator.example/PRIVATE';const service=new Swap({getRpc:()=>''});process.env.IATB_AUTH_MODE='authenticated';assert.equal(service._rpc('ethereum'),'');process.env.IATB_AUTH_MODE='';assert.equal(service._rpc('ethereum'),process.env.IATB_RPC_ETHEREUM);}finally{for(const [key,value] of [['IATB_AUTH_MODE',saved.mode],['IATB_RPC_ETHEREUM',saved.rpc]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
