(function(){'use strict';

var state={
 exchanges:[
  {id:'binance',name:'Binance',icon:'◆',brand:'binance',status:'En ligne',latency:8,liquidity:'Très élevée',api:'API OK'},
  {id:'coinbase',name:'Coinbase',icon:'C',brand:'coinbase',status:'En ligne',latency:12,liquidity:'Élevée',api:'API OK'},
  {id:'kraken',name:'Kraken',icon:'K',brand:'kraken',status:'En ligne',latency:18,liquidity:'Élevée',api:'API OK'},
  {id:'okx',name:'OKX',icon:'✣',brand:'okx',status:'En ligne',latency:15,liquidity:'Moyenne',api:'API OK'},
  {id:'gmx',name:'GMX (DEX)',icon:'▲',brand:'gmx',status:'Dégradé',latency:22,liquidity:'Moyenne',api:'API OK'}
 ],
 oracles:[
  {id:'chainlink',name:'Chainlink',icon:'⬡',brand:'chainlink',status:'En ligne',latency:3,uptime:99.98},
  {id:'pyth',name:'Pyth Network',icon:'P',brand:'pyth',status:'En ligne',latency:7,uptime:99.95},
  {id:'gmxoracle',name:'GMX Oracle',icon:'▲',brand:'gmx',status:'En ligne',latency:12,uptime:99.90},
  {id:'arbitrum',name:'Arbitrum Bridge',icon:'A',brand:'arbitrum',status:'En ligne',latency:18,uptime:99.92}
 ],
 engines:{router:5,market:3,indicator:7,strategy:9,trading:6,risk:4,portfolio:8,fundamental:12,supervisor:6,ui:3},
 summary:[
  {icon:'⇄',value:'5',label:'Exchanges suivis'},
  {icon:'⚙',value:'9',label:'Engines actifs'},
  {icon:'⛓',value:'4',label:'Oracles surveillés'},
  {icon:'↔',value:'2',label:'Bridges actifs'},
  {icon:'◔',value:'11 ms',label:'Temps moyen API'},
  {icon:'◷',value:'99.96%',label:'Uptime global',good:true}
 ],
 adoption:{
  labels:['1 Mars','4 Mars','7 Mars','10 Mars','13 Mars','16 Mars','19 Mars','22 Mars','25 Mars','28 Mars','31 Mars'],
  users:[18,23,28,31,35,39,36,38,42,48,58],
  volume:[20,24,28,33,36,44,46,49,55,59,62],
  defi:[42,52,53,60,58,64,67,66,72,74,77]
 },
 cefi:{
  shares:[],volume:[],exchanges:[],assets:[],
  health:[['Données','Chargement…','warn']]
 },
 defi:{
  shares:[],volume:[],protocols:[],stableIn:[],stableOut:[],networks:[]
 }
};
state.cefi={shares:[],volume:[],volumeHistory:[],volumeRange:'24H',exchanges:[],assets:[],health:[]};
state.defi={shares:[],volume:[],volumeHistory:[],volumeDaily:[],volumeRange:'24H',protocols:[],protocolsRaw:[],stableIn:[],stableOut:[],networks:[],yieldPools:[],dexFeeProtocols:[],swapLiquidity:null,leaders:null};
state.ui={showAllExchanges:false,showAllOracles:false,errors:{},inflight:{},wanted:{},lastKey:{},lastAt:{}};
state.data={snapshot:{},cefiHistory:null,defiHistory:null,oi:null,liq:null,dex:null,streams:null};
state.adoptionRange='30J';
state.oracleCatalog=[
 {id:'redstone',name:'RedStone Oracle',icon:'R',brand:'',status:'Référencé',latency:null,uptime:null,kind:'oracle'},
 {id:'api3',name:'API3 Oracle',icon:'3',brand:'',status:'Référencé',latency:null,uptime:null,kind:'oracle'},
 {id:'wormhole',name:'Wormhole Bridge',icon:'W',brand:'',status:'Référencé',latency:null,uptime:null,kind:'bridge'},
 {id:'layerzero',name:'LayerZero Bridge',icon:'L',brand:'',status:'Référencé',latency:null,uptime:null,kind:'bridge'}
];

function number(v){return v==null||v===''||!isFinite(+v)?null:+v}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function q(s,r){return (r||document).querySelector(s)}
function qa(s,r){return [].slice.call((r||document).querySelectorAll(s))}
function setText(selector,value){var n=q(selector);if(n)n.textContent=value}
function brandClass(b){return ['binance','coinbase','kraken','okx','gmx','chainlink','pyth','arbitrum'].indexOf(b)>=0?b:''}

function renderPlatforms(){
 var base=state.exchanges.slice(),seen={};
 base.forEach(function(x){seen[String(x.id||x.name).toLowerCase()]=1});
 var extra=[];
 (state.defi.protocolsRaw||[]).forEach(function(x){
  if(extra.length>=5)return;
  var name=String(x.name||x.displayName||x.slug||'DEX'),id=String(x.slug||name).toLowerCase().replace(/[^a-z0-9]+/g,'-'),key=id||name.toLowerCase();
  if(seen[key])return;seen[key]=1;
  extra.push({id:'defi-'+id,name:name,icon:(name.charAt(0)||'D').toUpperCase(),brand:'',status:'DeFiLlama',latency:null,liquidity:'DEX',api:'Volume 24h '+money(x.volume24hUsd),extra:true});
 });
 var rows=state.ui.showAllExchanges?base.concat(extra):base.slice(0,5);
 var h=rows.map(function(x){
  var warn=String(x.status).toLowerCase().indexOf('dégrad')>=0||String(x.status).toLowerCase().indexOf('degrad')>=0;
  var latency=x.latency==null?'N/D':esc(x.latency)+' ms';
  return '<div class="platformCard'+(x.extra?' extendedCard':'')+'" data-platform="'+esc(x.id)+'"><div class="platformCardTop"><span class="brandIcon '+brandClass(x.brand)+'">'+esc(x.icon)+'</span><div><b>'+esc(x.name)+'</b><span class="miniState '+(warn?'warn':'')+'">● '+esc(x.status)+'</span></div></div><span class="miniLatency" data-platform-ms="'+esc(x.id)+'">'+latency+'</span><div class="platformMeta"><span>'+(x.extra?'Type':'Liquidité')+'</span><strong class="'+(x.liquidity==='Moyenne'?'warn':'')+'">'+esc(x.liquidity||'N/D')+'</strong><strong>'+esc(x.api||'N/D')+'</strong></div></div>';
 }).join('');
 var host=q('#platformCards');if(host){host.innerHTML=h;host.classList.toggle('expanded',!!state.ui.showAllExchanges)}
 var b=q('#toggleAllExchanges');if(b){b.setAttribute('aria-expanded',state.ui.showAllExchanges?'true':'false');b.textContent=state.ui.showAllExchanges?'Réduire les DEX & CEX ↑':'Afficher tous les DEX & CEX ↓'}
 var connected=state.exchanges.filter(function(x){var s=String(x.status||'').toLowerCase();return s.indexOf('hors ligne')<0&&s.indexOf('offline')<0&&s.indexOf('déconnect')<0&&s.indexOf('deconnect')<0;}).length;
 setText('#cexConnectedState','● '+connected+'/'+state.exchanges.length+' connectés');
 state.exchanges.forEach(function(x){if(x.latency!=null)setText('[data-stat="'+x.id+'-latency"]',x.latency+' ms')});
}
function renderOracles(){
 var rows=state.ui.showAllOracles?state.oracles.concat(state.oracleCatalog):state.oracles.slice(0,4);
 var h=rows.map(function(x){
  var hasUptime=x.uptime!=null&&isFinite(+x.uptime),p=hasUptime?Math.max(0,Math.min(100,+x.uptime)):0,lat=x.latency==null?'N/D':esc(x.latency)+' ms';
  return '<div class="oracleCard'+(!hasUptime?' extendedCard':'')+'" data-oracle="'+esc(x.id)+'"><div class="oracleCardTop"><span class="brandIcon '+brandClass(x.brand)+'">'+esc(x.icon)+'</span><div><b>'+esc(x.name)+'</b><span class="miniState">● '+esc(x.status)+'</span><span class="miniLatency">'+lat+'</span></div></div><div class="oracleMeta"><span>'+(hasUptime?'Uptime':'Type')+'</span><strong>'+(hasUptime?p.toFixed(2)+'%':esc(x.kind==='bridge'?'Bridge':'Oracle'))+'</strong></div><div class="uptimeRing'+(hasUptime?'':' unavailable')+'" style="--p:'+p+'"><span>'+(hasUptime?Math.round(p)+'%':'N/D')+'</span></div></div>';
 }).join('');
 var host=q('#oracleCards');if(host){host.innerHTML=h;host.classList.toggle('expanded',!!state.ui.showAllOracles)}
 var b=q('#toggleAllOracles');if(b){b.setAttribute('aria-expanded',state.ui.showAllOracles?'true':'false');b.textContent=state.ui.showAllOracles?'Réduire Oracles & Bridges ↑':'Afficher tous les Oracles & Bridges ↓'}
}
function renderEngines(){
 Object.keys(state.engines).forEach(function(k){setText('[data-engine-ms="'+k+'"]',state.engines[k]+' ms')});
 var values=Object.keys(state.engines).map(function(k){return +state.engines[k]||0});
 var ok=values.length&&values.every(function(v){return v>=0&&v<1000});
 var n=q('#engineGlobalState');if(n){n.textContent=ok?'● Tous les services opérationnels':'● Service dégradé';n.classList.toggle('good',ok)}
}
function summaryUniqueCount(rows,keyFn){
 var seen={},n=0;(rows||[]).forEach(function(x){var k=String(keyFn(x)||'').trim().toLowerCase();if(!k||seen[k])return;seen[k]=1;n++;});return n;
}
function renderSummary(){
 var exchanges=summaryUniqueCount(state.exchanges,function(x){return x.id||x.name});
 var engines=Object.keys(state.engines||{}).filter(function(k){var v=state.engines[k];return v!=null&&isFinite(+v)&&+v>=0}).length;
 var networks=summaryUniqueCount(state.defi&&state.defi.networks,function(x){return Array.isArray(x)?x[0]:(x&&x.name)});
 var oracleRows=(state.oracles||[]).concat((state.oracleCatalog||[]).filter(function(x){return x.kind==='oracle'}));
 var bridgeRows=(state.oracles||[]).filter(function(x){return String(x.kind||'').toLowerCase()==='bridge'||/bridge/i.test(String(x.name||''))}).concat((state.oracleCatalog||[]).filter(function(x){return x.kind==='bridge'}));
 var oracles=summaryUniqueCount(oracleRows,function(x){return x.id||x.name});
 var bridges=summaryUniqueCount(bridgeRows,function(x){return x.id||x.name});
 var latencies=[];
 (state.exchanges||[]).concat(state.oracles||[]).forEach(function(x){if(x&&x.latency!=null&&isFinite(+x.latency))latencies.push(+x.latency)});
 Object.keys(state.engines||{}).forEach(function(k){var v=state.engines[k];if(v!=null&&isFinite(+v))latencies.push(+v)});
 var avgLatency=latencies.length?Math.round(latencies.reduce(function(a,b){return a+b},0)/latencies.length):null;
 var uptimes=(state.oracles||[]).map(function(x){return x&&x.uptime}).filter(function(v){return v!=null&&isFinite(+v)}).map(Number);
 var avgUptime=uptimes.length?uptimes.reduce(function(a,b){return a+b},0)/uptimes.length:null;
 var rows=[
  {icon:'⇄',value:String(exchanges),label:'Exchanges suivis'},
  {icon:'⚙',value:String(engines),label:'Engines actifs'},
  {icon:'◎',value:String(networks),label:'Réseaux suivis'},
  {icon:'⛓',value:String(oracles),label:'Oracles suivis'},
  {icon:'↔',value:String(bridges),label:'Bridges suivis'},
  {icon:'◔',value:avgLatency==null?'N/D':avgLatency+' ms',label:'Temps moyen API'},
  {icon:'◷',value:avgUptime==null?'N/D':avgUptime.toFixed(2)+'%',label:'Uptime global',good:avgUptime!=null&&avgUptime>=99.9}
 ];
 state.summary=rows;
 var h=rows.map(function(x){return '<div class="summaryCell '+(x.good?'good':'')+'"><i>'+esc(x.icon)+'</i><div><b>'+esc(x.value)+'</b><span>'+esc(x.label)+'</span></div></div>'}).join('');
 var host=q('#summaryGrid');if(host)host.innerHTML=h;
}
function linePath(values,w,h,pad){
 var max=Math.max.apply(Math,values.concat([1])),min=0,dx=(w-pad*2)/Math.max(1,values.length-1);
 return values.map(function(v,i){var x=pad+i*dx,y=h-pad-((v-min)/(max-min||1))*(h-pad*2);return(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)}).join(' ');
}
function points(values,w,h,pad,klass){
 var max=Math.max.apply(Math,values.concat([1])),dx=(w-pad*2)/Math.max(1,values.length-1);
 return values.map(function(v,i){var x=pad+i*dx,y=h-pad-(v/max)*(h-pad*2);return'<circle class="'+klass+'" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="2.7"/>'}).join('');
}
function adoptionDataset(){
 var src=state.adoption||{},range=String(state.adoptionRange||'30J').toUpperCase();
 if(src.byRange&&src.byRange[range])return src.byRange[range];
 if(src.ranges&&src.ranges[range])return src.ranges[range];
 if(range==='30J')return src;
 if(range==='7J'){
  var n=Math.min(3,(src.users||[]).length),from=Math.max(0,(src.users||[]).length-n);
  return{labels:(src.labels||[]).slice(from),users:(src.users||[]).slice(from),volume:(src.volume||[]).slice(from),defi:(src.defi||[]).slice(from),partial:true};
 }
 return null;
}
function renderAdoption(){
 var range=String(state.adoptionRange||'30J').toUpperCase(),a=adoptionDataset(),host=q('#adoptionChart'),sub=q('#adoptionSubtitle');
 if(sub)sub.textContent='Évolution des utilisateurs, volumes et part de marché · '+range;
 if(!a||!Array.isArray(a.users)||a.users.length<2){
  if(host)host.innerHTML='<div class="adoptionEmpty"><b>Historique '+esc(range)+' insuffisant</b><span>Cette période sera affichée dès qu’une série historique dédiée sera disponible. Les données 30J ne sont pas étirées artificiellement.</span></div>';
  return;
 }
 var w=760,h=150,pad=24,count=a.users.length,barW=Math.max(6,Math.min(24,(w-pad*2)/(count*1.8))),max=Math.max.apply(Math,a.users.concat([1])),bars='';
 a.users.forEach(function(v,i){var x=pad+i*((w-pad*2)/(Math.max(1,count-1)))-barW/2,bh=(v/max)*(h-pad*2),y=h-pad-bh;bars+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="1"/>'});
 var grid='';for(var g=0;g<5;g++){var gy=pad+g*((h-pad*2)/4);grid+='<line x1="'+pad+'" y1="'+gy+'" x2="'+(w-pad)+'" y2="'+gy+'"/>'}
 var labels='',step=Math.max(1,Math.ceil((a.labels||[]).length/7));(a.labels||[]).forEach(function(l,i){if(i%step!==0&&i!==(a.labels||[]).length-1)return;var x=pad+i*((w-pad*2)/(Math.max(1,count-1)));labels+='<text x="'+x.toFixed(1)+'" y="'+(h-4)+'" text-anchor="middle">'+esc(l)+'</text>'});
 var svg='<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><g class="chartGrid">'+grid+'</g><g class="chartBars">'+bars+'</g><path class="chartLineVolume" d="'+linePath(a.volume||[],w,h,pad)+'"/><path class="chartLineDefi" d="'+linePath(a.defi||[],w,h,pad)+'"/><g>'+points(a.volume||[],w,h,pad,'chartPointVolume')+points(a.defi||[],w,h,pad,'chartPointDefi')+'</g><g class="chartAxis">'+labels+'</g></svg>';
 if(host)host.innerHTML=svg;
}


var FINANCE_COLORS=['#17b9e8','#2bd9aa','#7665f0','#d754d9','#42667b','#f0b74b'];
function formatPct(v){v=+v;return isFinite(v)?v.toFixed(1).replace('.',',')+'%':'--'}
function compactShares(items){items=(items||[]).filter(function(x){return x&&isFinite(+x[1])&&+x[1]>0}).sort(function(a,b){return+b[1]-+a[1]});if(items.length<=6)return items;var top=items.slice(0,5),other=items.slice(5).reduce(function(z,x){return z+(+x[1]||0)},0);if(other>0)top.push(['Autres',other]);return top}
function donutGradient(items){var at=0,stops=[];(items||[]).forEach(function(x,i){var v=Math.max(0,+x[1]||0),next=Math.min(100,at+v),co=FINANCE_COLORS[i%FINANCE_COLORS.length];stops.push(co+' '+at.toFixed(2)+'% '+next.toFixed(2)+'%');at=next});if(at<100)stops.push('#163447 '+at.toFixed(2)+'% 100%');return 'conic-gradient('+stops.join(',')+')'}
function financeEmpty(label){return '<div class="financeDataEmpty"><b>'+esc(label)+'</b><span>En attente d\'une réponse valide du provider.</span></div>'}
function legendHtml(items){items=items||[];if(!items.length)return financeEmpty('Répartition indisponible');return items.map(function(x,i){return'<div class="financeLegendRow"><i class="legendDot" style="background:'+FINANCE_COLORS[i%FINANCE_COLORS.length]+'"></i><span title="'+esc(x[0])+'">'+esc(x[0])+'</span><b>'+esc(formatPct(x[1]))+'</b></div>'}).join('');}
function syncDonut(selector,items){var n=q(selector);if(!n)return;items=items||[];n.style.background=items.length?donutGradient(items):'#163447';n.classList.toggle('unavailable',!items.length)}
function financeTable(rows){
 rows=rows||[];if(!rows.length)return financeEmpty('Exchanges indisponibles');
 return rows.map(function(x){return'<div class="financeTableRow"><div><b>'+esc(x.name)+'</b><small>'+esc(x.status)+'</small></div><span>'+esc(x.volume)+'</span><span>'+esc(x.share)+'</span><span>'+esc(x.liquidity)+'</span></div>'}).join('');
}
function assetBars(rows,tone){
 rows=rows||[];if(!rows.length)return financeEmpty('Volumes par actif indisponibles');
 return rows.map(function(x){return'<div class="assetBarRow"><div><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div><div class="assetBar"><i class="'+tone+'" style="width:'+Math.max(4,Math.min(100,+x[2]||0))+'%"></i></div></div>'}).join('');
}
function healthGrid(rows){
 return rows.map(function(x){return'<div class="marketHealthCell '+esc(x[2])+'"><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>'}).join('');
}
function stableFlow(){
 var rows=state.defi.stableFlows||[];
 if(!rows.length)return '<div class="stableFlowEmpty"><b>Historique indisponible</b><span>Variations de capitalisation USD · DeFiLlama. Aucun flux brut mesuré.</span></div>';
 var w=620,h=180,p=20,max=Math.max.apply(Math,rows.map(function(x){return Math.abs(x.netChangeUsd)}).concat([1])),step=(w-p*2)/rows.length,bars='';
 rows.forEach(function(x,i){var v=x.netChangeUsd,bh=Math.abs(v)/max*58,px=p+i*step+step*.18,label=new Date(x.timestamp).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}),period=x.from?new Date(x.from).toLocaleString('fr-FR')+' → '+new Date(x.timestamp).toLocaleString('fr-FR'):label;
  bars+='<rect class="'+(v>=0?'stableIn':'stableOut')+'" x="'+px.toFixed(1)+'" y="'+(v>=0?h/2-bh:h/2).toFixed(1)+'" width="'+(step*.64).toFixed(1)+'" height="'+bh.toFixed(1)+'"><title>'+esc(period+' · variation nette '+money(v)+' · DeFiLlama')+'</title></rect>';
  if(i===0||i===rows.length-1)bars+='<text x="'+px.toFixed(1)+'" y="175" fill="#93b9c9" font-size="10">'+esc(label)+'</text>';
 });
 return '<svg role="img" aria-label="Variations nettes de capitalisation des stablecoins, en USD" viewBox="0 0 '+w+' '+h+'"><line class="stableAxis" x1="'+p+'" y1="90" x2="'+(w-p)+'" y2="90"/>'+bars+'</svg><div class="stableLegend"><span><i class="in"></i>Hausse nette</span><span><i class="out"></i>Baisse nette</span><span>USD · échelle ± '+esc(money(max))+'</span></div><p class="metricNote">DeFiLlama · variation entre deux observations datées, pas des entrées/sorties brutes ni un flux garanti sur 24 h.</p>';
}
function historySeries(h,family,pathName){
 var out=[],seen={},parts=String(pathName||'').split('.');
 ((h&&h.items)||[]).forEach(function(x){var data=family==='CEFI'?x.cefi:x.defi,cur=data;for(var i=0;i<parts.length&&cur!=null;i++)cur=cur[parts[i]];var v=number(cur),ts=+(data&&data.observedAt||x.timestamp)||0;
  if(v!=null&&v>=0&&ts&&!seen[ts]){seen[ts]=1;out.push({timestamp:ts,valueUsd:v});}
 });return out.sort(function(a,b){return a.timestamp-b.timestamp});
}
function seriesRange(a,range){
 var ms=range==='1H'?3600000:range==='24H'?86400000:range==='7J'?604800000:2592000000,now=Date.now(),seen={};
 return(a||[]).filter(function(x){var ts=x&&+x.timestamp;if(!ts||ts<now-ms||ts>now||number(x.valueUsd)==null||+x.valueUsd<0||seen[ts])return false;seen[ts]=1;return true;}).sort(function(a,b){return a.timestamp-b.timestamp});
}
function seriesChart(series,range,kind){
 series=(series||[]).filter(function(x){return isFinite(+x.valueUsd)});
 if(series.length<2)return '<div class="financeChartEmpty"><b>Historique '+esc(range)+' en cours de constitution</b><span>Le Market Data Collector conserve les snapshots et le graphique se complète automatiquement.</span></div>';
 var w=760,h=210,pl=70,pr=18,pt=18,pb=30,vals=series.map(function(x){return+x.valueUsd}),max=Math.max.apply(Math,vals),min=Math.min.apply(Math,vals),pts=[],grid='',labels='';if(max===min){var margin=Math.max(1,max*.05);min=Math.max(0,min-margin);max+=margin;}var span=max-min;
 for(var g=0;g<4;g++){var y=pt+g*((h-pt-pb)/3),v=max-g*(span/3);grid+='<line x1="'+pl+'" y1="'+y.toFixed(1)+'" x2="'+(w-pr)+'" y2="'+y.toFixed(1)+'"/><text x="'+(pl-7)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end">'+esc(money(v))+'</text>';}
 series.forEach(function(x,i){var px=pl+(x.timestamp-series[0].timestamp)/Math.max(1,series[series.length-1].timestamp-series[0].timestamp)*(w-pl-pr),py=pt+(max-(+x.valueUsd))/span*(h-pt-pb);pts.push([px,py]);});
 var line=pts.map(function(p,i){return(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1);}).join(' '),area=line+' L '+pts[pts.length-1][0].toFixed(1)+' '+(h-pb)+' L '+pts[0][0].toFixed(1)+' '+(h-pb)+' Z';
 var ticks=[0,Math.floor((series.length-1)/2),series.length-1];ticks.filter(function(v,i,a){return a.indexOf(v)===i;}).forEach(function(i){var x=pts[i][0],d=new Date(series[i].timestamp),lab=range==='1H'?d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):(range==='24H'?d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}));labels+='<text x="'+x.toFixed(1)+'" y="'+(h-8)+'" text-anchor="'+(i===0?'start':i===series.length-1?'end':'middle')+'">'+esc(lab)+'</text>';});
 return '<svg role="img" aria-label="Historique des volumes en USD" class="defiVolumeSvg '+(kind==='cefi'?'cefiVolumeSvg':'')+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><defs><linearGradient id="'+(kind==='cefi'?'cefiVolArea':'defiVolArea')+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2dd9ca" stop-opacity=".42"/><stop offset="100%" stop-color="#2dd9ca" stop-opacity=".02"/></linearGradient></defs><g class="financeGrid defiGrid">'+grid+'</g><path class="defiVolumeArea" style="fill:url(#'+(kind==='cefi'?'cefiVolArea':'defiVolArea')+')" d="'+area+'"/><path class="defiVolumeLine" d="'+line+'"/><circle class="defiVolumeLast" cx="'+pts[pts.length-1][0].toFixed(1)+'" cy="'+pts[pts.length-1][1].toFixed(1)+'" r="4"/><g class="defiVolumeAxis">'+labels+'</g></svg>';
}
function cexRangeConfig(){
 var r=String(state.cefi.volumeRange||'24H').toUpperCase();
 return ({'1H':{ms:3600000,limit:24},'24H':{ms:86400000,limit:320},'7J':{ms:604800000,limit:2100},'30J':{ms:2592000000,limit:9000}})[r]||{ms:86400000,limit:120};
}
function cexSeriesRange(a,range){return seriesRange(a,range)}
function renderCefiVolume(){
 var range=state.cefi.volumeRange||'24H',series=seriesRange(state.cefi.volumeHistory,range),host=q('#cefiVolumeChart'),sub=q('#cefiVolumeSubtitle');
 if(host)host.innerHTML=seriesChart(series,range,'cefi');
 if(sub)sub.textContent='Volume CEX glissant sur 24 h (USD) · observations sur '+range+' · CoinGecko via Market Data · '+series.length+' points';
}
function renderDefiVolume(){
 var range=state.defi.volumeRange||'24H',useDaily=range==='7J'||range==='30J',src=useDaily?state.defi.volumeDaily:state.defi.volumeHistory,series=seriesRange(src,range),host=q('#defiVolumeChart'),sub=q('#defiVolumeSubtitle');
 if(host)host.innerHTML=seriesChart(series,range);
 if(sub)sub.textContent=(useDaily?'Volume DEX journalier (USD)':'Volume DEX glissant sur 24 h (USD)')+' · observations sur '+range+' · DeFiLlama · '+series.length+' points';
}


