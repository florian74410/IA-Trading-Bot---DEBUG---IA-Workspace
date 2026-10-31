'use strict';
var assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
var Router=require('../communication_router_v1');
var tmp=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-router-test-'));
try{
  var r=new Router(tmp);
  var caps=r.capabilities();
  var chart=caps.components.filter(function(x){return x.id==='chart_viewer';})[0];
  assert(chart&&chart.capabilities.indexOf('chart.add_indicator')>=0);
  var a=r.planClientAction('chart.add_indicator',{indicator:'ichimoku'});
  assert.strictEqual(a.status,'PENDING_ACK');
  var ack=r.ackClientAction({action_id:a.action_id,status:'SUCCESS',message:'Ichimoku affiche.',data:{indicator:'ichimoku'}});
  assert.strictEqual(ack.status,'SUCCESS');
  assert.throws(function(){r.planClientAction('chart.add_indicator',{});},/CP_INDICATOR_REQUIRED/);
  assert.throws(function(){r.planClientAction('chart.set_timeframe',{timeframe:'99h'});},/CP_TIMEFRAME_INVALID/);
  console.log('test_client_action_ack_v1: OK');
} finally {try{fs.rmSync(tmp,{recursive:true,force:true});}catch(e){}}
