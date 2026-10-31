'use strict';
var assert=require('assert'),fs=require('fs'),path=require('path'),Registry=require('../protocol_registry_v2');
var ROOT=path.resolve(__dirname,'../../..'),r=new Registry(ROOT),ids=['indicator','trading','risk','portfolio','marketdata','liquidity','fundamental','strategy'];
ids.forEach(function(id){var x=r.get(id);assert(x,id+' missing');assert.equal(x.transport,'CP1',id+' must use CP1');assert(x.endpoint.port>0,id+' endpoint missing');assert(x.table.commands.length>0,id+' commands missing');x.table.commands.forEach(function(c){assert.equal(c.transport,'CP1',id+' command not CP1: '+c.name);});});
['firewall'].forEach(function(id){assert(r.get(id),id+' bridge missing');});
['supervisor'].forEach(function(id){var x=r.get(id);assert(x,id+' reserved missing');assert.equal(x.status,'RESERVED');});var strategy=r.get('strategy');assert.equal(strategy.status,'ACTIVE');assert.equal(strategy.endpoint.port,8018);
var adapter=fs.readFileSync(path.join(ROOT,'Core/Communication/component_cp1_adapter.js'),'utf8');assert(adapter.indexOf('CP_SIGNATURE_INVALID')>=0);assert(adapter.indexOf("'/communication/v1/register'")>=0);assert(adapter.indexOf('shell')>=0);
console.log('Router normalization v1.8.12: OK');