function parsePoolFeePct(p){var s=String(p&&p.poolMeta||''),m=s.match(/(?:fee(?:\s*tier)?[^0-9]*)?(\d+(?:[.,]\d+)?)\s*%/i);if(!m)return null;var v=+String(m[1]).replace(',','.');return isFinite(v)&&v>=0&&v<=10?v:null;}
function sourcePool(x,src){return Object.assign({},x,{dataSource:src})}
function buildLeaders(){
 var dl=(state.defi.yieldPools||[]).map(function(x){return sourcePool(x,'DeFiLlama')}),ds=((state.defi.swapLiquidity&&state.defi.swapLiquidity.pools)||[]).map(function(x){return sourcePool({pool:x.pairAddress,symbol:(x.base&&x.base.symbol||'?')+'/'+(x.quote&&x.quote.symbol||'?'),chain:x.chainId,project:x.dexId,tvlUsd:null,liquidityUsd:number(x.liquidityUsd),volume24hUsd:number(x.volume24hUsd),apy:null},'DexScreener')});
 var all=dl.concat(ds);function top5(key){return all.filter(function(x){return number(x[key])!=null&&(key==='apy'||+x[key]>0)}).sort(function(a,b){return+b[key]-+a[key]}).slice(0,5)}
 state.defi.leaders={tvl:top5('tvlUsd'),volume:top5('volume24hUsd'),apr:top5('apy'),liquidity:top5('liquidityUsd')};
}
function rankList(label,rows,key,fmt){
 var missing=key==='apy'?'APY non fourni : aucune pool de rendement dans le snapshot DeFiLlama ; DexScreener ne fournit pas cette métrique.':key==='tvlUsd'?'TVL par pool non fournie par le snapshot actuel. La liquidité DexScreener ne remplace pas la TVL.':'Aucune pool avec cette métrique disponible.';
 return '<section class="poolRankGroup"><h3>'+esc(label)+'</h3><ol>'+((rows||[]).map(function(x,i){return'<li class="poolRankRow"><span class="poolRankNumber">'+(i+1)+'</span><div class="poolRankIdentity"><b>'+esc(x.symbol||x.pool||'Paire N/D')+'</b><span>Protocole : '+esc(x.project||'N/D')+'</span><span>Réseau : '+esc(x.chain||'N/D')+'</span></div><div class="poolRankValue"><strong>'+esc(fmt(x[key]))+'</strong><small>'+esc(x.dataSource||'Source N/D')+'</small></div></li>'}).join('')||'<li class="modulePlaceholder">'+esc(missing)+'</li>')+'</ol></section>';
}
function renderTopPools(){buildLeaders();var h=q('#defiTopPools'),z=state.defi.leaders;if(h)h.innerHTML=rankList('Top 5 liquidité',z.liquidity,'liquidityUsd',money)+rankList('Top 5 volume 24 h',z.volume,'volume24hUsd',money)+rankList('Top 5 TVL',z.tvl,'tvlUsd',money)+rankList('Top 5 APY annuel',z.apr,'apy',function(v){return number(v)==null?'N/D':(+v).toLocaleString('fr-FR',{maximumFractionDigits:2})+' %'});}

