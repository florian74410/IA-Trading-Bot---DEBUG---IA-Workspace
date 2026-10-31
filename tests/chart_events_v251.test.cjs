'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const cal=require('../App/Frontend/JS/calendar_events_v2_2_5');
const provider=require('../App/Fundamental/Providers/finance_calendar_provider_v2_4');
const sandbox={window:{},Intl,CustomEvent:function(){}};
vm.runInNewContext(fs.readFileSync('App/Frontend/JS/chart_controller_native_v1.2.js','utf8'),sandbox);
const proto=sandbox.window.IATBChartController.prototype;
function controller(tf='1m'){
 const c=Object.create(proto);Object.assign(c,{context:{timeframe:tf},rows:[],visibleCount:40,panOffset:0,invalidate(){},_geom:{L:8,cw:800},timeZone:'Europe/Paris'});
 const step=c.intervalSeconds();c.rows=Array.from({length:240},(_,i)=>({time:1700000000+i*step,open:100,high:105,low:95,close:101,volume:10}));return c;
}
test('UTC conversion accepts offsets, preserves milliseconds and rejects unzoned/date-only instants',()=>{
 const e=cal.normalize({id:'a',source:'FED',title:'Real',startAtUtc:'2026-10-22T16:30:00.125+02:00'});
 assert.equal(e.startAtUtc,'2026-10-22T14:30:00.125Z');assert.equal(cal.chartMarkers([e])[0].time,Date.parse(e.startAtUtc)/1000);
 assert.equal(provider.normalize({id:'x',date:'2026-10-22',time_utc:'2026-10-22T14:30:00'}).startAtUtc,null);
 assert.equal(cal.chartMarkers(cal.fromCalendars({fed:{events:[{id:'x',title:'Date only',date:'2026-10-22'}]}})).length,0);
});
test('Paris summer/winter offsets, spring gap and autumn repeated hour remain explicit',()=>{
 for(const [utc,offset]of [['2026-03-29T00:30:00Z','UTC+1'],['2026-03-29T01:30:00Z','UTC+2'],['2026-10-25T00:30:00Z','UTC+2'],['2026-10-25T01:30:00Z','UTC+1']])assert.ok(cal.formatTime(Date.parse(utc)/1000,'Europe/Paris').includes(offset));
 assert.equal(cal.whenFromLocalDate('2026-03-08','02:30 ET'),null);
 assert.equal(cal.whenFromLocalDate('2026-11-01','01:30 ET'),null);
 assert.equal(cal.whenFromLocalDate('2026-07-01','14:00 ET'),'2026-07-01T18:00:00.000Z');
 assert.equal(cal.whenFromLocalDate('2026-01-01','14:00 ET'),'2026-01-01T19:00:00.000Z');
 assert.equal(cal.whenFromLocalDate('2026-07-01','14:00 EST'),'2026-07-01T19:00:00.000Z');
 assert.equal(cal.whenFromLocalDate('2026-07-01','14:99 ET'),null);
});
test('exact sub-candle position and inverse mapping survive zoom/pan for every timeframe',()=>{
 for(const tf of ['1m','5m','15m','1h','4h','1D']){const c=controller(tf),t=c.rows[220].time+c.intervalSeconds()*.37;
  for(const count of [20,40,160])for(const pan of [0,12,-10]){c.visibleCount=count;c.panOffset=pan;const x=c.timeToCoordinate(t),v=c.viewport();assert.ok(Math.abs(x-(8+(220.37-v.start+.5)*800/v.count))<1e-5);assert.ok(Math.abs(c.coordinateToTime(x)-t)<1e-5)}
 }
});
test('future navigation and pan reserve empty slots without any synthetic OHLCV',()=>{
 const c=controller(),before=JSON.stringify(c.rows),t=c.rows.at(-1).time+3600;
 assert.equal(c.locateEconomicEvent({time:t}),true);assert.ok(c.timeToCoordinate(t)>8&&c.timeToCoordinate(t)<808);assert.equal(c.visibleRows().length,0);assert.equal(JSON.stringify(c.rows),before);
 assert.equal(c.locateEconomicEvent({time:c.rows.at(-1).time+100*86400}),false);assert.equal(c.locateEconomicEvent({time:null}),false);
});
test('off-window events retain their true coordinate; missing data has no coordinate',()=>{
 const c=controller();assert.ok(c.timeToCoordinate(c.rows[0].time)<8);c.rows=[];assert.equal(c.timeToCoordinate(1700000000),null);
});
test('provider provenance, all-day suppression, values and distinct mandatory colors',()=>{
 const events=cal.fromCalendars({cme:{events:[{id:'generic',calendar:'FINANCE_CALENDAR',title:'GDP',date:'2026-10-22',startAtUtc:'2026-10-22T14:30:00Z',forecast:0,previous:2,actual:3},{id:'explicit',calendar:'FINANCE_CALENDAR',source:'FED',title:'FOMC',date:'2026-10-22',startAtUtc:'2026-10-22T14:30:00Z'},{id:'allDay',title:'Holiday',date:'2026-10-22',startAtUtc:'2026-10-22T00:00:00Z',allDay:true}]}});
 assert.equal(events.find(e=>e.sourceId==='generic').source,'FINANCE_CALENDAR');assert.equal(events.find(e=>e.sourceId==='explicit').source,'FED');assert.equal(cal.chartMarkers(events).length,2);
 assert.equal(cal.color('FED'),'#f6bf61');assert.equal(cal.color('CME'),'#5acfff');assert.equal(cal.color('FINANCE_CALENDAR'),'#b4a6cf');
 const detail=cal.details(cal.chartMarkers(events).find(e=>e.source==='FINANCE_CALENDAR'),'Europe/Paris');assert.match(detail,/GDP/);assert.match(detail,/Prévision : 0/);assert.match(detail,/Précédent : 2/);assert.match(detail,/Réel : 3/);assert.match(detail,/Importance : Indisponible/);assert.match(detail,/Europe\/Paris/);
 assert.deepEqual(cal.fromCalendars({fed:{events:[null,{}]}}),[]);assert.deepEqual(cal.chartMarkers([]),[]);assert.deepEqual(cal.fromCalendars({cme:{events:{invalid:true}}}),[]);
 assert.equal(cal.normalize({id:'bad',source:'FED',title:'No clock',startAtUtc:'2026-10-22Z'}),null);
});

test('Fundamental preferences keep default-on display and independent source switches',()=>{
 const on=cal.optionsFromSettings({});assert.equal(on.enabled,true);assert.equal(on.showFed,true);assert.equal(on.showCme,true);assert.equal(on.highMediumOnly,false);
 const off=cal.optionsFromSettings({chartEconomicEvents:false,chartEconomicFed:false,chartEconomicCme:false,chartEconomicHighMediumOnly:true});assert.equal(off.enabled,false);assert.equal(off.showFed,false);assert.equal(off.showCme,false);assert.equal(off.highMediumOnly,true);
});
