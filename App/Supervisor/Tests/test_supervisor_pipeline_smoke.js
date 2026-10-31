'use strict';
/*
 IA-TB Supervisor pipeline smoke test (DEBUG / non-LIVE).
 Verifies: Router -> Supervisor -> context/analyze -> Risk Gate -> Firewall negative gate.
 It NEVER sends an approved order and never calls an exchange adapter.
 Node 16 compatible.
*/
var path=require('path'),http=require('http');
var ROOT=path.resolve(__dirname,'../..');
var CP=require('../../Core/Communication/communication_protocol_v1');
var Client=require('../Core/cp1_client');
var client=new Client(ROOT,+(process.env.ROUTER_PORT||8021));
var ROUTER_PORT=+(process.env.ROUTER_PORT||8021);
function ok(name,detail){console.log('[ OK ] '+name+(detail?' · '+detail:''));}
function fail(name,e){console.error('[FAIL] '+name+' · '+String(e&&e.message||e));process.exitCode=1;}
function cp(target,action,args,detail){return client.request(target,action,args||{},detail||'analysis',15000);}
function rawRouter(message){return new Promise(function(resolve,reject){var token=CP.ensureSecret(ROOT),b=Buffer.from(JSON.stringify(message)),q=http.request({host:'127.0.0.1',port:ROUTER_PORT,path:'/communication/v1/request',method:'POST',timeout:10000,headers:{'Content-Type':'application/json','Accept':'application/json','Content-Length':b.length,'X-IATB-CP-Token':token}},function(r){var a=[];r.on('data',function(c){a.push(c);});r.on('end',function(){var o;try{o=JSON.parse(Buffer.concat(a).toString('utf8')||'{}');}catch(e){return reject(e);}resolve({code:r.statusCode,body:o});});});q.on('timeout',function(){q.destroy(new Error('TIMEOUT'));});q.on('error',reject);q.end(b);});}
(async function(){
 console.log('IA-TB Supervisor pipeline smoke test · NO LIVE / NO APPROVED ORDER');
 try{var h=await cp('supervisor','supervisor.health',{},'analysis');if(!h||h.execution!=='INTENTION_ONLY')throw new Error('SUPERVISOR_EXECUTION_INVARIANT');ok('Supervisor via Router','INTENTION_ONLY');}catch(e){fail('Supervisor via Router',e);return;}
 try{var c=await cp('supervisor','supervisor.context',{symbol:'BTCUSD',timeframe:'1h',limit:50,fundamentalLimit:10},'analysis');if(!c||c.transport!=='CP/1 Router only')throw new Error('CONTEXT_TRANSPORT_INVALID');ok('Context orchestration',c.degraded?'DEGRADED (reported)':'all sources available');if(c.warnings&&c.warnings.length)console.log('       warnings: '+c.warnings.join(' | '));}catch(e){fail('Context orchestration',e);}
 try{var a=await cp('supervisor','supervisor.analyze',{symbol:'BTCUSD',timeframe:'1h',limit:50,fundamentalLimit:10,prompt:'Smoke test: summarize the supplied context only. Do not execute a trade.'},'analysis');if(!a||a.execution!=='NONE')throw new Error('ANALYZE_EXECUTION_INVARIANT');ok('Supervisor analysis','execution=NONE');}catch(e){fail('Supervisor analysis',e);}
 var intent={schema:'cp1.trade-intent/1.0',source:'supervisor.autonomous-trading',mode:'PAPER',exchange:'KRAKEN',market_type:'SPOT',symbol:'BTCUSD',action:'BUY',orderType:'MARKET',size:0.00001,leverage:1,confidence:0.5,createdAt:new Date().toISOString(),metadata:{smokeTest:true}};
 try{var r=await cp('supervisor','supervisor.risk.evaluate',{intent:intent},'execution');if(!r||r.decision!=='APPROVED'||!r.risk_approval_id)throw new Error('RISK_GATE_NOT_APPROVED:'+JSON.stringify(r));ok('Risk Gate','PAPER intent approved (not executed)');}catch(e){fail('Risk Gate',e);}
 try{var m=CP.makeRequest('trading','trading.execute',{exchange:'KRAKEN',symbol:'BTCUSD',side:'BUY',quantity:0.00001,order_type:'MARKET',metadata:{smokeTest:true}},'execution');var n=await rawRouter(m),s=JSON.stringify(n.body);if(n.code<400&&!/PROTECTION|ERROR|REJECT/i.test(s))throw new Error('FIREWALL_NEGATIVE_TEST_UNEXPECTED_PASS');if(!/RISK_APPROVAL_REQUIRED|PROTECTION|REJECT|ERROR/i.test(s))throw new Error('EXPECTED_RISK_REJECTION_NOT_FOUND:'+s);ok('Firewall negative gate','order without approval rejected');}catch(e){fail('Firewall negative gate',e);}
 if(!process.exitCode)console.log('\nPASS · Supervisor -> Router -> context/analyze -> Risk Gate -> Firewall protection verified. No approved order was sent.');
})().catch(function(e){fail('Smoke test',e);});
