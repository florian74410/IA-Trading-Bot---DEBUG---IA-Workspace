'use strict';
function ms(t){t=+t||0;if(t>0&&t<1e12)t*=1000;return Math.round(t);}
function fromKraken(rows){rows=Array.isArray(rows)?rows:[];var by=Object.create(null),out=[],pos=0;for(var i=0;i<rows.length;i++){var x=rows[i];if(!Array.isArray(x)||x.length<5)continue;var t=ms(x[0]),o=+x[1],h=+x[2],l=+x[3],c=+x[4],v=x.length>=7?+x[6]:(x.length>=6?+x[5]:0);if(!t||![o,h,l,c].every(isFinite))continue;if(!isFinite(v)||v<0)v=0;if(v>0)pos++;by[String(t)]=[t,o,h,l,c,v];}Object.keys(by).sort(function(a,b){return+a-+b}).forEach(function(k){out.push(by[k]);});return{candles:out,volumeAvailable:pos>0,positiveVolumeRows:pos};}
module.exports={ms:ms,fromKraken:fromKraken};
