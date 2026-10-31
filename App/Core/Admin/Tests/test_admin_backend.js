'use strict';
var fs=require('fs'),path=require('path'),os=require('os'),Perm=require('../admin_permissions'),Logs=require('../log_reader'),Registry=require('../service_registry'),Backend=require('../admin_backend');
var fail=[];function ok(c,m){if(c)console.log('PASS',m);else fail.push(m)}
var r=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-admin-test-'));['AddOns/Kraken','Indicators','MarketData','Liquidity','Updates'].forEach(function(x){fs.mkdirSync(path.join(r,x),{recursive:true})});fs.writeFileSync(path.join(r,'logs.dat'),'a\nb\nc\n');
ok(Perm.roleOfUser({})==='ADMIN','legacy user defaults ADMIN');ok(Perm.normalizeRole('visitor')==='VISITOR','roles normalize');ok(Perm.isAdmin({role:'ADMIN'})===true,'ADMIN accepted');ok(Perm.isAdmin({role:'USER'})===false,'USER refused');
var l=new Logs(r);ok(l.tail('core',2).text.indexOf('c')>=0,'log tail');try{l.tail('../secrets',20);ok(false,'traversal rejected')}catch(e){ok(e.message==='LOG_SOURCE_INVALID','log whitelist rejects traversal')}
var reg=new Registry(r,{ports:{router:19000,core:19001,kraken:19011,indicators:19012,marketdata:19013,liquidity:19014}});ok(reg.spec('marketdata').restartable===true,'marketdata restartable');ok(reg.spec('core').restartable===false,'core not spawned by registry');try{reg.spec('../../bin/sh');ok(false,'service traversal rejected')}catch(e){ok(e.message==='SERVICE_INVALID','service whitelist rejects arbitrary id')}
var b=new Backend(r,{version:'1.4.0',ports:{router:19000,core:19001,kraken:19011,indicators:19012,marketdata:19013,liquidity:19014}});var s=b.system();ok(s.cpuCount>=1,'system snapshot');
if(fail.length){console.error('FAIL\n'+fail.join('\n'));process.exit(1)}console.log('ALL ADMIN TESTS PASS');
