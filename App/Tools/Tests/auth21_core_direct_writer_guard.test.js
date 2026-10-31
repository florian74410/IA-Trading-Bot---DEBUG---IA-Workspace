'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../Core/Server/server.js'),'utf8');
test('Core direct configuration and user/vault mutation paths check snapshot annex gate',()=>{
 for(const name of ['saveAISettings','writeUser','writeVault','setCfgValues']){
  const pattern='function '+name+'(';
  const start=source.indexOf(pattern);
  assert.ok(start>=0,'missing '+name);
  const body=source.slice(start,start+210);
  assert.ok(body.includes("AUTH21_LOCAL_WRITERS.gateFor('annex-root').assertWritable()"),'unguarded '+name);
 }
});
test('Core restart signaling prohibited on isolated backup runtime',()=>{
 const start=source.indexOf('function scheduleSupervisorRestart(');
 assert.ok(start>=0);
 assert.ok(source.slice(start,start+220).includes("AUTH21_UPDATES_READ_ONLY"));
});
