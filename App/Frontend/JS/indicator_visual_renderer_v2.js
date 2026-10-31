/* IA-TB Indicator Visual Renderer V2.1 - graphics only; never calculates indicators. */
(function(global){'use strict';
function finite(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(+v)}
function stamp(v){v=+v;return Number.isFinite(v)&&v>0?Math.floor(v>1e11?v/1000:v):0}
function tint(v,fallback){return typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:fallback}
function number(v,d,a,b){v=+v;return Number.isFinite(v)?Math.max(a,Math.min(b,v)):d}
function align(r,rows){var index=Object.create(null),a=Object.create(null),times=r.times||[],values=r.values||{};
 rows.forEach(function(row,i){index[row.time]=i});
 Object.keys(values).forEach(function(key){var arr=values[key],mapped=Object.create(null);if(!Array.isArray(arr))return;
  for(var i=0;i<Math.min(arr.length,times.length);i++){var x=index[stamp(times[i])];if(x!==undefined)mapped[x]=finite(arr[i])?+arr[i]:null}
  a[key]=mapped;
 });return a}
function drawPrice(ctx,batch,rows,g){
 if(!ctx||!g||!rows||!rows.length||!Array.isArray(batch))return;
 var W=g.cw/Math.max(1,g.slots||rows.length),L=g.L,T=g.priceTop,H=g.priceH,range=g.hi-g.lo||1;
 function X(i){return L+(i+(g.rowOffset||0)+.5)*W}
 function Y(v){return T+(g.hi-v)/range*H}
 ctx.save();ctx.beginPath();ctx.rect(L,T,g.cw,H);ctx.clip();
 batch.forEach(function(entry){if(!entry||!entry.ok||!entry.result)return;
 var r=entry.result,display=r.display||{},v=display.visual||{};
 if(display.pane!=='price'||!Array.isArray(v.layers))return;
 var data=align(r,rows);
 v.layers.forEach(function(layer){if(!layer||layer.visible===false)return;
  if(layer.type!=='cloud'&&layer.type!=='band')return;
  var a=data[layer.upper||layer.a],b=data[layer.lower||layer.b];if(!a||!b)return;
  var opacity=number(layer.opacity,.2,0,.75),bull=tint(layer.bullColor,'#16c784'),bear=tint(layer.bearColor,'#ea3943');
  var segments=[],current=[],last=-2;
  for(var i=0;i<rows.length;i++){if(!finite(a[i])||!finite(b[i])){if(current.length)segments.push(current);current=[];continue}
   var d=+a[i]-+b[i],pt={i:i,a:+a[i],b:+b[i],d:d};
   if(current.length&&((d>0)!==(current[current.length-1].d>0)||i!==last+1)){
    var prev=current[current.length-1];if((d>0)!==(prev.d>0)&&prev.d!==d){
     var t=prev.d/(prev.d-d),at=prev.i+(i-prev.i)*t,cross=prev.a+(pt.a-prev.a)*t;
     current.push({i:at,a:cross,b:cross,d:prev.d});segments.push(current);
     current=[{i:at,a:cross,b:cross,d:d}];
    }else{segments.push(current);current=[]}
   }
   current.push(pt);last=i;
  }
  if(current.length)segments.push(current);
  segments.forEach(function(seg){if(seg.length<2)return;
   ctx.beginPath();seg.forEach(function(p,j){if(j===0)ctx.moveTo(X(p.i),Y(p.a));else ctx.lineTo(X(p.i),Y(p.a))});
   for(var j=seg.length-1;j>=0;j--)ctx.lineTo(X(seg[j].i),Y(seg[j].b));
   ctx.closePath();ctx.fillStyle=(seg[0].d>=0?bull:bear);ctx.globalAlpha=opacity;ctx.fill();ctx.globalAlpha=1;
  });
 });
 });ctx.restore();
}
global.IATBIndicatorVisualV2={drawPrice:drawPrice,align:align,finite:finite,stamp:stamp};
})(window);
