/* IA-TB v2.2.5 — one real Fundamental news stream shared by compact and expanded Globe. */
(function(){
'use strict';
var raw=[],mini=null,expanded=null,miniHost=null,miniVisible=true,selectedMini='ALL',periodMini='WEEK',hoverMini=null;
var COLORS={CRYPTO:'#ff932b',DEFI:'#b75cff',MACRO:'#18d6a2',REGULATION:'#fbc84a',SECURITY:'#ff586c',OTHER:'#65bfe7'};
function safe(v){return String(v==null?'':v).replace(/[&<>"']/g,function(k){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]})}
function pointInfo(p){return '<div style="background:#061d2c;border:1px solid #1787b7;border-radius:7px;padding:7px 10px;color:#daf3ff;font:12px sans-serif"><b>'+safe(p.title||p.category||'News')+'</b><div>'+safe(p.country||'')+(p.locationQuality==='REGION'?' · position indicative':'')+'</div></div>'}
function category(x){
 var value=String(x.category||x.content_class||x.domain||'').toUpperCase().trim();
 var aliases={REGLEMENTATION:'REGULATION',REGULATORY:'REGULATION',SECURITE:'SECURITY',MONETARY:'MACRO'};
 value=aliases[value]||value;
 if(['CRYPTO','DEFI','MACRO','REGULATION','SECURITY'].includes(value))return value;
 var txt=[value,x.title,x.headline,x.summary].join(' ').toUpperCase();
 if(/SECURITY|EXPLOIT|HACK|ATTACK|VULNERAB|BREACH/.test(txt))return'SECURITY';
 if(/REGUL|MICA|\bSEC\b|CFTC|COMPLIANCE/.test(txt))return'REGULATION';
 if(/DEFI|DEX|LENDING|STAKING/.test(txt))return'DEFI';
 if(/MACRO|FED|FOMC|ECB|INFLATION|CPI|INTEREST RATE|MONETARY/.test(txt))return'MACRO';
 if(/CRYPTO|BITCOIN|ETHEREUM|BLOCKCHAIN|ETF|BTC|\bETH\b/.test(txt))return'CRYPTO';
 return'OTHER';
}
function timestamp(x){
 var d=x.published_at??x.publishedAt??x.collected_at??x.timestamp;
 if(d==null||d==='')return null;
 var date=typeof d==='number'?new Date(d<1e11?d*1000:d):new Date(d);
 return Number.isFinite(date.getTime())?date.toISOString():null;
}
function safeId(x,i){return String(x.id==null?'NEWS_'+i:x.id)}
function coordinates(x){var lat=x.latitude??x.lat??x.geo?.latitude,lon=x.longitude??x.lon??x.geo?.longitude;if(lat==null||lon==null||lat===''||lon==='')return null;lat=Number(lat);lon=Number(lon);return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{latitude:lat,longitude:lon}:null}
var REGIONS=[
 {re:/\b(?:UNITED STATES|USA|U\.S\.A\.|WASHINGTON|FEDERAL RESERVE|FOMC|SECURITIES AND EXCHANGE COMMISSION|\bSEC\b)\b/i,cc:'US',country:'États-Unis',lat:39.8,lon:-98.6},
 {re:/\b(?:FRANCE|PARIS|AMF FRANCE)\b/i,cc:'FR',country:'France',lat:46.2,lon:2.2},
 {re:/\b(?:GERMANY|ALLEMAGNE|FRANKFURT|BERLIN)\b/i,cc:'DE',country:'Allemagne',lat:51.1,lon:10.4},
 {re:/\b(?:EUROPEAN UNION|EUROPEAN CENTRAL BANK|\bECB\b|\bBCE\b|\bMICA\b|BRUSSELS)\b/i,cc:'EU',country:'Union européenne',lat:50.8,lon:4.35},
 {re:/\b(?:UNITED KINGDOM|BRITAIN|LONDON|BANK OF ENGLAND|\bBOE\b)\b/i,cc:'GB',country:'Royaume-Uni',lat:54,lon:-2},
 {re:/\b(?:JAPAN|TOKYO|BANK OF JAPAN|\bBOJ\b)\b/i,cc:'JP',country:'Japon',lat:36.2,lon:138.2},
 {re:/\b(?:CHINA|BEIJING|\bPBOC\b)\b/i,cc:'CN',country:'Chine',lat:35.9,lon:104.2},
 {re:/\b(?:SINGAPORE|SINGAPOUR)\b/i,cc:'SG',country:'Singapour',lat:1.35,lon:103.82},
 {re:/\b(?:AUSTRALIA|AUSTRALIE|SYDNEY)\b/i,cc:'AU',country:'Australie',lat:-25.3,lon:133.8},
 {re:/\b(?:SWITZERLAND|SUISSE|ZURICH)\b/i,cc:'CH',country:'Suisse',lat:46.8,lon:8.2}
];
function locate(x){var explicit=coordinates(x);if(explicit)return{pos:explicit,quality:'EXACT',country:String(x.country||x.country_name||''),cc:String(x.country_code||x.countryCode||'').toUpperCase()};var text=[x.location,x.country,x.country_name,x.city,x.title,String(x.summary||'').slice(0,900)].filter(Boolean).join(' '),code=String(x.country_code||x.countryCode||'').toUpperCase();for(var i=0;i<REGIONS.length;i++){var g=REGIONS[i];if(g.re.test(text)||(code&&code===g.cc))return{pos:{latitude:g.lat,longitude:g.lon},quality:'REGION',country:g.country,cc:g.cc}}return{pos:null,quality:'UNKNOWN',country:'',cc:''}}
function adapt(x,i){var when=timestamp(x);if(!when)return null;var geo=locate(x),loc=geo.pos,country=geo.country,cc=geo.cc;return{id:safeId(x,i),title:String(x.title||x.headline||'Publication fondamentale'),summary:String(x.summary||''),category:category(x),publishedAt:when,latitude:loc?loc.latitude:null,longitude:loc?loc.longitude:null,country:country,countryCode:/^[A-Z]{2}$/.test(cc)?cc:null,locationQuality:geo.quality,city:String(x.city||''),source:String(x.source_name||x.source||''),url:String(x.url||x.link||''),raw:x};}
function events(){return raw.map(adapt).filter(Boolean)}
function pts(arr){return arr.filter(function(e){return e.latitude!=null&&e.longitude!=null})}
function hours(){return{DAY:86400000,WEEK:604800000,MONTH:2592000000}[periodMini]||604800000}
function visible(){var now=Date.now();return events().filter(function(e){var when=Date.parse(e.publishedAt);return when<=now&&when>=now-hours()&&(selectedMini==='ALL'||e.category===selectedMini)})}
function pinSize(p){return p&&p.id===hoverMini?1.08:.64}
function initMini(){if(mini||!window.Globe)return;miniHost=document.getElementById('fundamentalGlobeWebGL');var canvas=document.getElementById('fundamentalGlobe');if(!miniHost||!canvas)return;try{mini=window.Globe()(miniHost).backgroundColor('rgba(0,0,0,0)').globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg').bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png').showAtmosphere(true).atmosphereColor('#3fa8fa').atmosphereAltitude(.12).onPointClick(function(p){if(p&&p.ref)window.dispatchEvent(new CustomEvent('fundamental-globe-select',{detail:{event:p.ref,domain:p.category,region:p.country||p.city||'GLOBAL'}}))}).onPointHover(function(p){var next=p&&p.id||null;if(next===hoverMini)return;hoverMini=next;if(mini)mini.pointRadius(pinSize);});var ctrl=mini.controls();ctrl.enableDamping=true;ctrl.autoRotate=true;ctrl.autoRotateSpeed=.45;ctrl.enablePan=false;ctrl.enableZoom=false;mini.pointOfView({lat:25,lng:0,altitude:2.2},0);mini.pointsData([]).pointLat('latitude').pointLng('longitude').pointAltitude(.018).pointRadius(pinSize).pointColor(function(p){return COLORS[p.category]||COLORS.OTHER}).pointResolution(8).pointLabel(pointInfo);var resize=function(){if(!miniHost||!mini)return;var box=miniHost.getBoundingClientRect(),n=Math.round(Math.min(box.width||280,box.height||280));if(n>40)mini.width(n).height(n);};resize();window.addEventListener('resize',resize);if(window.ResizeObserver)new ResizeObserver(resize).observe(miniHost);if(window.IntersectionObserver)new IntersectionObserver(function(entries){miniVisible=entries[0].isIntersecting;miniVisible?mini.resumeAnimation():mini.pauseAnimation()},{threshold:.01}).observe(miniHost);canvas.style.visibility='hidden';miniHost.classList.add('ready');drawMini();}catch(e){mini=null;miniHost.classList.remove('ready');canvas.style.visibility='visible';}}
function drawMini(){if(!mini)return;mini.pointsData(pts(visible()).map(function(e){return Object.assign({ref:e.raw},e)}));}
function initExpanded(){var open=document.getElementById('openEarthRadar');if(!open||!window.IATBExpandedGlobe||!window.Globe)return;
 open.addEventListener('click',function(ev){ev.stopImmediatePropagation();ev.preventDefault();if(expanded)return;var globe=null,api=null;if(mini)mini.pauseAnimation();expanded=window.IATBExpandedGlobe.mount(document.body,{events:events(),initialPeriod:({DAY:'today',WEEK:'week',MONTH:'month'}[periodMini]||'week'),initialCategory:selectedMini==='ALL'?'TOP':selectedMini,renderGlobe:function(slot){globe=window.Globe()(slot).globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg').bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png').backgroundColor('rgba(0,0,0,0)').showAtmosphere(true).atmosphereColor('#489cfa').pointLat('latitude').pointLng('longitude').pointAltitude(.025).pointRadius(.65).pointColor(function(p){return COLORS[p.category]||COLORS.OTHER}).pointLabel(pointInfo).onPointClick(function(p){if(p){var list=expanded&&expanded.element&&expanded.element.querySelectorAll('.iatb-ge-event');if(list)Array.prototype.forEach.call(list,function(b){if(b.dataset.eventId===p.id)b.click()});}});var rect=slot.getBoundingClientRect();globe.width(Math.max(280,rect.width)).height(Math.max(340,rect.height));globe.pointOfView({lat:20,lng:0,altitude:2},0);var ctl=globe.controls();ctl.enableDamping=true;ctl.enablePan=false;var obs=window.ResizeObserver?new ResizeObserver(function(){var r=slot.getBoundingClientRect();if(globe&&r.width>0&&r.height>0)globe.width(r.width).height(r.height)}):null;if(obs)obs.observe(slot);return function(){if(obs)obs.disconnect();if(globe){globe.pauseAnimation();if(globe._destructor)globe._destructor();globe=null;}};},updateGlobe:function(list){if(globe)globe.pointsData(list);},onClose:function(){expanded=null;if(mini&&miniVisible)mini.resumeAnimation();},onZoom:function(direction){if(!globe)return;var p=globe.pointOfView();globe.pointOfView({lat:p.lat,lng:p.lng,altitude:Math.max(.6,Math.min(4,(p.altitude||2)*(direction<0?.77:1.3)))},300);},onReset:function(){if(globe)globe.pointOfView({lat:20,lng:0,altitude:2},450);},onSelect:function(e){if(globe&&e.latitude!=null)globe.pointOfView({lat:e.latitude,lng:e.longitude,altitude:1.5},700);}});
 },true);
}
function setup(){initMini();initExpanded();var stage=document.querySelector('.marketPanel .globeStage'),expand=document.getElementById('openEarthRadar');if(stage&&expand)stage.addEventListener('dblclick',function(e){e.preventDefault();e.stopImmediatePropagation();expand.click();},true);document.querySelectorAll('[data-radar-domain]').forEach(function(b){b.addEventListener('click',function(){selectedMini=b.getAttribute('data-radar-domain')||'ALL';drawMini()})});document.querySelectorAll('[data-globe-period]').forEach(function(b){b.addEventListener('click',function(){periodMini=b.getAttribute('data-globe-period')||'WEEK';drawMini()})});window.addEventListener('iatb-fundamental-news',function(e){raw=e.detail?.items||[];drawMini();if(!mini&&window.FundamentalGlobe){var fallback=visible().filter(function(x){return x.latitude!=null&&x.longitude!=null}).map(function(x){return {timestamp:x.publishedAt,event:x.category,data:{latitude:x.latitude,longitude:x.longitude,category:x.category,title:x.title,message:x.title,source:x.source,country:x.country,url:x.url}}});window.FundamentalGlobe.setEvents(fallback)}if(expanded)expanded.updateEvents(events());});}
if(typeof module==='object'&&module.exports){module.exports={adapt:adapt,category:category,locate:locate,timestamp:timestamp};}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();}
})();