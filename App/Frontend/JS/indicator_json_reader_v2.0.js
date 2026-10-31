'use strict';
(function(global){
 var COLORS=['#45c8ff','#3de19a','#ffd45e','#b58cff','#ff7f91','#67a6ff','#f59c5c','#6ee7d8'];
 function finite(v){return v!=null&&v!==''&&isFinite(+v)}
 function time(v){if(typeof v==='string'&&!isFinite(+v))return Math.floor(Date.parse(v)/1000)||0;v=+v;return isFinite(v)&&v>0?Math.floor(v>1e11?v/1000:v):0}
 function fmt(v){if(!finite(v))return'--';var a=Math.abs(+v);return a>=1e6?(+v).toExponential(3):(+v).toFixed(a>=1000?2:a>=10?3:5)}
 function node(tag,cls,text){var e=document.createElement(tag);e.className=cls||'';if(text!=null)e.textContent=text;return e}
 function Reader(){
  this.host=document.getElementById('indicatorDockBody');this.state=document.getElementById('indicatorDockState');this.batch=[];this.controller=null;this.raf=0;
  var self=this;if(this.host&&global.ResizeObserver){this.ro=new ResizeObserver(function(){self.schedule()});this.ro.observe(this.host)}
 }
 Reader.prototype.schedule=function(){var self=this;if(this.raf)return;this.raf=global.requestAnimationFrame(function(){self.raf=0;self.drawAll()})};
 Reader.prototype.accept=function(results,controller){this.batch=Array.isArray(results)?results.slice():[];this.controller=controller||global.IATBActiveChartController||null;this.render()};
 Reader.prototype.render=function(){
  if(!this.host)return;var self=this;this.host.replaceChildren();
  var dock=this.host.closest?this.host.closest('#indicatorDock'):null;
  var overlays=0,external=0,errors=0;
  // Indicator Renderer V2 owns pane metadata. Only oscillators receive a lower
  // canvas; price overlays are represented inside the main ChartViewer legend.
  this.batch.forEach(function(item,i){
   if(!item||!item.ok||!item.result){errors++;self.host.appendChild(node('div','indicatorReaderError',(item&&item.id||'Indicateur')+' · '+(item&&item.error||'Résultat invalide')));return;}
   var r=item.result,isOverlay=!!(r.display&&(r.display.pane==='price'||r.display.render==='zones'));
   if(isOverlay){overlays++;return;}
   external++;
   var pane=node('section','indicatorPane indicatorJsonPane');pane.dataset.indicatorId=r.id||('indicator-'+i);
   pane.appendChild(node('div','indicatorPaneTitle',(r.name||r.id)+' · '+(r.state||'INCONNU')));
   var latest=Object.keys(r.latest||{}).filter(function(k){return !(r.outputs&&r.outputs[k]&&r.outputs[k].chart===false)}).map(function(k){return k+' '+fmt(r.latest[k])}).join(' · ');
   pane.appendChild(node('div','indicatorReaderLatest',latest||'--'));
   if(r.display&&r.display.render==='zones'){
    var overlay=node('div','indicatorReaderOverlay');overlay.appendChild(node('small','',r.display.render==='zones'?'Zones estimées sur le graphique des prix · '+(r.disclaimer||r.mode||'ESTIMATED'):'Superposé au graphique des prix · '+latest));pane.appendChild(overlay);
    pane.__indicator={result:r,overlay:true};
   }else{
    var cv=node('canvas','');cv.dataset.indicatorCanvas='1';pane.appendChild(cv);
    pane.appendChild(node('div','indicatorReaderNoData','En attente de valeurs visibles'));
    pane.__indicator={result:r,keys:Object.keys(r.values||{}).filter(function(k){return Array.isArray(r.values[k])&&!(r.outputs&&r.outputs[k]&&r.outputs[k].chart===false)})};
   }
   self.host.appendChild(pane);
  });
  if(dock){dock.classList.toggle('active',external>0||errors>0);dock.classList.toggle('iatbHasExternalIndicatorPane',external>0||errors>0);dock.setAttribute('data-overlay-count',String(overlays));}
  if(this.state)this.state.textContent=external+' panneau(x) · '+overlays+' sur graphique · '+errors+' erreur(s)';
  this.schedule();
 };
 Reader.prototype.drawAll=function(controller){
  if(controller&&this.controller&&controller!==this.controller)return;if(!this.host)return;
  var self=this,drawn=0,overlays=0,waiting=0;
  this.batch.forEach(function(item){var r=item&&item.result;if(item&&item.ok&&r&&r.display&&(r.display.pane==='price'||r.display.render==='zones'))overlays++});
  this.host.querySelectorAll('.indicatorJsonPane').forEach(function(pane){var r=self.drawPane(pane);if(r==='DRAWN')drawn++;else if(r==='OVERLAY')overlays++;else waiting++});
  if(this.state)this.state.textContent=drawn+' tracé'+(drawn>1?'s':'')+' · '+overlays+' superposé'+(overlays>1?'s':'')+' · '+waiting+' en attente · '+self.host.querySelectorAll('.indicatorReaderError').length+' erreur(s)';
 };
 Reader.prototype.drawPane=function(pane){
  var meta=pane.__indicator;if(!meta)return'EMPTY';var r=meta.result,c=this.controller,rows=c&&c.visibleRows?c.visibleRows():[],g=c&&c._geom;
  if(meta.overlay){var ids=Object.keys(c&&c.indicatorSeries||{}),present=r.display.render==='zones'?(c&&c.liquidityZones||[]).length>0:ids.some(function(id){return id.indexOf('ind:'+r.id+':')===0&&(c.indicatorSeries[id].data||[]).some(function(p){return finite(p.value)&&rows.some(function(row){return row.time===p.time})})});pane.__renderState={state:present?'OVERLAY':'EMPTY',indicator:r.id};return pane.__renderState.state;}
  var cv=pane.querySelector('canvas'),msg=pane.querySelector('.indicatorReaderNoData');if(!cv)return'EMPTY';
  var w=pane.clientWidth,h=pane.clientHeight;if(w<2||h<2)return'HIDDEN';
  var d=Math.min(global.devicePixelRatio||1,2);if(cv.width!==Math.round(w*d))cv.width=Math.round(w*d);if(cv.height!==Math.round(h*d))cv.height=Math.round(h*d);
  var x=cv.getContext('2d');x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,w,h);x.fillStyle='#070b10';x.fillRect(0,0,w,h);
  var idx=Object.create(null);rows.forEach(function(row,i){idx[row.time]=i});
  var aligned=!!(g&&c.canvas),L=aligned?c.canvas.getBoundingClientRect().left-cv.getBoundingClientRect().left+g.L:8,R=60,T=27,B=24,cw=aligned?g.cw:Math.max(1,w-L-R),ch=Math.max(1,h-T-B),all=[],hist=false;
  var series=meta.keys.map(function(k,ki){var a=r.values[k],points=[],out=r.outputs&&r.outputs[k]||{},render=out.render||r.display&&r.display.render||'line';if(render==='histogram'||render==='bars')hist=true;
   for(var i=0;i<Math.min(a.length,(r.times||[]).length);i++){var ts=time(r.times[i]),at=idx[ts];if(at==null)continue;var v=finite(a[i])?+a[i]:null;points.push({index:at,time:ts,value:v});if(v!=null)all.push(v)}
   return{key:k,color:out.visual&&out.visual.color||COLORS[ki%COLORS.length],render:render,points:points,positiveColor:out.visual&&out.visual.positiveColor,negativeColor:out.visual&&out.visual.negativeColor};
  });
  var count=all.length;pane.__renderState={state:count?'DRAWN':'EMPTY',indicator:r.id,pointCount:count,from:rows.length?rows[0].time:null,to:rows.length?rows[rows.length-1].time:null,plotLeft:L,plotWidth:cw,series:series};
  if(msg){msg.style.display=count?'none':'';msg.textContent=!rows.length?'En attente des bougies du graphique':r.state==='WARMING'?'Chauffe de l’indicateur · '+(r.candleCount||0)+' / '+(r.requiredCandles||'?')+' bougies':'Aucune valeur visible sur cette fenêtre · pas de valeur inventée';}
  if(!count)return'EMPTY';
  var display=r.display||{},fixedMin=finite(display.min),fixedMax=finite(display.max),min=fixedMin?+display.min:Math.min.apply(Math,all),max=fixedMax?+display.max:Math.max.apply(Math,all);
  if(hist){if(!fixedMin)min=Math.min(0,min);if(!fixedMax)max=Math.max(0,max)}if(max<=min){min-=1;max+=1}var pad=(max-min)*.06;if(!fixedMin)min-=pad;if(!fixedMax)max+=pad;
  pane.__renderState.min=min;pane.__renderState.max=max;
  function X(i){return L+(i+.5)*cw/Math.max(1,rows.length)}function Y(v){return T+(max-v)/(max-min)*ch}
  x.font='9px Menlo,monospace';for(var gi=0;gi<3;gi++){var y=T+ch*gi/2;x.strokeStyle='#142a37';x.beginPath();x.moveTo(Math.max(0,L),y+.5);x.lineTo(Math.min(w,L+cw),y+.5);x.stroke();x.fillStyle='#75899a';x.fillText(fmt(max-(max-min)*gi/2),Math.min(w-55,L+cw+4),y+3)}
  x.save();x.beginPath();x.rect(Math.max(0,L),T,Math.max(1,Math.min(w,L+cw)-Math.max(0,L)),ch);x.clip();
  var zones=display.visual&&Array.isArray(display.visual.zones)?display.visual.zones:[];
  zones.forEach(function(z){if(!z||!finite(z.min)||!finite(z.max))return;var high=Math.min(max,+z.max),low=Math.max(min,+z.min);if(high<=low)return;var top=Y(high),bottom=Y(low);x.save();x.fillStyle=/^#[0-9a-f]{6}$/i.test(z.color||'')?z.color:'#9472b8';x.globalAlpha=Math.max(0,Math.min(.35,finite(z.opacity)?+z.opacity:.08));x.fillRect(L,top,cw,bottom-top);x.restore()});
  var levels=display.visual&&Array.isArray(display.visual.levels)?display.visual.levels:[];
  levels.forEach(function(level){if(!level||!finite(level.value))return;var v=+level.value;if(v<min||v>max)return;var py=Y(v);x.save();x.strokeStyle=level.color||'#64748b';x.setLineDash([4,4]);x.globalAlpha=.65;x.beginPath();x.moveTo(L,py);x.lineTo(L+cw,py);x.stroke();x.restore()});
  series.forEach(function(s){x.strokeStyle=s.color;x.fillStyle=s.color;x.lineWidth=1.6;var segment=[],previous=-2;
   function flush(){if(!segment.length)return;var first=segment[0],last=segment[segment.length-1];x.beginPath();segment.forEach(function(p,i){if(i)x.lineTo(X(p.index),Y(p.value));else x.moveTo(X(p.index),Y(p.value));});x.stroke();if(s.render==='area'){x.lineTo(X(last.index),T+ch);x.lineTo(X(first.index),T+ch);x.closePath();x.globalAlpha=.15;x.fill();x.globalAlpha=1;}segment=[];}
   s.points.forEach(function(p){if(p.value==null){flush();previous=-2;return;}var px=X(p.index),py=Y(p.value);
    if(s.render==='histogram'||s.render==='bars'){var zero=Y(0),bw=Math.max(1,cw/rows.length*.58);x.fillStyle=p.value>=0?(s.positiveColor||s.color):(s.negativeColor||'#f05d6c');x.fillRect(px-bw/2,Math.min(py,zero),bw,Math.max(1,Math.abs(zero-py)));x.fillStyle=s.color;}
    else if(s.render==='points'||s.render==='markers'){x.beginPath();x.arc(px,py,2,0,Math.PI*2);x.fill();}
    else{if(p.index!==previous+1)flush();segment.push(p);previous=p.index;}
   });flush();
  });x.restore();return'DRAWN';
 };
 function mount(){var reader=new Reader();global.IATBIndicatorJsonReader=reader;
  global.addEventListener('ia-tb:indicator-json-batch',function(e){if(!(e&&e.detail&&e.detail.renderedByController))reader.accept(e&&e.detail&&e.detail.results||[])});
  if(global.IATBIndicatorBatch)reader.accept(global.IATBIndicatorBatch.results);else reader.render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})(window);
