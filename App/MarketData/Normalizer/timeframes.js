'use strict';
var MAP={'1m':1,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240,'1d':1440,'1w':10080};
function normalize(t){t=String(t||'1h').toLowerCase();return MAP[t]?t:'1h';}
function minutes(t){return MAP[normalize(t)]||60;}
module.exports={normalize:normalize,minutes:minutes};
