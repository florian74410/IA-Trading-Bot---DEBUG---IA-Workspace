'use strict';

var store=null,listeners=[];
function setStore(s){store=s||null;}
function on(fn){if(typeof fn==='function')listeners.push(fn);return function(){listeners=listeners.filter(function(x){return x!==fn;});};}
function emit(event){
 event=Object.assign({timestamp:Date.now()},event||{});
 if(store&&typeof store.save==='function'){try{store.save(event);}catch(e){}}
 listeners.slice().forEach(function(fn){try{fn(event);}catch(e){}});
 return event;
}
function status(){return{store:store&&typeof store.status==='function'?store.status():null,listeners:listeners.length};}
module.exports={setStore:setStore,on:on,emit:emit,status:status};
