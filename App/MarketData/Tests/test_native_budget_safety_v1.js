"use strict";
const assert=require("assert");
const Budget=require("../Orchestrator/request_budget");

const budget=new Budget({mode:"NATIVE"});

const unknown=budget.admit({
 provider:"UNKNOWN_PROVIDER",
 dataset:"TEST",
 cost:1
});
assert.strictEqual(unknown.allowed,false,
 "Un provider inconnu doit etre refuse en NATIVE");

budget.configure("TEST",{
 shortLimit:10,
 shortWindowMs:60000,
 longLimit:100,
 longWindowMs:60000
});

const invalid=budget.admit({
 provider:"TEST",
 dataset:"TEST",
 cost:-1
});
assert.strictEqual(invalid.allowed,false,
 "Un cout invalide doit etre refuse");

const valid=budget.admit({
 provider:"TEST",
 dataset:"TEST",
 cost:1
});
assert.strictEqual(valid.allowed,true,
 "Une requete valide doit etre autorisee");

assert.strictEqual(
 budget.status().providers.TEST.shortUsed,1,
 "Seule la requete valide doit consommer le quota"
);

console.log("PASS NATIVE budget safety: unknown, invalid cost, valid");
