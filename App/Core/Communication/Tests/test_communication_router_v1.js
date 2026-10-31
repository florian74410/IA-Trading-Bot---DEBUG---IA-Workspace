'use strict';
var assert=require('assert'),fs=require('fs'),path=require('path'),Router=require('../communication_router_v1'),CP=require('../communication_protocol_v1');
var root=path.resolve(__dirname,'../../..');assert.ok(!fs.existsSync(path.join(root,'Parametres')));
var r=new Router(root);assert.ok(r.verifyToken(CP.ensureSecret(root)));assert.equal(r.registry.indicator.id,'indicator');
try{r.register({id:'evil',host:'127.0.0.1',port:9000,capabilities:['shell.exec']});assert.fail('unknown engine accepted');}catch(e){assert.equal(e.message,'CP_COMPONENT_NOT_REGISTERED_IN_PROTOCOL_REGISTRY');}
try{r.register({id:'indicator',host:'0.0.0.0',port:8012,capabilities:['indicator.analyze']});assert.fail('non local accepted');}catch(e){assert.equal(e.message,'CP_COMPONENT_HOST_FORBIDDEN');}
r.register({id:'indicator',host:'127.0.0.1',port:8012,capabilities:['indicator.analyze'],events:['indicator.analysis.updated']});var ev=CP.makeEvent('indicator','indicator.analysis.updated',{symbol:'BTCUSD',summary:{bias:'BULLISH'}},{schema:'indicator.event/1.0',severity:'NOTICE'});r.publishEvent(ev);var q=r.listEvents({since:0,source:'indicator'});assert.equal(q.count,1);assert.equal(q.events[0].data_hash,ev.data_hash);try{r.publishEvent(ev);assert.fail('replay accepted');}catch(e){assert.equal(e.message,'CP_REPLAY_DETECTED');}
console.log('Communication Router registry/security/events: OK');
