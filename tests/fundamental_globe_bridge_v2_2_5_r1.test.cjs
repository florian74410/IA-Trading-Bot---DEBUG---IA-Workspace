const test=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../App/Frontend/JS/fundamental_globe_bridge_v2_2_5.js');

test('a real country code creates an explicitly indicative regional marker',()=>{
 const result=bridge.adapt({id:42,title:'Publication sur une décision de marché',published_at:'2026-10-17T12:00:00Z',countryCode:'US'},0);
 assert.equal(result.countryCode,'US');
 assert.equal(result.locationQuality,'REGION');
 assert.ok(result.latitude!==null&&result.longitude!==null);
});
test('events with no verifiable location are not assigned false markers',()=>{
 const result=bridge.adapt({id:43,title:'Marchés mondiaux',published_at:'2026-10-17T12:00:00Z'},0);
 assert.equal(result.locationQuality,'UNKNOWN');
 assert.equal(result.latitude,null);
 assert.equal(result.longitude,null);
});
test('explicit coordinates take precedence over country centroid',()=>{
 const result=bridge.adapt({id:44,title:'Événement de marché',published_at:'2026-10-17T12:00:00Z',countryCode:'US',latitude:40.7,longitude:-74.0},0);
 assert.equal(result.locationQuality,'EXACT');
 assert.equal(result.latitude,40.7);
 assert.equal(result.longitude,-74.0);
});
