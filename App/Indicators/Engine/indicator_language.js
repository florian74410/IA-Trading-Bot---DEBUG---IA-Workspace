'use strict';
/* IA-TB Indicator Language (IIL) v1.0.
   Public language owned by Indicator Engine. Compiles to private Indicator IR. */
var ID='[_a-z][_a-z0-9]{0,63}',RID=new RegExp('^'+ID+'$','i'),MAX_LINES=96;
function clean(s){return String(s==null?'':s).trim();}
function atom(s){s=clean(s);if(/^[-+]?\d+(?:\.\d+)?$/.test(s))return +s;if(/^\$param\.[a-z_][a-z0-9_]*$/i.test(s))return s;if(/^\$source\.(open|high|low|close|volume)$/i.test(s))return s.toLowerCase();if(RID.test(s))return s;throw new Error('IIL_ATOM_INVALID:'+s);}
function args(s){var o={},a=clean(s);if(!a)return o;a.split(',').forEach(function(x){var k=x.indexOf('=');if(k<1)throw new Error('IIL_ARGUMENT_INVALID:'+x);var n=clean(x.slice(0,k));if(!RID.test(n))throw new Error('IIL_ARGUMENT_NAME_INVALID:'+n);o[n]=atom(x.slice(k+1));});return o;}
function compile(src){src=String(src||'');if(src.length>16384)throw new Error('IIL_SOURCE_TOO_LARGE');var lines=src.split(/\r?\n/).map(clean).filter(function(x){return x&&x.charAt(0)!=='#';});if(lines.length>MAX_LINES)throw new Error('IIL_TOO_MANY_LINES');var ir={version:'1.0',steps:[],outputs:{}},declared=Object.create(null),indicatorId='',name='',version='1.0',category='custom',inputs={},display={pane:'separate'};
 lines.forEach(function(line,no){var m;
  if((m=/^indicator\s+([a-z][a-z0-9_]{1,63})(?:\s+"([^"]{1,100})")?$/i.exec(line))){indicatorId=m[1].toLowerCase();name=m[2]||indicatorId;return;}
  if((m=/^version\s+([A-Za-z0-9._-]{1,20})$/i.exec(line))){version=m[1];return;}
  if((m=/^category\s+([A-Za-z0-9_-]{1,40})$/i.exec(line))){category=m[1];return;}
  if((m=/^pane\s+(price|separate)$/i.exec(line))){display.pane=m[1].toLowerCase();return;}
  if((m=/^input\s+([a-z_][a-z0-9_]*)\s*=\s*(open|high|low|close|volume)$/i.exec(line))){inputs[m[1]]={type:'series',default:m[2].toLowerCase(),allowed:['open','high','low','close','volume']};return;}
  if((m=/^param\s+([a-z_][a-z0-9_]*)\s*=\s*([-+]?\d+(?:\.\d+)?)(?:\s+min=([-+]?\d+(?:\.\d+)?))?(?:\s+max=([-+]?\d+(?:\.\d+)?))?$/i.exec(line))){var v=+m[2],isInt=Math.floor(v)===v;inputs[m[1]]={type:isInt?'integer':'number',default:v};if(m[3]!=null)inputs[m[1]].min=+m[3];if(m[4]!=null)inputs[m[1]].max=+m[4];return;}
  if((m=/^(use|calc)\s+([_a-z][_a-z0-9]*)\s*=\s*([a-z_][a-z0-9_]*)\((.*)\)(?:\.([a-z_][a-z0-9_]*))?$/i.exec(line))){var id=m[2],op=m[3].toLowerCase();if(declared[id])throw new Error('IIL_DUPLICATE:'+id);declared[id]=1;ir.steps.push({id:id,op:op,args:args(m[4]),output:m[5]||undefined});return;}
  if((m=/^output\s+([a-z_][a-z0-9_]*)\s*=\s*([_a-z][_a-z0-9]*)$/i.exec(line))){ir.outputs[m[1]]=m[2];return;}
  throw new Error('IIL_SYNTAX_LINE_'+(no+1)+':'+line);
 });
 if(!indicatorId)throw new Error('IIL_INDICATOR_REQUIRED');if(!Object.keys(ir.outputs).length)throw new Error('IIL_OUTPUT_REQUIRED');
 var outputs={};Object.keys(ir.outputs).forEach(function(k){outputs[k]={type:'number',strategy:true,chart:true};});
 return{schema:'iatb.indicator.v1',id:indicatorId,name:name,version:version,category:category,inputs:inputs,language:{id:'IIL',version:'1.0',source:src},engine:{ir:ir},outputs:outputs,display:display};
}
module.exports={id:'IIL',version:'1.0',compile:compile,MAX_LINES:MAX_LINES};
