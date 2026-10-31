/* node --test tests/calendar_events_v2_2_5.test.cjs */
const test=require('node:test'), assert=require('node:assert/strict');
const cal=require('../App/Frontend/JS/calendar_events_v2_2_5.js');
const fed={source:'FED',events:[{id:'1',title:'FOMC',startAtUtc:'2026-10-25T00:30:00Z',importance:'HIGH',forecast:'1%',actual:'2%',previous:'0.5%'}]};
const cme={source:'CME',events:[{id:'1',title:'Options',date:'2026-10-25',category:'expiration'}]};
test('source-qualified IDs, values and no false merging',()=>{const r=cal.mergeFeeds([fed,cme]);assert.equal(r.length,2);assert.ok(r.some(x=>x.id==='FED:1'&&x.actual==='2%'));});
test('Europe/Paris DST boundary and date-only do not shift dates',()=>{const r=cal.mergeFeeds([fed,cme]);assert.equal(cal.dayKey(r.find(x=>x.source==='FED'),'Europe/Paris'),'2026-10-25');assert.equal(cal.dayKey(r.find(x=>x.source==='CME'),'America/New_York'),'2026-10-25');});
test('filters remain source-specific',()=>{const r=cal.mergeFeeds([fed,cme]);assert.equal(cal.filter(r,{source:'CME'}).length,1);assert.equal(cal.filter(r,{source:'ALL'}).length,2);});
test('chart on by default, date-only excluded and optional off',()=>{const r=cal.mergeFeeds([fed,cme]);assert.equal(cal.optionsFromSettings({}).enabled,true);assert.equal(cal.chartMarkers(r).length,1);assert.equal(cal.chartMarkers(r,{enabled:false}).length,0);});
test('timestamps must have timezone and unsafe URLs are omitted',()=>{assert.equal(cal.normalize({source:'FED',id:'2',title:'a',startAtUtc:'2026-10-17T10:00:00'}),null);assert.equal(cal.normalize({source:'FED',id:'2',title:'a',date:'2026-10-17',url:'javascript:alert(1)'}).officialUrl,null);});

test('calendar detail uses only provider-supplied description and numbers',()=>{
 const events=cal.fromCalendars({fed:{events:[{id:'meeting',date:'2026-10-28',title:'FOMC',description:'Réunion officielle',forecast:0,actual:0.25,previous:0.5,countryCode:'US'}]}});
 assert.equal(events.length,1);
 assert.equal(events[0].description,'Réunion officielle');
 assert.equal(events[0].forecast,0);
 assert.equal(events[0].actual,0.25);
 assert.equal(events[0].previous,0.5);
 assert.equal(events[0].localDate,'2026-10-28');
 assert.equal(events[0].startAtUtc,null);
});
