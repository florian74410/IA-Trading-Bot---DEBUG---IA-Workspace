'use strict';
var fs=require('fs'),path=require('path'),assert=require('assert');
var ROOT=path.resolve(__dirname,'../..');
function read(p){return fs.readFileSync(path.join(ROOT,p),'utf8');}
var html=read('Frontend/Pages/fundamental_v3.html');
var js=read('Frontend/JS/fundamental_controller_v3.js');
var css=read('Frontend/CSS/fundamental_v3.css');
var svc=read('Fundamental/Engine/fundamental_service.js');
[
 'id="fundamentalConsole"','id="consoleInput"','id="consoleSend"','id="consolePause"',
 'data-console-filter="CHAT"','data-console-filter="COLLECTOR"','data-console-filter="DIAGNOSTIC"'
].forEach(function(x){assert(html.indexOf(x)>=0,'HTML missing '+x);});
['function bindConsole()','function consoleCommand(','function loadConsoleEvents()','function diagnoseSelected()','bindConsole();bindSourceV2();'].forEach(function(x){assert(js.indexOf(x)>=0,'controller missing '+x);});
['.fundamentalConsole{','.consoleEntry.chat-ai{','.consoleEntry.collector{','.consoleEntry.diagnostic{'].forEach(function(x){assert(css.indexOf(x)>=0,'CSS missing '+x);});
['/api/observability/recent','/api/diagnostic/feed','/api/discovery/inspect','/api/discovery/prepare','/api/discovery/test'].forEach(function(x){assert(svc.indexOf(x)>=0,'service route missing '+x);});
assert(html.indexOf('FUNDAMENTAL ENGINE V2 · INFORMATION_ONLY')>=0,'V2 hero missing');
console.log('[PASS] Fundamental V3 unified console static contract');
