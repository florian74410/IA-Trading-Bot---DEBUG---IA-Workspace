'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setImmediate:turn}=require('node:timers/promises');
const source=fs.readFileSync(path.join(__dirname,'../../Frontend/JS/auth21_ui.js'),'utf8');
function browser({locked=false,logoutFails=false}={}){
 const nodes=new Map(),requests=[];
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{hidden:true,value:'',textContent:'',dataset:{},events:{},
   addEventListener(kind,fn){this.events[kind]=fn;}});
  return nodes.get(id);
 };
 let active=true,timer;
 vm.runInNewContext(source,{
  document:{getElementById:get,addEventListener(){}},
  setTimeout(fn){timer=fn;return 1;},clearTimeout(){},Date,
  fetch:async(url,options)=>{
   requests.push({url,options});let status=200,data={ok:true};
   if(url==='/auth21/state')data={locked,expiresAt:1900000000,csrfToken:'csrf-only'};
   if(url==='/auth21/me'){status=active&&!locked?200:401;data={clientId:'CL123',role:'USER'};}
   if(url==='/auth21/csrf')data={csrfToken:'csrf-only'};
   if(url==='/auth21/lock')locked=true;
   if(url==='/auth21/unlock')locked=false;
   if(url==='/auth21/logout'){if(logoutFails)status=503;else active=false;}
   return {status,ok:status===200,json:async()=>data};
  }
 });
 return {get,requests,click:async id=>{await get(id).events.click();await turn();},
  submit:async id=>{await get(id).events.submit({preventDefault(){}});await turn();},
  timeout:async()=>{await timer();await turn();}};
}
test('reload of a locked session displays unlock, reauthenticates, locks and logs out',async()=>{
 const b=browser({locked:true});await turn();
 assert.equal(b.get('unlock-panel').hidden,false);
 assert.equal(b.get('session-panel').hidden,true);
 assert.equal(b.requests.some(r=>r.url==='/auth21/me'),false);
 b.get('unlockPassword').value='fictional password';await b.submit('unlock-form');
 assert.equal(b.get('session-panel').hidden,false);
 assert.equal(b.get('unlockPassword').value,'');
 await b.click('lock');assert.equal(b.get('unlock-panel').hidden,false);
 assert.equal(b.requests.find(r=>r.url==='/auth21/lock').options.headers['X-IATB-CSRF'],'csrf-only');
 await b.click('locked-logout');assert.equal(b.get('login-panel').hidden,false);
});
test('five-minute UI timeout requests server lock and hides previous data',async()=>{
 const b=browser();await turn();b.get('market-result').textContent='previous account data';
 await b.timeout();assert.equal(b.get('unlock-panel').hidden,false);
 assert.equal(b.get('market-result').textContent,'');
 assert.ok(b.requests.some(r=>r.url==='/auth21/lock'));
});
test('failed logout keeps a lock screen with retry, not a false success',async()=>{
 const b=browser({logoutFails:true});await turn();await b.click('logout');
 assert.equal(b.get('unlock-panel').hidden,false);
 assert.equal(b.get('login-panel').hidden,true);
 assert.match(b.get('status').textContent,/non confirmée/);
 await b.click('locked-logout');
 assert.equal(b.requests.filter(r=>r.url==='/auth21/logout').length,2);
});
