/* IA-TB v2.2.5 — Uniform states for Actualiser / Synchroniser.
 * Does not change authentication or fetch strategy. Call bind(button, () => existingRefresh()).
 */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.IATBSyncButtonState=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var LABELS=Object.freeze({idle:'Actualiser',loading:'Actualisation…',success:'À jour',error:'Erreur'});
function create(run,onChange){
 if(typeof run!=='function')throw new TypeError('run must be a function');
 var state='idle',pending=null;
 function set(next){state=next;if(typeof onChange==='function')onChange({state:state,label:LABELS[state],busy:state==='loading'});}
 var api={
  getState:function(){return state;},getLabel:function(){return LABELS[state];},
  trigger:function(){
   if(pending)return pending;
   set('loading');
   pending=Promise.resolve().then(run).then(function(result){
    if(result&&(result.ok===false||result.status==='error'||result.status==='failed'))throw new Error('SYNC_FAILED');
    set('success');return result;
   }).catch(function(error){set('error');throw error;}).finally(function(){pending=null;});
   return pending;
  },
  reset:function(){if(!pending)set('idle');}
 };
 return api;
}
function bind(button,run,options){
 if(!button||!button.addEventListener)throw new TypeError('button required');
 options=options||{};
 var original={text:button.textContent,disabled:!!button.disabled,ariaBusy:button.getAttribute('aria-busy'),state:button.getAttribute('data-sync-state')};
 var disposed=false;
 var controller=create(run,function(x){
  if(disposed)return;
  button.textContent=x.label;
  button.disabled=x.busy||original.disabled;
  button.setAttribute('aria-busy',String(x.busy));
  button.setAttribute('data-sync-state',x.state);
  if(typeof options.onStateChange==='function')options.onStateChange(x);
 });
 if(!original.disabled)button.textContent=LABELS.idle;
 function click(event){if(disposed||button.disabled||original.disabled)return;controller.trigger().catch(function(err){if(typeof options.onError==='function')options.onError(err);});}
 button.addEventListener('click',click);
 return {controller:controller,destroy:function(){
  disposed=true;button.removeEventListener('click',click);
  button.textContent=original.text;button.disabled=original.disabled;
  if(original.ariaBusy===null)button.removeAttribute('aria-busy');else button.setAttribute('aria-busy',original.ariaBusy);
  if(original.state===null)button.removeAttribute('data-sync-state');else button.setAttribute('data-sync-state',original.state);
 }};
}
return {LABELS:LABELS,create:create,bind:bind};
});
