'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Provider=require('../Provider/market_data_provider');
const p=new Provider({root:path.resolve(__dirname,'../..')}),calls=[];
p.client={request(target,action,args,detail,cb){calls.push({target,action,args,detail});cb(null,{ok:true});}};
const done=e=>assert.ifError(e);
p.getCandles('BTCUSD','1m',100,done);p.getLiquiditySnapshot('BTCUSD','KRAKEN',20,false,done);p.getLiquidityHistory({},done);p.getLiquidityStorage(done);p.getOpenInterestAggregate('BTCUSD',[],done);p.getOpenInterestHistory({},done);p.getDexLiquidity('BTCUSD',false,done);p.getDexLiquidityHistory({},done);p.getLiquidationStats({},done);p.getRecentLiquidations({},done);
assert.equal(calls.length,10);assert(calls.every(c=>c.target==='marketdata'&&c.action.startsWith('marketdata.')&&c.detail==='analysis'));assert(calls.some(c=>c.action==='marketdata.microstructure.snapshot'));assert(calls.some(c=>c.action==='marketdata.dex.liquidity.snapshot'));assert(calls.every(c=>c.args.force!==true));
for(const name of fs.readdirSync(path.join(__dirname,'../Provider')).filter(n=>n.endsWith('.js'))){const source=fs.readFileSync(path.join(__dirname,'../Provider',name),'utf8');assert(!/require\(['"](?:https|tls|net|ws)['"]\)/.test(source),'Liquidity provider cannot connect directly to Internet: '+name);}
console.log('PASS maintained Liquidity provider: ten canonical Market Data CP/1 reads, no direct Internet transport');
