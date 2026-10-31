'use strict';
/* Internal-only Market Data client.
   Liquidity Engine never calls Internet providers directly.
   Every request goes through Router CP/1 to Market Data.
*/
var CPClient=require('../../Core/Communication/cp1_client');
function P(o){o=o||{};this.client=new CPClient({root:o.root,routerPort:+o.routerPort||+o.port||+(process.env.ROUTER_PORT||8021),timeout:Math.max(1000,+o.timeout||10000),maxBytes:4*1024*1024});this.name='MARKET_DATA_CP1';}
P.prototype._call=function(action,args,cb){this.client.request('marketdata',action,args||{},'analysis',cb);};
P.prototype.getCandles=function(s,t,l,cb){this._call('marketdata.candles',{symbol:s,timeframe:t,limit:l,force:false},cb);};
P.prototype.getLiquiditySnapshot=function(s,source,depth,force,cb){this._call('marketdata.microstructure.snapshot',{symbol:s,source:source||'AUTO',depth:depth||20,force:force===true},cb);};
P.prototype.getLiquidityHistory=function(o,cb){o=o||{};this._call('marketdata.microstructure.history',{symbol:o.symbol||'',source:o.source||'',limit:o.limit||240,since:o.since||0},cb);};
P.prototype.getLiquidityStorage=function(cb){this._call('marketdata.microstructure.storage',{},cb);};
P.prototype.getOpenInterestAggregate=function(symbol,sources,cb){this._call('marketdata.derivatives.open_interest',{symbol:symbol,sources:Array.isArray(sources)?sources:[]},cb);};
P.prototype.getOpenInterestHistory=function(o,cb){o=o||{};this._call('marketdata.derivatives.open_interest.history',{symbol:o.symbol||'',limit:o.limit||500,since:o.since||0},cb);};
P.prototype.getDexLiquidity=function(symbol,force,cb){this._call('marketdata.dex.liquidity.snapshot',{symbol:symbol,force:force===true},cb);};
P.prototype.getDexLiquidityHistory=function(o,cb){o=o||{};this._call('marketdata.dex.liquidity.history',{symbol:o.symbol||'',limit:o.limit||500,since:o.since||0},cb);};
P.prototype.getLiquidationStats=function(o,cb){o=o||{};this._call('marketdata.liquidations.stats',{symbol:o.symbol||'',source:o.source||'',windowMs:o.windowMs||900000},cb);};
P.prototype.getRecentLiquidations=function(o,cb){o=o||{};this._call('marketdata.liquidations.recent',{symbol:o.symbol||'',source:o.source||'',windowMs:o.windowMs||900000,limit:o.limit||500,since:o.since||0},cb);};
module.exports=P;
