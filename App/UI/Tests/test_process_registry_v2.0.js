'use strict';
var fs=require('fs'),path=require('path'),assert=require('assert');
var ROOT=path.resolve(__dirname,'../..'),DIR=path.join(ROOT,'Core/ProcessRegistry/manifests');
var expected={core:8001,ui:8000,router:8021,firewall:8017,indicator:8012,marketdata:8013,liquidity:8014,fundamental:8015,trading:8016,strategy:8018,risk:8019,portfolio:8020,supervisor:3000};
var files=fs.readdirSync(DIR).filter(function(n){return /\.json$/.test(n);}),rows=files.map(function(n){return JSON.parse(fs.readFileSync(path.join(DIR,n),'utf8'));});
assert.equal(rows.length,Object.keys(expected).length,'unexpected Process Registry manifest count');
var ids={};rows.forEach(function(x){assert(expected[x.id]!==undefined,'unexpected service id '+x.id);assert.equal(x.port,expected[x.id],'wrong port for '+x.id);assert(!ids[x.id],'duplicate service id '+x.id);ids[x.id]=1;});
Object.keys(expected).forEach(function(id){assert(ids[id],'missing service '+id);});
rows.forEach(function(x){
 (x.dependencies||[]).concat(x.optionalDependencies||[]).forEach(function(d){assert(ids[d],'unknown dependency '+x.id+' -> '+d);assert.notEqual(d,'indicators','plural Indicator dependency is obsolete');});
 var env=x.env||{};assert(!env.KRAKEN_ADDON_PORT,x.id+' still exports Kraken bridge port');assert(!env.IATB_TRADING_FIREWALL_PORT,x.id+' still exports legacy Firewall alias');
 if(x.id!=='marketdata')assert(!env.IATB_MARKET_DATA_PORT,x.id+' still depends on direct Market Data port');
 if(x.id!=='ui')assert(!env.CORE_PUBLIC_PORT,x.id+' still depends on direct Core public port');
});
console.log('[PROCESS-REGISTRY] OK v2.0');
