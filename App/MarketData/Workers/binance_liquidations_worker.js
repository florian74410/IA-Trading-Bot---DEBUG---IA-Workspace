'use strict';
var parent=require('worker_threads').parentPort,WS=require('../Transport/simple_websocket');
var URL=process.env.IATB_BINANCE_LIQ_WS||'wss://fstream.binance.com/ws/!forceOrder@arr',ws=null,timer=null,pingTimer=null,statusTimer=null,stopped=false,retries=0,lastEventAt=0,lastHeartbeatAt=0,events=0,lastError='',connections=0;

function status(state){parent.postMessage({type:'status',provider:'BINANCE_FUTURES',state:state||((ws&&ws.open)?'ONLINE':'CONNECTING'),events:events,lastEventAt:lastEventAt||null,lastHeartbeatAt:lastHeartbeatAt||null,lastError:lastError||null,retries:retries,connections:connections,subscriptions:1});}
var normalize=require('../Normalizer/liquidations').binance;
function connect(){
 if(stopped)return;status('CONNECTING');ws=new WS(URL,{timeout:30000,maxBytes:2*1024*1024});
 ws.on('open',function(){connections++;retries=0;lastError='';clearInterval(pingTimer);pingTimer=setInterval(function(){try{if(ws&&ws.open)ws.ping('iatb');}catch(e){}},20000);clearInterval(statusTimer);statusTimer=setInterval(function(){status();},30000);status('ONLINE');});
 ws.on('pong',function(){lastHeartbeatAt=Date.now();});
 ws.on('message',function(txt){var o;try{o=JSON.parse(txt);}catch(e){return;}var rows=normalize(o);if(!rows)return;if(!Array.isArray(rows))rows=[rows];rows.forEach(function(x){if(!x)return;events++;lastEventAt=Date.now();parent.postMessage({type:'liquidation',event:x});});});
 ws.on('error',function(e){lastError=String(e&&e.message||e);status('DEGRADED');});
 ws.on('close',function(){clearInterval(pingTimer);clearInterval(statusTimer);if(stopped)return;retries++;lastError=lastError||'WEBSOCKET_CLOSED';status('RECONNECTING');clearTimeout(timer);timer=setTimeout(connect,Math.min(30000,1000*Math.pow(2,Math.min(5,retries))));});
}
parent.on('message',function(m){if(m&&m.op==='stop'){stopped=true;clearTimeout(timer);clearInterval(pingTimer);clearInterval(statusTimer);if(ws)ws.close();status('STOPPED');}else if(m&&m.op==='status')status();});
connect();
