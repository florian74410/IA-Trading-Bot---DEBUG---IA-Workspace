/* IA-TB Native Chart Engine · DEBUG 2.0.4
 * Canvas 2D renderer owned by IA-TB. No TradingView dependency.
 * v1.4 repairs pointer drag/pan, candle hover selection, OHLCV/timestamp readout
 * and keeps the public API used by IA-TB v1.11.7.
 */
(function(global){'use strict';
 var ALLOWED={'chart.fit':1,'chart.clear_analysis':1,'chart.set_symbol':1,'chart.set_timeframe':1,'chart.add_level':1,'chart.remove_level':1,'chart.apply_visual_plan':1,'chart.focus':1,'chart.restore':1};
 function num(v,n){v=Number(v);if(!isFinite(v))throw new Error(n+' invalide');return v}
 function txt(v,n,max){v=String(v==null?'':v).trim();if(!v||v.length>max)throw new Error(n+' invalide');return v}
 function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
 function timeKey(v){if(typeof v==='number')return v>100000000000?Math.floor(v/1000):Math.floor(v);var t=new Date(v).getTime();return isFinite(t)?Math.floor(t/1000):0}
 function palette(i){var p=['#5aa9e6','#f4c95d','#bd9cff','#69b889','#ff8f99','#f39c6b','#7fd1b9','#a8b8ff'];return p[i%p.length]}
 function evt(n,d){try{return new CustomEvent(n,{detail:d})}catch(e){var x=document.createEvent('CustomEvent');x.initCustomEvent(n,false,false,d);return x}}
 function fmt(v){v=+v;if(!isFinite(v))return'--';return v>=1000?v.toFixed(2):v>=1?v.toFixed(4):v.toFixed(6)}
 function stamp(sec,zone){var d=new Date((+sec||0)*1000);if(!isFinite(d.getTime()))return'--';try{return d.toLocaleString('fr-FR',{timeZone:zone,timeZoneName:'shortOffset'})}catch(e){return d.toISOString()}}
 function IATBChartController(o){
  o=o||{};this.container=o.container;this.root=o.root||document;this.focusButton=o.focusButton||null;this.restoreButton=o.restoreButton||null;this.focusClass=o.focusClass||'ia-chart-focus-mode';
  if(!this.container)throw new Error('Conteneur graphique manquant');
  this.series={};this.indicatorSeries={};this.priceLines={};this.liquidityZones=[];this.markers=[];this.economicMarkers=[];this.rows=[];this.visibleCount=100;this.panOffset=0;this.priceScale=1;this.priceOffset=0;this.drag=null;this.crosshair=null;this.hoverIndex=-1;this._raf=0;this.context={symbol:'',timeframe:'',source:''};this.indicatorBatch=[];this.lastRenderStats={received:0,accepted:0,visible:0,rendered:0,width:0,height:0,at:0};
  this.timeZone=o.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  this.mount();this.bindFocusControls();this.bindIndicatorEngine();this.bindInteraction();this.hideLegacyCommunicationCard();global.IATBActiveChartController=this;
 }
 IATBChartController.prototype.hideLegacyCommunicationCard=function(){try{var d=this.root&&this.root.getElementById?this.root:document,n=d.getElementById('cpVersion');if(!n)return;var card=n.closest?n.closest('.settingsCard'):null;if(card)card.style.display='none'}catch(e){}};
 IATBChartController.prototype.mount=function(){
  while(this.container.firstChild)this.container.removeChild(this.container.firstChild);
  var c=document.createElement('canvas');c.className='iatbNativeChartCanvas';c.style.position='absolute';c.style.inset='0';c.style.width='100%';c.style.height='100%';c.style.display='block';c.style.cursor='crosshair';c.style.touchAction='none';c.style.userSelect='none';this.container.appendChild(c);this.canvas=c;this.ctx=c.getContext('2d');
  var self=this;this.chart={timeScale:function(){return{fitContent:function(){self.fitContent()},subscribeVisibleLogicalRangeChange:function(){}}},removeSeries:function(s){if(s&&s.__id)self.removeSeries(s.__id)},panes:function(){return self._paneLayout||[]}};
  this.candles={setData:function(r){self.setCandles(r)},update:function(r){self.updateCandle(r)},priceToCoordinate:function(v){return self.priceToCoordinate(v)},createPriceLine:function(opt){var id='native:'+Date.now()+':'+Math.random();self.priceLines[id]=Object.assign({},opt||{});self.invalidate();return{id:id,__id:id}},removePriceLine:function(l){if(l&&l.__id)delete self.priceLines[l.__id];self.invalidate()}};this.series.price=this.candles;
  if(global.ResizeObserver){this.ro=new ResizeObserver(function(){self.refreshLayout()});this.ro.observe(this.container);if(this.container.parentNode&&this.container.parentNode.nodeType===1)this.ro.observe(this.container.parentNode)}
  global.addEventListener('resize',function(){self.refreshLayout()});
  this.container.addEventListener('ia-tb:chart-resize',function(){self.refreshLayout()});
  this.mountEconomicEvents();this.refreshLayout();[0,80,250,800].forEach(function(ms){setTimeout(function(){self.refreshLayout()},ms)})
 };
 IATBChartController.prototype.refreshLayout=function(){
  var w=this.container&&this.container.clientWidth||0,h=this.container&&this.container.clientHeight||0;
  if(w<2||h<2){var self=this;clearTimeout(this._layoutRetry);this._layoutRetry=setTimeout(function(){self.invalidate()},80);return false}
  this.invalidate();return true
 };
 IATBChartController.prototype.bindIndicatorEngine=function(){var self=this;this.container.addEventListener('ia-tb:indicator-batch',function(e){try{self.applyIndicatorBatch(e&&e.detail&&e.detail.results||[]);if(e&&e.detail)e.detail.renderedByController=true}catch(x){try{console.error('Indicator Engine chart:',x.message)}catch(ignore){}}});if(global.IATBIndicatorBatch&&Array.isArray(global.IATBIndicatorBatch.results)){setTimeout(function(){try{self.applyIndicatorBatch(global.IATBIndicatorBatch.results)}catch(ignore){}},0)}};
 IATBChartController.prototype.bindFocusControls=function(){var self=this;if(this.focusButton)this.focusButton.addEventListener('click',function(){self.setFocus(true)});if(this.restoreButton)this.restoreButton.addEventListener('click',function(){self.setFocus(false)})};
 IATBChartController.prototype.pointerXY=function(e){var r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top,inside:e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom}};
 IATBChartController.prototype.bindInteraction=function(){var self=this,c=this.canvas;
  c.addEventListener('wheel',function(e){e.preventDefault();var p=self.pointerXY(e),g=self._geom,onPriceAxis=g&&p.x>=g.L+g.cw;if(onPriceAxis){var factor=e.deltaY>0?1.12:.89;self.priceScale=clamp(self.priceScale*factor,.18,8);self.invalidate();return}var dir=e.deltaY>0?1:-1,old=self.visibleCount;self.setVisibleCount(old+dir*Math.max(5,Math.round(old*.1)),false)},{passive:false});
  function down(e){if(e.button!=null&&e.button!==0)return;var p=self.pointerXY(e),g=self._geom,isPrice=g&&p.x>=g.L+g.cw;self.drag={pointerId:e.pointerId,x:e.clientX,y:e.clientY,offset:self.panOffset,priceOffset:self.priceOffset,priceScale:self.priceScale,mode:isPrice?'price':'time',moved:false};if(c.setPointerCapture&&e.pointerId!=null){try{c.setPointerCapture(e.pointerId)}catch(ignore){}}c.style.cursor='grabbing';self.setCrosshair(p.x,p.y,true);e.preventDefault()}
  function move(e){var p=self.pointerXY(e);if(self.drag){if(self.drag.mode==='price'){var dy=e.clientY-self.drag.y,h=Math.max(100,self.container.clientHeight||400);self.priceScale=clamp(self.drag.priceScale*Math.exp(dy/h*2.2),.18,8);self.drag.moved=self.drag.moved||Math.abs(dy)>2;self.invalidate();e.preventDefault();return}var geom=self._geom,w=geom&&geom.cw?geom.cw:(self.container.clientWidth||1),slots=self.viewport().count,ppc=w/slots,dx=e.clientX-self.drag.x,delta=Math.round(dx/Math.max(1,ppc)),maxPan=Math.max(0,self.rows.length-self.visibleCount);self.drag.moved=self.drag.moved||Math.abs(dx)>2;self.panOffset=clamp(self.drag.offset-delta,-self.futureSlots(),maxPan);self.setCrosshair(p.x,p.y,p.inside);self.invalidate();e.preventDefault();return}if(p.inside)self.setCrosshair(p.x,p.y,true);else self.clearCrosshair()}
  function up(e){if(!self.drag)return;if(c.releasePointerCapture&&e.pointerId!=null){try{c.releasePointerCapture(e.pointerId)}catch(ignore){}}self.drag=null;c.style.cursor='crosshair';var p=self.pointerXY(e);if(p.inside)self.setCrosshair(p.x,p.y,true);self.invalidate()}
  if(global.PointerEvent){c.addEventListener('pointerdown',down);c.addEventListener('pointermove',move);c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);c.addEventListener('pointerleave',function(){if(!self.drag)self.clearCrosshair()})}else{c.addEventListener('mousedown',down);global.addEventListener('mousemove',move);global.addEventListener('mouseup',up);c.addEventListener('mouseleave',function(){if(!self.drag)self.clearCrosshair()})}
  c.addEventListener('dblclick',function(){self.fitContent()})
 };
 IATBChartController.prototype.setCrosshair=function(x,y,on){if(!on){this.clearCrosshair();return}this.crosshair={x:x,y:y};this.updateHoverFromX(x);this.invalidate()};
 IATBChartController.prototype.clearCrosshair=function(){if(!this.crosshair&&this.hoverIndex<0)return;this.crosshair=null;this.hoverIndex=-1;this.updateReadout(null);this.invalidate()};
 IATBChartController.prototype.updateHoverFromX=function(x){var rows=this.visibleRows(),g=this._geom;if(!rows.length||!g||!isFinite(x)){this.hoverIndex=-1;this.updateReadout(null);return}var v=this.viewport(),step=g.cw/v.count,idx=Math.floor((x-g.L)/step+v.start)-Math.floor(v.start);if(idx<0||idx>=rows.length){this.hoverIndex=-1;this.updateReadout(null);return}this.hoverIndex=idx;this.updateReadout(rows[idx]);this.container.dispatchEvent(evt('ia-tb:chart-hover',{candle:rows[idx],index:idx,symbol:this.context.symbol,timeframe:this.context.timeframe}))};
 IATBChartController.prototype.updateReadout=function(c){try{var d=this.root&&this.root.getElementById?this.root:document,el=d.getElementById('ohlc');if(!el)return;if(!c){var last=this.rows.length?this.rows[this.rows.length-1]:null;if(!last)return;el.textContent=(this.context.symbol||'')+' · O '+fmt(last.open)+'   H '+fmt(last.high)+'   L '+fmt(last.low)+'   C '+fmt(last.close)+'   V '+fmt(last.volume);return}el.textContent=stamp(c.time,this.timeZone)+' · '+(this.context.symbol||'')+' · O '+fmt(c.open)+'   H '+fmt(c.high)+'   L '+fmt(c.low)+'   C '+fmt(c.close)+'   V '+fmt(c.volume)}catch(e){}};
 IATBChartController.prototype.invalidate=function(){var self=this;if(this._raf)return;this._raf=global.requestAnimationFrame(function(){self._raf=0;self.draw()})};
 IATBChartController.prototype.setContext=function(symbol,timeframe,source){symbol=String(symbol||'');timeframe=String(timeframe||'');source=String(source||'').toUpperCase();if(this.context.symbol===symbol&&this.context.timeframe===timeframe&&this.context.source===source)return false;this.context={symbol:symbol,timeframe:timeframe,source:source};this.contextRevision=(this.contextRevision||0)+1;this.rows=[];this.panOffset=0;this.priceScale=1;this.priceOffset=0;this.crosshair=null;this.hoverIndex=-1;this.clearIndicators();this.liquidityZones=[];this.markers=[];this.lastRenderStats={received:0,accepted:0,visible:0,rendered:0,width:this.container.clientWidth||0,height:this.container.clientHeight||0,at:Date.now()};this.invalidate();return true};
 IATBChartController.prototype.setVisibleCount=function(n,resetPan){n=Math.round(+n||100);this.visibleCount=clamp(n,20,500);if(resetPan!==false)this.panOffset=0;this.panOffset=clamp(this.panOffset,-this.futureSlots(),Math.max(0,this.rows.length-this.visibleCount));this.invalidate();return this.visibleCount};
 IATBChartController.prototype.fitContent=function(){this.panOffset=0;this.priceScale=1;this.priceOffset=0;this.visibleCount=clamp(Math.min(Math.max(this.rows.length,20),160),20,500);this.invalidate()};
 IATBChartController.prototype.setFocus=function(on){var root=this.root.documentElement||this.root;if(root&&root.classList)root.classList.toggle(this.focusClass,!!on);if(this.restoreButton)this.restoreButton.style.display=on?'inline-flex':'none';if(this.focusButton)this.focusButton.style.display=on?'none':'';var self=this;this.invalidate();setTimeout(function(){self.refreshLayout()},80);setTimeout(function(){self.refreshLayout()},260)};
 IATBChartController.prototype.setCandles=function(rows){if(!Array.isArray(rows))return 0;var received=rows.length;this.rows=rows.slice(-5000).map(function(r){return{time:timeKey(r.time),open:num(r.open,'open'),high:num(r.high,'high'),low:num(r.low,'low'),close:num(r.close,'close'),volume:isFinite(+r.volume)?+r.volume:0}}).filter(function(r){return r.time>0&&r.high>=Math.max(r.open,r.close,r.low)&&r.low<=Math.min(r.open,r.close,r.high)});this.panOffset=clamp(this.panOffset,-this.futureSlots(),Math.max(0,this.rows.length-this.visibleCount));this.lastRenderStats.received=received;this.lastRenderStats.accepted=this.rows.length;this.lastRenderStats.at=Date.now();this.invalidate();if(this.container&&this.rows.length){try{this.container.dispatchEvent(new CustomEvent('ia-tb:chart-candles-loaded',{detail:{symbol:this.context.symbol,timeframe:this.context.timeframe,count:this.rows.length}}));}catch(e){}}return this.rows.length};
 IATBChartController.prototype.updateCandle=function(r){var c={time:timeKey(r.time),open:num(r.open,'open'),high:num(r.high,'high'),low:num(r.low,'low'),close:num(r.close,'close'),volume:isFinite(+r.volume)?+r.volume:0};if(this.rows.length&&this.rows[this.rows.length-1].time===c.time)this.rows[this.rows.length-1]=c;else this.rows.push(c);if(this.rows.length>5000)this.rows.shift();this.invalidate()};
 // One logical time scale for candles, events, drawings and indicator overlays.
 IATBChartController.prototype.intervalSeconds=function(){var m=String(this.context.timeframe||'').match(/^(\d+)(m|h|d|w)$/i);if(m)return +m[1]*({m:60,h:3600,d:86400,w:604800}[m[2].toLowerCase()]);var r=this.rows;return r.length>1?Math.max(1,r[r.length-1].time-r[r.length-2].time):60};
 IATBChartController.prototype.futureSlots=function(){return Math.max(this.visibleCount,Math.ceil(90*86400/this.intervalSeconds()))};
 IATBChartController.prototype.viewport=function(){var count=Math.max(1,Math.min(this.visibleCount,this.rows.length||this.visibleCount)),end=Math.max(count,this.rows.length-this.panOffset);return{start:end-count,end:end,count:count}};
 IATBChartController.prototype.visibleRows=function(){var v=this.viewport();return this.rows.slice(Math.max(0,Math.floor(v.start)),Math.min(this.rows.length,Math.ceil(v.end)))};
 IATBChartController.prototype.logicalTime=function(time){var r=this.rows,n=r.length;if(!n||!Number.isFinite(+time))return null;var step=this.intervalSeconds();if(time<=r[0].time)return (time-r[0].time)/step;if(time>=r[n-1].time)return n-1+(time-r[n-1].time)/step;var lo=0,hi=n-1;while(hi-lo>1){var mid=(lo+hi)>>1;if(r[mid].time<=time)lo=mid;else hi=mid}return lo+(time-r[lo].time)/(r[hi].time-r[lo].time)};
 IATBChartController.prototype.timeAtLogical=function(at){var r=this.rows,n=r.length;if(!n)return null;if(at<=0)return r[0].time+at*this.intervalSeconds();if(at>=n-1)return r[n-1].time+(at-n+1)*this.intervalSeconds();var i=Math.floor(at);return r[i].time+(at-i)*(r[i+1].time-r[i].time)};
 IATBChartController.prototype.timeToCoordinate=function(time){var g=this._geom,at=this.logicalTime(time),v=this.viewport();return g&&at!=null?g.L+(at-v.start+.5)*g.cw/v.count:null};
 IATBChartController.prototype.coordinateToTime=function(x){var g=this._geom,v=this.viewport();return g?this.timeAtLogical(v.start+(x-g.L)*v.count/g.cw-.5):null};
 IATBChartController.prototype.locateEconomicEvent=function(e){if(!e||!Number.isFinite(e.time)||!this.rows.length)return false;var at=this.logicalTime(e.time),v=this.viewport();if(at<0||at>this.rows.length-1+this.futureSlots())return false;this.panOffset=clamp(this.rows.length-(at+v.count/2),-this.futureSlots(),Math.max(0,this.rows.length-v.count));this.invalidate();return true};
 IATBChartController.prototype.setTimeZone=function(zone){new Intl.DateTimeFormat('fr-FR',{timeZone:zone});this.timeZone=zone;this.invalidate()};
 IATBChartController.prototype.getRenderState=function(){return Object.assign({symbol:this.context.symbol,timeframe:this.context.timeframe,totalRows:this.rows.length,panOffset:this.panOffset,hoverIndex:this.hoverIndex},this.lastRenderStats||{})};
 IATBChartController.prototype.priceToCoordinate=function(v){var g=this._geom;if(!g)return null;return g.priceTop+(g.hi-v)/(g.hi-g.lo||1)*g.priceH};
 IATBChartController.prototype.removeSeries=function(id){if(id==='price')return;delete this.series[id];delete this.indicatorSeries[id];this.invalidate()};
 IATBChartController.prototype.setLine=function(id,data,title,pane,options){id=txt(id,'id',80);var opt=Object.assign({},options||{}),s={__id:id,id:id,title:String(title||id).slice(0,40),pane:Number.isInteger(pane)?pane:0,paneKey:opt.paneKey||'',scaleMin:isFinite(+opt.scaleMin)?+opt.scaleMin:null,scaleMax:isFinite(+opt.scaleMax)?+opt.scaleMax:null,options:opt,data:(data||[]).slice(-5000).map(function(p){return{time:timeKey(p.time),value:p.value!=null&&p.value!==''&&isFinite(+p.value)?+p.value:null}})};this.series[id]=s;this.invalidate();return s};
 IATBChartController.prototype.removeLevel=function(id){delete this.priceLines[String(id||'')];this.invalidate()};
 IATBChartController.prototype.setLevel=function(id,price,title,options){id=txt(id,'id',80);this.priceLines[id]=Object.assign({price:num(price,'price'),title:String(title||id).slice(0,40),color:'#8ca1b3'},options||{});this.invalidate();return{__id:id}};
 // The JSON reader owns the dock DOM; the chart owns only price overlays.
 IATBChartController.prototype.renderExternalIndicatorPanes=function(batch){if(global.IATBIndicatorJsonReader)global.IATBIndicatorJsonReader.accept(batch,this)};
 IATBChartController.prototype.clearIndicators=function(){var self=this;Object.keys(this.indicatorSeries).forEach(function(id){delete self.indicatorSeries[id];delete self.series[id]});this.indicatorSeries={};this.indicatorBatch=[];if(global.IATBIndicatorJsonReader)global.IATBIndicatorJsonReader.accept([],this);global.IATBIndicatorBatch=null;this.invalidate()};
 IATBChartController.prototype.setLiquidityZones=function(z){this.liquidityZones=Array.isArray(z)?z.slice(0,12):[];this.invalidate()};
 IATBChartController.prototype.clearLiquidityZones=function(){this.liquidityZones=[];this.invalidate()};
 IATBChartController.prototype.scheduleLiquidityOverlay=function(){this.invalidate()};
 IATBChartController.prototype.applyIndicatorBatch=function(batch){batch=Array.isArray(batch)?batch:[];var active={},self=this,ci=0,hasLiquidity=false;this.indicatorBatch=batch;function lineData(times,vals){var out=[],n=Math.min(times&&times.length||0,vals&&vals.length||0);for(var i=0;i<n;i++){var t=timeKey(+times[i]),v=vals[i];if(!t)continue;out.push({time:t,value:v==null?null:(isFinite(+v)?+v:null)})}return out}batch.forEach(function(x){if(!x||!x.ok||!x.result)return;var r=x.result;if(r.display&&r.display.render==='zones'){hasLiquidity=true;self.setLiquidityZones(r.zones||[]);return}var isPrice=(r.display&&r.display.pane)==='price';if(!isPrice)return;var vals=r.values||{},outputs=r.outputs||{};Object.keys(vals).forEach(function(k){if(outputs[k]&&outputs[k].chart===false)return;var data=lineData(r.times,vals[k]);if(!data.length)return;var id='ind:'+r.id+':'+k,opt={color:outputs[k]&&outputs[k].visual&&outputs[k].visual.color||palette(ci++),lineWidth:outputs[k]&&outputs[k].visual&&outputs[k].visual.width||2,paneKey:'price',render:outputs[k]&&outputs[k].render||r.display&&r.display.render||(r.id==='parabolic_sar'?'points':'line')};self.indicatorSeries[id]=self.setLine(id,data,(r.name||r.id)+(Object.keys(vals).length>1?' · '+k:''),0,opt);active[id]=1})});if(!hasLiquidity)this.clearLiquidityZones();Object.keys(this.indicatorSeries).forEach(function(id){if(!active[id]){delete self.indicatorSeries[id];delete self.series[id]}});this.renderExternalIndicatorPanes(batch);this.invalidate()};
 IATBChartController.prototype.clearAnalysis=function(){var self=this;Object.keys(this.priceLines).forEach(function(k){if(k.indexOf('sys:')!==0)delete self.priceLines[k]});Object.keys(this.series).forEach(function(k){if(k!=='price'&&k.indexOf('sys:')!==0){delete self.series[k];delete self.indicatorSeries[k]}});this.markers=[];this.invalidate()};
 IATBChartController.prototype.clearSystem=function(){var self=this;Object.keys(this.priceLines).forEach(function(k){if(k.indexOf('sys:')===0)delete self.priceLines[k]});Object.keys(this.series).forEach(function(k){if(k.indexOf('sys:')===0)delete self.series[k]});this.invalidate()};
 IATBChartController.prototype.setEconomicMarkers=function(markers){this.economicMarkers=Array.isArray(markers)?markers.filter(function(e){return e&&e.time!=null&&Number.isFinite(+e.time)&&+e.time>0}).slice(0,250):[];this.invalidate();};
 IATBChartController.prototype.mountEconomicEvents=function(){
  var self=this,layer=document.createElement('div');layer.className='iatbEconomicLayer';this.container.appendChild(layer);this.economicLayer=layer;this.economicButtons=new Map();
  var tip=document.createElement('div');tip.className='iatbEconomicTooltip';tip.id='iatbEconomicTooltip';tip.setAttribute('role','tooltip');tip.hidden=true;this.container.appendChild(tip);this.economicTooltip=tip;
  var zone=document.createElement('span');zone.className='iatbChartTimeZone';this.container.appendChild(zone);this.economicZone=zone;
  function hide(){self.activeEconomicGroup=null;tip.hidden=true;self.economicButtons.forEach(function(b){b.setAttribute('aria-expanded','false')})}
  this.hideEconomicTooltip=hide;
  this.canvas.addEventListener('pointermove',function(e){if(self.drag)return;var p=self.pointerXY(e),g=self._geom;if(!g)return;var found=(self.economicGroups||[]).find(function(group){return Math.abs(group.x-p.x)<=5&&p.y>=g.priceTop&&p.y<=self.container.clientHeight-g.B});if(found)self.showEconomicTooltip(found);else if(!tip.matches(':hover'))hide()});
  this.canvas.addEventListener('pointerleave',function(){if(!layer.contains(document.activeElement))hide()});
  this.container.addEventListener('keydown',function(e){if(e.key==='Escape')hide()});
  this.container.addEventListener('pointerdown',function(e){if(!layer.contains(e.target)&&!tip.contains(e.target))hide()});
 };
 IATBChartController.prototype.showEconomicTooltip=function(group){
  var cal=global.IATBCalendarEvents;if(!cal)return;this.activeEconomicGroup=group.key;var tip=this.economicTooltip;tip.textContent=group.events.map(function(e){return cal.details(e,this.timeZone)},this).join('\n\n');tip.hidden=false;
  tip.style.left=clamp(group.x,8,Math.max(8,this.container.clientWidth-tip.offsetWidth-8))+'px';tip.style.top=Math.max(8,Math.min(92,this.container.clientHeight-tip.offsetHeight-8))+'px';
  var button=this.economicButtons.get(group.key);if(button)button.setAttribute('aria-expanded','true');
 };
 IATBChartController.prototype.drawEconomicEvents=function(ctx){
  var cal=global.IATBCalendarEvents,g=this._geom,self=this;if(!cal||!g)return;
  this.economicZone.textContent=this.timeZone;var groups=new Map();
  this.economicMarkers.forEach(function(e){var x=self.timeToCoordinate(+e.time);if(x==null||x<g.L||x>g.L+g.cw)return;var key=String(e.time),group=groups.get(key);if(!group){group={key:key,x:x,events:[]};groups.set(key,group)}group.events.push(e)});
  this.economicGroups=Array.from(groups.values()).sort(function(a,b){return a.x-b.x});
  // Persistent buttons keep keyboard focus when candles refresh or the chart redraws.
  this.economicButtons.forEach(function(b,key){if(!groups.has(key)){b.remove();self.economicButtons.delete(key)}});
  var laneEnds=[-Infinity,-Infinity,-Infinity];
  this.economicGroups.forEach(function(group){
   var sources=Array.from(new Set(group.events.map(function(e){return e.source}))),x=group.x;
   sources.forEach(function(source,i){ctx.save();ctx.strokeStyle=cal.color(source);ctx.lineWidth=1.25;ctx.globalAlpha=.38;ctx.setLineDash([4,4]);ctx.lineDashOffset=i*4;ctx.beginPath();ctx.moveTo(x,g.priceTop);ctx.lineTo(x,self.container.clientHeight-g.B);ctx.stroke();ctx.restore()});
   var button=self.economicButtons.get(group.key);
   if(!button){button=document.createElement('button');button.type='button';button.className='iatbEconomicBadge';button.setAttribute('aria-describedby',self.economicTooltip.id);button.setAttribute('aria-expanded','false');self.economicLayer.appendChild(button);self.economicButtons.set(group.key,button);
    button.addEventListener('pointerenter',function(){self.showEconomicTooltip(button.eventGroup)});button.addEventListener('focus',function(){self.showEconomicTooltip(button.eventGroup)});button.addEventListener('blur',function(){self.hideEconomicTooltip()});button.addEventListener('pointerleave',function(){if(document.activeElement!==button)self.hideEconomicTooltip()});button.addEventListener('click',function(){if(self.activeEconomicGroup===button.eventGroup.key&&button.touchOpen){button.touchOpen=false;self.hideEconomicTooltip()}else{button.touchOpen=true;self.showEconomicTooltip(button.eventGroup)}});
   }
   button.eventGroup=group;var label=sources.join(' / ')+' — '+cal.formatTime(+group.key,self.timeZone,true)+(group.events.length>1?' · '+group.events.length+' événements':'');
   if(button.dataset.label!==label+group.events.map(function(e){return e.flag||''}).join('')){button.replaceChildren();sources.forEach(function(source){var span=document.createElement('span');var event=group.events.find(function(e){return e.source===source});span.textContent=(event.flag?event.flag+' ':'')+source;span.style.color=cal.color(source);button.appendChild(span)});button.appendChild(document.createTextNode(' · '+cal.formatTime(+group.key,self.timeZone,true)+(group.events.length>1?' · +'+(group.events.length-1):'')));button.dataset.label=label+group.events.map(function(e){return e.flag||''}).join('');}
   button.setAttribute('aria-label',group.events.map(function(e){return cal.details(e,self.timeZone)}).join('\n\n'));button.title=group.events.map(function(e){return e.label}).join(' · ');button.style.borderColor=cal.color(sources[0]);
   var width=Math.min(230,g.cw),left=clamp(x-8,g.L,g.L+g.cw-width),lane=laneEnds.findIndex(function(end){return end+5<left});
   if(lane<0)lane=laneEnds.indexOf(Math.min.apply(Math,laneEnds));laneEnds[lane]=left+width;
   button.style.left=left+'px';button.style.top=(g.priceTop+28+lane*24)+'px';button.style.maxWidth=width+'px';button.style.zIndex=String(1+lane);
  });
  if(this.activeEconomicGroup){var active=groups.get(this.activeEconomicGroup);if(active)this.showEconomicTooltip(active);else this.hideEconomicTooltip()}
 };
 IATBChartController.prototype.applyVisualPlan=function(plan){plan=plan||{};if(plan.replace!==false)this.clearAnalysis();var self=this;(Array.isArray(plan.levels)?plan.levels.slice(0,40):[]).forEach(function(x,i){self.setLevel(x.id||('ai:'+i),x.price,x.title||x.id||('Niveau '+(i+1)),x.options||{})});(Array.isArray(plan.lines)?plan.lines.slice(0,16):[]).forEach(function(x,i){if(Array.isArray(x.data))self.setLine(x.id||('ai-line:'+i),x.data,x.title||x.id,Number.isInteger(x.pane)?x.pane:0,x.options||{})});this.markers=Array.isArray(plan.markers)?plan.markers.slice(0,500):[];if(plan.fit!==false)this.fitContent();this.invalidate()};
 IATBChartController.prototype.handleCommand=function(c){c=c||{};var t=String(c.type||'');if(!ALLOWED[t])throw new Error('Commande graphique refusee: '+t);if(t==='chart.fit'){this.fitContent();return{ok:true}}if(t==='chart.clear_analysis'){this.clearAnalysis();return{ok:true}}if(t==='chart.set_symbol'){this.container.dispatchEvent(evt('ia-tb:chart-symbol-request',{symbol:txt(c.symbol,'symbol',30).toUpperCase()}));return{ok:true}}if(t==='chart.set_timeframe'){this.container.dispatchEvent(evt('ia-tb:chart-timeframe-request',{timeframe:txt(c.timeframe,'timeframe',12)}));return{ok:true}}if(t==='chart.add_level'){this.setLevel(c.id||'ai:level',c.price,c.title||'IA',c.options||{});return{ok:true}}if(t==='chart.remove_level'){this.removeLevel(c.id);return{ok:true}}if(t==='chart.apply_visual_plan'){this.applyVisualPlan(c.plan||{});return{ok:true}}if(t==='chart.focus'){this.setFocus(true);return{ok:true}}if(t==='chart.restore'){this.setFocus(false);return{ok:true}}};
 IATBChartController.prototype.drawTradingLegend=function(ctx,w,rows){
  if(!rows||!rows.length||w<170)return;
  var index=this.hoverIndex>=0&&this.hoverIndex<rows.length?this.hoverIndex:rows.length-1;
  var candle=rows[index],previous=index>0?rows[index-1]:null;
  var up=candle.close>=candle.open,delta=previous?candle.close-previous.close:candle.close-candle.open;
  var percent=previous&&previous.close?delta/previous.close*100:0;
  var symbol=String(this.context.symbol||'MARKET').toUpperCase().slice(0,25);
  var tf=String(this.context.timeframe||'').slice(0,10);
  var exchange=String(this.context.source||'').toUpperCase().slice(0,18);
  var priceColor=up?'#25c996':'#f05d6c',x=10;
  var maxX=Math.max(100,w-76),y0=24;
  var bands=[];
  var indicators=this.indicatorBatch||[],self=this;
  indicators.forEach(function(entry){
   if(!entry||!entry.ok||!entry.result||bands.length>=5)return;
   var r=entry.result,vals=r.values||{},items=[],keys=Object.keys(vals);
   if(r.display&&r.display.pane&&r.display.pane!=='price')return;
   keys.forEach(function(k){
    if(items.length>=5||(r.outputs&&r.outputs[k]&&r.outputs[k].chart===false))return;
    var serie=self.series['ind:'+r.id+':'+k],data=serie&&serie.data||[];
    var value=null;
    for(var i=data.length-1;i>=0;i--)if(data[i].time<=candle.time&&data[i].value!=null&&isFinite(+data[i].value)){value=+data[i].value;break}
    if(value==null)return;
    items.push({value:value,color:serie&&serie.options&&serie.options.color||palette(items.length),name:k});
   });
   if(items.length)bands.push({name:String(r.name||r.id||'Indicateur').slice(0,32),items:items});
  });
  // The glassy, dark readout remains inside the chart. It does not create
  // a false oscillator pane for overlays such as Ichimoku, SMA or VWAP.
  var lineHeight=19,legendHeight=39+bands.length*lineHeight;
  ctx.save();
  var bg=ctx.createLinearGradient(0,0,Math.min(w,650),0);
  bg.addColorStop(0,'rgba(7,11,16,.95)');bg.addColorStop(1,'rgba(7,11,16,.04)');
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,legendHeight);
  ctx.font='600 12px system-ui, sans-serif';ctx.fillStyle='#f0f4f8';
  var title=symbol+(tf?' · '+tf:'')+(exchange?' · '+exchange:'');
  if(ctx.measureText(title).width>maxX-5&&title.length>15)title=title.slice(0,Math.max(10,Math.floor(maxX/8)))+'…';
  ctx.fillText(title,x,y0);
  x+=ctx.measureText(title).width+13;
  ctx.font='11px ui-monospace, SFMono-Regular, Menlo, monospace';
  var tokens=[['O '+fmt(candle.open),'#9baebc'],['H '+fmt(candle.high),'#24bfa0'],['L '+fmt(candle.low),'#f26d78'],['C '+fmt(candle.close),priceColor],[(delta>=0?'+':'')+fmt(delta)+' ('+(percent>=0?'+':'')+percent.toFixed(2)+'%)',priceColor]];
  tokens.forEach(function(t){var width=ctx.measureText(t[0]).width+13;if(x+width>maxX)return;ctx.fillStyle=t[1];ctx.fillText(t[0],x,y0);x+=width});
  ctx.font='11px system-ui, sans-serif';
  bands.forEach(function(b,i){
   var y=43+i*lineHeight,x=11;
   ctx.fillStyle='#bac7d2';ctx.fillText(b.name,x,y);x+=ctx.measureText(b.name).width+10;
   ctx.font='11px ui-monospace, SFMono-Regular, Menlo, monospace';
   b.items.forEach(function(p){
    var value=fmt(p.value),width=ctx.measureText(value).width+13;
    if(x+width>maxX)return;
    ctx.fillStyle=p.color;ctx.fillText(value,x,y);x+=width;
   });
   ctx.font='11px system-ui, sans-serif';
  });
  ctx.restore();
 };
 IATBChartController.prototype.draw=function(){var cv=this.canvas,ctx=this.ctx,w=this.container.clientWidth||1,h=this.container.clientHeight||1,d=Math.min(global.devicePixelRatio||1,2),pw=Math.max(1,Math.round(w*d)),ph=Math.max(1,Math.round(h*d));if(cv.width!==pw||cv.height!==ph){cv.width=pw;cv.height=ph}ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#070b10';ctx.fillRect(0,0,w,h);var rows=this.visibleRows();this.lastRenderStats.width=w;this.lastRenderStats.height=h;this.lastRenderStats.visible=rows.length;this.lastRenderStats.rendered=0;this.lastRenderStats.at=Date.now();if(this.economicLayer)this.economicLayer.hidden=!this.rows.length;if(!this.rows.length){this._geom=null;this.hideEconomicTooltip();return}var viewport=this.viewport(),rowOffset=Math.max(0,Math.floor(viewport.start))-viewport.start;var L=8,R=68,T=10,B=22,cw=Math.max(10,w-L-R),timeIndex={},i;for(i=0;i<rows.length;i++)timeIndex[rows[i].time]=i;
  var paneKeys=[],paneMap={};Object.keys(this.series).forEach(function(id){var s=this.series[id];if(!s||id==='price'||s.pane===0)return;var k=s.paneKey||('pane:'+id);if(!paneMap[k]){paneMap[k]={key:k,series:[],min:null,max:null};paneKeys.push(k)}paneMap[k].series.push(s);if(s.scaleMin!=null)paneMap[k].min=s.scaleMin;if(s.scaleMax!=null)paneMap[k].max=s.scaleMax},this);var usable=Math.max(80,h-T-B),paneCount=paneKeys.length,sepH=paneCount?Math.min(90,Math.max(58,usable*.2)):0,priceH=Math.max(70,usable-sepH*paneCount-(paneCount?5*paneCount:0)),priceTop=T,lo=Infinity,hi=-Infinity;var scaleRows=rows.length?rows:this.rows.slice(-1);for(i=0;i<scaleRows.length;i++){lo=Math.min(lo,scaleRows[i].low);hi=Math.max(hi,scaleRows[i].high)}/* Price scale is anchored to visible candles. Overlays/levels may extend it only when they remain near the visible market range; a zero/default/bad indicator must never flatten BTC into the top edge. */var candleLo=lo,candleHi=hi,candleRange=Math.max(candleHi-candleLo,Math.max(Math.abs(candleHi),1)*.002),guardLo=candleLo-candleRange*6,guardHi=candleHi+candleRange*6;Object.keys(this.priceLines).forEach(function(k){var p=+this.priceLines[k].price;if(isFinite(p)&&p>=guardLo&&p<=guardHi){lo=Math.min(lo,p);hi=Math.max(hi,p)}},this);Object.keys(this.series).forEach(function(k){var s=this.series[k];if(!s||s.pane!==0||!Array.isArray(s.data))return;for(var q=0;q<s.data.length;q++)if(timeIndex[s.data[q].time]!=null&&s.data[q].value!=null&&isFinite(+s.data[q].value)){var v=+s.data[q].value;if(v>=guardLo&&v<=guardHi){lo=Math.min(lo,v);hi=Math.max(hi,v)}}},this);var rg=hi-lo||candleRange||1;lo-=rg*.08;hi+=rg*.08;rg=hi-lo||1;/* TradingView-like vertical price scale: autoscale fills the available pane, while user scale/offset can expand, compress or move the price range. */var mid=(hi+lo)/2+this.priceOffset*rg,scaled=Math.max(candleRange*.08,rg*this.priceScale);lo=mid-scaled/2;hi=mid+scaled/2;rg=hi-lo||1;this._geom={L:L,R:R,T:T,B:B,cw:cw,priceTop:priceTop,priceH:priceH,lo:lo,hi:hi,slots:viewport.count,rowOffset:rowOffset};function y(v){return priceTop+(hi-v)/rg*priceH}function xx(idx){return L+(idx+rowOffset+.5)*(cw/viewport.count)}ctx.font='10px Menlo,monospace';ctx.lineWidth=1;for(i=0;i<5;i++){var gy=priceTop+priceH*i/4;ctx.strokeStyle='#182631';ctx.beginPath();ctx.moveTo(L,gy+.5);ctx.lineTo(L+cw,gy+.5);ctx.stroke();ctx.fillStyle='#75899a';ctx.fillText(fmt(hi-rg*i/4),w-R+5,gy+3)}
  for(i=0;i<this.liquidityZones.length;i++){var z=this.liquidityZones[i]||{},a=+(z.low!=null?z.low:(z.priceLow!=null?z.priceLow:(z.min!=null?z.min:z.price))),b=+(z.high!=null?z.high:(z.priceHigh!=null?z.priceHigh:(z.max!=null?z.max:z.price)));if(!isFinite(a)||!isFinite(b))continue;var zy1=y(Math.max(a,b)),zy2=y(Math.min(a,b)),side=String(z.side||z.direction||'').toUpperCase(),strength=isFinite(+z.strength)?Math.max(0,Math.min(1,+z.strength)):0.55;ctx.fillStyle=side==='SHORT'?'rgba(228,93,107,'+(0.10+strength*.12)+')':side==='LONG'?'rgba(64,201,138,'+(0.10+strength*.12)+')':'rgba(90,169,230,'+(0.10+strength*.12)+')';ctx.fillRect(L,zy1,cw,Math.max(3,zy2-zy1));ctx.strokeStyle=side==='SHORT'?'rgba(228,93,107,.72)':side==='LONG'?'rgba(64,201,138,.72)':'rgba(90,169,230,.72)';ctx.beginPath();ctx.moveTo(L,zy1+.5);ctx.lineTo(L+cw,zy1+.5);ctx.stroke();ctx.fillStyle='#9fb0bd';ctx.font='9px Menlo,monospace';ctx.fillText('LIQ '+(side||'ZONE'),L+5,Math.max(priceTop+10,zy1-3))}
  var step=cw/viewport.count,bw=Math.max(1,Math.min(8,step*.62));for(i=0;i<rows.length;i++){var c=rows[i],xp=xx(i),up=c.close>=c.open;ctx.strokeStyle=ctx.fillStyle=up?'#40c98a':'#e45d6b';ctx.beginPath();ctx.moveTo(xp,y(c.high));ctx.lineTo(xp,y(c.low));ctx.stroke();var yo=y(c.open),yc=y(c.close),top=Math.min(yo,yc),bh=Math.max(1,Math.abs(yc-yo));ctx.fillRect(xp-bw/2,top,bw,bh)}
  function drawPriceSeries(s){ctx.save();ctx.strokeStyle=s.options&&s.options.color||'#5aa9e6';ctx.lineWidth=s.options&&s.options.lineWidth||1.5;if(s.options&&s.options.lineStyle)ctx.setLineDash([5,4]);ctx.beginPath();var begun=false;ctx.rect(L,priceTop,cw,priceH);ctx.clip();ctx.beginPath();var points=s.options&&['points','markers'].indexOf(s.options.render)>=0;for(var j=0;j<s.data.length;j++){var p=s.data[j],idx=timeIndex[p.time];if(idx==null||p.value==null||!isFinite(+p.value)){begun=false;continue;}var px=xx(idx),py=y(+p.value);if(points){ctx.moveTo(px+2,py);ctx.arc(px,py,2,0,Math.PI*2);}else if(!begun){ctx.moveTo(px,py);begun=true}else ctx.lineTo(px,py)}if(points){ctx.fillStyle=ctx.strokeStyle;ctx.fill();}else ctx.stroke();ctx.restore()}
  if(global.IATBIndicatorVisualV2)global.IATBIndicatorVisualV2.drawPrice(ctx,this.indicatorBatch,rows,this._geom);
  Object.keys(this.series).forEach(function(id){var s=this.series[id];if(s&&id!=='price'&&s.pane===0)drawPriceSeries(s)},this);
  Object.keys(this.priceLines).forEach(function(k){var p=this.priceLines[k],v=+p.price;if(!isFinite(v))return;var py=y(v);ctx.save();ctx.strokeStyle=p.color||'#8ca1b3';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(L,py);ctx.lineTo(L+cw,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=p.color||'#8ca1b3';ctx.fillText(String(p.title||k).slice(0,26)+' '+fmt(v),L+5,py-3);ctx.restore()},this);
  var paneTop=priceTop+priceH+5,thisPaneLayout=[];for(var pi=0;pi<paneKeys.length;pi++){var pk=paneKeys[pi],pm=paneMap[pk],pmin=pm.min,pmax=pm.max;if(pmin==null||pmax==null){pmin=Infinity;pmax=-Infinity;for(var si=0;si<pm.series.length;si++){var sd=pm.series[si].data||[];for(var jj=0;jj<sd.length;jj++)if(timeIndex[sd[jj].time]!=null&&sd[jj].value!=null&&isFinite(+sd[jj].value)){pmin=Math.min(pmin,+sd[jj].value);pmax=Math.max(pmax,+sd[jj].value)}}if(!isFinite(pmin)||!isFinite(pmax)){pmin=0;pmax=100}if(pmax===pmin)pmax=pmin+1}var pr=pmax-pmin||1,ph=sepH;ctx.strokeStyle='#182631';ctx.beginPath();ctx.moveTo(L,paneTop-.5);ctx.lineTo(L+cw,paneTop-.5);ctx.stroke();for(si=0;si<pm.series.length;si++){var ss=pm.series[si];ctx.save();ctx.strokeStyle=ss.options&&ss.options.color||palette(si);ctx.lineWidth=ss.options&&ss.options.lineWidth||1.5;ctx.beginPath();var bg=false;for(jj=0;jj<ss.data.length;jj++){var pp=ss.data[jj],ix=timeIndex[pp.time];if(ix==null||pp.value==null||!isFinite(+pp.value))continue;var pxx=xx(ix),pyy=paneTop+(pmax-(+pp.value))/pr*ph;if(!bg){ctx.moveTo(pxx,pyy);bg=true}else ctx.lineTo(pxx,pyy)}if(bg)ctx.stroke();ctx.restore()}thisPaneLayout.push({key:pk,top:paneTop,height:ph});paneTop+=ph+5}this._paneLayout=thisPaneLayout;
  for(i=0;i<this.markers.length;i++){var m=this.markers[i]||{},mi=timeIndex[timeKey(m.time)];if(mi==null)continue;var mc=rows[mi],mx=xx(mi),below=String(m.position||'').indexOf('below')===0,my=below?y(mc.low)+12:y(mc.high)-12;ctx.fillStyle=m.color||'#f4c95d';ctx.beginPath();if(below){ctx.moveTo(mx,my-6);ctx.lineTo(mx-5,my+3);ctx.lineTo(mx+5,my+3)}else{ctx.moveTo(mx,my+6);ctx.lineTo(mx-5,my-3);ctx.lineTo(mx+5,my-3)}ctx.closePath();ctx.fill()}
  this.drawEconomicEvents(ctx);
  var labels=6;ctx.fillStyle='#75899a';for(i=0;i<labels;i++){var lx=L+i*cw/(labels-1),sec=this.coordinateToTime(lx),lab=new Intl.DateTimeFormat('fr-FR',{timeZone:this.timeZone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(sec*1000));ctx.fillText(lab,clamp(lx-24,L,L+cw-80),h-6)}
  if(this.crosshair){var cx=clamp(this.crosshair.x,L,L+cw),cy=clamp(this.crosshair.y,T,Math.max(T,h-B));ctx.save();ctx.strokeStyle='#607484';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(cx,T);ctx.lineTo(cx,h-B);ctx.moveTo(L,cy);ctx.lineTo(L+cw,cy);ctx.stroke();ctx.restore();var hr=this.visibleRows(),hi2=this.hoverIndex;if(hi2>=0&&hi2<hr.length){var hx=xx(hi2),hc=hr[hi2];ctx.save();ctx.strokeStyle='#9db0bf';ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(hx,T);ctx.lineTo(hx,h-B);ctx.stroke();ctx.restore();this.updateReadout(hc)}}
  this.lastRenderStats.rendered=rows.length;
  if(global.IATBIndicatorJsonReader)global.IATBIndicatorJsonReader.drawAll(this);
  this.drawTradingLegend(ctx,w,rows);
 };
 global.IATBChartController=IATBChartController;
})(window);
