'use strict';
var fs=require('fs'),path=require('path'),R=require('../Engine/indicator_registry'),E=require('../Engine/indicator_engine');
var root=path.resolve(__dirname,'..'),custom=path.join(root,'Custom'),made=[];
function put(id,lines){var d=R.compileLanguage(lines.join('\n')),p=path.join(custom,id+'.indicator.json');fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');made.push(p);}
function candles(){var a=[],p=100;for(var i=0;i<240;i++){p+=Math.sin(i/9)*.4+.12;a.push({time:1700000000000+i*3600000,open:p-.2,high:p+.7,low:p-.8,close:p,volume:1000+i});}return a;}
try{
 put('dep_fast',['indicator dep_fast "Dep Fast"','version 1.0','category test','pane separate','param period = 7 min=2 max=100','use e = ema(source=close,period=$param.period).value','output value = e']);
 put('dep_combo',['indicator dep_combo "Dep Combo"','version 1.0','category test','pane separate','param period = 7 min=2 max=100','use a = dep_fast(period=$param.period).value','use b = rsi(source=close,period=14).value','calc c = sub(a=a,b=b)','output value = c']);
 var reg=new R.Registry(root);reg.safeNative=R.SAFE_NATIVE;
 var m=reg.meta('dep_combo');if(!m||m.dependencies.indexOf('dep_fast')<0)throw new Error('dependency graph missing');
 var r=E.compute(reg.get('dep_combo'),candles(),{},reg);if(r.state!=='READY'||r.latest.value==null)throw new Error('composite compute failed');
 var legacy=R.compileLanguage(['indicator legacy_probe "Legacy Probe"','version 1.0','category test','pane separate','param period = 7 min=2 max=100','use e = ema(source=close,period=$param.period).value','output value = e'].join('\n'));
 var lr=E.compute(legacy,candles(),{});if(lr.latest.value==null)throw new Error('legacy direct IIL compute failed');
 console.log('INDICATOR COMPLETE v1.12 DEBUG PASS',r.id,r.state,m.dependencies.join(','));
}finally{made.forEach(function(p){try{fs.unlinkSync(p);}catch(e){}});}
