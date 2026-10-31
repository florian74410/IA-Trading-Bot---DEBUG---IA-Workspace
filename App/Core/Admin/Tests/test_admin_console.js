'use strict';
var assert=require('assert'),AdminConsole=require('../admin_console');
var admin={
 system:function(){return{totalMemoryMB:4096,freeMemoryMB:2048,coreRssMB:128,coreHeapMB:64,cpuCount:4,loadAvg:[.1,.2,.3],platform:'darwin',arch:'x64',coreUptimeSec:10,systemUptimeSec:100};},
 snapshot:function(cb){cb(null,{version:'1.8.8',system:this.system(),processRegistry:{},services:[]});},
 services:{status:function(cb){cb(null,[{id:'portfolio',label:'Portfolio Engine',port:8020,pid:321,online:true,enabled:true}]);},restart:function(id,cb){cb(null,{id:id,online:true});},stop:function(id,cb){cb(null,{id:id,online:false});}},
 logs:{info:function(){return[{id:'core',label:'Core'}];}}
};
var c=new AdminConsole('/tmp',admin);
assert.equal(c.modeForAction('portfolio.health'),'observation');
assert.equal(c.modeForAction('trading.history'),'observation');
assert.equal(c.modeForAction('trading.cancel'),'command');
assert.equal(c.modeForAction('trading.close_position'),'command');
assert.equal(c.modeForAction('server.service.stop'),'command');
assert.equal(c.requiresConfirmation('server.service.restart'),true);
assert.throws(function(){c.validateArgs({allowed:['port']},{shell:'rm -rf /'});},/ADMIN_CONSOLE_ARGUMENT_FORBIDDEN/);
c.executeServer('server.ports',{port:8020},function(e,o){assert.ifError(e);assert.equal(o.services.length,1);assert.equal(o.services[0].service,'portfolio');});
c.executeServer('server.memory',{},function(e,o){assert.ifError(e);assert.equal(o.totalMemoryMB,4096);});
console.log('Admin Console CP/1 controlled surface: OK');
