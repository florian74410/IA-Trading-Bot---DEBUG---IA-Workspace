'use strict';
const http=require('http'),path=require('path');
const ROOT=process.argv[2];
const CP=require(path.join(ROOT,'Core/Communication/communication_protocol_v1'));
const Adapter=require(path.join(ROOT,'Core/Communication/component_cp1_adapter'));
const routerPort=18221, componentPort=18015;
const adapter=new Adapter({root:ROOT,id:'fundamental',label:'Fundamental Engine TEST',port:componentPort,routerPort,version:'1.8.0-event.1',schema:'fundamental.response/1.1',actions:['fundamental.health','fundamental.get_events'],events:['fundamental.event.confirmed'],handlers:{
 'fundamental.health':()=>({ok:true,name:'IA-TB Fundamental Engine',mode:'INFORMATION_ONLY',eventEngine:'INTERNAL_SUBPROCESS'}),
 'fundamental.get_events':()=>({ok:true,events:[{id:1,status:'CONFIRMED'}]})
}});
const component=http.createServer((req,res)=>{if(adapter.handle(req,res))return;res.statusCode=404;res.end();});
function post(pathname,obj,headers,cb){const b=Buffer.from(JSON.stringify(obj));const q=http.request({host:'127.0.0.1',port:routerPort,path:pathname,method:'POST',headers:Object.assign({'Content-Type':'application/json','Content-Length':b.length},headers||{})},r=>{let a=[];r.on('data',c=>a.push(c));r.on('end',()=>{let o={};try{o=JSON.parse(Buffer.concat(a).toString())}catch(e){}cb(null,r.statusCode,o);});});q.on('error',cb);q.end(b);}
component.listen(componentPort,'127.0.0.1',()=>{
 adapter.register((ok,e,status)=>{
  if(!ok){console.error('REGISTER_FAIL',e&&e.message,status);process.exit(2);}
  const token=CP.ensureSecret(ROOT), msg=CP.makeRequest('fundamental','fundamental.health',{},'summary');
  post('/communication/v1/request',msg,{'X-IATB-CP-Token':token},(er,code,o)=>{
   if(er||code!==200||!o||o.status!=='OK'||!o.data||o.data.eventEngine!=='INTERNAL_SUBPROCESS'){console.error('ROUTE_FAIL',er,code,JSON.stringify(o));process.exit(3);}
   const ev=CP.makeEvent('fundamental','fundamental.event.confirmed',{eventId:42,status:'CONFIRMED',eventConfidence:91.4},{schema:'fundamental.event/1.0',severity:'NOTICE'});
   post('/communication/v1/event',ev,{'X-IATB-CP-Token':token},(ee,ecode,eo)=>{
    if(ee||ecode!==200||!eo||eo.accepted!==true){console.error('EVENT_FAIL',ee,ecode,JSON.stringify(eo));process.exit(4);}
    console.log(JSON.stringify({ok:true,register:true,request:{routerStatus:code,protocol:o.protocol,data:o.data},event:{routerStatus:ecode,accepted:eo.accepted,event_id:eo.event_id,type:ev.type}},null,2));
    component.close(()=>process.exit(0));
   });
  });
 });
});
