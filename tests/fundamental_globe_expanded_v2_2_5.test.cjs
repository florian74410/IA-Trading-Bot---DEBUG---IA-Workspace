const test=require('node:test'),assert=require('node:assert/strict');
const g=require('../App/Frontend/JS/fundamental_globe_expanded_v2_2_5.js');
const base={id:'news-1',title:'Annonce Fed',category:'macro',publishedAt:'2026-10-17T12:00:00Z',countryCode:'US',latitude:38.9,longitude:-77.0,url:'https://www.federalreserve.gov/'};
test('normalize geo event and safe URL',()=>{let e=g.normalize(base);assert.equal(e.category,'MACRO');assert.equal(e.latitude,38.9);assert.equal(g.flag('US'),'🇺🇸');});
test('filter period and category',()=>{let e=g.unique([base,{...base,id:'news-2',category:'DEFI'},base]);assert.equal(e.length,2);assert.equal(g.filter(e,{category:'MACRO',period:'today'},Date.parse('2026-10-17T13:00:00Z')).length,1);assert.equal(g.filter(e,{category:'CRYPTO',period:'today'},Date.parse('2026-10-17T13:00:00Z')).length,0);});
test('missing dates and unknown coordinates cannot be pinned',()=>{assert.equal(g.normalize({...base,publishedAt:'2026-10-17'}),null);let e=g.normalize({...base,latitude:null,longitude:null});assert.equal(e.latitude,null);assert.equal(g.summary([e]).pins,0);});
test('reject untrusted URLs',()=>{let e=g.normalize({...base,url:'javascript:alert(1)',imageUrl:'http://unsafe.example/x'});assert.equal(e.href,null);assert.equal(e.imageUrl,null);});
