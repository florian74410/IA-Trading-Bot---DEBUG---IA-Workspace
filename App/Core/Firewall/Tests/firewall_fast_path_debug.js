'use strict';
var path=require('path'),CPClient=require('../../Communication/cp1_client'),DataFirewall=require('../Protection/market_data_firewall');
var fail=0,ROOT=path.resolve(__dirname,'../../..'),cp=new CPClient({root:ROOT,routerPort:+(process.env.ROUTER_PORT||8021),timeout:1800,maxBytes:512*1024});
function ok(v,m){console.log((v?'[OK] ':'[FAIL] ')+m);if(!v)fail++;}
var fw=new DataFirewall({enabled:true,mode:'PROTECTION',providerWhitelist:['KRAKEN_PUBLIC_REFERENCE'],typeWhitelist:['OHLCV'],duplicateWindowMs:5000});
var now=Date.now(),msg={provider:'KRAKEN_PUBLIC_REFERENCE',source:'KRAKEN_PUBLIC_REFERENCE',provenance:'KRAKEN_PUBLIC_REFERENCE',type:'OHLCV',symbol:'BTC/USD',timeframe:'1m',timestamp:now,data:[[now-60000,100,102,99,101,12],[now,101,103,100,102,10]]};
var a=fw.inspect(msg,{payloadBytes:512});ok(a.decision==='PASS','valid MarketData passes');
var stale=Object.assign({},msg,{timestamp:now-120000});var b=fw.inspect(stale,{payloadBytes:512});ok(b.decision==='REJECT','stale MarketData rejected');
var bad=Object.assign({},msg,{provider:'UNTRUSTED'});var c0=fw.inspect(bad,{payloadBytes:512});ok(c0.decision==='REJECT','unknown provider rejected');
function runtime(){
 cp.request('firewall','firewall.events',{audience:'user',limit:5},'summary',function(e,o){
  if(e){console.log('[INFO] Runtime unavailable: CP/1 Firewall event feed skipped');return done();}
  ok(o&&o.readOnly===true,'Firewall user feed is read-only through CP/1');
  ok(Array.isArray(o&&o.events),'Firewall CP/1 event feed returns an event array');
  done();
 });
}
function done(){console.log('\nFirewall Fast Path DEBUG: '+(fail?'FAIL':'PASS')+' ('+fail+' error(s))');process.exitCode=fail?1:0;}
runtime();
