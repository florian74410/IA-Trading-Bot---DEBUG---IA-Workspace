'use strict';
var assert=require('assert');
var Budget=require('../Orchestrator/request_budget');
var Passport=require('../Orchestrator/provider_passport_v1');

var b=new Budget({mode:'SHADOW'});
b.configure('UNKNOWN_TEST',{limitModel:'UNKNOWN',shortLimit:null,longLimit:null});
var first=b.observe({provider:'UNKNOWN_TEST',dataset:'ANY',cost:1});
assert.equal(first.enforcementPolicy,'OBSERVE_ONLY_NON_BLOCKING');
assert.equal(first.blockingEligible,false);
assert.equal(first.enforceable,false);
assert.equal(first.wouldAllow,true);

b.feedback('UNKNOWN_TEST',{rateLimited:true,retryAfterMs:60000,providerCooldownMs:60000,reason:'HTTP_429'});
var after429=b.observe({provider:'UNKNOWN_TEST',dataset:'ANY',cost:1});
assert.equal(after429.providerCooldown.active,true);
assert.equal(after429.blockingEligible,false);
assert.equal(after429.enforceable,false);
assert.equal(after429.wouldAllow,false,'429 cooldown should remain visible as an advisory signal');

b.configure('KNOWN_TEST',{limitModel:'RPM',shortWindowMs:60000,shortLimit:1,costDefault:1});
var known1=b.observe({provider:'KNOWN_TEST',dataset:'ANY',cost:1});
var known2=b.observe({provider:'KNOWN_TEST',dataset:'ANY',cost:1});
assert.equal(known1.blockingEligible,true);
assert.equal(known1.wouldAllow,true);
assert.equal(known2.blockingEligible,true);
assert.equal(known2.wouldAllow,false);

assert.equal(Passport.isBlockingEligible('DEFILLAMA'),false);
assert.equal(Passport.isBlockingEligible('GMX'),false);
assert.equal(Passport.isBlockingEligible('KRAKEN'),false);
assert.equal(Passport.isBlockingEligible('BINANCE'),true);
assert.equal(Passport.isBlockingEligible('HYPERLIQUID'),true);
assert.equal(Passport.isBlockingEligible('DEXSCREENER'),true);
assert.equal(Passport.isBlockingEligible('BYBIT'),true);

console.log('PASS UNKNOWN quota profiles are observe-only and non-blocking');
