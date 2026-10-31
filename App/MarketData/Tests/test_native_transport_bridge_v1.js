"use strict";
const assert = require("assert");
const Bridge = require("../Orchestrator/transport_orchestrator_bridge");
const Orchestrator = require("../Orchestrator/api_request_orchestrator");

const native = new Orchestrator({mode:"NATIVE"});
native.configureProvider("TEST",{
 shortLimit:2,
 shortWindowMs:60000,
 longLimit:10,
 longWindowMs:60000
});

Bridge.set(native);

const request = {provider:"TEST",dataset:"CANDLES",cost:1};
assert.strictEqual(Bridge.admit(request).allowed,true);
assert.strictEqual(Bridge.admit(request).allowed,true);
assert.strictEqual(Bridge.admit(request).allowed,false);

const state = native.budget.status().providers.TEST;
assert.strictEqual(state.shortUsed,2);

Bridge.set(null);
assert.strictEqual(Bridge.admit(request).allowed,false);

const shadow = new Orchestrator({mode:"SHADOW"});
Bridge.set(shadow);
assert.strictEqual(Bridge.admit(request).allowed,false);

Bridge.set(null);
console.log("PASS NATIVE Bridge: admission, quota, fail-closed, SHADOW");
