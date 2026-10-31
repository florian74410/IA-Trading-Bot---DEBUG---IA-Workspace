'use strict';
var assert=require('assert'),path=require('path'),fs=require('fs'),os=require('os');
var ExtensionManager=require('../Core/extension_manager'),LLMManager=require('../LLM/llm_manager');
(async function(){
 var root=path.resolve(__dirname,'../..'),em=new ExtensionManager(root),xs=em.snapshot();
 assert(xs.some(function(x){return x.id==='autonomous-trading';}),'AutonomousTrading extension missing');
 var llm=new LLMManager({provider:'MOCK',mock:{response:'SUPERVISOR_OK'}});
 var r=await llm.reason({prompt:'health'});assert.equal(r.text,'SUPERVISOR_OK');
 var orch=fs.readFileSync(path.join(root,'Supervisor','Core','context_orchestrator.js'),'utf8');
 ['marketdata','indicator','fundamental','liquidity','portfolio','strategy','risk'].forEach(function(id){assert(orch.indexOf("'"+id+"'")>=0,'Missing context source '+id);});
 assert(!/http\.request|http\.get|:801[234589]|:8020/.test(orch),'Context orchestrator must use CP1 client, not direct engine HTTP');
 var svc=fs.readFileSync(path.join(root,'Supervisor','supervisor_service.js'),'utf8');
 assert(!/services\/trading-engine\/adapters|Exchanges\/Adapters/.test(svc),'Supervisor must not import exchange adapters');
 assert(/execution:'INTENTION_ONLY'/.test(svc),'Supervisor execution lock missing');
 console.log('Supervisor architecture tests: OK');
})().catch(function(e){console.error(e);process.exit(1);});