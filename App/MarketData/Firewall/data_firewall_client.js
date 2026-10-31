'use strict';
var http=require('http'),crypto=require('crypto');

function Client(o){
 o=o||{};
 this.host='127.0.0.1';
 this.port=+o.port||+(process.env.IATB_FIREWALL_PORT||8017);
 this.timeout=Math.max(1000,+o.timeout||8000);
}
Client.prototype.inspect=function(message,cb){
 var body=Buffer.from(JSON.stringify({message:message,meta:{payloadBytes:Buffer.byteLength(JSON.stringify(message),'utf8')}}));
 var auth={};if(process.env.IATB_AUTH_MODE==='authenticated'){var CP=require('../../Core/Communication/communication_protocol_v1'),token=CP.ensureSecret('');auth={'X-IATB-CP-Token':token,'X-IATB-CP-Signature':crypto.createHmac('sha256',token).update(body).digest('hex')};}
 var q=http.request({host:this.host,port:this.port,path:'/api/data/inspect',method:'POST',timeout:this.timeout,headers:{...auth,
  'Content-Type':'application/json','Accept':'application/json','Content-Length':body.length
 }},function(r){var a=[],n=0;r.on('data',function(c){n+=c.length;if(n<=1024*1024)a.push(c)});r.on('end',function(){
  var o;try{o=JSON.parse(Buffer.concat(a).toString('utf8')||'{}')}catch(e){return cb(new Error('DATA_FIREWALL_JSON_INVALID'))}
  if((r.statusCode||500)>=400||o.ok===false){var er=new Error(o.error||('DATA_FIREWALL_HTTP_'+r.statusCode));er.firewall=o.firewall||o;return cb(er);}
  cb(null,o);
 });});
 q.on('timeout',function(){q.destroy(new Error('DATA_FIREWALL_TIMEOUT'))});q.on('error',cb);q.end(body);
};
module.exports=Client;
