'use strict';
var intent=require('./trade_intent');
function DecisionEngine(opts){this.opts=opts||{};}
DecisionEngine.prototype.prepare=function(modelDecision){var i=intent.normalize(modelDecision);var v=intent.validate(i);return{ok:v.ok,intent:i,validation:v,executionAllowed:false,note:'Decision prepared only. Risk Gate must approve before any execution.'};};
module.exports=DecisionEngine;