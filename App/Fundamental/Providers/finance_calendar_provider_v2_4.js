'use strict';
// IA-TB v2.4: official documented Finance Calendar JSON. No CME scraping, no API key.
const https=require('node:https');
const BASE='https://www.financecalendar.com/wp-json/fc/v1/calendar';
const ATTR='https://www.financecalendar.com';
const TTL=15*60*1000;
let cache={at:0,data:null},pending=null;
const iso=d=>d.toISOString().slice(0,10);
function normalize(x){
 if(!x||typeof x!=='object'||!/^\d{4}-\d{2}-\d{2}$/.test(String(x.date||''))||!String(x.id||'').trim())return null;
 const date=String(x.date),rawTime=x.release_at_utc||x.time_utc||null;
 const timestamp=typeof rawTime==='string'&&/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(rawTime)&&Number.isFinite(Date.parse(rawTime))&&x.all_day!==true?new Date(rawTime).toISOString():null;
 const country=String(x.country||'').toUpperCase();
 const impact=String(x.impact||'').toUpperCase();
 return {id:'FC:'+String(x.id).slice(0,130),calendar:'FINANCE_CALENDAR',date,
  startAtUtc:timestamp,timeLabel:timestamp?new Date(timestamp).toISOString().slice(11,16)+' UTC':null,
  country:country,countryCode:country,event:String(x.name||x.title||x.series_name||'Economic release').slice(0,200),
  impact:['HIGH','MEDIUM','LOW'].includes(impact)?impact:'UNKNOWN',
  source:'Finance Calendar',sourceName:String(x.source_name||''),sourceUrl:String(x.source_url||''),
  url:String(x.url||ATTR),status:String(x.status||'unknown'),seriesCode:String(x.series_code||''),
  consensus:x.consensus??null,prior:x.prior??null,actual:x.actual??null,unit:x.unit??null,
  period:x.period??null,allDay:x.all_day===true,updatedAt:x.updated_at||null};
}
function parse(payload){
 if(!payload||!Array.isArray(payload.events)||!Number.isSafeInteger(payload.total))throw Error('FINANCE_CALENDAR_SCHEMA_INVALID');
 const events=payload.events.map(normalize).filter(Boolean);
 return {events,total:payload.total,attribution:{source:'financecalendar.com',url:ATTR,terms:payload.attribution&&payload.attribution.terms||'Attribution required'}};
}
function get(url,cb){
 const req=https.get(url,{timeout:12000,headers:{Accept:'application/json','User-Agent':'IA-TB/2.4 EconomicCalendar (+https://www.financecalendar.com)'}},res=>{
  if(res.statusCode!==200){res.resume();return cb(Error('HTTP '+res.statusCode));}
  let n=0,a=[];res.on('data',c=>{n+=c.length;if(n>2*1024*1024){req.destroy(Error('RESPONSE_TOO_LARGE'));return;}a.push(c);});
  res.on('end',()=>{try{cb(null,JSON.parse(Buffer.concat(a).toString('utf8')));}catch(e){cb(e);}});
 });req.on('timeout',()=>req.destroy(Error('TIMEOUT')));req.on('error',cb);
}
function collect(cb){
 if(cache.data&&Date.now()-cache.at<TTL)return process.nextTick(()=>cb(null,{...cache.data,cacheAgeMs:Date.now()-cache.at}));
 if(pending){pending.push(cb);return;}pending=[cb];
 // Current-month backfill plus next 60 days; stays within API's 92-day limit.
 const now=new Date(),from=iso(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)));
 const to=iso(new Date(Date.now()+60*86400000));
 const url=BASE+'?from='+from+'&to='+to+'&limit=500&include=holidays';
 get(url,(err,payload)=>{
  let result=null;
  if(!err)try{const p=parse(payload);if(p.total>p.events.length)throw Error('FINANCE_CALENDAR_PAGINATION_REQUIRED');
   result={ok:true,status:p.events.length?'OK':'NO_EVENTS',events:p.events,attribution:p.attribution,
    url:ATTR,generatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString(),transport:'https-json',total:p.total};
   cache={at:Date.now(),data:result};
  }catch(e){err=e;}
  // Fail closed for fresh data; never fabricate zero events when API failed.
  if(err)result={ok:false,status:/HTTP (?:401|403|429)/.test(err.message)?'HTTP_BLOCKED':'UNAVAILABLE',error:String(err.message).slice(0,160),events:[],url:ATTR,attribution:{source:'financecalendar.com',url:ATTR}};
  const subscribers=pending;pending=null;subscribers.forEach(fn=>fn(null,result));
 });
}
module.exports={collect,normalize,parse,invalidate(){cache={at:0,data:null}},ATTR};
