'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const Quality=require('../Financial/financial_quality_v2');

test('extreme raw CoinGecko volume is not reliable',function(){
 assert.equal(Quality.validGlobalVolume(1.0117619345935505e21,2777324221776.975),false);
 assert.equal(Quality.validGlobalVolume(125e9,2.8e12),true);
 assert.equal(Quality.validGlobalVolume(32630715883604.51,2784798984952.207),true);
 assert.equal(Quality.validGlobalVolume(null,2.8e12),false);
 assert.equal(Quality.validGlobalVolume(1e9,null),false);
});
test('null global volume keeps valid market cap/dominance admissible',function(){
 const s={cefi:{provider:'COINGECKO',observedAt:Date.now(),global:{marketCapUsd:2.8e12,totalVolume24hUsd:null,btcDominancePct:55}}};
 assert.equal(Quality.inspect(s).ok,true);
});
