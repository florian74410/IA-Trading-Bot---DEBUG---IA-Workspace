'use strict';
/* Supervisor Promise facade over the canonical IA-TB CP/1 client.
   Kept as a compatibility boundary for Supervisor/Core consumers.
*/
var SharedClient=require('../../Core/Communication/cp1_client');
function Client(root,routerPort){this.root=root;this.routerPort=+routerPort||8021;this.client=new SharedClient({root:root,routerPort:this.routerPort,timeout:12000,maxBytes:2*1024*1024});}
Client.prototype.request=function(target,action,args,detail,timeoutMs){var self=this;return new Promise(function(resolve,reject){var client=+timeoutMs>0?new SharedClient({root:self.root,routerPort:self.routerPort,timeout:+timeoutMs,maxBytes:2*1024*1024}):self.client;client.request(target,action,args||{},detail||'analysis',function(e,d){if(e)return reject(e);resolve(d);});});};
module.exports=Client;