function executionEstimate(pool,amount){
 var liq=number(pool&&pool.liquidityUsd),feePct=parsePoolFeePct({poolMeta:(pool&&pool.labels||[]).join(' ')});
 var impact=liq>0&&amount>0?amount/(liq/2+amount)*100:null;
 return{feePct:feePct,feeUsd:feePct==null?null:amount*feePct/100,impactPct:impact,impactUsd:impact==null?null:amount*impact/100};
}
function renderExecutionCost(){
 var host=q('#defiExecutionCost');if(!host)return;
 var snap=state.defi.swapLiquidity,pools=(snap&&snap.pools||[]).filter(function(x){return number(x.liquidityUsd)>0&&x.chainId&&x.dexId}).sort(function(a,b){return b.liquidityUsd-a.liquidityUsd});
 var networkSelect=q('#execNetwork'),dexSelect=q('#execDex'),sel=q('#execTradeSize'),amount=number(sel&&sel.value);
 function unique(values){return Array.from(new Set(values)).sort(function(a,b){return a.localeCompare(b)});}
 function updateSelect(node,values,emptyLabel){
  if(!node)return values[0]||'';
  var previous=node.value,chosen=values.indexOf(previous)>=0?previous:(values[0]||'');
  node.innerHTML=values.length?values.map(function(v){return '<option value="'+esc(v)+'">'+esc(v)+'</option>';}).join(''):'<option value="">'+esc(emptyLabel)+'</option>';
  node.value=chosen;node.disabled=!values.length;return chosen;
 }
 var network=updateSelect(networkSelect,unique(pools.map(function(p){return String(p.chainId)})),'Réseau indisponible');
 var networkPools=pools.filter(function(p){return String(p.chainId)===network});
 var dex=updateSelect(dexSelect,unique(networkPools.map(function(p){return String(p.dexId)})),'DEX indisponible');
 var pool=networkPools.filter(function(p){return String(p.dexId)===dex})[0];
 if(!pool||!amount||amount<=0){host.innerHTML=financeEmpty('Estimation indisponible : aucune pool exploitable ou montant invalide');return;}
 var e=executionEstimate(pool,amount),pair=(pool.base&&pool.base.symbol||'?')+'/'+(pool.quote&&pool.quote.symbol||'?');
 host.innerHTML='<div class="execVisual"><div class="execTotal"><span>COÛT TOTAL · NON CHIFFRABLE</span><b>Indisponible</b><small>Simulation indicative : '+esc(money(amount))+'<br>Gas et cotation exécutable non fournis</small></div></div><div class="execDetails"><div class="execCostRow gas"><span class="costMini">⛽</span><div><b>Gas · N/D</b><small>Aucune estimation RPC validée pour '+esc(pool.chainId||'ce réseau')+'</small></div><strong>N/D</strong></div><div class="execCostRow fee"><span class="costMini">◆</span><div><b>Frais DEX · '+(e.feePct==null?'N/D':'indicatifs')+'</b><small>'+(e.feePct==null?'DexScreener ne fournit pas de tarif exploitable.':'Taux '+esc(e.feePct)+' % extrait du libellé API ; tarif du swap non vérifié.')+'</small></div><strong>'+esc(e.feeUsd==null?'N/D':money(e.feeUsd))+'</strong></div><div class="execCostRow slip"><span class="costMini">⇵</span><div><b>Impact théorique · estimation</b><small>Modèle x·y=k, deux réserves de même valeur : montant / (liquidité de cette pool / 2 + montant). Hors frais, gas, routage et liquidité concentrée.</small></div><strong>'+esc(e.impactPct==null?'N/D':e.impactPct.toLocaleString('fr-FR',{maximumFractionDigits:4})+' %')+'<br><small>'+esc(e.impactUsd==null?'N/D':money(e.impactUsd))+'</small></strong></div><div class="execPoolRef"><span>Pool de référence · donnée API DexScreener</span><b>'+esc(pair)+'</b><small>Protocole '+esc(pool.dexId||'N/D')+' · réseau '+esc(pool.chainId||'N/D')+'</small><small>Liquidité de la pool '+esc(money(pool.liquidityUsd))+' · volume 24 h '+esc(money(pool.volume24hUsd))+'</small><small>'+esc(pool.pairAddress||'Adresse N/D')+'</small></div><p class="metricNote">Ordre de grandeur de l’impact uniquement, pour la pool la plus liquide du réseau et DEX choisis. Cette approximation ne mesure pas le slippage réel. La liquidité de pool ne constitue pas une profondeur exécutable. Aucun total fiable ne peut être calculé avec les sources actuelles.</p></div>';
}
function renderFinance(){
 renderCefiVolume();
 renderDefiVolume();
 var l=q('#cefiShareLegend');if(l)l.innerHTML=legendHtml(state.cefi.shares);syncDonut('.cefiDonut',state.cefi.shares);
 var dl=q('#defiShareLegend');if(dl)dl.innerHTML=legendHtml(state.defi.shares);syncDonut('.defiDonut',state.defi.shares);
 var t=q('#cefiExchangeTable');if(t)t.innerHTML=financeTable(state.cefi.exchanges);
 var pt=q('#defiProtocolTable');if(pt)pt.innerHTML=financeTable(state.defi.protocols);
 var av=q('#cefiAssetVolumes');if(av)av.innerHTML=assetBars(state.cefi.assets,'cefi');
 var nw=q('#defiNetworks');if(nw)nw.innerHTML=assetBars(state.defi.networks,'defi');
 var hg=q('#cefiHealth');if(hg)hg.innerHTML=healthGrid(state.cefi.health);
 var sf=q('#defiStableFlow');if(sf)sf.innerHTML=stableFlow();
 renderTopPools();renderExecutionCost();
}


