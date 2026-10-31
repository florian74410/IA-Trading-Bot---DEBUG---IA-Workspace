/* IA-TB v2.2.5 Globe expanded UI — additive component, no data acquisition.
 * Supply real events and the existing globe renderer via options.renderGlobe.
 */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.IATBExpandedGlobe=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var CATEGORIES=['CRYPTO','DEFI','MACRO','REGULATION','SECURITY'],COLORS={CRYPTO:'#ff911e',DEFI:'#af52ff',MACRO:'#12d796',REGULATION:'#ffc72c',SECURITY:'#ff4357'};
function str(v){return typeof v==='string'?v.trim():'';}
function asDate(v){if(typeof v!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(v))return null;var t=Date.parse(v);return Number.isFinite(t)?t:null;}
function url(v){if(typeof v!=='string'||!/^https:\/\//i.test(v))return null;try{var u=new URL(v);return u.protocol==='https:'?u.href:null;}catch(e){return null;}}
function normalize(x){
 if(!x||typeof x!=='object'||!str(x.id)||!str(x.title))return null;
 var cat=str(x.category).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 if(cat==='REGLEMENTATION'||cat==='REGULATION')cat='REGULATION';
 if(cat==='SECURITE'||cat==='SECURITY')cat='SECURITY';
 if(CATEGORIES.indexOf(cat)<0)cat='OTHER';
 var at=asDate(x.publishedAt||x.published_at||'');
 if(at===null)return null;
 var lat=Number(x.latitude),lon=Number(x.longitude),coords=x.latitude!==null&&x.latitude!==undefined&&x.longitude!==null&&x.longitude!==undefined&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
 return {id:str(x.id),title:str(x.title),summary:str(x.summary),category:cat,at:at,
 countryCode:/^[A-Z]{2}$/.test(str(x.countryCode).toUpperCase())?str(x.countryCode).toUpperCase():null,
 country:str(x.countryName||x.country),city:str(x.city),locationQuality:['EXACT','REGION'].includes(x.locationQuality)?x.locationQuality:'UNKNOWN',latitude:coords?lat:null,longitude:coords?lon:null,
 href:url(x.url),imageUrl:url(x.imageUrl),source:str(x.source)};
}
function unique(events){var seen=new Set();return(events||[]).map(normalize).filter(function(x){if(!x||seen.has(x.id))return false;seen.add(x.id);return true;});}
function filter(events,opts,now){
 opts=opts||{};now=Number.isFinite(now)?now:Date.now();var span={today:86400000,week:604800000,month:2592000000}[opts.period]||86400000,cat=opts.category||'TOP';
 return (events||[]).filter(function(e){return e.at<=now&&e.at>=now-span&&(cat==='TOP'||e.category===cat);}).sort(function(a,b){return b.at-a.at||a.id.localeCompare(b.id);});
}
function summary(events){var counts={},countries=new Set(),regions=new Set(),pins=0;
 CATEGORIES.forEach(function(c){counts[c]=0;});
 events.forEach(function(e){if(counts[e.category]!==undefined)counts[e.category]++;if(e.countryCode)countries.add(e.countryCode);if(e.country)regions.add(e.country);if(e.latitude!==null&&e.longitude!==null)pins++;});
 return {events:events.length,byCategory:counts,countries:countries.size,regions:regions.size,pins:pins};
}
function flag(cc){if(!cc||!/^[A-Z]{2}$/.test(cc))return '🌐';return String.fromCodePoint(cc.charCodeAt(0)+127397,cc.charCodeAt(1)+127397);}
function el(doc,tag,cls,txt){var n=doc.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n;}
function mount(host,options){
 if(!host||!host.ownerDocument)throw Error('GLOBE_HOST_REQUIRED');
 options=options||{};var doc=host.ownerDocument,events=unique(options.events),period=['today','week','month'].includes(options.initialPeriod)?options.initialPeriod:'today',category=['TOP'].concat(CATEGORIES).includes(options.initialCategory)?options.initialCategory:'TOP',selected=null;
 var overlay=el(doc,'section','iatb-globe-expanded');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Terre · News géolocalisées');
 var header=el(doc,'header','iatb-ge-head'),heading=el(doc,'div','iatb-ge-heading'),close=el(doc,'button','iatb-ge-close','×');close.type='button';close.setAttribute('aria-label','Fermer le globe agrandi');
 heading.append(el(doc,'small','','GLOBAL FUNDAMENTAL RADAR'),el(doc,'h2','','Terre · News géolocalisées'));header.append(heading,close);
 var nav=el(doc,'nav','iatb-ge-filters'),left=el(doc,'aside','iatb-ge-stats'),center=el(doc,'div','iatb-ge-globe'),right=el(doc,'aside','iatb-ge-news'),body=el(doc,'div','iatb-ge-body'),slot=el(doc,'div','iatb-ge-renderer'),legend=el(doc,'div','iatb-ge-legend'),status=el(doc,'p','iatb-ge-renderer-status');
 center.append(slot,status,legend);body.append(left,center,right);overlay.append(header,nav,body);host.append(overlay);
 var previousFocus=doc.activeElement,renderCleanup=null;
 function button(label,callback,active){var b=el(doc,'button',active?'iatb-ge-active':'',label);b.type='button';b.setAttribute('aria-pressed',active?'true':'false');b.addEventListener('click',callback);return b;}
 function render(){
  nav.replaceChildren();['TOP'].concat(CATEGORIES).forEach(function(c){nav.append(button(c,function(){category=c;selected=null;render();},category===c));});
  ['today','week','month'].forEach(function(p){nav.append(button({today:"Aujourd'hui",week:'Semaine',month:'Mois'}[p],function(){period=p;selected=null;render();},period===p));});
  var visible=filter(events,{category:category,period:period},options.now),stats=summary(filter(events,{category:'TOP',period:period},options.now));
  left.replaceChildren(el(doc,'h3','','Événements'),el(doc,'div','iatb-ge-total',visible.length+' affichés · '+stats.events+' dans la période'));
  CATEGORIES.forEach(function(c){var row=el(doc,'div','iatb-ge-stat');row.append(el(doc,'span','',c),el(doc,'strong','',stats.byCategory[c]));left.append(row);});
  left.append(el(doc,'h3','','Couverture géographique'),el(doc,'p','',stats.countries+' pays · '+stats.pins+' repères géolocalisés'));
  right.replaceChildren(el(doc,'h3','','Derniers événements'));
  if(!visible.length)right.append(el(doc,'p','iatb-ge-empty','Aucun événement pour ce filtre.'));
  visible.slice(0,50).forEach(function(e){var b=el(doc,'button','iatb-ge-event'+(selected===e.id?' iatb-ge-selected':''));b.type='button';b.dataset.eventId=e.id;b.append(el(doc,'small','iatb-ge-event-domain','● '+e.category+' · '+(e.source||'Source inconnue')),el(doc,'strong','',flag(e.countryCode)+' '+e.title),el(doc,'span','',e.summary||'Résumé indisponible'),el(doc,'small','',([e.city,e.country].filter(Boolean).join(', ')||'Lieu non précisé')+(e.locationQuality==='REGION'?' · position indicative':'')+' · '+new Date(e.at).toLocaleString('fr-FR')));b.addEventListener('click',function(){selected=e.id;if(typeof options.onSelect==='function')options.onSelect(e);render();});right.append(b);});var chosen=visible.find(function(e){return e.id===selected});if(chosen){var details=el(doc,'section','iatb-ge-detail');details.append(el(doc,'h3','','Détail de l’événement'),el(doc,'strong','',flag(chosen.countryCode)+' '+chosen.title),el(doc,'p','',chosen.summary||'Résumé non disponible'),el(doc,'small','',([chosen.city,chosen.country].filter(Boolean).join(', ')||'Localisation non précisée')+(chosen.locationQuality==='REGION'?' · position indicative':'')+' · '+new Date(chosen.at).toLocaleString('fr-FR')));if(chosen.href){var link=el(doc,'a','iatb-ge-source','Consulter la source ↗');link.href=chosen.href;link.target='_blank';link.rel='noopener noreferrer';details.append(link)}right.append(details)}
  legend.replaceChildren();CATEGORIES.forEach(function(c){var item=el(doc,'span','', '● '+c);item.style.color=COLORS[c];legend.append(item);});
  var located=visible.filter(function(e){return e.latitude!==null&&e.longitude!==null;}).length;status.textContent=typeof options.renderGlobe!=='function'?'Le renderer Globe existant doit être raccordé ici.':located===0&&visible.length?'Aucun emplacement vérifiable parmi '+visible.length+' publication(s) : aucun marqueur fictif.':located<visible.length?located+' repères géolocalisés sur '+visible.length+' événement(s)':' ';
  if(typeof options.updateGlobe==='function')options.updateGlobe(visible.filter(function(e){return e.latitude!==null&&e.longitude!==null;}),{selected:selected,category:category,period:period});
 }
 function keydown(e){if(e.key==='Escape'){e.preventDefault();destroy();}if(e.key==='Tab'){var f=overlay.querySelectorAll('button');if(!f.length)return;var first=f[0],last=f[f.length-1];if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}}}
 function destroy(){doc.removeEventListener('keydown',keydown);if(typeof renderCleanup==='function')renderCleanup();overlay.remove();if(previousFocus&&typeof previousFocus.focus==='function')previousFocus.focus();if(typeof options.onClose==='function')options.onClose();}
 var controls=el(doc,'div','iatb-ge-zoom');controls.append(button('+',function(){if(typeof options.onZoom==='function')options.onZoom(-1)},false),button('−',function(){if(typeof options.onZoom==='function')options.onZoom(1)},false),button('◎',function(){if(typeof options.onReset==='function')options.onReset()},false));center.append(controls);
 close.addEventListener('click',destroy);doc.addEventListener('keydown',keydown);
 if(typeof options.renderGlobe==='function')renderCleanup=options.renderGlobe(slot)||null;
 render();close.focus();
 return {updateEvents:function(next){events=unique(next);render();},destroy:destroy,element:overlay};
}
return {normalize:normalize,unique:unique,filter:filter,summary:summary,flag:flag,mount:mount,COLORS:COLORS};
});
