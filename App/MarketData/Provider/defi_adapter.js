'use strict';
/* DeFi adapter contract. Providers (DeFiLlama/indexers/protocol adapters) normalize into this shape. No fake data. */
var F=require('../Normalizer/financial_data');
function normalize(rows,source){return(Array.isArray(rows)?rows:[]).map(function(x){var p=F.defiPosition(x);p.provenance=Object.assign({source:source||'DEFI_ADAPTER'},p.provenance||{});return p;});}
module.exports={normalizePositions:normalize};
