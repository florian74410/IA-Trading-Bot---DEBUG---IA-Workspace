'use strict';
var C=require('../provider_contract');
function MockProvider(config){this.id='MOCK';this.config=config||{};}
MockProvider.prototype.health=function(){return Promise.resolve({ok:true,provider:this.id,debug:true});};
MockProvider.prototype.reason=function(input){var r=C.normalizeRequest(input),text=this.config.response||JSON.stringify({debug:true,message:'MOCK LLM response',promptLength:r.prompt.length});return Promise.resolve(C.normalizeResponse(this.id,'mock-debug',text,{debug:true},0));};
module.exports=MockProvider;