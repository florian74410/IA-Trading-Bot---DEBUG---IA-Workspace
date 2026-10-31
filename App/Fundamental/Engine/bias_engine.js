'use strict';
/* IA-TB v1.6.2 informational news-bias heuristic.
   This is a UI aid only. It cannot influence strategies and is not a market forecast. */
function txt(x){return String(x||'').toLowerCase().normalize?String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''):String(x||'').toLowerCase();}
var POS=[
 [/(approve|approved|approval|authori[sz]e|greenlight|adopted|launch|record inflow|inflows? rise|inflows? surge|liquidity (?:rise|increase)|rate cut|cuts? rates|lower inflation|inflation (?:falls|drops|cools)|easing|stimulus|partnership|institutional adoption|adoption (?:rise|increase)|upgrade|successful upgrade|recovery|surge in demand|growth accelerat)/,3,'catalyseur positif'],
 [/(approuv|autorisation|adoption en hausse|baisse des taux|taux en baisse|inflation en baisse|inflation ralentit|liquidite en hausse|partenariat|mise a jour reussie|croissance accelere)/,3,'catalyseur positif'],
 [/(etf.*inflow|inflow.*etf|stablecoin.*growth|treasury yields? fall|dxy fall|dollar weak)/,2,'conditions favorables']
];
var NEG=[
 [/(hack|exploit|breach|stolen|drain(?:ed)?|attack|bankrupt|bankruptcy|insolven|liquidation|outflow|outflows? rise|ban\b|banned|reject(?:ed|ion)?|lawsuit|sue[ds]?\b|enforcement action|sanction|rate hike|hikes? rates|higher inflation|inflation (?:rises|jumps|accelerates)|tightening|recession|default|downgrade|shutdown|freeze|fraud|scam|rug pull)/,3,'risque negatif'],
 [/(piratage|faille|attaque|vole|vol de|faillite|insolv|liquidation|sorties? nettes?|interdiction|rejette|rejet|poursuite|sanction|hausse des taux|taux en hausse|inflation en hausse|resserrement|recession|defaut|fraude|arnaque)/,3,'risque negatif'],
 [/(etf.*outflow|outflow.*etf|stablecoin.*decline|treasury yields? rise|dxy rise|dollar strong)/,2,'conditions defavorables']
];
var NEU=[[/(unchanged|maintain(?:s|ed)? rates|holds? rates|no change|as expected|conforme aux attentes|inchang|maintien des taux)/,2,'information neutre ou attendue']];
function scoreRules(t,rules){var s=0,h=[];rules.forEach(function(r){if(r[0].test(t)){s+=r[1];h.push(r[2]);}});return{score:s,hits:h};}
function estimate(item){item=item||{};var t=txt((item.title||'')+' '+(item.summary||'')),p=scoreRules(t,POS),n=scoreRules(t,NEG),z=scoreRules(t,NEU),label='UNKNOWN',conf=25,reason='Pas assez de signal lexical pour classer cette publication.';if(p.score&&n.score){label='MIXED';conf=Math.min(82,45+Math.min(p.score+n.score,7)*5);reason='Signaux positifs et negatifs simultanes.';}else if(p.score>n.score&&p.score>0){label='BULL';conf=Math.min(86,48+p.score*8);reason=p.hits[0]||'Signal positif detecte.';}else if(n.score>p.score&&n.score>0){label='BEAR';conf=Math.min(86,48+n.score*8);reason=n.hits[0]||'Signal negatif detecte.';}else if(z.score>0){label='NEUTRAL';conf=Math.min(78,48+z.score*8);reason=z.hits[0]||'Signal neutre detecte.';}else if(String(item.content_class||'').toUpperCase()==='PREDICTION'){label='UNKNOWN';conf=20;reason='Prediction: pas de biais directionnel attribue sans signal explicite.';}return{label:label,confidence:conf,reason:reason,informationalOnly:true};}
module.exports={estimate:estimate};
