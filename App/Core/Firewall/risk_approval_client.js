'use strict';
var CPClient=require('../Communication/cp1_client');
function Client(root,routerPort){this.client=new CPClient({root:root,routerPort:+routerPort||8021,timeout:4000,maxBytes:256*1024});}
Client.prototype.verify=function(id,intent,consume,cb){this.client.request('risk','risk.gate.verify',{risk_approval_id:String(id||''),intent:intent||{},consume:consume===true},'execution',function(e,d){if(e)return cb(e);if(!d||d.ok===false)return cb(null,d||{ok:false});cb(null,d);});};
module.exports=Client;
