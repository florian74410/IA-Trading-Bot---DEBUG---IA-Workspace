'use strict';
/* IA-TB CP/1 Client v2.0
   Single internal client for Router-bound CP/1 traffic.
   Keeps transport/auth/error handling consistent across Engines.
   Node.js 16 compatible, local loopback only.
*/
var http=require('http'),CP=require('./communication_protocol_v1');

function Client(opt){
 opt=opt||{};
 this.root=opt.root;
 this.host='127.0.0.1';
 this.port=+opt.routerPort||+(process.env.ROUTER_PORT||8021);
 this.timeout=Math.max(500,Math.min(60000,+opt.timeout||8000));
 this.maxBytes=Math.max(65536,Math.min(8*1024*1024,+opt.maxBytes||4*1024*1024));
}
Client.prototype._token=function(){return CP.ensureSecret(this.root);};
Client.prototype._post=function(pathname,obj,opt,cb){
 opt=opt||{};cb=typeof cb==='function'?cb:function(){};
 var token;try{token=this._token();}catch(e){return cb(e);}
 var raw;try{raw=Buffer.from(JSON.stringify(obj||{}));}catch(e){return cb(e);}
 var done=false,self=this,limit=Math.max(65536,Math.min(8*1024*1024,+opt.maxBytes||self.maxBytes));
 var q=http.request({host:self.host,port:self.port,path:pathname,method:'POST',timeout:+opt.timeout||self.timeout,headers:{
   Accept:'application/json','Content-Type':'application/json','Content-Length':raw.length,'X-IATB-CP-Token':token
 }},function(r){
   var a=[],n=0;
   r.on('data',function(c){n+=c.length;if(n<=limit)a.push(c);});
   r.on('end',function(){
     if(done)return;done=true;
     if(n>limit)return cb(new Error('CP_ROUTER_RESPONSE_TOO_LARGE'));
     var out;try{out=JSON.parse(Buffer.concat(a).toString('utf8')||'{}');}catch(e){return cb(new Error('CP_ROUTER_JSON_INVALID'));}
     if((r.statusCode||500)>=400||out.status==='ERROR'||out.ok===false){
       var msg=out.error||(out.data&&out.data.error)||('CP_ROUTER_HTTP_'+r.statusCode),er=new Error(msg);er.statusCode=r.statusCode||500;er.response=out;return cb(er);
     }
     cb(null,out,r.statusCode||200);
   });
 });
 q.on('timeout',function(){q.destroy(new Error('CP_ROUTER_TIMEOUT'));});
 q.on('error',function(e){if(done)return;done=true;cb(e);});
 q.end(raw);
};
function routerPathAllowed(pathname,method){
 pathname=String(pathname||'').split('?')[0];
 if(method==='GET')return pathname==='/communication-health'||pathname==='/router-health'||pathname==='/communication/v1/registry'||pathname.indexOf('/communication/v1/registry/')===0||pathname==='/communication/v1/capabilities'||pathname==='/communication/v1/runtime'||pathname==='/communication/v1/events';
 if(method==='POST')return pathname==='/communication/v1/client/plan'||pathname==='/communication/v1/client/ack'||pathname==='/communication-test';
 return false;
}
Client.prototype._get=function(pathname,opt,cb){
 opt=opt||{};cb=typeof cb==='function'?cb:function(){};
 if(!routerPathAllowed(pathname,'GET'))return cb(new Error('CP_ROUTER_PATH_FORBIDDEN'));
 var token;try{token=this._token();}catch(e){return cb(e);}
 var done=false,self=this,limit=Math.max(65536,Math.min(8*1024*1024,+opt.maxBytes||self.maxBytes));
 var q=http.get({host:self.host,port:self.port,path:pathname,timeout:+opt.timeout||self.timeout,headers:{Accept:'application/json','X-IATB-CP-Token':token}},function(r){
  var a=[],n=0;r.on('data',function(x){n+=x.length;if(n<=limit)a.push(x);});r.on('end',function(){if(done)return;done=true;if(n>limit)return cb(new Error('CP_ROUTER_RESPONSE_TOO_LARGE'));var out;try{out=JSON.parse(Buffer.concat(a).toString('utf8')||'{}');}catch(e){return cb(new Error('CP_ROUTER_JSON_INVALID'));}if((r.statusCode||500)>=400||out.ok===false){var er=new Error(out.error||('CP_ROUTER_HTTP_'+r.statusCode));er.statusCode=r.statusCode||500;er.response=out;return cb(er);}cb(null,out,r.statusCode||200);});
 });q.on('timeout',function(){q.destroy(new Error('CP_ROUTER_TIMEOUT'));});q.on('error',function(e){if(done)return;done=true;cb(e);});
};
Client.prototype.routerGet=function(pathname,cb){this._get(pathname,{},cb);};
Client.prototype.routerPost=function(pathname,obj,cb){if(!routerPathAllowed(pathname,'POST'))return cb(new Error('CP_ROUTER_PATH_FORBIDDEN'));this._post(pathname,obj||{},{timeout:this.timeout,maxBytes:this.maxBytes},cb);};
Client.prototype.planClientAction=function(action,args,meta,cb){this.routerPost('/communication/v1/client/plan',{action:action,arguments:args||{},meta:meta||{}},cb);};
Client.prototype.ackClientAction=function(ack,cb){this.routerPost('/communication/v1/client/ack',ack||{},cb);};

