'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Context=require('../../Core/Clients/UserManagement/context');
const Mosaic=require('../../Core/Mosaics/mosaic_store_v1.0');
const {scopedMosaics}=require('../../Core/Clients/UserManagement/mosaics');
test('canonical Mosaic validator and private settings prevent cross-user read, overwrite and delete',()=>{
 const memory=new Map(),raw={get:(s,k,d)=>memory.get(s+':'+k)??d,set:(s,k,v)=>memory.set(s+':'+k,v)},cipher={seal:JSON.stringify,open:JSON.parse};
 const scoped=Context.scopedSettings(raw,cipher),base=Object.create(Mosaic.prototype),mosaics=scopedMosaics(base,scoped),a={clientId:'CLAlice',role:'USER'},b={clientId:'CLBob',role:'USER'};
 const input={id:'private',title:'Alice secret dashboard',items:[{source:'literal.text',value:'ALICE_PRIVATE'}]};
 Context.run(a,()=>{assert.throws(()=>mosaics.write({items:[]}),/information valide/);mosaics.write(input);assert.equal(mosaics.list().length,1);});
 Context.run(b,()=>{assert.deepEqual(mosaics.list(),[]);assert.throws(()=>mosaics.remove('moz:private'),/NOT_FOUND/);mosaics.write({...input,title:'Bob separate dashboard'});});
 Context.run(a,()=>{assert.equal(mosaics.list()[0].definition.title,'Alice secret dashboard');mosaics.remove('moz:private');assert.deepEqual(mosaics.list(),[]);});
 Context.run(b,()=>assert.equal(mosaics.list()[0].definition.title,'Bob separate dashboard'));
 Context.run({...a,role:'GUEST'},()=>assert.throws(()=>mosaics.write(input),/FORBIDDEN/));
});
