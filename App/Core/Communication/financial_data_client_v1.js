'use strict';
/* Shared read-only financial data client.
   Consumers never call CoinGecko/DeFiLlama directly; they request Market Data through Router CP/1.
*/
var CPClient=require('./cp1_client');
function Client(opt){opt=opt||{};this.client=new CPClient({root:opt.root,routerPort:+opt.routerPort||+(process.env.ROUTER_PORT||8021),timeout:Math.max(1000,+opt.timeout||8000)});}
Client.prototype._call=function(action,args,cb){this.client.request('marketdata',action,args||{},'analysis',cb);};
Client.prototype.snapshot=function(scope,cb){scope=String(scope||'ALL').toUpperCase();this._call('marketdata.financial.snapshot',{force:false},function(e,o){if(e)return cb(e);if(scope==='CEFI')return cb(null,{ok:true,timestamp:o.timestamp,expiresAt:o.expiresAt,cefi:o.cefi,meta:o.meta});if(scope==='DEFI')return cb(null,{ok:true,timestamp:o.timestamp,expiresAt:o.expiresAt,defi:o.defi,meta:o.meta});cb(null,o)});};
Client.prototype.history=function(scope,limit,since,cb){this._call('marketdata.financial.history',{family:String(scope||'ALL').toUpperCase(),limit:Math.max(1,Math.min(1000,+limit||96)),since:+since||0},cb);};
Client.prototype.aiContext=function(scope,cb){this._call('marketdata.financial.ai_context',{scope:String(scope||'ALL').toUpperCase()},cb);};
Client.prototype.storage=function(cb){this._call('marketdata.financial.storage',{},cb);};
module.exports=Client;
