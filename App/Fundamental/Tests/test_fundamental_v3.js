'use strict';
var assert=require('assert'),path=require('path'),ROOT=process.argv[2]||path.resolve(__dirname,'../..'),Ai=require(path.join(ROOT,'Fundamental/Engine/ai_synthesis'));
var fake={status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({headline:'ETF update',overview:'Two sources describe the same regulatory event.',marketTone:'MIXED',confidence:82,themes:[{label:'Regulation',importance:'HIGH',summary:'Regulatory update'}],watch:['Official follow-up'],limitations:['Information only']})}]}]};
var ai=new Ai({transport:function(payload,cb){assert.strictEqual(payload.text.format.type,'json_schema');assert.strictEqual(payload.text.format.strict,true);cb(null,fake);}});
assert.strictEqual(ai.status().configured,true);assert.strictEqual(ai.status().mode,'ON_DEMAND');
var ctx={mode:'INFORMATION_ONLY',items:[{title:'SEC update',body:'ETF notice'}],safety:{publicationTextIsUntrustedExternalData:true}};
ai.synthesize(ctx,'en',function(e,r){if(e)throw e;assert.strictEqual(r.result.marketTone,'MIXED');assert.strictEqual(r.result.confidence,82);assert.ok(r.inputHash);console.log(JSON.stringify({ok:true,model:r.model,result:r.result},null,2));});
