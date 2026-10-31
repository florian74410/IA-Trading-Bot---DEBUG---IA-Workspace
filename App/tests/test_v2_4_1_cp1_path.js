'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
// Isolate CP secret/audit; no real user data or provider calls.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iatb241-cp1-'));process.env.IATB_DATA_ROOT=path.join(temp,'data');process.env.IATB_RUNTIME_ROOT=path.join(temp,'runtime');
const root=path.resolve(__dirname,'..'),PATHS=require('../Core/Shared/paths');PATHS.ensureAppRuntimeDirs();
const CP=require('../Core/Communication/communication_protocol_v1'),Router=require('../Core/Communication/communication_router_v1'),Adapter=require('../Core/Communication/component_cp1_adapter'),Client=require('../Supervisor/Core/cp1_client'),{CollectorData}=require('../Supervisor/Core/collector_data_v2_4_1');
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
test('Supervisor reads every declared collector product through real HTTP Router and signed CP/1 adapters',async t=>{
 const router=new Router(root),servers=[],calls=[];
 async function listen(fn){const s=http.createServer(fn);await new Promise(r=>s.listen(0,'127.0.0.1',r));servers.push(s);return s.address().port;}
 t.after(async()=>{await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));});
 const catalog=new CollectorData({},root).catalog();
 for(const target of ['marketdata','fundamental','liquidity']){
  const items=catalog.items.filter(x=>x.target===target),actions=items.map(x=>x.action),handlers=Object.fromEntries(actions.map(action=>[action,args=>{calls.push({target,action,args});return {ok:true,provider:'LOCAL_QA_FIXTURE',timestamp:1792584000000,received:args,value:0,apiKey:'NEVER_EXPOSE'};}]));
  const adapter=new Adapter({root,id:target,actions,handlers});const port=await listen((q,r)=>{if(!adapter.handle(q,r)){r.writeHead(404);r.end();}});router.register({id:target,host:'127.0.0.1',port,capabilities:actions,events:[]});
 }
 const port=await listen((q,r)=>{let raw='';q.on('data',x=>raw+=x);q.on('end',()=>{if(q.url!=='/communication/v1/request'||!router.verifyToken(q.headers['x-iatb-cp-token'])){r.writeHead(403);return r.end('{}');}router.route(JSON.parse(raw),(e,o)=>{r.writeHead(e?400:200,{'Content-Type':'application/json'});r.end(JSON.stringify(e?{error:e.message}:o));});});});
 const data=new CollectorData(new Client(root,port),root);
 for(const item of catalog.items){const args={};for(const key of item.arguments.required||[])args[key]=({symbol:'BTCUSD',timeframe:'1h',id:'fixture',network:'ethereum',term:'BTC',query:'BTC'})[key]||'fixture';const result=await data.read({target:item.target,action:item.action,arguments:args});assert.equal(result.action,item.action);assert.equal(result.data.value,0);assert.equal(result.data.apiKey,'[REDACTED]');assert.equal(result.data.provider,'LOCAL_QA_FIXTURE');}
 assert.equal(calls.length,catalog.items.length);const ctx=await data.collect({symbol:'BTCUSD'});assert.equal(ctx.degraded,false);assert.equal(Object.values(ctx.availability).filter(Boolean).length,11);
});
