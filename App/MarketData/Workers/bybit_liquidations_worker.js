'use strict';
var parent=require('worker_threads').parentPort,WS=require('../Transport/simple_websocket');
var URL=process.env.IATB_BYBIT_LIQ_WS||'wss://stream.bybit.com/v5/public/linear',ws=null,timer=null,pingTimer=null,statusTimer=null,stopped=false,retries=0,lastEventAt=0,lastHeartbeatAt=0,events=0,lastError='',connections=0,symbols=Object.create(null);

function status(state){parent.postMessage({type:'status',provider:'BYBIT',state:state||((ws&&ws.open)?'ONLINE':'CONNECTING'),events:events,lastEventAt:lastEventAt||null,lastHeartbeatAt:lastHeartbeatAt||null,lastError:lastError||null,retries:retries,connections:connections,subscriptions:Object.keys(symbols)});}
function normSymbol(s){s=String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(/USDT$/.test(s))return s;if(/USDC$/.test(s))return s;if(/USD$/.test(s))return s.slice(0,-3)+'USDT';return s+'USDT';}
function subscribe(list){if(!Array.isArray(list))list=[list];var args=[];list.forEach(function(s){s=normSymbol(s);if(!s||symbols[s])return;symbols[s]=1;args.push('allLiquidation.'+s);});if(args.length&&ws&&ws.open)try{ws.sendJson({op:'subscribe',args:args});}catch(e){lastError=e.message;}}
var normalize=require('../Normalizer/liquidations').bybit;
function connect(){
 if(stopped)return;status('CONNECTING');ws=new WS(URL,{timeout:30000,maxBytes:4*1024*1024});
 ws.on('open',function(){connections++;retries=0;lastError='';var current=Object.keys(symbols);symbols=Object.create(null);subscribe(current);clearInterval(pingTimer);pingTimer=setInterval(function(){try{if(ws&&ws.open)ws.sendJson({op:'ping'});}catch(e){}},20000);clearInterval(statusTimer);statusTimer=setInterval(function(){status();},30000);status('ONLINE');});
 ws.on('message',function(txt){var o;try{o=JSON.parse(txt);}catch(e){return;}if(o&&(o.op==='pong'||String(o.ret_msg||o.retMsg||'').toLowerCase()==='pong'||(o.op==='ping'&&o.success===true))){lastHeartbeatAt=Date.now();return;}if(o&&o.success===false){lastError='BYBIT_WS:'+String(o.ret_msg||o.retMsg||'ERROR');return status('DEGRADED');}normalize(o).forEach(function(x){events++;lastEventAt=Date.now();parent.postMessage({type:'liquidation',event:x});});});
 ws.on('error',function(e){lastError=String(e&&e.message||e);status('DEGRADED');});
 ws.on('close',function(){clearInterval(pingTimer);clearInterval(statusTimer);if(stopped)return;retries++;lastError=lastError||'WEBSOCKET_CLOSED';status('RECONNECTING');clearTimeout(timer);timer=setTimeout(connect,Math.min(30000,1000*Math.pow(2,Math.min(5,retries))));});
}
parent.on('message',function(m){if(!m)return;if(m.op==='stop'){stopped=true;clearTimeout(timer);clearInterval(pingTimer);clearInterval(statusTimer);if(ws)ws.close();status('STOPPED');}else if(m.op==='status')status();else if(m.op==='subscribe')subscribe(m.symbols||m.symbol||[]);});
connect();
