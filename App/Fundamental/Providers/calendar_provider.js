'use strict';
/* IA-TB normalized calendars
   - FED: official FOMC meeting calendar from Federal Reserve
   - Finance Calendar: structured economic releases
   - CME legacy parsers retained only for diagnostics; no live CME scraping
   INFORMATION_ONLY. Expirations remain NOT_CONFIGURED.
*/
var FedWatch=require('./fedwatch_provider'),FinanceCalendar=require('./finance_calendar_provider_v2_4');
var CACHE_MS=10*60*1000,last={at:0,data:null};
function strip(s){return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();}
function uniq(a,keyFn){var seen={},out=[];(a||[]).forEach(function(x){var k=keyFn(x);if(!k||seen[k])return;seen[k]=1;out.push(x)});return out;}
function impactNorm(s){s=String(s||'').toUpperCase();if(/HIGH|MARKET MOVER/.test(s))return'HIGH';if(/MERITS|MEDIUM|EXTRA ATTENTION/.test(s))return'MEDIUM';if(/LOW|MINIMAL/.test(s))return'LOW';return'UNKNOWN';}
var MONTH={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11};
function parseCme(html){
 var txt=strip(html),out=[],year=new Date().getUTCFullYear();
 var re=/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?[\s\S]{0,500}?((?:\d{1,2}:\d{2}\s*(?:AM|PM))|(?:\d{1,2}\s*(?:AM|PM))|N\/A)?\s*(Australia|Brazil|Canada|China|EMU|France|Germany|Global|Hong Kong|India|Italy|Japan|New Zealand|Singapore|South Korea|Switzerland|Taiwan|United Kingdom|United States)[\s:|-]+([^|]{4,120}?)(?=(?:High Impact|Low Impact|Minimal Impact|Merits Extra Attention|Other Key Indicator|\d{1,2}:\d{2}\s*(?:AM|PM)|N\/A|$))/gi,m;
 while((m=re.exec(txt))){
  var monKey=m[1],mo=MONTH[monKey] != null ? MONTH[monKey] : MONTH[monKey.slice(0,3)],day=+m[2],yy=+(m[3]||year),time=String(m[4]||'').trim(),country=String(m[5]||'').trim(),event=String(m[6]||'').replace(/\s+/g,' ').trim(),dt=new Date(Date.UTC(yy,mo,day,0,0,0));
  if(!event||isNaN(dt.getTime()))continue;
  var tail=txt.slice(m.index,m.index+700),imp=(tail.match(/High Impact|Low Impact|Minimal Impact|Merits Extra Attention|Other Key Indicator/i)||[])[0]||'UNKNOWN';
  out.push({id:'CME:'+yy+'-'+String(mo+1).padStart(2,'0')+'-'+String(day).padStart(2,'0')+':'+event.toUpperCase().replace(/[^A-Z0-9]+/g,'_').slice(0,80),calendar:'CME_ECONOMIC_RELEASES',date:dt.toISOString().slice(0,10),timeLabel:time||null,country:country,event:event,impact:impactNorm(imp),source:'CME Group',url:'https://www.cmegroup.com/education/events/economic-releases-calendar'});
  if(out.length>=120)break;
 }
 if(!out.length){
  var dRe=/Showing ['"]?undefined['"]? Matching Events for ["']?(\d{1,2})(?:st|nd|rd|th)\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,]+(20\d{2})/i,dm=txt.match(dRe);
  if(dm){return{events:[],status:'NO_EVENTS_FOR_CURRENT_DATE',pageDate:dm[3]+'-'+String(MONTH[dm[2]]+1).padStart(2,'0')+'-'+String(+dm[1]).padStart(2,'0')};}
 }
 out=uniq(out,function(x){return x.id});
 out.sort(function(a,b){return String(a.date).localeCompare(String(b.date))||String(a.timeLabel||'').localeCompare(String(b.timeLabel||''))});
 return{events:out,status:out.length?'OK':'PARSE_EMPTY',pageDate:null};
}

function expirationType(s){
 s=String(s||'').replace(/\s+/g,' ').trim();
 var u=s.toUpperCase();
 if(/LAST TRADE|EXPIRATION|TERMINATION/.test(u))return'LAST_TRADE';
 if(/SETTLEMENT/.test(u))return'SETTLEMENT';
 if(/FIRST TRADE/.test(u))return'FIRST_TRADE';
 if(/FIRST NOTICE/.test(u))return'FIRST_NOTICE';
 if(/LAST NOTICE/.test(u))return'LAST_NOTICE';
 if(/FIRST DELIVERY/.test(u))return'FIRST_DELIVERY';
 if(/LAST DELIVERY|DELIVERY DATE/.test(u))return'LAST_DELIVERY';
 if(/FIRST POSITION/.test(u))return'FIRST_POSITION';
 if(/LAST POSITION/.test(u))return'LAST_POSITION';
 if(/FIRST HOLDING/.test(u))return'FIRST_HOLDING';
 if(/LAST HOLDING/.test(u))return'LAST_HOLDING';
 return'OTHER';
}
function parseCmeExpirations(html){
 var txt=strip(html),out=[],dateRe=/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?/gi,m,year=new Date().getUTCFullYear(),lastDate=null,lastIdx=0;
 while((m=dateRe.exec(txt))){
  var mon=m[1],mo=MONTH[mon]!=null?MONTH[mon]:MONTH[mon.slice(0,3)],day=+m[2],yy=+(m[3]||year),dt=new Date(Date.UTC(yy,mo,day)),from=m.index,to=Math.min(txt.length,from+1100),part=txt.slice(from,to);
  if(isNaN(dt.getTime()))continue;
  var row=/\b([A-Z0-9]{1,8})\s+([A-Z0-9]{1,8})\s+([^|]{4,110}?)\s+(Agriculture|Energy|Equity Index|FX|Interest Rates|Metals|Cryptocurrencies|Weather|Real Estate|Alternative Investment|Other)\s+([A-Z0-9-]{2,24})\s+(First Trade Date|Last Trade Date(?: \(Expiration & Termination Day\))?|Settlement Date|First Holding Date|Last Holding Date|First Position Date|Last Position Date|First Notice Date|Last Notice Date|First Delivery Date|Last Delivery Date)/gi,r;
  while((r=row.exec(part))){
   var ev=String(r[6]||'').trim(),product=String(r[3]||'').replace(/\s+/g,' ').trim(),date=dt.toISOString().slice(0,10),globex=String(r[2]||'').trim(),clearing=String(r[1]||'').trim();
   out.push({id:'CMEEXP:'+date+':'+globex+':'+String(r[5]||'')+':'+expirationType(ev),calendar:'CME_EXPIRATIONS',date:date,timeLabel:null,country:'Global',event:ev+' · '+product,impact:'MEDIUM',source:'CME Group',url:'https://www.cmegroup.com/tools-information/calendars/expiration-calendar.html',product:product,clearingCode:clearing,globexCode:globex,assetClass:String(r[4]||'').trim(),contract:String(r[5]||'').trim(),tradingEvent:ev,tradingEventType:expirationType(ev)});
  }
  lastDate=dt;lastIdx=m.index;
  if(out.length>=240)break;
 }
 out=uniq(out,function(x){return x.id});
 out.sort(function(a,b){return String(a.date).localeCompare(String(b.date))||String(a.globexCode||'').localeCompare(String(b.globexCode||''));});
 if(out.length)return{events:out,status:'OK',pageDate:null};
 var no=txt.match(/Showing:\s*(\d+)\s*Days[\s\S]{0,500}?Showing ['"]?(?:No|undefined)['"]? Matching Events for ["']?(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,]+(20\d{2})/i);
 if(no){var pmo=MONTH[no[3]]!=null?MONTH[no[3]]:MONTH[no[3].slice(0,3)];return{events:[],status:'NO_EVENTS_FOR_CURRENT_DATE',pageDate:no[4]+'-'+String(pmo+1).padStart(2,'0')+'-'+String(+no[2]).padStart(2,'0')};}
 if(/Expiration Calendar/i.test(txt)&&/Settlement Date|Last Trade Date|Delivery Date/i.test(txt))return{events:[],status:'DYNAMIC_PAGE_NO_ROWS',pageDate:lastDate?lastDate.toISOString().slice(0,10):null};
 return{events:[],status:'PARSE_EMPTY',pageDate:null};
}

// Structured diagnostics: never confuse fetch/parser failures with a genuine empty calendar.
function classifyFetchError(error){
 var msg=String(error&&error.message||error||'');
 if(/\b(?:HTTP\s*(?:401|403|407|429)|access denied|forbidden|captcha|rate.limit|challenge)\b/i.test(msg))return 'HTTP_BLOCKED';
 return 'UNAVAILABLE';
}
function classifyEmptyHtml(html,kind,parseStatus){
 if(parseStatus==='NO_EVENTS_FOR_CURRENT_DATE')return 'NO_EVENTS';
 var raw=String(html||'');
 if(/captcha|challenge.platform|access denied|bot detection|verify you are human|unusual traffic/i.test(raw))return 'HTTP_BLOCKED';
 // A page shell whose calendar rows are injected by client JS cannot be scraped as static HTML.
 if(/(?:__NEXT_DATA__|__NUXT__|<script[^>]+(?:chunk|webpack|runtime|main)[^>]*>)/i.test(raw)&&
   !/Matching Events for|Last Trade Date|Settlement Date/i.test(strip(raw)))return 'JS_RENDER_REQUIRED';
 return 'PARSE_INCOMPATIBLE';
}



function fedEvents(packet){
 var c=(packet&&packet.calendar)||[];
 return c.map(function(x){return{id:'FED:FOMC:'+x.date,calendar:'FED_FOMC',date:x.date,timeLabel:null,country:'United States',event:'FOMC Meeting / Rate Decision',impact:'HIGH',source:'Federal Reserve',url:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'};});
}


exports.collect=function(cb){
 if(last.data&&Date.now()-last.at<CACHE_MS)return process.nextTick(function(){var d=Object.assign({},last.data,{cacheAgeMs:Date.now()-last.at});if(Date.now()-last.at>CACHE_MS/2)d.cacheStatus='STALE_DATA';cb(null,d)});
 var done=0,fed=null,cme=null,expirations=null;
 function finish(){
  if(++done<3)return;
  var all=(fed&&fed.events||[]).concat(cme&&cme.events||[]).concat(expirations&&expirations.events||[]).sort(function(a,b){return String(a.date).localeCompare(String(b.date))||String(a.timeLabel||'').localeCompare(String(b.timeLabel||''));});
  var data={ok:!!((fed&&fed.ok)||(cme&&cme.ok)||(expirations&&expirations.ok)),generatedAt:new Date().toISOString(),calendars:{fed:fed,cme:cme,cmeExpirations:expirations},events:all};
  last={at:Date.now(),data:data};cb(null,data);
 }
 FedWatch.collect(function(e,p){fed=e?{ok:false,status:'UNAVAILABLE',error:String(e.message||e),events:[]}:{ok:true,status:'OK',events:fedEvents(p),url:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'};finish();});
 FinanceCalendar.collect(function(e,p){cme=e?{ok:false,status:'UNAVAILABLE',error:String(e.message||e),events:[]}:p;finish();});
 expirations={ok:false,status:'NOT_CONFIGURED',events:[],source:'CME Group',message:'CME expiry dates require separately licensed reference data'};process.nextTick(finish);
};
exports.invalidate=function(){last={at:0,data:null}};
exports._parseCme=parseCme;exports._parseCmeExpirations=parseCmeExpirations;

exports._classifyFetchError=classifyFetchError;exports._classifyEmptyHtml=classifyEmptyHtml;