function money(v){
 v=number(v);if(v==null)return'N/D';
 var a=Math.abs(v);
 if(a>=1e12)return(v/1e12).toFixed(2).replace('.',',')+' T$';
 if(a>=1e9)return(v/1e9).toFixed(1).replace('.',',')+' B$';
 if(a>=1e6)return(v/1e6).toFixed(1).replace('.',',')+' M$';
 if(a>0&&a<.01)return(v<0?'− ':'')+'< 0,01 $';
 return v.toLocaleString('fr-FR',{maximumFractionDigits:a<1000?2:0})+' $';
}
function pctShare(v,total){v=+v;total=+total;return isFinite(v)&&isFinite(total)&&total>0?v/total*100:0}
function scaled(v,max){v=+v;max=+max;return max>0?Math.max(4,Math.min(100,v/max*100)):4}
function trend(values){
 values=(values||[]).filter(function(v){return isFinite(+v)}).map(Number);
 if(values.length<2||!values[0])return'En cours';
 var p=(values[values.length-1]-values[0])/Math.abs(values[0])*100;
 return(p>=0?'+':'')+p.toFixed(1).replace('.',',')+' %';
}
function setKpi(id,value,trendValue,note){
 var b=q('#'+id);if(!b)return;b.textContent=value;
 var card=b.parentNode,em=card&&card.querySelector('em'),sm=card&&card.querySelector('small');
 if(em)em.textContent=trendValue||'--';if(sm&&note)sm.textContent=note;
}
function uiRead(action,args){
 return fetch('/communication/v1/ui/read',{
  method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000),
  body:JSON.stringify({target:'marketdata',action:action,arguments:args||{}})
 }).then(function(r){return r.json().then(function(o){
  if(!r.ok||o.ok===false||o.status==='ERROR'||(o.data&&o.data.ok===false))throw new Error(o.error||(o.data&&o.data.error)||('HTTP '+r.status));
  return o.data!==undefined?o.data:o;
 })});
}
function safeGlobalVolume(g){
 var v=number(g&&g.totalVolume24hUsd),cap=number(g&&g.marketCapUsd);
 return v!=null&&v>=0&&cap!=null&&cap>0&&v<=cap*1000?v:null;
}
function validGlobalHistory(h){
 return ((h&&h.items)||[]).filter(function(x){return x&&x.cefi&&safeGlobalVolume(x.cefi.global)!=null;});
}
function historyValues(h,family,pathName){
 var rows=(h&&h.items)||[],out=[],parts=String(pathName||'').split('.');
 rows.forEach(function(x){
  var cur=family==='CEFI'?x.cefi:x.defi;
  for(var i=0;i<parts.length&&cur!=null;i++)cur=cur[parts[i]];
  if(cur==null||cur==='')return;
  cur=+cur;if(isFinite(cur))out.push(cur);
 });
 return out.slice(-24);
}
function applyFinancialSnapshot(s,cefiHistory,defiHistory,oi,liq,dexLiquidity){
 s=s||{};var c=s.cefi||{},d=s.defi||{},meta=s.meta||{};state.defi.swapLiquidity=dexLiquidity&&dexLiquidity.ok!==false?dexLiquidity:null;
 if(c&&Object.keys(c).length){
  var exTotal=c.spotVolume24hUsd==null?null:+c.spotVolume24hUsd,
      exAvailable=Array.isArray(c.exchanges)&&c.exchanges.length>0&&isFinite(exTotal)&&exTotal>0,
      cefiShares=exAvailable?(c.exchangeShares||[]).map(function(x){return[x.name,+x.sharePct||0]}):[];
  if(exAvailable&&!cefiShares.length)cefiShares=(c.exchanges||[]).slice(0,10).map(function(x){return[x.name||x.id,pctShare(x.volume24hUsd,exTotal)]});
  if(cefiShares.length){var cefiKnown=cefiShares.reduce(function(z,x){return z+(+x[1]||0)},0);if(cefiKnown<99.95)cefiShares.push(['Autres',Math.max(0,100-cefiKnown)]);}
  state.cefi.shares=compactShares(cefiShares);
  state.cefi.exchanges=exAvailable?(c.exchanges||[]).slice(0,8).map(function(x){
   return{name:x.name||x.id,volume:money(x.volume24hUsd),share:pctShare(x.volume24hUsd,exTotal).toFixed(1).replace('.',',')+'%',liquidity:number(x.trustScore)==null?'Confiance N/D':'Confiance '+x.trustScore+'/10',status:'CoinGecko'};
  }):[];
  var assets=(c.assets||[]).filter(function(x){return x&&x.volume24hUsd!=null&&isFinite(+x.volume24hUsd)&&+x.volume24hUsd>0}).slice(0,8),
      maxAsset=Math.max.apply(Math,assets.map(function(x){return+x.volume24hUsd||0}).concat([1]));
  state.cefi.assets=assets.map(function(x){return[x.symbol||x.name,money(x.volume24hUsd),scaled(x.volume24hUsd,maxAsset)]});
  var globalVolume=safeGlobalVolume(c.global),cv=historyValues({items:validGlobalHistory(cefiHistory)},'CEFI','global.totalVolume24hUsd'),
      spotSeries=historySeries(cefiHistory,'CEFI','spotVolume24hUsd');
  if(exAvailable){var ts=+c.observedAt||+s.timestamp||Date.now(),last=spotSeries[spotSeries.length-1];if(!last||last.timestamp!==ts)spotSeries.push({timestamp:ts,valueUsd:exTotal});}
  state.cefi.volumeHistory=spotSeries;
  var currentSeries=cexSeriesRange(spotSeries,state.cefi.volumeRange||'24H'),spotHist=currentSeries.map(function(x){return+x.valueUsd});
  var partial=c.partial===true||!exAvailable||!assets.length,partialNote=(c.errors&&c.errors.length)?' · '+String(c.errors[0]).slice(0,54):'';
  setKpi('cefiVolume24',exAvailable?money(exTotal):'N/D',exAvailable?trend(spotHist):'Indisponible',exAvailable?'CoinGecko · échantillon des exchanges CEX suivis':'CoinGecko · données exchanges indisponibles'+partialNote);
  setKpi('cefiSpot24',globalVolume==null?'N/D':money(globalVolume),globalVolume==null?'Indisponible':trend(cv),globalVolume==null?'CoinGecko · volume mondial incohérent ou indisponible':'CoinGecko · volume global du marché crypto');
  var donut=q('.cefiDonut b');if(donut)donut.textContent=exAvailable?money(exTotal):'N/D';
  var fresh=meta.freshness&&meta.freshness.cefi,age=fresh&&fresh.observedAt?Math.max(0,Date.now()-fresh.observedAt):null;
  state.cefi.health=[
   ['Market cap',money(c.global&&c.global.marketCapUsd),'good'],
   ['Volume marché 24h',globalVolume==null?'N/D':money(globalVolume),globalVolume==null?'warn':'good'],
   ['Provider',partial?'CoinGecko · partiel':'CoinGecko',partial?'warn':'good'],
   ['Fraîcheur',age==null?'--':Math.round(age/1000)+' s',age!=null&&fresh&&age<=fresh.ttlMs?'good':'warn']
  ];
 }
 if(d&&Object.keys(d).length){
  var cats=(d.categories||[]).slice(0,12),catTotal=cats.reduce(function(z,x){return z+(+x.tvlUsd||0)},0);
  state.defi.shares=compactShares(cats.map(function(x){return[x.name,pctShare(x.tvlUsd,catTotal)]}));
  var dx=(d.dexProtocols||[]).slice(0,8),dxTotal=+d.dexVolume24hUsd||dx.reduce(function(z,x){return z+(+x.volume24hUsd||0)},0);state.defi.protocolsRaw=(d.dexProtocols||[]).slice();
  state.defi.protocols=dx.map(function(x){return{name:x.name||x.slug,volume:money(x.volume24hUsd),share:pctShare(x.volume24hUsd,dxTotal).toFixed(1).replace('.',',')+'%',liquidity:'DEX',status:'DeFiLlama'}});
  var chains=(d.chains||[]).slice(0,8),maxTvl=Math.max.apply(Math,chains.map(function(x){return+x.tvlUsd||0}).concat([1]));
  state.defi.networks=chains.map(function(x){return[x.name,money(x.tvlUsd),scaled(x.tvlUsd,maxTvl)]});
  var dv=historyValues(defiHistory,'DEFI','dexVolume24hUsd');state.defi.volumeHistory=historySeries(defiHistory,'DEFI','dexVolume24hUsd');if(number(d.dexVolume24hUsd)!=null){var dts=+d.observedAt||+s.timestamp;if(dts&&!state.defi.volumeHistory.some(function(x){return x.timestamp===dts}))state.defi.volumeHistory.push({timestamp:dts,valueUsd:+d.dexVolume24hUsd});}state.defi.volumeDaily=(d.dexVolumeHistory||[]).map(function(x){return{timestamp:+x.timestamp||0,valueUsd:number(x.valueUsd)};}).filter(function(x){return x.timestamp&&x.valueUsd!=null&&x.valueUsd>=0;});state.defi.yieldPools=(d.yieldPools||[]).slice();state.defi.dexFeeProtocols=(d.dexFeeProtocols||[]).slice();
  var tvlHist=historyValues(defiHistory,'DEFI','tvlUsd');
  var stableSeries=(d.stablecoinHistory||[]).filter(function(x){return x&&isFinite(+x.valueUsd)&&+x.valueUsd>0}).sort(function(a,b){return(+a.timestamp||0)-(+b.timestamp||0)});
  var stableHist=stableSeries.length?stableSeries.slice(-30).map(function(x){return+x.valueUsd}):historyValues(defiHistory,'DEFI','stablecoinMarketCapUsd');
  if(dv.length)state.defi.volume=dv;
  setKpi('defiTvl',money(d.tvlUsd),trend(tvlHist),'DeFiLlama · agrégat des chaînes (chevauchements possibles)');
  setKpi('defiDexVolume',money(d.dexVolume24hUsd),trend(dv),'DeFiLlama · DEX 24h');
  setKpi('defiStable',money(d.stablecoinMarketCapUsd),trend(stableHist),'DeFiLlama · stablecoincharts/all');
  setKpi('defiBridgeVolume','N/D','Non suivi','Donnée non disponible · provider de volume bridge non connecté');
  var dd=q('.defiDonut b');if(dd)dd.textContent=catTotal>0?money(catTotal):'N/D';
  var source=stableSeries.length?stableSeries:historySeries(defiHistory,'DEFI','stablecoinMarketCapUsd');
  state.defi.stableFlows=[];
  for(var i=1;i<source.length;i++){var prev=source[i-1],cur=source[i];if(+cur.timestamp>+prev.timestamp)state.defi.stableFlows.push({from:+prev.timestamp,timestamp:+cur.timestamp,netChangeUsd:+cur.valueUsd-+prev.valueUsd});}
  state.defi.stableFlows=state.defi.stableFlows.slice(-14);

 }
 renderDerivatives(oi,liq,state.data.streams);
 renderFinance();
 renderSummary();
 renderDataStatus();
}
function renderDerivatives(oi,liq,streams){
 var venues=(oi&&oi.venues||[]).filter(function(x){return String(x.venueType||'').toUpperCase()==='CEX'&&number(x.openInterestNotionalUsd)!=null}),value=oi&&number(oi.cexOpenInterestUsd),coverage=oi&&oi.coverage||{};
 setKpi('cefiOi',venues.length&&value!=null?money(value):'N/D',venues.length?venues.length+' CEX · couverture partielle':'Indisponible',venues.length?'OI BTC perpétuels (USD) · '+venues.map(function(x){return x.source}).join(', ')+(coverage.missing&&coverage.missing.length?' · manquants : '+coverage.missing.join(', '):''):'OI BTC · '+(state.ui.errors.oi||'en attente de venues dérivées'));
 var count=number(liq&&liq.count)||0,cov=liq&&liq.coverage||{},known=number(cov.notionalKnownEvents)||0,amount=number(liq&&liq.coveredNotionalUsd),partial=cov.notionalComplete===false;
 var sourceText=(liq&&liq.byProvider||[]).map(function(x){return x.provider+' : '+x.count+' événements, '+(x.observedNotionalUsd==null?'N/D':money(x.observedNotionalUsd))+' ('+x.knownEvents+' valorisés)';}).join(' ; ')||(cov.providers||[]).join(', ');
 var streamText=!streams?'statut des flux en attente':streams.enabled===false?'flux désactivés':(streams.providers||[]).map(function(x){return x.provider+' '+x.state}).join(', ')||'aucun flux connecté';
 setKpi('cefiLiq',count&&known&&amount!=null?(partial?'≥ ':'')+money(amount):'N/D',count?count+' événements · '+known+' valorisés / '+(count-known)+' N/D':'Aucun événement observé', 'Toutes paires · fenêtre 24 h · montant observé, pas total mondial · valorisation aux prix publiés (faillite pour OKX/Bybit), pas prix d’exécution garanti · '+sourceText+' · '+streamText+(partial?' · notionnels incomplets':'')+(known===0&&count?' · données de contrat ou taux USD non disponibles / anciens événements non vérifiés':''));
}
function renderDataStatus(){
 ['cefi','defi'].forEach(function(section){var names=section==='cefi'?['snapshot','cefiHistory','oi','liq','streams']:['snapshot','defiHistory','dex'],errors=names.filter(function(n){return state.ui.errors[n]}).map(function(n){return n+' : '+state.ui.errors[n]}),pending=names.some(function(n){return !!state.ui.inflight[state.ui.wanted[n]]});
  var f=state.data.snapshot&&state.data.snapshot.meta&&state.data.snapshot.meta.freshness||{},fresh=f[section],stale=fresh&&fresh.expiresAt&&Date.now()>fresh.expiresAt;
  setText('#'+section+'DataStatus',(pending?'Actualisation en cours · ':'')+(stale?'Dernier snapshot conservé · données anciennes · ':'')+(errors.length?'Source indisponible ; dernières données conservées · '+errors.join(' | '):'Sources : '+(section==='cefi'?'CoinGecko et venues dérivées via Market Data':'DeFiLlama et DexScreener via Market Data')));
 });
}
function applyResources(){var d=state.data;applyFinancialSnapshot(d.snapshot,d.cefiHistory,d.defiHistory,d.oi,d.liq,d.dex)}
function scheduleSnapshotRecheck(data){
 var f=data&&data.meta&&data.meta.freshness||{},stale=['cefi','defi'].some(function(k){return f[k]&&f[k].expiresAt&&Date.now()>f[k].expiresAt});
 if(!stale){if(state.ui.snapshotFollowup)clearTimeout(state.ui.snapshotFollowup);state.ui.snapshotFollowup=null;return;}
 if(state.ui.snapshotFollowup)return;
 // One bounded cache read lets a completed background refresh reach the screen.
 state.ui.snapshotFollowup=setTimeout(function(){state.ui.snapshotFollowup=null;if(currentSection()!=='server'&&document.visibilityState!=='hidden')loadResource('snapshot','marketdata.financial.snapshot',{force:false,staleWhileRevalidate:true},{followup:true});},15000);
}
function loadResource(name,action,args,opt){
 opt=opt||{};
 var key=action+'|'+JSON.stringify(args||{});state.ui.wanted[name]=key;
 if(state.ui.inflight[key])return state.ui.inflight[key];
 if(!opt.followup&&state.ui.lastKey[name]===key&&Date.now()-state.ui.lastAt[name]<30000)return Promise.resolve();
 var task=uiRead(action,args).then(function(data){if(state.ui.wanted[name]!==key)return;state.data[name]=data;state.ui.lastKey[name]=key;state.ui.lastAt[name]=Date.now();delete state.ui.errors[name];applyResources();if(name==='snapshot'&&!opt.followup)scheduleSnapshotRecheck(data);}).catch(function(e){if(state.ui.wanted[name]!==key)return;state.ui.errors[name]=e.message;renderDerivatives(state.data.oi,state.data.liq,state.data.streams);}).then(function(){delete state.ui.inflight[key];renderDataStatus();});
 state.ui.inflight[key]=task;renderDataStatus();return task;
}
function loadHistory(section){
 var cfg=section==='cefi'?cexRangeConfig():{ms:86400000,limit:320};
 // Rounded lower boundary keeps equivalent requests deduplicable during navigation.
 return loadResource(section+'History','marketdata.financial.history',{family:section.toUpperCase(),limit:cfg.limit,since:Math.floor((Date.now()-cfg.ms)/60000)*60000});
}
function loadFinancialData(){
 var section=currentSection();if(section==='server'||document.visibilityState==='hidden')return;
 loadResource('snapshot','marketdata.financial.snapshot',{force:false,staleWhileRevalidate:true});loadHistory(section);
 if(section==='defi')loadResource('dex','marketdata.dex.liquidity.snapshot',{symbol:'ETHUSDC',force:false});
 else{
  loadResource('oi','marketdata.derivatives.open_interest',{symbol:'BTCUSD'});
  loadResource('liq','marketdata.liquidations.stats',{windowMs:86400000});
  loadResource('streams','marketdata.liquidations.streams',{});
 }
}

