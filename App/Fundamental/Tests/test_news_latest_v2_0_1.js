'use strict';
/* C3 / v2.0.1 — real Fundamental Storage regression, isolated temporary SQLite DB.
   Run from App: node Fundamental/Tests/test_news_latest_v2_0_1.js
   Requires the application's better-sqlite3 dependency; never touches GEN-1 production data. */
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-c3-news-'));
process.env.IATB_DATA_ROOT=tmp;
let storage;
try{
 const Storage=require('../Engine/database_core');
 storage=new Storage();
 const db=storage.db;
 const existing=db.prepare('SELECT id FROM feeds LIMIT 1').get();
 assert(existing,'No seeded Fundamental feed available');
 const feedId=existing.id;
 const insert=db.prepare('INSERT INTO raw_items(feed_id,external_id,url,title,summary,published_at,collected_at,content_hash,language) VALUES(?,?,?,?,?,?,?,?,?)');
 const start=Date.UTC(2026,9,1,0,0,0);
 const tx=db.transaction(function(){
   for(let i=0;i<867;i++){
     const iso=new Date(start+i*60000).toISOString();
     const published=i===866?'':iso;
     const id='c3-fixture-'+i;
     insert.run(feedId,id,'https://example.org/news/'+i,'C3 article '+i,'C3 article summary '+i,published,iso,crypto.createHash('sha256').update(id).digest('hex'),'en');
   }
 });
 tx();
 const total=db.prepare('SELECT COUNT(*) AS n FROM raw_items').get().n;
 assert.strictEqual(total,867,'fixture must contain exactly 867 publications');
 const latest=storage.rawItems({limit:5,lang:'fr',sort:'DATE_DESC'});
 assert.strictEqual(latest.length,5,'five newest articles must be returned');
 assert.deepStrictEqual(latest.map(x=>x.title),['C3 article 866','C3 article 865','C3 article 864','C3 article 863','C3 article 862']);
 assert(latest.every(x=>x.id&&x.source_name&&x.url),'news card fields must exist');
 const withoutOptionalFilters=storage.rawItems({limit:5,minReliability:null,minImportance:null});
 assert.strictEqual(withoutOptionalFilters.length,5,'null optional filters must not exclude stored news');
 assert.strictEqual(storage.rawItems({q:'NOT_A_MATCH_C3_TEST',limit:5}).length,0,'genuine empty filter remains empty');
 process.stdout.write('C3_OK: 867 stored -> 5 latest ordered and readable; empty and null-filter cases passed\\n');
}catch(e){
 console.error('C3_FAIL:',e&&e.stack||e);
 process.exitCode=1;
}finally{
 if(storage)try{storage.close();}catch(ignore){}
 try{fs.rmSync(tmp,{recursive:true,force:true});}catch(e){
   // Node versions without rmSync: leave only this isolated temp fixture.
   if(!process.exitCode)console.warn('C3_TEMP_CLEANUP:',e.message);
 }
}
