'use strict';
// Executed inside the isolated network namespace, never against a VPS URL.
const https=require('node:https'),http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict');
const origin='https://localhost:8000',password='FICTIONAL_Docker_Qualification_2026!',ca=fs.readFileSync(process.env.IATB_AUTH_TLS_CERT);
function request(port,route,{method='GET',body=null,headers={},tls=false}={}){return new Promise((resolve,reject)=>{const raw=body===null?'':JSON.stringify(body),q=(tls?https:http).request({host:'127.0.0.1',port,servername:'localhost',ca,path:route,method,timeout:3000,headers:{Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),...headers}},r=>{let text='';r.on('data',b=>text+=b);r.on('end',()=>{let data;try{data=JSON.parse(text);}catch(_){}resolve({status:r.statusCode,data,text,cookie:r.headers['set-cookie']?.[0]});});});q.on('error',reject);q.on('timeout',()=>q.destroy(Error('TIMEOUT')));q.end(raw);});}
const api=(route,options)=>request(8000,route,{...options,tls:true});
async function main(){
 for(const port of [8001,8021,8017,8013,8012,8014,8018,8019,8020,3000,8015]){let ok=false;for(let i=0;i<90;i++){try{const r=await request(port,port===8001?'/api/health':port===8021?'/router-health-internal':'/health',{tls:port===8001});if(r.status===200){ok=true;break;}}catch(_){}await new Promise(r=>setTimeout(r,500));}assert(ok,'SERVICE_HEALTH_FAILED_'+port);}
 assert.equal((await api('/api/health')).data.version,require('../../Core/Shared/build_info').version);
 assert(fs.statSync(require('node:path').join(process.env.IATB_RUNTIME_ROOT,'ssh-ui.sock')).isSocket());assert.equal((await api('/api/settings')).status,401);
 async function login(name){const r=await api('/auth21/login',{method:'POST',body:{email:name+'@example.invalid',password}});assert.equal(r.status,200);return {Cookie:r.cookie.split(';')[0],'X-IATB-CSRF':r.data.csrfToken};}
 const a=await login('alice'),b=await login('bobby');
 for(const route of ['/ia-trading','/chart-viewer','/strategy','/portfolio','/bank','/bank/keys','/fundamental','/statistiques','/settings']){const page=await api(route,{headers:a});assert.equal(page.status,200,'AUTH_PAGE_'+route);assert(page.text.includes('alice@example.invalid'));assert(!page.text.includes('bobby@example.invalid'));}
 const admin=await login('admin'),status=await api('/api/admin/status',{headers:admin});assert.equal(status.status,200);assert(status.data.services.find(s=>s.id==='ui').online,'UI_PINNED_TLS_PROBE');
 const CP=require('../../Core/Communication/communication_protocol_v1'),crypto=require('node:crypto'),machineBody={thread:'data'},machineToken=CP.ensureSecret(''),machineHeaders={'X-IATB-CP-Token':machineToken,'X-IATB-CP-Signature':crypto.createHmac('sha256',machineToken).update(JSON.stringify(machineBody)).digest('hex')};
 assert.equal((await request(8017,'/api/thread/stop',{method:'POST',body:machineBody,headers:machineHeaders})).data.error,'ADMIN_CAPABILITY_REQUIRED');
 for(const op of ['stop','restart']){const control=await api('/api/admin/firewall/thread/'+op,{method:'POST',body:{service:'data',password,confirmed:true},headers:admin});assert.equal(control.status,200,'ADMIN_FIREWALL_'+op+':'+JSON.stringify(control.data));}

 if(process.argv[2]==='restart'){assert((await api('/api/mosaics',{headers:a})).data.items.some(x=>x.moduleId==='moz:alice-only'));assert((await api('/auth21/sessions',{headers:b})).data.items.length>=2);}
 assert.equal((await api('/api/settings/language',{method:'POST',body:{language:'en'},headers:a})).status,200);assert.equal((await api('/api/settings',{headers:b})).data.language,'fr');
 assert.equal((await api('/api/mosaics/create',{method:'POST',body:{definition:{id:'alice-only',title:'Alice',items:[{source:'literal.text',value:'ALICE_ONLY'}]}},headers:a})).status,200);assert.equal((await api('/api/mosaics',{headers:b})).data.items.length,0);
 const cp=(target,action,args,headers,extra={})=>api('/communication/v1/ui/read',{method:'POST',body:{target,action,arguments:args,...extra},headers});
 console.log('AUTH21_QA_STAGE operator-controls');
 assert.equal((await cp('marketdata','marketdata.settings.get',{},a)).status,403);assert.equal((await cp('marketdata','marketdata.settings.get',{},admin)).status,200);
 const operatorPatch={settings:{defaultSource:'BINANCE',microstructure:{liquidationStreams:{enabled:false}}}};assert.equal((await cp('marketdata','marketdata.settings.set',operatorPatch,admin)).status,428);assert.equal((await cp('marketdata','marketdata.settings.set',operatorPatch,admin,{password:'wrong',confirmed:true})).status,401);const operatorWrite=await cp('marketdata','marketdata.settings.set',operatorPatch,admin,{password,confirmed:true});assert.equal(operatorWrite.status,200,JSON.stringify(operatorWrite.data));assert.equal(operatorWrite.data.data.settings.defaultSource,'BINANCE');assert.equal((await cp('fundamental','fundamental.logs.recent',{},a)).status,403);assert.equal((await cp('fundamental','fundamental.logs.recent',{},admin)).status,200);
 console.log('AUTH21_QA_STAGE marketdata');
 const symbols=await cp('marketdata','marketdata.symbols',{source:'BINANCE'},a);assert.equal(symbols.status,200,'MARKETDATA_SYMBOLS '+JSON.stringify(symbols.data));assert(symbols.data.data.symbols.some(x=>x.symbol==='BTCUSDT'));
 const candles=await api('/ui-data/market/candles?exchange=BINANCE&symbol=BTCUSDT&interval=1m&limit=120',{headers:a});assert.equal(candles.status,200,'MARKETDATA_CANDLES '+JSON.stringify(candles.data));assert.equal(candles.data.candles.length,120);assert(['PASS','WARN'].includes(candles.data.firewall.decision));
 console.log('AUTH21_QA_STAGE indicator');
 const ownSource='indicator qa_private \"Fictional Alice\"\ninput price = close\nparam period = 14 min=2 max=200\nuse base = ema(source=close,period=$param.period).value\noutput value = base';assert.equal((await cp('indicator','indicator.language.create',{source:ownSource,overwrite:true},a)).status,200);
 const indicator=await cp('indicator','indicator.compute_batch_data',{symbol:'BTCUSDT',timeframe:'1m',candles:candles.data.candles,requests:[{id:'rsi'},{id:'macd'},{id:'qa_private'}]},a);assert.equal(indicator.status,200,JSON.stringify(indicator.data));assert(indicator.data.data.results.every(x=>x.ok));
 const otherIndicator=await cp('indicator','indicator.compute_batch_data',{symbol:'BTCUSDT',timeframe:'1m',candles:candles.data.candles,requests:[{id:'qa_private'}]},b);assert.equal(otherIndicator.data.data.results[0].ok,false);
 console.log('AUTH21_QA_STAGE strategy');
 const strategy={schema_version:1,name:'QA RSI Owner',version:'1.0',symbol:'BTCUSDT',timeframe:'1m',entry:{side:'BUY',conditions:[{indicator:'RSI',operator:'>=',value:0}]},risk:{leverage:1,max_position_usdt:10,stop_loss_percent:1,take_profit_percent:2}};assert.equal((await cp('strategy','strategy.definition.save',{strategy},a)).status,200);assert.equal((await cp('strategy','strategy.catalog',{},b)).data.data.catalog.count,0);
 const value=indicator.data.data.results.find(x=>x.result.id==='rsi').result.latest.value;assert(Number.isFinite(value));const evaluation=await cp('strategy','strategy.evaluate',{symbol:'BTCUSDT',timeframe:'1m',indicators:{RSI:value}},a);assert.equal(evaluation.status,200);assert.equal(evaluation.data.data.selected,1);assert.equal(evaluation.data.data.execution,'INTENTION_ONLY');assert.equal((await cp('strategy','strategy.stats',{},b)).data.data.stats.evaluations,0);
 assert.equal((await cp('strategy','strategy.catalog',{},a)).status,200);assert.equal((await cp('portfolio','portfolio.overview',{},a)).status,200);
 console.log('AUTH21_QA_STAGE owner-ai');
 const schema={type:'object',properties:{message:{type:'string'}},required:['message'],additionalProperties:false},spec={prompt:'Fictional owner qualification only',schema,name:'qa_owner_message',maxTokens:64};const beforeB=(await api('/api/credits/usage',{headers:b})).data.events.length,aiA=await cp('supervisor','supervisor.structured',spec,a);assert.equal((await api('/api/credits/usage',{headers:b})).data.events.length,beforeB);const aiB=await cp('supervisor','supervisor.structured',spec,b);assert.equal((await api('/api/credits/usage',{headers:b})).data.events.length,beforeB+1);assert.equal(aiA.status,200,JSON.stringify(aiA.data));assert.equal(aiB.status,200,JSON.stringify(aiB.data));assert.equal(aiA.data.data.response.data.message,'FICTIONAL_ALICE_RESPONSE');assert.equal(aiB.data.data.response.data.message,'FICTIONAL_BOB_RESPONSE');
 console.log('AUTH21_QA_STAGE authenticated-chats');
 for(const route of ['/api/chat','/api/companion/chat','/api/chart-viewer/chat']){const chat=await api(route,{method:'POST',body:{message:'Bonjour',state:{source:'BINANCE',symbol:'BTCUSDT',interval:'1m',visible:100,indicators:[]},candles:candles.data.candles,history:[]},headers:a});assert.equal(chat.status,200,route+':'+JSON.stringify(chat.data));assert.equal(chat.data.source,'supervisor');assert.equal(chat.data.command?.message||chat.data.message,'FICTIONAL_ALICE_RESPONSE');assert(!(chat.data.routerActions||[]).some(x=>/^trading\./.test(x.action)));}
 console.log('AUTH21_QA_STAGE portfolio-history');
 const historyA=await cp('portfolio','portfolio.events',{},a),historyB=await cp('portfolio','portfolio.events',{},b);assert(historyA.data.data.events.some(e=>e.event_id==='FICTIONAL_HISTORICAL_ALICE'));assert.equal(historyB.data.data.events.length,0);
 console.log('AUTH21_QA_STAGE private-settings-and-notifications');
 for(const route of ['/api/bank/vaults','/api/transfers/status','/api/transfers/assets?network=ethereum','/api/onchain/status','/api/swap-bridge/status','/api/chart-viewer/status','/api/token-usage'])assert.equal((await api(route,{headers:a})).status,200,route);
 const bobNotifications=(await api('/api/notifications',{headers:b})).data.items.length;
 assert.equal((await api('/api/notifications/test',{method:'POST',body:{},headers:a})).status,200);
 assert((await api('/api/notifications',{headers:a})).data.items.some(item=>item.title==='Test IA-TB'));
 assert.equal((await api('/api/notifications',{headers:b})).data.items.length,bobNotifications);
 const bobUsage=(await api('/api/credits/usage',{headers:b})).data.events.length;
 const health=await api('/api/settings/test-openai',{method:'POST',body:{},headers:a});assert.equal(health.status,200,JSON.stringify(health.data));assert.equal(health.data.ownerScoped,true);
 assert.equal((await api('/api/credits/usage',{headers:b})).data.events.length,bobUsage);
 assert.equal((await api('/api/credits/pricing',{method:'POST',body:{openai:{model:'gpt-5.6',input:1,output:2},eurPerUsd:0.9},headers:a})).status,200);
 const capabilities=await api('/auth21/capabilities',{headers:a});assert.equal(capabilities.status,200);assert.equal(capabilities.data.execution.enabled,false);assert.equal(capabilities.data.infrastructureAdministration,false);
 assert.equal((await api('/api/settings/language',{method:'POST',body:{language:'fr',clientId:'CLVictim'},headers:a})).status,400);
 assert.equal((await api('/auth21/logout',{method:'POST',body:{},headers:a})).status,200);assert.equal((await api('/api/settings',{headers:a})).status,401);
 console.log(JSON.stringify({ok:true,services:13,sshSocket:true,authenticated:true,ownerIsolation:true,marketFirewallIndicator:true,ownerStrategy:true,ownerHistoricalPortfolio:true,ownerAi:true,authenticatedChats:true,adminOperatorControls:true,adminFirewallControl:true,tradingStarted:false,network:'internal-only',data:'fictional'}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
