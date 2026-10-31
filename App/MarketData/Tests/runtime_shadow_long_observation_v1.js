'use strict';
var fs=require('fs'),path=require('path'),CPClient=require('../../Core/Communication/cp1_client');
var ROOT=path.resolve(__dirname,'../..'),OUT=process.env.IATB_LONG_RUN_DIR||path.join(ROOT,'.runtime','long-shadow');
var minutes=Math.max(10,Math.min(180,+process.env.IATB_LONG_RUN_MINUTES||60)),intervalMs=Math.max(60000,+process.env.IATB_LONG_RUN_INTERVAL_MS||300000);
var cp=new CPClient({root:ROOT,routerPort:+process.env.ROUTER_PORT||8021,timeout:20000,maxBytes:4*1024*1024});
var startedAt=Date.now(),endAt=startedAt+minutes*60000,cycle=0,ok=0,soft=0,errors=[];

fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(path.join(OUT,'long_run_start_ms.txt'),String(startedAt));

function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
function call(target,action,args,allowed){
 return new Promise(function(resolve){
  var t=Date.now();
  cp.request(target,action,args||{},'analysis',function(e,o){
   var row={at:Date.now(),cycle:cycle,target:target,action:action,latencyMs:Date.now()-t,ok:!e};
   if(e){
    row.error=String(e.message||e);
    var isSoft=(allowed||[]).some(function(x){return row.error.indexOf(x)>=0;});
    if(isSoft){soft++;row.soft=true;}else{errors.push(row);console.log('[LONG ERROR]',JSON.stringify(row));}
   }else ok++;
   console.log('[LONG]',JSON.stringify(row));
   resolve(row);
  });
 });
}
async function oneCycle(){
 cycle++;
 console.log('\n=== LONG SHADOW CYCLE '+cycle+' ===');
 await call('marketdata','marketdata.health',{});
 await call('marketdata','marketdata.financial.snapshot',{force:false});
 await call('marketdata','marketdata.asset.price',{symbol:'BTC',currency:'usd'},['429','TIMEOUT']);
 await call('marketdata','marketdata.candles',{symbol:'BTCUSD',timeframe:'1h',limit:180,force:false,source:'OKX'});
 await call('marketdata','marketdata.microstructure.snapshot',{symbol:'BTCUSD',source:'OKX',depth:20,force:false});
 await call('marketdata','marketdata.derivatives.open_interest',{symbol:'BTCUSD',sources:['OKX','BYBIT','HYPERLIQUID']},['403','451','429','UNAVAILABLE']);
 await call('marketdata','marketdata.dex.liquidity.snapshot',{symbol:'BTCUSD',force:false},['429','UNAVAILABLE']);
 await call('indicator','indicator.financial_context',{scope:'ALL'});
 await call('liquidity','liquidity.financial',{scope:'ALL'});
 await call('marketdata','marketdata.liquidations.streams',{});
}
(async function(){
 while(Date.now()<endAt){
  await oneCycle();
  var left=endAt-Date.now();if(left<=0)break;
  await sleep(Math.min(intervalMs,left));
 }
 var report={schema:'iatb.marketdata.long-shadow/1.0',startedAt:startedAt,endedAt:Date.now(),minutes:minutes,intervalMs:intervalMs,cycles:cycle,success:ok,softFailures:soft,hardFailures:errors.length,errors:errors};
 fs.writeFileSync(path.join(OUT,'long_run_report.json'),JSON.stringify(report,null,2));
 console.log('\n=== LONG SHADOW COMPLETE ===');
 console.log(JSON.stringify(report,null,2));
 process.exitCode=errors.length?1:0;
})().catch(function(e){console.error(e&&e.stack||e);process.exit(1);});
