'use strict';
/* IA-TB CP/1 Console - Layer 4/4: pipeline engine / controlled dispatcher. */
var Parser=require('./parser'),Caps=require('./capabilities'),Tools=require('./tools');
function Engine(opt){opt=opt||{};this.execute=opt.execute;this.resource=opt.resource;this.audit=opt.audit||function(){};}
Engine.prototype.catalog=function(){return{protocol:'CP/1',architecture:['Parser','Permissions & Capabilities','Common Tools','Controlled Dispatcher'],commonTools:Caps.list(),shell:false,pipelines:true};};
Engine.prototype.run=function(line,ctx,cb){var self=this,who;try{who=Caps.caller(ctx);}catch(e){return cb(e);}var plan;try{plan=Parser.parse(line);}catch(e2){return cb(e2);}var stages=plan.stages,index=0,input;
 function done(err,val){if(err){self.audit('caller='+who.caller+' role='+who.role+' line='+plan.line+' ERROR='+err.message);return cb(err);}self.audit('caller='+who.caller+' role='+who.role+' line='+plan.line+' OK');cb(null,{ok:true,protocol:'CP/1',pipeline:plan.line,stages:stages.map(function(s){return s.name;}),response:val});}
 function next(err,val){if(err)return done(err);if(index>0)input=val;if(index>=stages.length)return done(null,input);var s=stages[index++],tool=Caps.tool(s.name);
  if(index===1&&tool){if(s.name==='cat'){var resource;try{resource=Caps.virtualResource(s.arguments.resource||s.arguments.name);}catch(e){return next(e);}if(!self.resource)return next(new Error('CP1_RESOURCE_PROVIDER_UNAVAILABLE'));return self.resource(resource,s.arguments,function(e,o){input=o;next(e,o);});}if(s.name==='watch'){var action=String(s.arguments.action||s.arguments.command||'');if(!/^[a-z][a-z0-9_.-]{2,95}$/i.test(action))return next(new Error('CP1_WATCH_ACTION_REQUIRED'));var times=Math.max(1,Math.min(5,Math.round(+s.arguments.times||3))),interval=Math.max(0,Math.min(2000,Math.round(+s.arguments.interval||500))),samples=[],wi=0;function sample(){self.execute(action,{},ctx,function(we,wo){if(we)return next(we);samples.push({at:Date.now(),data:wo});wi++;if(wi>=times){input=samples;return next(null,input);}setTimeout(sample,interval);});}return sample();}try{input=Tools.run(s.name,s.arguments,input);return next(null,input);}catch(te){return next(te);}}
  if(index===1){if(typeof self.execute!=='function')return next(new Error('CP1_DISPATCHER_UNAVAILABLE'));return self.execute(s.name,s.arguments,ctx,function(e,o){input=o;next(e,o);});}
  if(!tool)return next(new Error('CP1_PIPELINE_TOOL_REQUIRED:'+s.name));if(s.name==='cat'||s.name==='watch')return next(new Error('CP1_PIPELINE_TOOL_POSITION_FORBIDDEN:'+s.name));try{input=Tools.run(s.name,s.arguments,input);next(null,input);}catch(te2){next(te2);}
 }
 next(null,undefined);
};
module.exports=Engine;
