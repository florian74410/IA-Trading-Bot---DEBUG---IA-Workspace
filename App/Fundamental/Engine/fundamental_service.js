'use strict';
/* IA-TB Fundamental Engine V3
   INFORMATION_ONLY. RSS/Atom + WEB + X collection, Flux Manager, Source Registry, translation cache,
   informational per-publication bias. No strategy influence, no AI-written facts. */
var http=require('http'),fs=require('fs'),path=require('path'),Bootstrap=require('./bootstrap_sqlite'),Collector=require('./collector'),EventEngine=require('./event_engine'),AiSynthesis=require('./ai_synthesis'),TranslationService=require('./translation_service'),SynthesisHelper=require('./synthesis_helper'),Observability=require('./observability_v3'),DiagnosticCore=require('./diagnostic_core'),SourceDiscovery=require('./source_discovery'),FedWatch=require('../Providers/fedwatch_provider'),Calendars=require('../Providers/calendar_provider'),CPAdapter=require('../../Core/Communication/component_cp1_adapter'),CPClient=require('../../Core/Communication/cp1_client'),PATHS=require('../../Core/Shared/paths'),BUILD=require('../../Core/Shared/build_info');
var HOST='127.0.0.1',PORT=+(process.env.IATB_FUNDAMENTAL_PORT||8015),ROOT=path.resolve(__dirname,'..'),APP_ROOT=path.resolve(__dirname,'../..'),LOG=PATHS.RuntimeLogs.fundamental,VERSION=BUILD.version,Storage,storage,collector,eventEngine,aiSynthesis,observability,diagnosticCore,sourceDiscovery,translationService,eventTimer,fedwatchTimer,fedwatchLast=null,fedwatchRunning=false,server,bootstrapInfo=null,aiSummaryCache={key:'',at:0,data:null},aiSummaryRunning=false,aiSummaryLastCall=0,CP_CLIENT=new CPClient({root:APP_ROOT,routerPort:+(process.env.ROUTER_PORT||8021),timeout:3000,maxBytes:512*1024}),AI_CP_CLIENT=new CPClient({root:APP_ROOT,routerPort:+(process.env.ROUTER_PORT||8021),timeout:65000,maxBytes:2*1024*1024});
function stamp(){return new Date().toISOString();}
function log(tag,msg){var line='['+stamp()+'] '+String(tag||'FE')+' '+String(msg||'');try{fs.appendFileSync(LOG,line+'\n','utf8')}catch(e){}if(process.stdout.isTTY||process.env.IATB_FUNDAMENTAL_STDOUT==='1')console.log(line);}
function refreshFedWatch(cb){
 if(fedwatchRunning)return cb&&cb(null,fedwatchLast||storage.latestFedwatchSnapshot());
 fedwatchRunning=true;
 FedWatch.collect(function(e,packet){
  fedwatchRunning=false;
  if(e){log('FEDWATCH','collect error '+String(e.message||e));if(observability)observability.warn('FEDWATCH','fedwatch.collect.error',{message:String(e.message||e)});return cb&&cb(e);}
  fedwatchLast=packet;
  try{storage.saveFedwatchSnapshot(packet);}catch(se){log('FEDWATCH','snapshot '+String(se.message||se));}
  if(observability)observability.info('FEDWATCH','fedwatch.collect.complete',{ok:!!packet.ok,errors:(packet.errors||[]).length,nextMeeting:packet.reconstructed&&packet.reconstructed[0]&&packet.reconstructed[0].meetingDate||null});
  cb&&cb(null,packet);
 });
}

