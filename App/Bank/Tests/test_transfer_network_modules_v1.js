'use strict';
var assert=require('assert');
var Registry=require('../Core/transfer_asset_registry_v1');
var TransferService=require('../Core/transfer_service_v2');

function fakeWalletService(){
 return{
  list:function(){return[];},
  clientService:{resolveSession:function(){return{clientId:'TEST'};},accountByClientId:function(){return null;},verifyPassword:function(){return true;}},
  reveal:function(){throw new Error('TEST_SHOULD_NOT_SIGN');}
 };
}
function rejectPreview(service,payload,expected,done){
 service.preview({},payload,function(e){
  try{assert(e,'preview must be rejected');assert.strictEqual(e.message,expected);done();}catch(x){done(x);}
 });
}

assert.strictEqual(Registry.get('bitcoin').module,'BITCOIN');
assert.strictEqual(Registry.get('solana').module,'SOLANA');
assert.strictEqual(Registry.get('ethereum').module,'ERC20');
assert.strictEqual(Registry.assets('bitcoin')[0].symbol,'BTC');
assert.strictEqual(Registry.assets('solana')[0].symbol,'SOL');
assert.strictEqual(Registry.coinAllowed('bitcoin','bitcoin',''),true);
assert.strictEqual(Registry.coinAllowed('bitcoin','ethereum',''),false);
assert.strictEqual(Registry.coinAllowed('solana','solana',''),true);
assert.strictEqual(Registry.coinAllowed('solana','usd-coin',''),false);
assert.strictEqual(Registry.coinAllowed('ethereum','usd-coin','0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'),true);

var service=new TransferService({walletService:fakeWalletService(),getRpc:function(){return'';},log:function(){}});
var status=service.status();
assert.strictEqual(status.engine,'TRANSFER_V3_ROUTER');
assert.strictEqual(status.modules.BITCOIN.engine,'BITCOIN_TRANSFER_V1');
assert.strictEqual(status.modules.SOLANA.engine,'SOLANA_TRANSFER_V1');
assert.strictEqual(status.modules.ERC20.engine,'EVM_TRANSFER_V1');

rejectPreview(service,{sourceNetwork:'bitcoin',destinationNetwork:'bitcoin',coinId:'ethereum',asset:'BTC'},'ASSET_NOT_ALLOWED_ON_NETWORK',function(e){
 if(e)throw e;
 rejectPreview(service,{sourceNetwork:'solana',destinationNetwork:'solana',coinId:'usd-coin',asset:'SOL'},'ASSET_NOT_ALLOWED_ON_NETWORK',function(x){
  if(x)throw x;
  console.log('TRANSFER_NETWORK_MODULES_V1_OK');
 });
});