function currentSection(){
 var h=String(location.hash||'#server').toLowerCase();
 return h==='#cefi'?'cefi':h==='#defi'?'defi':'server';
}
function showSection(name){
 name=name||currentSection();
 qa('[data-stats-section]').forEach(function(n){n.classList.toggle('active',n.getAttribute('data-stats-section')===name)});
 qa('[data-stats-nav]').forEach(function(n){n.classList.toggle('active',n.getAttribute('data-stats-nav')===name)});
 document.body.setAttribute('data-stats-view',name);
 window.scrollTo(0,0);
}
function apply(data){
 data=data||{};
 if(Array.isArray(data.exchanges))state.exchanges=data.exchanges;
 if(Array.isArray(data.oracles))state.oracles=data.oracles;
 if(data.engines)Object.keys(data.engines).forEach(function(k){state.engines[k]=data.engines[k]});
 if(Array.isArray(data.summary))state.summary=data.summary;
 if(data.adoption)state.adoption=data.adoption;
 if(data.cefi)state.cefi=data.cefi;
 if(data.defi)state.defi=data.defi;
 renderAll();
}
function renderAll(){
 renderPlatforms();renderOracles();renderEngines();renderSummary();renderAdoption();renderFinance();showSection();
}
function bind(){
 qa('.rangeBtns button').forEach(function(b){b.onclick=function(){var p=b.parentNode;qa('.rangeBtns button',p).forEach(function(x){x.classList.remove('active')});b.classList.add('active');state.adoptionRange=String(b.getAttribute('data-range')||'30J').toUpperCase();renderAdoption()}});
 qa('.financeRanges button:not([data-defi-range])').forEach(function(b){b.onclick=function(){var p=b.parentNode;qa('button',p).forEach(function(x){x.classList.remove('active')});b.classList.add('active');state.cefi.volumeRange=String(b.textContent||'24H').trim().toUpperCase();renderCefiVolume();loadHistory('cefi')}});
 qa('[data-defi-range]').forEach(function(b){b.onclick=function(){var p=b.parentNode;qa('[data-defi-range]',p).forEach(function(x){x.classList.remove('active')});b.classList.add('active');state.defi.volumeRange=b.getAttribute('data-defi-range')||'24H';renderDefiVolume()}});
 var allEx=q('#toggleAllExchanges');if(allEx)allEx.onclick=function(){state.ui.showAllExchanges=!state.ui.showAllExchanges;renderPlatforms()};
 var allOr=q('#toggleAllOracles');if(allOr)allOr.onclick=function(){state.ui.showAllOracles=!state.ui.showAllOracles;renderOracles()};
 var ex=q('#execTradeSize');if(ex)ex.onchange=renderExecutionCost;
 var en=q('#execNetwork');if(en)en.onchange=renderExecutionCost;
 var ed=q('#execDex');if(ed)ed.onchange=renderExecutionCost;
 window.addEventListener('hashchange',function(){showSection();loadFinancialData()});
 document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')loadFinancialData()});
}
function liveProbe(){
 fetch('/ui-health',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(o){if(!o)return;state.engines.ui=1;renderEngines()}).catch(function(){});
 fetch('/api/status',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(o){if(!o)return;var s=q('#engineGlobalState');if(s&&o.version)s.title='Core IA-TB '+o.version}).catch(function(){});
}

window.IATBStats={state:state,update:apply,render:renderAll,section:showSection};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){renderAll();bind();liveProbe();loadFinancialData();setInterval(loadFinancialData,60000)});else{renderAll();bind();liveProbe();loadFinancialData();setInterval(loadFinancialData,60000)}
})()
