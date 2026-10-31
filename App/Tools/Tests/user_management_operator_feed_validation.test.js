'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Storage=require('../../Fundamental/Engine/database_core');
test('operator feed creation rejects literal private IPv6 and endpoint credentials through the canonical validator',()=>{
 const storage=Object.create(Storage.prototype);storage.q={sourceByCode:{get:()=>({id:1,code:'FIXTURE'})}};
 const input={sourceCode:'FIXTURE',provider:'RSS',label:'Fictional source'};
 for(const endpoint of ['http://[::1]/','http://[::]/','http://[::ffff:127.0.0.1]/','http://[fc00::1]/','http://[fe80::1]/'])assert.throws(()=>storage.prepareFeedDraft({...input,endpoint}),/PRIVATE_REJECTED/);
 assert.throws(()=>storage.prepareFeedDraft({...input,endpoint:'https://user:password@news.example/rss'}),/CREDENTIALS_REJECTED/);
 assert.equal(storage.prepareFeedDraft({...input,endpoint:'https://news.example/rss?language=fr'}).feed.endpoint,'https://news.example/rss?language=fr');
});
