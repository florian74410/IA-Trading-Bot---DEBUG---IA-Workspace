'use strict';
// QA preload only: synthetic vendor transport, real normalizer/orchestrator,
// real Firewall inspection, real Router and Indicator Engine. Never used by
// the application's normal Dockerfile or service entrypoints.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),{Readable,Writable}=require('node:stream');
const MARKER='FICTIONAL_AUTH21_PROVIDER_FIXTURE_ONLY\n';
function response(url){
 if(url.hostname!=='api.binance.com')throw Error('QA_EXTERNAL_DESTINATION_DENIED');
 if(url.pathname==='/api/v3/exchangeInfo')return {symbols:['BTC','ETH'].map(base=>({symbol:base+'USDT',baseAsset:base,quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true}))};
 if(url.pathname==='/api/v3/klines'){
  const interval=url.searchParams.get('interval')||'1m',steps={'1m':60000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000,'1w':604800000},step=steps[interval];if(!step||!['BTCUSDT','ETHUSDT'].includes(url.searchParams.get('symbol')))throw Error('QA_MARKET_REQUEST_INVALID');const end=Math.floor(Date.now()/step)*step,base=url.searchParams.get('symbol')==='ETHUSDT'?3000:60000;
  return Array.from({length:500},(_,i)=>{const at=end-(499-i)*step,price=base+i+Math.sin(i/5)*10;return [at,String(price),String(price+12),String(price-12),String(price+2),'1000',at+step-1,'100000',100,'500','50000','0'];});
 }
 throw Error('QA_MARKET_ENDPOINT_DENIED');
}
function openaiResponse(raw,headers){
 const body=JSON.parse(raw),auth=Object.entries(headers).find(([k])=>k.toLowerCase()==='authorization')?.[1],owner=auth==='Bearer FICTIONAL_OPENAI_ALICE'?'ALICE':auth==='Bearer FICTIONAL_OPENAI_BOB'?'BOB':null,format=body.text?.format;if(!owner||body.store!==false||format?.type!=='json_schema')throw Error('QA_AI_REQUEST_NOT_SCRIPTED');const message='FICTIONAL_'+owner+'_RESPONSE';let result;
 if(Object.keys(format.schema?.properties||{}).join(',')==='message')result={message};
 else if(format.name==='iatb_owner_health'&&Object.keys(format.schema?.properties||{}).join(',')==='ok,message')result={ok:true,message};
 else if(format.name==='trading_control_v2_multi_exchange')result={message,chart:{symbol:'',interval:'',visible:100,indicators:'',replaceIndicators:false,showLevels:'keep',reset:false},actions:[],gmxAction:'none',gmxDraft:''};
 else if(format.name==='iatb_chart_viewer_v32')result={message,chartSymbol:'',chartInterval:'',strategyTitle:'',strategySummary:'',entry:'',exit:'',risk:'',pineScript:''};
 else throw Error('QA_AI_REQUEST_NOT_SCRIPTED');return {output_text:JSON.stringify(result),usage:{input_tokens:1,output_tokens:2,total_tokens:3}};
}
function install(env=process.env){
 const data=env.IATB_DATA_ROOT,root=data&&path.dirname(data);if((env.IATB_QA_MARKET_FIXTURE==='1')===(env.IATB_QA_AI_FIXTURE==='1')||!root||(root!=='/fixture'&&!/^iatb-auth21-docker-/.test(path.basename(root)))||data!==path.join(root,'data')||fs.realpathSync(data)!==data||fs.readFileSync(path.join(data,'FICTIONAL_FIXTURE_ONLY'),'utf8')!==MARKER)throw Error('QA_FICTIONAL_INSTALLATION_REQUIRED');
 const original=https.request;
 https.request=function(options,callback){const url=typeof options==='string'||options instanceof URL?new URL(options):new URL('https://'+(options.hostname||options.host)+(options.path||'/'));
  if(['localhost','127.0.0.1'].includes(url.hostname))return original.apply(this,arguments);
  let payload,error,chunks=[],size=0;const ai=env.IATB_QA_AI_FIXTURE==='1';try{if(ai){if(url.hostname!=='api.openai.com'||url.pathname!=='/v1/responses'||options.method!=='POST')throw Error('QA_AI_ENDPOINT_DENIED');}else{if(options.method&&options.method!=='GET')throw Error('QA_MARKET_METHOD_DENIED');payload=JSON.stringify(response(url));}}catch(e){error=e;}
  return new Writable({autoDestroy:false,write(chunk,encoding,done){if(!ai)return done(Error('QA_MARKET_BODY_DENIED'));size+=chunk.length;if(size>524288)return done(Error('QA_AI_BODY_TOO_LARGE'));chunks.push(Buffer.from(chunk));done();},final(done){if(ai&&!error)try{payload=JSON.stringify(openaiResponse(Buffer.concat(chunks).toString('utf8'),options.headers||{}));}catch(e){error=e;}done();process.nextTick(()=>{if(error)return this.destroy(error);const res=Readable.from([Buffer.from(payload)]);res.statusCode=200;res.headers={'content-type':'application/json','x-iatb-fixture':'fictional'};res.complete=true;callback(res);});}});
 };
 console.log('AUTH21_FICTIONAL_PROVIDER_TRANSPORT_ENABLED');
 return ()=>{https.request=original;};
}
if(process.env.IATB_QA_MARKET_FIXTURE==='1'||process.env.IATB_QA_AI_FIXTURE==='1')install();
module.exports={install,response,openaiResponse,MARKER};
