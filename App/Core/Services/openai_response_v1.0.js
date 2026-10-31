'use strict';
function extractResponseText(o){
  if(o&&typeof o.output_text==='string'&&o.output_text)return o.output_text;
  var out=o&&o.output;if(!Array.isArray(out))return'';var t='';
  for(var i=0;i<out.length;i++){
    var it=out[i];if(!it||!Array.isArray(it.content))continue;
    for(var j=0;j<it.content.length;j++){
      var p=it.content[j];
      if(p&&p.type==='output_text'&&typeof p.text==='string')t+=p.text;
    }
  }
  return t;
}
function extractRefusal(o){
  var out=o&&o.output;if(!Array.isArray(out))return'';
  for(var i=0;i<out.length;i++){var it=out[i];if(!it||!Array.isArray(it.content))continue;for(var j=0;j<it.content.length;j++){var p=it.content[j];if(p&&p.type==='refusal'){if(typeof p.refusal==='string')return p.refusal;if(typeof p.text==='string')return p.text;}}}
  return'';
}
function blankLegacy(message){return{message:String(message||''),symbol:'',interval:'',visible:0,indicators:[],replaceIndicators:false,showLevels:'keep',reset:false,uiCommands:[],gmxAction:'none',gmxDraft:{}};}
function inspectResponse(o){
  o=o||{};
  var status=String(o.status||'');
  var reason=o.incomplete_details&&o.incomplete_details.reason?String(o.incomplete_details.reason):'';
  if(status==='incomplete')return{ok:false,retry:true,reason:reason||'incomplete',text:extractResponseText(o)};
  if(status==='failed')return{ok:false,retry:false,reason:(o.error&&o.error.message)||'response_failed',text:extractResponseText(o)};
  return{ok:true,retry:false,reason:'',text:extractResponseText(o)};
}

function normalizeJsonText(t){
  t=String(t||'').trim();
  if(/^```/.test(t)){t=t.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();}
  var a=t.indexOf('{'),b=t.lastIndexOf('}');
  if(a>=0&&b>a&&(a>0||b<t.length-1))t=t.slice(a,b+1);
  return t;
}
function parseJsonText(t){var n=normalizeJsonText(t);if(!n)throw new Error('Sortie OpenAI vide');return JSON.parse(n);}

function parseObjectString(s){if(!s)return{};if(typeof s==='object'&&!Array.isArray(s))return s;try{var x=JSON.parse(String(s));return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch(e){return{};}}
function compactToLegacy(x){
  x=x||{};var ch=x.chart||{},acts=Array.isArray(x.actions)?x.actions:[],ui=[];
  for(var i=0;i<acts.length&&ui.length<16;i++){var a=acts[i]||{},type=String(a.type||''),args=parseObjectString(a.args);if(!type)continue;args.type=type;ui.push(args);}
  var inds=[];String(ch.indicators||'').split(',').forEach(function(v){v=v.trim().toUpperCase();if(v&&inds.indexOf(v)<0)inds.push(v);});
  return{message:String(x.message||''),symbol:String(ch.symbol||''),interval:String(ch.interval||''),visible:+ch.visible||0,indicators:inds,replaceIndicators:!!ch.replaceIndicators,showLevels:String(ch.showLevels||'keep'),reset:!!ch.reset,uiCommands:ui,gmxAction:String(x.gmxAction||'none'),gmxDraft:parseObjectString(x.gmxDraft)};
}

function decodeStructuredResponse(o){
  var info=inspectResponse(o);if(!info.ok)return{ok:false,retry:info.retry,reason:info.reason,text:info.text};
  var refusal=extractRefusal(o);if(!info.text&&refusal)return{ok:true,retry:false,reason:'refusal',command:blankLegacy(refusal),raw:null,text:''};
  try{var parsed=parseJsonText(info.text);return{ok:true,retry:false,reason:'',command:compactToLegacy(parsed),raw:parsed,text:info.text};}
  catch(e){return{ok:false,retry:true,reason:'json_parse:'+e.message,text:info.text};}
}
module.exports={extractResponseText:extractResponseText,extractRefusal:extractRefusal,inspectResponse:inspectResponse,normalizeJsonText:normalizeJsonText,parseJsonText:parseJsonText,parseObjectString:parseObjectString,compactToLegacy:compactToLegacy,blankLegacy:blankLegacy,decodeStructuredResponse:decodeStructuredResponse};
