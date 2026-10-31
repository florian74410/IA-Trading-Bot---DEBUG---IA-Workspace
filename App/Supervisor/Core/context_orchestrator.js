'use strict';
var Build=require('../Extensions/AutonomousTrading/context_builder');
function Orchestrator(client){this.client=client;}
function settle(name,p){return p.then(function(data){return{name:name,ok:true,data:data,error:null};},function(e){return{name:name,ok:false,data:null,error:String(e&&e.message||e).slice(0,240)};});}
Orchestrator.prototype.collect=function(input){input=input||{};var symbol=String(input.symbol||'BTCUSD').toUpperCase(),timeframe=String(input.timeframe||'1h').toLowerCase(),source=input.source?String(input.source):undefined,c=this.client;
var asset=String(input.fundamentalAsset||symbol).replace(/(?:USDT|USDC|USD|EUR)$/,'')||symbol,newsLimit=Math.max(3,Math.min(50,+input.newsLimit||12)),newsSince=input.newsSince||new Date(Date.now()-Math.max(1,Math.min(168,+input.newsWindowHours||24))*3600000).toISOString();
var tasks=[
 settle('collectorData',new (require('./collector_data_v2_4_1').CollectorData)(c,require('../../Core/Shared/paths').ROOT).collect(input)),
 settle('marketData',c.request('marketdata','marketdata.candles',{symbol:symbol,timeframe:timeframe,limit:Math.max(20,Math.min(500,+input.limit||200)),force:false,source:source},'analysis')),
 settle('indicators',c.request('indicator','indicator.analyze',{symbol:symbol,timeframe:timeframe,force:false},'analysis')),
 settle('indicatorCatalog',c.request('indicator','indicator.list_indicators',{},'analysis')),
 settle('fundamentalEvents',c.request('fundamental','fundamental.events.search',{asset:asset,status:input.fundamentalStatus||'',limit:Math.max(5,Math.min(100,+input.fundamentalLimit||30))},'analysis')),
 settle('fundamentalSummary',c.request('fundamental','fundamental.summary',{},'analysis')),
 settle('fundamentalNews',c.request('fundamental','fundamental.news.search',{asset:asset,category:input.newsCategory||'',source:input.newsSource||'',minGrade:input.newsMinGrade||'',minReliability:input.newsMinReliability,minImportance:input.newsMinImportance,since:newsSince,sort:input.newsSort||'RELEVANCE_DESC',limit:newsLimit},'analysis')),
 settle('fundamentalSyntheses',c.request('fundamental','fundamental.synthesis.history',{scope:input.synthesisScope||'',limit:Math.max(1,Math.min(20,+input.synthesisLimit||5))},'analysis')),
 settle('fundamentalCalendar',c.request('fundamental','fundamental.calendar.upcoming',{days:Math.max(1,Math.min(90,+input.calendarDays||14)),country:input.calendarCountry||'',impact:input.calendarImpact||'',limit:Math.max(1,Math.min(200,+input.calendarLimit||80))},'analysis')),
 settle('fedwatch',c.request('fundamental','fundamental.fedwatch.get',{},'analysis')),
 settle('liquidity',c.request('liquidity','liquidity.context',{symbol:symbol,timeframe:timeframe,limit:Math.max(20,Math.min(500,+input.limit||200)),source:String(input.liquiditySource||'AUTO'),depth:Math.max(5,Math.min(100,+input.liquidityDepth||20)),liquidationWindowMs:Math.max(60000,Math.min(86400000,+input.liquidityWindowMs||900000))},'analysis')),
 settle('portfolio',c.request('portfolio','portfolio.snapshot',{force:false},'analysis')),
 settle('portfolioPositionHealth',c.request('portfolio','portfolio.position.health',{symbol:symbol},'analysis')),
 settle('portfolioTrades',c.request('portfolio','portfolio.trades',{limit:Math.max(1,Math.min(100,+input.portfolioTradeLimit||10))},'analysis')),
 settle('strategy',c.request('strategy','strategy.evaluate',{symbol:symbol,timeframe:timeframe,correlation_id:String(input.correlationId||'')},'analysis')),
 settle('risk',c.request('risk','risk.snapshot',{symbol:symbol,timeframe:timeframe},'analysis'))
];
var indicatorRequests=Array.isArray(input.indicatorRequests)?input.indicatorRequests.slice(0,32):[],indicatorCandles=Array.isArray(input.indicatorCandles)?input.indicatorCandles.slice(-1200):null;
if(indicatorRequests.length){
 tasks.push(settle('indicatorRequested',indicatorCandles?c.request('indicator','indicator.compute_batch_data',{candles:indicatorCandles,requests:indicatorRequests,symbol:symbol,timeframe:timeframe,source:String(input.indicatorSource||'SUPERVISOR_CONTEXT')},'evidence',20000):c.request('indicator','indicator.compute_batch',{symbol:symbol,timeframe:timeframe,requests:indicatorRequests,force:input.indicatorForce===true},'evidence',20000)));
}
return Promise.all(tasks).then(function(rows){var x={symbol:symbol,timeframe:timeframe},availability={},warnings=[];rows.forEach(function(r){x[r.name]=r.data;availability[r.name]=r.ok;if(!r.ok)warnings.push(r.name.toUpperCase()+'_UNAVAILABLE:'+r.error);});var fs=x.fundamentalSummary||{},fe=x.fundamentalEvents||{};x.fundamental={ok:!!(availability.fundamentalEvents&&availability.fundamentalSummary),mode:'INFORMATION_ONLY',asset:asset||null,horizon:timeframe||null,events:fe.events||[],stats:fs.events||{},latestNews:fs.latestNews||[]};availability.fundamental=!!(availability.fundamentalEvents&&availability.fundamentalSummary);var context=Build(x);context.collectorData=x.collectorData||null;context.fundamentalNews=x.fundamentalNews||null;context.fundamentalSyntheses=x.fundamentalSyntheses||null;context.fundamentalCalendar=x.fundamentalCalendar||null;context.fedwatch=x.fedwatch||null;context.positionHealth=x.portfolioPositionHealth||null;context.portfolioTrades=x.portfolioTrades||null;context.indicatorCatalog=x.indicatorCatalog||null;context.indicatorRequested=x.indicatorRequested||null;context.fundamentalSelection={asset:asset,since:newsSince,sort:String(input.newsSort||'RELEVANCE_DESC'),limit:newsLimit};context.timeframe=timeframe;context.availability=availability;context.warnings=warnings;context.degraded=warnings.length>0;context.transport='CP/1 Router only';return context;});};
module.exports=Orchestrator;