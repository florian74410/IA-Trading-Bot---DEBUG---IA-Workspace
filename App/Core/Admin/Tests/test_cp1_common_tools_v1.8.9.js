'use strict';
var assert=require('assert'),Engine=require('../CP1/engine');
var e=new Engine({execute:function(action,args,ctx,cb){if(action==='demo.list')return cb(null,{items:[{name:'BTC',v:3},{name:'ETH',v:1},{name:'BTC2',v:2}]});cb(new Error('BAD'));},resource:function(r,a,cb){if(r==='services')return cb(null,{services:[{id:'router'},{id:'portfolio'}]});cb(new Error('BAD_RESOURCE'));}});
e.run('demo.list | grep pattern=BTC | sort key=v | head n=1',{caller:'test-admin',role:'ADMIN'},function(err,out){assert.ifError(err);assert.equal(out.response.length,1);assert.equal(out.response[0].v,2);});
e.run('cat services | count',{caller:'test-admin',role:'ADMIN'},function(err,out){assert.ifError(err);assert.equal(out.response.count,2);});
e.run('cat ../../etc/passwd',{caller:'test-admin',role:'ADMIN'},function(err){assert(err);assert(/VIRTUAL_RESOURCE_FORBIDDEN/.test(err.message));});
e.run('demo.list | head n=1',{caller:'user',role:'USER'},function(err){assert(err);assert(/ROLE_FORBIDDEN/.test(err.message));});
console.log('CP/1 Common Tools v1.8.9: OK');
