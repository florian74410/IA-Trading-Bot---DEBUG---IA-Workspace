'use strict';

function num(v){v=+v;return isFinite(v)?v:null;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function normLevel(x){
 if(Array.isArray(x)){var p=num(x[0]),q=num(x[1]);return p>0&&q>=0?{price:p,size:q,count:num(x[2])}:null;}
 if(x&&typeof x==='object'){var px=num(x.price!=null?x.price:x.px),sz=num(x.size!=null?x.size:x.sz),n=num(x.count!=null?x.count:x.n);return px>0&&sz>=0?{price:px,size:sz,count:n}:null;}
 return null;
}
function normalizeBook(book,depth){
 book=book||{};depth=Math.max(1,Math.min(100,+depth||20));
 var bids=(Array.isArray(book.bids)?book.bids:[]).map(normLevel).filter(Boolean).sort(function(a,b){return b.price-a.price}).slice(0,depth);
 var asks=(Array.isArray(book.asks)?book.asks:[]).map(normLevel).filter(Boolean).sort(function(a,b){return a.price-b.price}).slice(0,depth);
 return{bids:bids,asks:asks};
}
function sideStats(levels){var qty=0,notional=0,weighted=0;levels.forEach(function(x){qty+=x.size;notional+=x.price*x.size;weighted+=x.price*x.size;});return{levels:levels.length,quantity:qty,notional:notional,vwap:qty?weighted/qty:null};}
function orderBook(book,depth){
 var b=normalizeBook(book,depth),bs=sideStats(b.bids),as=sideStats(b.asks),bb=b.bids[0]||null,ba=b.asks[0]||null,mid=bb&&ba?(bb.price+ba.price)/2:null,spread=bb&&ba?ba.price-bb.price:null;
 var total=bs.notional+as.notional,imb=total?(bs.notional-as.notional)/total:0,ratio=as.notional>0?bs.notional/as.notional:(bs.notional>0?null:1);
 return{available:!!(bb&&ba),depth:+depth||20,bestBid:bb?bb.price:null,bestAsk:ba?ba.price:null,midPrice:mid,spread:spread,spreadBps:mid&&spread!=null?spread/mid*10000:null,bid:bs,ask:as,imbalance:clamp(imb,-1,1),imbalancePct:clamp(imb,-1,1)*100,bidAskRatio:ratio,dominantSide:imb>.05?'BID':(imb<-.05?'ASK':'BALANCED'),levels:b};
}
function openInterest(raw,markPrice){
 if(raw&&typeof raw==='object'&&raw.available===false)return{available:false,value:null,notional:null,markPrice:num(raw.markPrice!=null?raw.markPrice:markPrice),reason:'OPEN_INTEREST_UNAVAILABLE'};
 var oi=num(raw&&typeof raw==='object'?raw.value:raw),mark=num(raw&&typeof raw==='object'&&raw.markPrice!=null?raw.markPrice:markPrice);
 if(oi==null||oi<0)return{available:false,value:null,notional:null,markPrice:mark,reason:'OPEN_INTEREST_UNAVAILABLE'};
 return{available:true,value:oi,unit:'BASE',markPrice:mark,notional:mark!=null?oi*mark:null};
}
function depthBand(ob,bps){
 if(!ob||!ob.available||!ob.midPrice)return{bps:bps,bidNotional:0,askNotional:0,totalNotional:0,bidQuantity:0,askQuantity:0};
 var low=ob.midPrice*(1-bps/10000),high=ob.midPrice*(1+bps/10000),bn=0,an=0,bq=0,aq=0;
 ob.levels.bids.forEach(function(x){if(x.price>=low){bn+=x.price*x.size;bq+=x.size;}});
 ob.levels.asks.forEach(function(x){if(x.price<=high){an+=x.price*x.size;aq+=x.size;}});
 return{bps:bps,bidNotional:bn,askNotional:an,totalNotional:bn+an,bidQuantity:bq,askQuantity:aq,imbalance:(bn+an)?(bn-an)/(bn+an):0};
}
function depthBands(ob){
 var out={};[10,25,50,100].forEach(function(bps){out[String(bps)+'bps']=depthBand(ob,bps);});return out;
}
function impact(levels,bestPrice,targetQuote,side){
 targetQuote=Math.max(0,+targetQuote||0);if(!levels||!levels.length||!bestPrice||!targetQuote)return{available:false,targetQuoteUsd:targetQuote,reason:'BOOK_OR_SIZE_UNAVAILABLE'};
 var remain=targetQuote,spent=0,base=0;
 for(var i=0;i<levels.length&&remain>0;i++){var x=levels[i],cap=x.price*x.size,take=Math.min(remain,cap);spent+=take;base+=take/x.price;remain-=take;}
 if(!base||!spent)return{available:false,targetQuoteUsd:targetQuote,reason:'INSUFFICIENT_DEPTH'};
 var avg=spent/base,filledPct=targetQuote?spent/targetQuote*100:0,slip=side==='BUY'?(avg-bestPrice)/bestPrice*10000:(bestPrice-avg)/bestPrice*10000;
 return{available:true,targetQuoteUsd:targetQuote,filledQuoteUsd:spent,filledPct:clamp(filledPct,0,100),averagePrice:avg,impactBps:Math.max(0,slip),complete:remain<=.000001};
}
function executionImpact(ob,sizes){
 sizes=Array.isArray(sizes)?sizes:[1000,10000,100000,1000000];var out={buy:{},sell:{}};
 sizes.forEach(function(v){var k=String(Math.round(v));out.buy[k]=impact(ob&&ob.levels&&ob.levels.asks,ob&&ob.bestAsk,v,'BUY');out.sell[k]=impact(ob&&ob.levels&&ob.levels.bids,ob&&ob.bestBid,v,'SELL');});
 return out;
}
function liquidityScore(ob,bands){
 if(!ob||!ob.available)return{available:false,score:null,grade:'N/D',estimated:true};
 var spread=isFinite(+ob.spreadBps)?+ob.spreadBps:100,spreadScore=clamp(100-spread*8,0,100),d=bands&&bands['100bps']&&+bands['100bps'].totalNotional||0,depthScore=clamp(Math.log(d+1)/Math.log(100000000+1)*100,0,100),balanceScore=clamp((1-Math.abs(+ob.imbalance||0))*100,0,100),score=.35*spreadScore+.45*depthScore+.20*balanceScore;
 return{available:true,score:score,grade:score>=80?'A':score>=65?'B':score>=50?'C':score>=35?'D':'E',estimated:true,components:{spread:spreadScore,depth100bps:depthScore,balance:balanceScore},method:'35% spread + 45% depth ±100bps + 20% balance'};
}
function liquidations(events,windowMs,now){
 events=Array.isArray(events)?events:[];windowMs=Math.max(60000,+windowMs||15*60000);now=+now||Date.now();var from=now-windowMs,longN=0,shortN=0,longQ=0,shortQ=0,longV=0,shortV=0,count=0,last=null;
 events.forEach(function(e){if(!e)return;var t=+(e.time||e.timestamp||0);if(t>0&&t<1e12)t*=1000;if(!isFinite(t)||t<from||t>now+60000)return;var side=String(e.side||'').toUpperCase(),q=num(e.quantity!=null?e.quantity:e.size),p=num(e.price),v=num(e.notional);if(v==null&&q!=null&&p!=null)v=q*p;if(q==null)q=0;if(v==null)v=0;if(side==='LONG'){longN++;longQ+=q;longV+=v;}else if(side==='SHORT'){shortN++;shortQ+=q;shortV+=v;}else return;count++;if(!last||t>last.time)last={time:t,side:side,price:p,quantity:q,notional:v,source:e.source||null};});
 var total=longV+shortV,imb=total?(longV-shortV)/total:0;
 return{available:count>0,windowMs:windowMs,from:from,to:now,count:count,long:{count:longN,quantity:longQ,notional:longV},short:{count:shortN,quantity:shortQ,notional:shortV},imbalance:clamp(imb,-1,1),imbalancePct:clamp(imb,-1,1)*100,last:last,reason:count?null:'NO_LIQUIDATION_EVENTS'};
}
function snapshot(input){
 input=input||{};var ob=orderBook(input.orderBook||{},input.depth||20),oi=openInterest(input.openInterest,input.markPrice||ob.midPrice),bands=depthBands(ob),exec=executionImpact(ob,input.executionSizes),score=liquidityScore(ob,bands),depth100=bands['100bps']&&bands['100bps'].totalNotional||0,stress=oi.available&&oi.notional!=null&&depth100>0?oi.notional/depth100:null;
 return{ok:true,source:input.source||'UNKNOWN',symbol:input.symbol||null,canonicalSymbol:input.canonicalSymbol||input.symbol||null,generatedAt:Date.now(),orderBook:ob,openInterest:oi,bidAskImbalance:{available:ob.available,value:ob.imbalance,percent:ob.imbalancePct,ratio:ob.bidAskRatio,dominantSide:ob.dominantSide,method:'TOP_LEVELS_NOTIONAL'},depthBands:bands,executionImpact:exec,liquidityScore:score,oiToDepth100bps:stress,liquidations:input.liquidations||{available:false,reason:'SOURCE_NOT_AVAILABLE'}};
}
module.exports={normalizeBook:normalizeBook,orderBook:orderBook,openInterest:openInterest,depthBand:depthBand,depthBands:depthBands,executionImpact:executionImpact,liquidityScore:liquidityScore,liquidations:liquidations,snapshot:snapshot};
