'use strict';
var BASE={XBT:'BTC',XDG:'DOGE'},KRAKEN={BTC:'XBT',DOGE:'XDG'};
function clean(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function split(s){s=clean(s);var q=['USDT','USDC','USD','EUR','GBP','BTC','ETH'];for(var i=0;i<q.length;i++){if(s.length>q[i].length&&s.slice(-q[i].length)===q[i]){var b=s.slice(0,-q[i].length);return{base:BASE[b]||b,quote:q[i]};}}return{base:BASE[s]||s,quote:'USD'};}
function canonical(s){var p=split(s);return p.base+'/'+p.quote;}
function krakenPair(s){var p=split(s);return(KRAKEN[p.base]||p.base)+p.quote;}
module.exports={clean:clean,split:split,canonical:canonical,krakenPair:krakenPair};
