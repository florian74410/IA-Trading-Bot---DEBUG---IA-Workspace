"use strict";
const assert = require("assert");
const Budget = require("../Orchestrator/request_budget");

const budget = new Budget({mode:"NATIVE"});
budget.configure("TEST",{
  shortLimit:2,
  shortWindowMs:60000,
  longLimit:10,
  longWindowMs:60000
});

assert.strictEqual(typeof budget.admit,"function",
  "NATIVE requires an explicit admission method");

const request = {provider:"TEST",dataset:"TEST",cost:1};

const first = budget.admit(request);
assert.strictEqual(first.allowed,true);

const second = budget.admit(request);
assert.strictEqual(second.allowed,true);

const third = budget.admit(request);
assert.strictEqual(third.allowed,false);

const state = budget.status().providers.TEST;
assert.strictEqual(state.shortUsed,2,
  "Rejected requests must not consume quota");

console.log("PASS NATIVE budget admission: 2 admitted, 1 rejected");