Client.prototype.requestMessage=function(message,cb){
 if(process.env.IATB_AUTH_MODE==='authenticated'&&message&&require('../Clients/UserManagement/operator_policy').permission(message.target,message.action)){try{var context=require('../Clients/UserManagement/context').current(),grant=require('../Clients/UserManagement/operator_capability').envelope({root:this.root,engine:message.target,action:message.action,args:message.arguments||{},principal:context,token:context&&context.token,authorized:!!(context&&context.operatorReauthenticated)});message=Object.assign({},message,{action:message.target+'.operator.request',arguments:grant});}catch(e){return cb(e);}}
 this._post('/communication/v1/request',message,{},function(e,o){if(e)return cb(e);cb(null,o&&o.data!==undefined?o.data:o,o);});
};
Client.prototype.request=function(target,action,args,detail,cb){
 if(typeof detail==='function'){cb=detail;detail='analysis';}
 var msg;try{msg=CP.makeRequest(target,action,args||{},detail||'analysis');}catch(e){return cb(e);}
 this.requestMessage(msg,cb);
};
Client.prototype.publish=function(source,type,data,meta,cb){
 cb=typeof cb==='function'?cb:function(){};
 var ev;try{ev=CP.makeEvent(source,type,data||{},meta||{});}catch(e){return cb(e);}
 this._post('/communication/v1/event',ev,{timeout:Math.min(this.timeout,3000),maxBytes:512*1024},function(e,o){cb(e,o);});
};
Client.prototype.register=function(desc,cb){
 cb=typeof cb==='function'?cb:function(){};
 this._post('/communication/v1/register',desc||{},{timeout:Math.min(this.timeout,3000),maxBytes:512*1024},function(e,o){cb(e,o);});
};
Client.prototype.maintainRegistration=function(desc,opt){
 opt=opt||{};var self=this,stopped=false,timer=null,state={attempts:0,lastOkAt:0,lastError:null};
 var retryMs=Math.max(500,Math.min(30000,+opt.retryMs||2000)),heartbeatMs=Math.max(5000,Math.min(300000,+opt.heartbeatMs||30000)),initialDelayMs=Math.max(0,Math.min(30000,+opt.initialDelayMs||500));
 function schedule(ms){if(stopped)return;timer=setTimeout(run,ms);if(timer&&timer.unref)timer.unref();}
 function run(){if(stopped)return;state.attempts++;self.register(desc,function(e,o){if(stopped)return;if(e){state.lastError=String(e.message||e);if(typeof opt.onResult==='function')opt.onResult(false,e,o,state);return schedule(retryMs);}state.lastOkAt=Date.now();state.lastError=null;if(typeof opt.onResult==='function')opt.onResult(true,null,o,state);schedule(heartbeatMs);});}
 schedule(initialDelayMs);
 return{stop:function(){stopped=true;if(timer)clearTimeout(timer);timer=null;},state:state,refresh:function(){if(stopped)return;if(timer)clearTimeout(timer);timer=null;schedule(0);}};
};
module.exports=Client;
