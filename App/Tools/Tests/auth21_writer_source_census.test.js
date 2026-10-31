'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {census}=require('../CI/auth21_writer_source_census');
test('source inventory reports every statically visible storage escape as unfinished',()=>{
 const result=census(path.resolve(__dirname,'../..'));
 assert.ok(result.scanned>10);
 assert.ok(result.uncovered.length>0,'a complete report requires an independent manual review');
 assert.equal(result.coverageComplete,false);
 assert.equal(Object.values(result.priorities).reduce((sum,n)=>sum+n,0),result.uncovered.length);
 assert.ok(result.priorities['potential-write']>0);
 assert.deepEqual(result.untriaged.map(x=>x.file),[], 'new static writer candidates require explicit review');
 assert.ok(result.uncovered.some(v=>v.file.includes('Core/Server/server.js')));
 console.log('# P22_WRITER_CENSUS '+JSON.stringify({
  scanned:result.scanned,reviewed:result.reviewed,uncovered:result.uncovered.length,
  priorities:result.priorities,
  files:result.uncovered.map(v=>({file:v.file,kinds:v.kinds}))
 }));
});

test('Bank vault and wallet must not write or migrate sensitive state during P2.2 trial',()=>{
 const vm=require('node:vm');
 const crypto=require('node:crypto');
 let writes=0,reads=0;
 const noDisk={mkdirSync(){writes++;throw Error('UNEXPECTED_BANK_WRITE')},
  writeFileSync(){writes++;throw Error('UNEXPECTED_BANK_WRITE')},
  renameSync(){writes++;throw Error('UNEXPECTED_BANK_WRITE')},
  chmodSync(){writes++;throw Error('UNEXPECTED_BANK_WRITE')},
  readFileSync(){reads++;throw Object.assign(Error('ENOENT'),{code:'ENOENT'})},
  existsSync(){return false}};
 function load(name){
  const source=require('node:fs').readFileSync(path.resolve(__dirname,'../..',name),'utf8');
  const module={exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports,
   process:{env:{IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL:'1'}},
   require:id=>id==='fs'?noDisk:id==='path'?path:id==='crypto'?crypto:
     id==='./multichain_wallet'?{}:
     id==='../../Core/Shared/paths'?{PersistentData:{root:'/discard-test'}}:
     (()=>{throw Error('UNEXPECTED_IMPORT')})()
  },{filename:name,timeout:1000});
  return module.exports;
 }
 const Vault=load('Bank/Core/vault_registry.js');
 assert.deepEqual(Array.from(Vault.list()),[]);
 assert.throws(()=>Vault.create({network:'ARBITRUM',asset:'USDC',name:'Test vault'}),/AUTH21_VAULT_DISABLED_DURING_SNAPSHOT_TRIAL/);
 const Wallet=load('Bank/Core/wallet_service_v2.js');
 const w=new Wallet('/discard-test',{get(){throw Error('UNEXPECTED_STORE_ACCESS')}},
  {resolveSession(){throw Error('UNEXPECTED_CLIENT_ACCESS')}},{});
 assert.throws(()=>w._master(),/AUTH21_WALLET_DISABLED_DURING_SNAPSHOT_TRIAL/);
 assert.throws(()=>w._all({}),/AUTH21_WALLET_DISABLED_DURING_SNAPSHOT_TRIAL/);
 assert.throws(()=>w._save({},[]),/AUTH21_WALLET_DISABLED_DURING_SNAPSHOT_TRIAL/);
 assert.equal(writes,0);
 assert.ok(reads<=2);
});
