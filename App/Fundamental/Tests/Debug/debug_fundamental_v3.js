'use strict';
/* Fundamental V3 DEBUG - static consolidation and runtime health checks. Node 16 compatible. */
var fs=require('fs'),path=require('path'),http=require('http');
var ROOT=path.resolve(__dirname,'../../..'),fail=[];
function check(label,cond){console.log((cond?'[OK] ':'[FAIL] ')+label);if(!cond)fail.push(label);}
function has(rel){return fs.existsSync(path.join(ROOT,rel));}
[
'Fundamental/Engine/fundamental_service.js',
'Fundamental/Engine/observability_v3.js',
'Core/Services/fundamental_ai_synthesis_v3.js',
'Frontend/Pages/fundamental_v3.html',
'Frontend/JS/fundamental_controller_v3.js',
'Frontend/JS/fundamental_globe_v3.js',
'Frontend/CSS/fundamental_v3.css',
'Fundamental/FUNDAMENTAL_V3_UI_CONTRACT.md'
].forEach(function(p){check('V3 present: '+p,has(p));});
[
'Fundamental/Engine/observability_v2.js',
'Core/Services/fundamental_ai_synthesis_v1.js',
'Frontend/Pages/fundamental_v1.0.html',
'Frontend/JS/fundamental_controller_v1.0.js',
'Frontend/JS/fundamental_globe_v1.0.js',
'Frontend/CSS/fundamental_v1.0.css',
'Fundamental/FUNDAMENTAL_V2_UI_CONTRACT.md'
].forEach(function(p){check('legacy absent: '+p,!has(p));});
var svc=fs.readFileSync(path.join(ROOT,'Fundamental/Engine/fundamental_service.js'),'utf8');
check('service identifies V3',svc.indexOf('1.12.0-fundamental-v3')>=0);
check('service imports observability V3',svc.indexOf("require('./observability_v3')")>=0);
check('service imports synthesis V3',svc.indexOf("fundamental_ai_synthesis_v3")>=0);
function finish(){console.log('\nFundamental V3 DEBUG: '+(fail.length?'FAIL':'PASS')+' ('+fail.length+' error(s))');process.exitCode=fail.length?1:0;}
var q=http.get({host:'127.0.0.1',port:8015,path:'/health',timeout:1200},function(r){var b='';r.on('data',function(x){b+=x});r.on('end',function(){var j={};try{j=JSON.parse(b)}catch(e){}check('runtime /health HTTP 200',r.statusCode===200);check('runtime reports V3',String(j.version||'').indexOf('fundamental-v3')>=0);finish();});});
q.on('timeout',function(){q.destroy();});
q.on('error',function(){console.log('[INFO] Fundamental not running: runtime health skipped');finish();});
