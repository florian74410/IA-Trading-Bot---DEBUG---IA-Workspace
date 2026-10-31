'use strict';
var OpenAI=require('./providers/openai_provider'),Remote=require('./providers/remote_llm_provider'),Mock=require('./providers/mock_provider');
function Manager(config){this.config=config||{};this.providers={OPENAI_API:new OpenAI(this.config.openai||{}),REMOTE_LLM:new Remote(this.config.remote||{}),MOCK:new Mock(this.config.mock||{})};}
Manager.prototype.get=function(id){id=String(id||this.config.provider||'MOCK').toUpperCase();if(!this.providers[id])throw new Error('UNKNOWN_LLM_PROVIDER_'+id);return this.providers[id];};
Manager.prototype.health=function(id){return this.get(id).health();};
Manager.prototype.reason=function(input){var self=this,primary=String(this.config.provider||'MOCK').toUpperCase(),fallback=String(this.config.fallbackProvider||'').toUpperCase();return this.get(primary).reason(input).catch(function(err){if(!self.config.fallbackEnabled||!fallback||fallback===primary)throw err;return self.get(fallback).reason(input).then(function(r){r.fallbackFrom=primary;r.primaryError=String(err.message||err);return r;});});};
Manager.prototype.structured=function(input){var p=this.get('OPENAI_API');if(typeof p.structured!=='function')return Promise.reject(new Error('STRUCTURED_LLM_UNSUPPORTED'));return p.structured(input||{});};
Manager.prototype.status=function(){return{provider:String(this.config.provider||'MOCK').toUpperCase(),fallbackEnabled:!!this.config.fallbackEnabled,fallbackProvider:String(this.config.fallbackProvider||''),available:Object.keys(this.providers)};};
module.exports=Manager;