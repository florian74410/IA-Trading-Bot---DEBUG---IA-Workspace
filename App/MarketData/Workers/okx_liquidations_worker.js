'use strict';
var parent=require('worker_threads').parentPort,WS=require('../Transport/simple_websocket');
var URL=process.env.IATB_OKX_LIQ_WS||'wss://ws.okx.com:8443/ws/v5/public',ws=null,timer=null,pingTimer=null,statusTimer=null,stopped=false,retries=0,lastEventAt=0,lastHeartbeatAt=0,events=0,lastError='',connections=0;

function status(state){parent.postMessage({type:'status',provider:'OKX',state:state||((ws&&ws.open)?'ONLINE':'CONNECTING'),events:events,lastEventAt:lastEventAt||null,lastHeartbeatAt:lastHeartbeatAt||null,lastError:lastError||null,retries:retries,connections:connections,subscriptions:1});}
var normalize=require('../Normalizer/liquidations').okx;
function connect(){
 if(stopped)return;status('CONNECTING');ws=new WS(URL,{timeout:30000,maxBytes:4*1024*1024});
 ws.on('open',function(){connections++;retries=0;lastError='';try{ws.sendJson({op:'subscribe',args:[{channel:'liquidation-orders',instType:'SWAP'}]});}catch(e){}clearInterval(pingTimer);pingTimer=setInterval(function(){try{if(ws&&ws.open)ws.send('ping');}catch(e){}},20000);clearInterval(statusTimer);statusTimer=setInterval(function(){status();},30000);status('ONLINE');});
 ws.on('message',function(txt){if(txt==='pong'){lastHeartbeatAt=Date.now();return;}var o;try{o=JSON.parse(txt);}catch(e){return;}if(o&&o.event==='error'){lastError='OKX_'+String(o.code||'WS')+':'+String(o.msg||'');return status('DEGRADED');}normalize(o).forEach(function(x){events++;lastEventAt=Date.now();parent.postMessage({type:'liquidation',event:x});});});
 ws.on('error',function(e){lastError=String(e&&e.message||e);status('DEGRADED');});
 ws.on('close',function(){clearInterval(pingTimer);clearInterval(statusTimer);if(stopped)return;retries++;lastError=lastError||'WEBSOCKET_CLOSED';status('RECONNECTING');clearTimeout(timer);timer=setTimeout(connect,Math.min(30000,1000*Math.pow(2,Math.min(5,retries))));});
}
parent.on('message',function(m){if(m&&m.op==='stop'){stopped=true;clearTimeout(timer);clearInterval(pingTimer);clearInterval(statusTimer);if(ws)ws.close();status('STOPPED');}else if(m&&m.op==='status')status();});
connect();