function send(res,code,obj){var b=Buffer.from(JSON.stringify(obj,null,2));res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Content-Length':b.length,'Cache-Control':'no-store','X-IA-TB-Fundamental-Mode':'INFORMATION_ONLY'});res.end(b);}
function int(v,d,min,max){v=parseInt(v,10);if(!isFinite(v))v=d;return Math.max(min,Math.min(max,v));}
function apiError(res,e){var m=String(e&&e.message||e||'UNKNOWN'),code=/NOT_FOUND/.test(m)?404:/COLLECTION_RUNNING|CONFLICT|EXISTS/.test(m)?409:/UNSUPPORTED|REQUIRED|INVALID|TOO_LONG/.test(m)?400:500;send(res,code,{ok:false,error:m});}


function publishCpEvent(type,data,severity){CP_CLIENT.publish('fundamental',type,data,{schema:'fundamental.event/1.0',severity:severity||'INFO'},function(e){if(e&&process.env.IATB_CP_REGISTER_LOG==='1')log('CP_EVENT',type+' '+e.message);});}

function aiGatewayContext(cb){AI_CP_CLIENT.request('ai_gateway','ai_gateway.context',{},'summary',cb);}
function aiGatewayTransport(payload,cb){AI_CP_CLIENT.request('ai_gateway','ai_gateway.responses',{payload:payload,usageContext:'FUNDAMENTAL'},'analysis',function(e,o){if(e)return cb(e);cb(null,o&&o.response||o);});}
function summaryContext(lang){
 var since=new Date(Date.now()-86400000).toISOString(),recent=storage.rawItems({since:since,sort:'DATE_DESC',limit:36}),items=recent;
 if(recent.length<8)items=storage.rawItems({sort:'DATE_DESC',limit:28});
 var window=recent.length>=8?'24H':(recent.length?'24H + RECENT_FALLBACK':'RECENT_FALLBACK'),ctx=SynthesisHelper.buildContext({summary:storage.summary()},{items:items},lang,window);
 ctx.scope='MARKET';ctx.query={window:window,language:lang};
 return{items:items,context:ctx,language:lang,window:window};
}
function aiSummaryState(done){aiGatewayContext(function(e,g){if(e)return done(e);var x=aiSummaryCache.data;done(null,{ok:true,configured:!!g.configured,running:!!aiSummaryRunning,cached:!!x,generatedAt:x&&x.generatedAt||null,model:x&&x.model||g.model||aiSynthesis.model,language:x&&x.language||g.language||null,summary:x&&x.synthesis||null,basis:x&&x.basis||null,usage:x&&x.usage||null});});}
function generateAiSummary(force,done){
 if(aiSummaryRunning)return done(new Error('FUNDAMENTAL_AI_SUMMARY_RUNNING'));
 aiSummaryRunning=true;
 aiGatewayContext(function(ge,g){
  if(ge){aiSummaryRunning=false;return done(ge);}
  if(!g||!g.configured){aiSummaryRunning=false;return done(new Error('OPENAI_API_KEY_MISSING'));}
  var pack=summaryContext(g.language||'fr');if(!pack.items.length){aiSummaryRunning=false;return done(new Error('FUNDAMENTAL_AI_NO_PUBLICATIONS'));}
  var model=String(g.model||aiSynthesis.model||'gpt-5.6'),key=SynthesisHelper.cacheKey(pack.context,model),same=aiSummaryCache.data&&aiSummaryCache.key===key,age=Date.now()-(aiSummaryCache.at||0),forced=force===true&&Date.now()-aiSummaryLastCall>15000;
  if(same&&age<15*60*1000&&!forced){aiSummaryRunning=false;return done(null,{ok:true,cached:true,data:aiSummaryCache.data});}
  aiSummaryLastCall=Date.now();aiSynthesis.model=model;
  aiSynthesis.synthesize(pack.context,pack.language,function(e,r){
   aiSummaryRunning=false;if(e)return done(e);
   var basis={window:pack.window,itemsUsed:pack.items.length,itemsWithBody:pack.items.filter(function(x){return!!String(x&&x.summary||'').trim();}).length,raw24h:pack.context.database&&pack.context.database.raw24h||0,rawTotal:pack.context.database&&pack.context.database.rawItems||0,rawEmpty:pack.context.database&&pack.context.database.rawEmpty||0};
   var saved=storage.saveSynthesis({scope:'MARKET',eventId:0,query:{window:pack.window,language:pack.language},inputHash:r.inputHash,model:r.model,result:r.result,evidenceCount:pack.items.length});
   var data={generatedAt:new Date().toISOString(),model:r.model,language:pack.language,synthesis:r.result,basis:basis,usage:r.usage||{},persistence:{shared:true,saved:true,id:saved&&saved.id||null}};
   aiSummaryCache={key:key,at:Date.now(),data:data};done(null,{ok:true,cached:false,data:data});
  });
 });
}

function fundamentalHealth(){var h=storage.health();return {ok:h.ok,name:'IA-TB Fundamental Engine',version:VERSION,mode:'INFORMATION_ONLY',pid:process.pid,host:HOST,port:PORT,database:{journal:h.journal,integrity:h.integrity,schemaVersion:h.schemaVersion},sqlite:bootstrapInfo,internalRouting:{collector:'INTERNAL',eventEngine:'INTERNAL_SUBPROCESS',corroborationScoring:'INTERNAL'},collector:{running:!!collector.running,lastRun:collector.lastRun&&collector.lastRun.finishedAt||null},eventEngine:eventEngine?eventEngine.status():null,eventStats:storage.eventStats(),providers:{RSS:true,ATOM:true,WEB:true,SOCIAL:true,X:true,API:false},ai:aiSynthesis?aiSynthesis.status():{configured:false},observability:observability?observability.stats():null,capabilities:{trading:false,informationOnly:true,cp1:true,consumer:'supervisor'}};}
function synthesisContext(scope,a){a=a||{};scope=String(scope||'MARKET').toUpperCase();var lang=String(a.language||'fr').toLowerCase(),items=[],eventId=null,query={};if(scope==='EVENT'){eventId=int(a.eventId||a.event_id,0,0,2147483647);if(!eventId)throw new Error('EVENT_ID_REQUIRED');var packet=storage.eventEvidencePacket(eventId);if(!packet)throw new Error('EVENT_NOT_FOUND');items=packet.evidence||[];query={eventId:eventId,event:packet.event};}else if(scope==='NEWS'){var ids=Array.isArray(a.newsIds)?a.newsIds.slice(0,40).map(function(x){return int(x,0,0,2147483647);}).filter(Boolean):[];if(ids.length){items=ids.map(function(id){return storage.getRawItem(id);}).filter(Boolean);}else items=storage.rawItems({q:a.query||'',source:a.source||'',feed:a.feed||'',since:a.since||'',limit:int(a.limit,20,1,40)});query={query:a.query||'',source:a.source||'',feed:a.feed||'',since:a.since||''};}else{items=storage.rawItems({q:a.query||a.asset||'',since:a.since||'',limit:int(a.limit,28,1,40)});query={asset:String(a.asset||'').toUpperCase()||null,query:a.query||'',since:a.since||'',window:a.window||'24H'};}var summary={summary:storage.summary()},ctx=SynthesisHelper.buildContext(summary,{items:items},lang,a.window||'24H');ctx.scope=scope;ctx.query=query;if(scope==='EVENT'){ctx.event=query.event;ctx.safety.eventEngineNormalized=true;ctx.safety.independentCorroborationNotGuaranteed=false;}return{scope:scope,eventId:eventId,items:items,context:ctx,language:lang,query:query};}
function runSynthesis(scope,a,done){var pack;try{pack=synthesisContext(scope,a);}catch(e){return done(e);}if(!pack.items.length)return done(new Error('SYNTHESIS_NO_DATA'));aiSynthesis.synthesize(pack.context,pack.language,function(e,r){if(e)return done(e);try{var saved=storage.saveSynthesis({scope:pack.scope,eventId:pack.eventId,query:pack.query,inputHash:r.inputHash,model:r.model,result:r.result,evidenceCount:pack.items.length});done(null,{ok:true,mode:'INFORMATION_ONLY',scope:pack.scope,synthesis:saved,ai:{provider:r.provider,model:r.model,durationMs:r.durationMs}});}catch(x){done(x);}});}
function makeCpAdapter(){var actions=['fundamental.health','fundamental.status','fundamental.capabilities','fundamental.calendar.upcoming','fundamental.calendar.fed','fundamental.calendar.cme','fundamental.calendar.cme.expirations','fundamental.fedwatch.get','fundamental.fedwatch.history','fundamental.news.search','fundamental.news.get','fundamental.events.search','fundamental.event.get','fundamental.event.evidence','fundamental.timeline.get','fundamental.timeline.context','fundamental.timeline.rebuild','fundamental.sources.search','fundamental.source.get','fundamental.feeds.search','fundamental.providers.status','fundamental.diagnostic.feed','fundamental.diagnostic.draft','fundamental.provider.test','fundamental.feed.test_draft','fundamental.feed.create','fundamental.feed.update','fundamental.feed.toggle','fundamental.feed.delete','fundamental.news.purge','fundamental.fedwatch.refresh','fundamental.discovery.inspect','fundamental.discovery.prepare','fundamental.discovery.test','fundamental.collect','fundamental.synthesis.news','fundamental.synthesis.event','fundamental.synthesis.market','fundamental.synthesis.history','fundamental.synthesis.import','fundamental.ai_summary.state','fundamental.ai_summary.generate','fundamental.translate','fundamental.translation.get','fundamental.translation.pending','fundamental.translation.save','fundamental.logs.recent','fundamental.logs.history','fundamental.logs.stats','fundamental.logs.purge','fundamental.summary','fundamental.context','fundamental.sources','fundamental.events','fundamental.get_state','fundamental.get_events','fundamental.get_sources','fundamental.get_context','fundamental.get_evidence','fundamental.list_capabilities','fundamental.latest_news','fundamental.event_process'];return new CPAdapter({root:APP_ROOT,id:'fundamental',label:'Fundamental Engine',port:PORT,routerPort:+(process.env.ROUTER_PORT||8021),version:VERSION,schema:'fundamental.response/1.1',actions:actions,events:['fundamental.event.promoted','fundamental.event.confirmed','fundamental.bias.changed','fundamental.data_quality.changed'],handlers:{
 'fundamental.health':function(){return fundamentalHealth();},
 'fundamental.status':function(){return fundamentalHealth();},
 'fundamental.capabilities':function(){return {ok:true,mode:'INFORMATION_ONLY',consumer:'supervisor',capabilities:actions.slice(),ai:aiSynthesis.status()};},
 'fundamental.calendar.upcoming':function(a,m,done){Calendars.collect(function(e,d){if(e)return done(e);a=a||{};var days=Math.max(1,Math.min(90,+a.days||30)),country=String(a.country||'').toLowerCase(),impact=String(a.impact||'').toUpperCase(),from=Date.now()-86400000,to=Date.now()+days*86400000,rows=(d.events||[]).filter(function(x){var t=new Date(x.date+'T23:59:59Z').getTime();return t>=from&&t<=to&&(!country||String(x.country||'').toLowerCase().indexOf(country)>=0)&&(!impact||String(x.impact||'').toUpperCase()===impact)}).slice(0,Math.max(1,Math.min(200,+a.limit||100)));done(null,{ok:true,mode:'INFORMATION_ONLY',generatedAt:d.generatedAt,events:rows,calendars:d.calendars});});},
 'fundamental.calendar.fed':function(a,m,done){Calendars.collect(function(e,d){if(e)return done(e);done(null,{ok:true,mode:'INFORMATION_ONLY',calendar:d.calendars.fed,events:(d.calendars.fed&&d.calendars.fed.events)||[]});});},
 'fundamental.calendar.cme':function(a,m,done){Calendars.collect(function(e,d){if(e)return done(e);done(null,{ok:true,mode:'INFORMATION_ONLY',calendar:d.calendars.cme,events:(d.calendars.cme&&d.calendars.cme.events)||[]});});},
 'fundamental.calendar.cme.expirations':function(a,m,done){Calendars.collect(function(e,d){if(e)return done(e);done(null,{ok:true,mode:'INFORMATION_ONLY',calendar:d.calendars.cmeExpirations,events:(d.calendars.cmeExpirations&&d.calendars.cmeExpirations.events)||[]});});},
 'fundamental.fedwatch.get':function(){return {ok:true,mode:'INFORMATION_ONLY',data:fedwatchLast||(storage.latestFedwatchSnapshot()&&storage.latestFedwatchSnapshot().payload)||null};},
 'fundamental.fedwatch.history':function(a){return {ok:true,items:storage.fedwatchHistory(int(a.limit,96,1,500))};},
 'fundamental.news.search':function(a){a=a||{};var query={q:a.query||'',asset:a.asset||'',category:a.category||'',source:a.source||'',feed:a.feed||'',grade:a.minGrade||a.grade||'',minReliability:a.minReliability,minImportance:a.minImportance,since:a.since||'',until:a.until||'',sort:a.sort||'DATE_DESC',lang:a.lang||'',limit:int(a.limit,50,1,200)};return {ok:true,mode:'INFORMATION_ONLY',query:{asset:query.asset||null,category:query.category||null,source:query.source||null,feed:query.feed||null,minGrade:query.grade||null,minReliability:query.minReliability==null?null:+query.minReliability,minImportance:query.minImportance==null?null:+query.minImportance,since:query.since||null,until:query.until||null,sort:String(query.sort).toUpperCase(),limit:query.limit},items:storage.rawItems(query),totalStored:storage.db.prepare('SELECT COUNT(*) AS n FROM raw_items').get().n};},
 'fundamental.news.get':function(a){var id=int(a.id||a.newsId,0,0,2147483647),item=storage.getRawItem(id);if(!id)throw new Error('NEWS_ID_REQUIRED');if(!item)throw new Error('RAW_ITEM_NOT_FOUND');return {ok:true,mode:'INFORMATION_ONLY',item:item};},
 'fundamental.events.search':function(a){return {ok:true,mode:'INFORMATION_ONLY',events:storage.listEventsDetailed({asset:a.asset||'',status:a.status||'',limit:int(a.limit,30,1,100)})};},
 'fundamental.event.get':function(a){var id=int(a.eventId||a.id,0,0,2147483647),packet=storage.eventEvidencePacket(id);if(!id)throw new Error('EVENT_ID_REQUIRED');if(!packet)throw new Error('EVENT_NOT_FOUND');return {ok:true,mode:'INFORMATION_ONLY',event:packet.event,evidenceCount:packet.evidence.length};},
 'fundamental.event.evidence':function(a){var id=int(a.eventId||a.id,0,0,2147483647),packet=storage.eventEvidencePacket(id);if(!id)throw new Error('EVENT_ID_REQUIRED');if(!packet)throw new Error('EVENT_NOT_FOUND');return {ok:true,mode:'INFORMATION_ONLY',evidence:packet};},
 'fundamental.timeline.get':function(a){var id=int(a.eventId||a.event_id||a.id,0,0,2147483647);if(!id)throw new Error('EVENT_ID_REQUIRED');storage.rebuildTimeline(id);return {ok:true,mode:'INFORMATION_ONLY',memory:'TEMPORAL_V3',timeline:storage.getTimeline(id,{since:a.since||'',limit:int(a.limit,300,1,1000)})};},
 'fundamental.timeline.context':function(a){var id=int(a.eventId||a.event_id||a.id,0,0,2147483647);if(!id)throw new Error('EVENT_ID_REQUIRED');return {ok:true,mode:'INFORMATION_ONLY',memory:'TEMPORAL_V3',context:storage.timelineContext(id,{limit:int(a.limit,60,1,100)})};},
 'fundamental.timeline.rebuild':function(a){var id=int(a.eventId||a.event_id||a.id,0,0,2147483647);if(!id)throw new Error('EVENT_ID_REQUIRED');var t=storage.rebuildTimeline(id);if(observability)observability.info('MEMORY','timeline.rebuilt',{event_id:id,entries:t.count});return {ok:true,mode:'INFORMATION_ONLY',memory:'TEMPORAL_V3',timeline:t};},
 'fundamental.sources.search':function(a){return {ok:true,sources:storage.listSources({q:a.query||'',domain:a.domain||'',enabled:typeof a.enabled==='boolean'?a.enabled:undefined,limit:int(a.limit,100,1,200)})};},
 'fundamental.source.get':function(a){return diagnosticCore.source(a.code||a.source);},
 'fundamental.feeds.search':function(a){return {ok:true,feeds:storage.listFeeds({source:a.source||'',provider:a.provider||'',enabled:typeof a.enabled==='boolean'?a.enabled:undefined,limit:int(a.limit,200,1,300)})};},
 'fundamental.providers.status':function(){return {ok:true,dashboard:storage.providerDashboard()};},
 'fundamental.diagnostic.feed':function(a,m,done){diagnosticCore.feed(a.feedId||a.id,done);},
 'fundamental.diagnostic.draft':function(a,m,done){diagnosticCore.draft(a,done);},
 'fundamental.provider.test':function(a,m,done){diagnosticCore.feed(a.feedId||a.id,done);},
 'fundamental.feed.test_draft':function(a,m,done){diagnosticCore.draft(a.feed||a,done);},
 'fundamental.feed.create':function(a){if(collector.running)throw new Error('COLLECTION_RUNNING');var payload=a.feed&&typeof a.feed==='object'?a.feed:a,nf=storage.createFeed(payload||{});log('FLUX_MANAGER','Ajout '+nf.code+' provider='+nf.provider_type+(nf.platform?'/'+nf.platform:''));return{ok:true,feed:nf};},
 'fundamental.feed.update':function(a){if(collector.running)throw new Error('COLLECTION_RUNNING');var id=int(a.feedId||a.id,0,1,2147483647),payload=a.feed&&typeof a.feed==='object'?a.feed:Object.assign({},a);delete payload.feedId;delete payload.id;var uf=storage.updateFeed(id,payload);log('FLUX_MANAGER','Modification '+uf.code);return{ok:true,feed:uf};},
 'fundamental.feed.toggle':function(a){if(collector.running)throw new Error('COLLECTION_RUNNING');var id=int(a.feedId||a.id,0,1,2147483647),tf=storage.toggleFeed(id,typeof a.enabled==='boolean'?a.enabled:undefined);log('FLUX_MANAGER',(tf.enabled?'Activation ':'Desactivation ')+tf.code);return{ok:true,feed:tf};},
 'fundamental.feed.delete':function(a){if(collector.running)throw new Error('COLLECTION_RUNNING');var id=int(a.feedId||a.id,0,1,2147483647),df=storage.deleteFeed(id);log('FLUX_MANAGER','Suppression '+df.code+' publications='+df.deletedItems);return{ok:true,result:df};},
 'fundamental.news.purge':function(){if(collector.running)throw new Error('COLLECTION_RUNNING');var pr=storage.purgeNews();log('PURGE','news deleted='+pr.deletedItems+' translations='+pr.deletedTranslations);return{ok:true,purge:pr};},
 'fundamental.fedwatch.refresh':function(a,m,done){FedWatch.invalidate();refreshFedWatch(function(e,d){if(e)return done(e);done(null,{ok:true,data:d});});},

 'fundamental.discovery.inspect':function(a){return sourceDiscovery.inspect(a.candidate||a);},
 'fundamental.discovery.prepare':function(a){return sourceDiscovery.prepare(a.candidate||a);},
 'fundamental.discovery.test':function(a,m,done){sourceDiscovery.test(a.candidate||a,done);},
 'fundamental.synthesis.news':function(a,m,done){runSynthesis('NEWS',a,done);},
 'fundamental.synthesis.event':function(a,m,done){runSynthesis('EVENT',a,done);},
 'fundamental.synthesis.market':function(a,m,done){runSynthesis('MARKET',a,done);},
 'fundamental.synthesis.history':function(a){return {ok:true,mode:'INFORMATION_ONLY',syntheses:storage.listSyntheses({eventId:a.eventId||a.event_id||0,scope:a.scope||'',limit:int(a.limit,20,1,100)})};},
  'fundamental.synthesis.import':function(a){a=a||{};var scope=String(a.scope||'MARKET').toUpperCase();if(['NEWS','EVENT','MARKET'].indexOf(scope)<0)throw new Error('SYNTHESIS_SCOPE_INVALID');var saved=storage.saveSynthesis({scope:scope,eventId:a.eventId||a.event_id||0,query:a.query||{},inputHash:String(a.inputHash||''),model:String(a.model||''),result:a.result||{},evidenceCount:int(a.evidenceCount,0,0,10000)});return {ok:true,mode:'INFORMATION_ONLY',synthesis:saved};},
  'fundamental.ai_summary.state':function(a,m,done){aiSummaryState(done);},
  'fundamental.ai_summary.generate':function(a,m,done){generateAiSummary(a.force===true,done);},
  'fundamental.translate':function(a,m,done){var lang=String(a.lang||'').toLowerCase();if(!lang)return aiGatewayContext(function(e,g){if(e)return done(e);translationService.translate(a.itemId||a.id,g.language||'fr',done);});translationService.translate(a.itemId||a.id,lang,done);},
  'fundamental.translation.get':function(a){var itemId=int(a.itemId||a.raw_item_id||a.id,0,0,2147483647),lang=String(a.lang||a.target_lang||'').toLowerCase();if(!itemId||!lang)throw new Error('TRANSLATION_KEY_REQUIRED');return {ok:true,translation:storage.getTranslation(itemId,lang)};},
  'fundamental.translation.pending':function(a){var lang=String(a.lang||a.target_lang||'').toLowerCase();if(!lang)throw new Error('TRANSLATION_LANGUAGE_REQUIRED');var items=storage.listUntranslated(lang,int(a.limit,200,1,500));return {ok:true,language:lang,items:items,count:items.length};},
  'fundamental.translation.save':function(a){return {ok:true,translation:storage.saveTranslation(a||{})};},
 'fundamental.logs.recent':function(a){return {ok:true,private:true,events:observability.query(a||{})};},
 'fundamental.logs.history':function(a){return {ok:true,private:true,events:observability.history(a||{})};},
 'fundamental.logs.stats':function(){return observability.stats();},
 'fundamental.logs.purge':function(){var r=observability.purge();observability.info('OBSERVABILITY','logs.purged',{deleted_bytes:r.deletedBytes});return r;},
 'fundamental.summary':function(){return {ok:true,version:VERSION,summary:storage.summary(),events:storage.eventStats(),latestNews:storage.latestNews(),domains:storage.domainCoverage(),collector:{running:collector.running,lastRun:collector.lastRun},eventEngine:eventEngine.status(),providers:{RSS:'ACTIVE',ATOM:'ACTIVE',WEB:'ACTIVE',SOCIAL:'ACTIVE_X',X:'ACTIVE',API:'PROVIDER_PENDING'}};},
 'fundamental.context':function(a){return {ok:true,context:storage.context(a.query||'')};},
 'fundamental.sources':function(a){return {ok:true,sources:storage.listSources({q:a.query||'',domain:a.domain||'',enabled:typeof a.enabled==='boolean'?a.enabled:undefined,limit:int(a.limit,100,1,200)})};},
 'fundamental.events':function(a){return {ok:true,mode:'EVENT_ENGINE_ACTIVE',events:storage.listEventsDetailed({asset:a.asset||'',status:a.status||'',limit:int(a.limit,30,1,100)})};},
 'fundamental.collect':function(a,m,done){collector.collect({all:!!a.all},function(e,r){if(e)return done(e);var er=null;try{er=eventEngine.process({limit:int(a.eventLimit,120,1,250)});}catch(x){er={ok:false,error:x.message};}r.eventEngine=er;done(null,r);});},
 'fundamental.get_state':function(){return fundamentalHealth();},
 'fundamental.analyze':function(a){return analysisPacket(a);},
 'fundamental.get_events':function(a){return {ok:true,mode:'INFORMATION_ONLY',events:storage.listEventsDetailed({asset:a.asset||'',status:a.status||'',limit:int(a.limit,30,1,100)})};},
 'fundamental.get_sources':function(a){return {ok:true,sources:storage.listSources({q:a.query||'',domain:a.domain||'',enabled:typeof a.enabled==='boolean'?a.enabled:undefined,limit:int(a.limit,100,1,200)})};},
 'fundamental.get_context':function(a){return {ok:true,context:storage.context(a.query||'')};},
 'fundamental.get_evidence':function(a){var id=int(a.eventId||a.event_id,0,0,2147483647);if(!id)throw new Error('EVENT_ID_REQUIRED');var packet=storage.eventEvidencePacket(id);if(!packet)throw new Error('EVENT_NOT_FOUND');return {ok:true,mode:'INFORMATION_ONLY',evidence:packet};},
 'fundamental.list_capabilities':function(){return {ok:true,mode:'INFORMATION_ONLY',capabilities:actions.slice(),internal:['Fundamental Collector','Event Engine','Corroboration / Scoring']};},
 'fundamental.latest_news':function(){return {ok:true,mode:'INFORMATION_ONLY',latestNews:storage.latestNews()};},
 'fundamental.event_process':function(a){return eventEngine.process({limit:int(a.limit,120,1,250)});}
 }});}
var cpAdapter=null;
function route(req,res){
 if(observability)observability.debug('HTTP','request',{method:req.method,path:String(req.url||'').split('?')[0]});
 if(cpAdapter&&cpAdapter.handle(req,res))return;
 var p=String(req.url||'').split('?')[0];
 try{
  if(req.method==='GET'&&p==='/health'){var hh=fundamentalHealth();return send(res,hh.ok?200:503,hh);}
  return send(res,404,{ok:false,error:'NOT_FOUND'});
 }catch(e){log('ERROR',e.stack||e.message);return apiError(res,e);}
}
function boot(){try{var snapshotGate=process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'?require('../../Core/Backup/auth21_engine_snapshot_trial').openEngineSnapshotTrial({env:process.env,engine:'fundamental'}).gate:null;if(snapshotGate&&snapshotGate.heldEpoch!==null)throw Error('AUTH21_FUNDAMENTAL_FROZEN_BOOTSTRAP');bootstrapInfo=Bootstrap.ensureSync();Storage=require('./database');storage=new Storage(snapshotGate?{snapshotGate:snapshotGate}:{});observability=new Observability({engine:'fundamental',version:VERSION,file:LOG+'.jsonl',maxRecent:1500});observability.info('ENGINE','engine.boot',{mode:'INFORMATION_ONLY',host:HOST,port:PORT});collector=new Collector(storage,log,observability);diagnosticCore=new DiagnosticCore(storage,collector,observability);sourceDiscovery=new SourceDiscovery(storage,collector,observability,null);eventEngine=new EventEngine(storage,log,publishCpEvent,observability);aiSynthesis=new AiSynthesis({log:log,observability:observability,transport:aiGatewayTransport});translationService=new TranslationService({storage:storage,log:log,contextProvider:aiGatewayContext});cpAdapter=makeCpAdapter();server=require('../../Core/Clients/auth21_engine_ingress').createServer(route);server.on('error',function(e){log('BIND',e.message);process.exit(13)});server.listen(PORT,HOST,function(){log('START','IA-TB Fundamental Engine v'+VERSION+' http://'+HOST+':'+PORT+' mode=INFORMATION_ONLY sqlite='+bootstrapInfo.sqliteVersion+(bootstrapInfo.installed?' bootstrap=installed':' bootstrap=ready')+' providers=RSS,ATOM,WEB,X');cpAdapter.maintainRegistration({initialDelayMs:500,onResult:function(ok,e){if(!ok&&process.env.IATB_CP_REGISTER_LOG==='1')log('CP_REGISTER',e&&e.message||'HTTP');}});if(process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL!=='1'){collector.start();translationService.start();setTimeout(function(){try{eventEngine.process({limit:120});}catch(e){log('EVENT_ENGINE',e.message);}},4000);setTimeout(function(){refreshFedWatch(function(){});},6500);eventTimer=setInterval(function(){if(collector&&collector.running)return;try{eventEngine.process({limit:120});}catch(e){log('EVENT_ENGINE',e.message);}},60000);if(eventTimer.unref)eventTimer.unref();fedwatchTimer=setInterval(function(){refreshFedWatch(function(){});},900000);if(fedwatchTimer.unref)fedwatchTimer.unref();} });}catch(e){log('FATAL',e.stack||e.message);process.exit(12);}}
function stop(){try{cpAdapter&&cpAdapter.stopRegistration();}catch(e){}try{translationService&&translationService.stop();}catch(e){}try{collector&&collector.stop();}catch(e){}try{if(eventTimer)clearInterval(eventTimer);}catch(e){}try{if(fedwatchTimer)clearInterval(fedwatchTimer);}catch(e){}try{storage&&storage.close();}catch(e){}if(server)return server.close(function(){process.exit(0)});process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);boot();
