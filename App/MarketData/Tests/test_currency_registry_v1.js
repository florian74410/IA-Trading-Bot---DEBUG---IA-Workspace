'use strict';

var assert=require('assert');
var Currency=require('../Registry/currency_registry_v1');

assert.deepEqual(Currency.fiatCodes(),['USD','EUR','GBP','JPY','CNY','CHF','CAD']);
assert.equal(Currency.snapshot().fiatCount,7);
assert.equal(Currency.snapshot().stableAssetCount,8);

assert.equal(Currency.resolve('USD').entityType,'FIAT');
assert.equal(Currency.resolve('USD').referenceFiat.code,'USD');

var usdt=Currency.resolve('USDT');
assert.equal(usdt.entityType,'STABLE_ASSET');
assert.equal(usdt.stableAsset.referenceFiat,'USD');
assert.equal(usdt.referenceFiat.code,'USD');
assert.equal(usdt.referenceFiat.monetaryArea,'United States');

var eurc=Currency.resolve('EURC');
assert.equal(eurc.referenceFiat.code,'EUR');
assert.equal(eurc.referenceFiat.monetaryArea,'Euro area');

assert.equal(Currency.resolve('TGBP').referenceFiat.code,'GBP');
assert.equal(Currency.resolve('ZCHF').referenceFiat.code,'CHF');
assert.equal(Currency.resolve('QCAD').referenceFiat.code,'CAD');
assert.equal(Currency.resolve('JPYC').referenceFiat.code,'JPY');
assert.equal(Currency.getStableAsset('TGBP').marketIds.COINGECKO,'tokenised-gbp');
assert.equal(Currency.getStableAsset('ZCHF').marketIds.COINGECKO,'frankencoin');
assert.equal(Currency.getStableAsset('QCAD').marketIds.COINGECKO,'stablecorp-qcad');
assert.equal(Currency.getStableAsset('JPYC').marketIds.COINGECKO,'jpy-coin');

assert.equal(Currency.resolve('UNKNOWN'),null);
assert.equal(Currency.validate().ok,true);

assert.throws(function(){
 Currency.registerStableAsset({symbol:'TEST',referenceFiat:'ZZZ'});
},/CURRENCY_REGISTRY_REFERENCE_FIAT_UNKNOWN/);

var chf=Currency.registerStableAsset({symbol:'TESTCHF',name:'Test CHF',referenceFiat:'CHF'});
assert.equal(chf.referenceFiat,'CHF');
assert.equal(Currency.resolve('TESTCHF').referenceFiat.code,'CHF');

assert.deepEqual(Currency.receipt('USDT',1000,'USDT',0.9998,999.8),{
 sourceAsset:'USDT',
 sourceAmount:1000,
 sourceUnit:'USDT',
 referenceFiat:'USD',
 entityType:'STABLE_ASSET',
 observedAssetPriceUsd:0.9998,
 normalizedUsd:999.8
});

console.log('PASS Currency Registry v1 unified fiat/stable-asset contract');
