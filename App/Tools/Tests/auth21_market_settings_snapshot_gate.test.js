'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');
test('MarketData provider configuration cannot write through real API during frozen epoch',t=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'iatb-market-config-')),'settings.json');
 t.after(()=>fs.rmSync(path.dirname(file),{recursive:true,force:true}));
 const moduleFile=require.resolve('../../MarketData/Config/market_data_settings');
 const before=process.env.IATB_MARKET_SETTINGS;
 process.env.IATB_MARKET_SETTINGS=file;delete require.cache[moduleFile];
 const settings=require(moduleFile);
 t.after(()=>{delete require.cache[moduleFile];if(before===undefined)delete process.env.IATB_MARKET_SETTINGS;else process.env.IATB_MARKET_SETTINGS=before;});
 const gate=new LocalSnapshotWriter('marketdata');
 settings.setSnapshotGate(gate);
 settings.save({});
 const original=fs.readFileSync(file,'utf8');
 gate.prepare(1);
 assert.throws(()=>settings.save({refreshMs:12345}),/SNAPSHOT_WRITE_QUIESCED/);
 assert.equal(fs.readFileSync(file,'utf8'),original);
 gate.abort(1);
 assert.doesNotThrow(()=>settings.save({refreshMs:12345}));
});
test('actual market service assigns configuration gate before settings loading',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../../MarketData/market_data_service.js'),'utf8');
 assert.ok(src.indexOf('Settings.setSnapshotGate(AUTH21_MARKETDATA_SNAPSHOT)')>=0);
 assert.ok(src.indexOf('Settings.setSnapshotGate(AUTH21_MARKETDATA_SNAPSHOT)')<src.indexOf('settings=Settings.load()'));
});
