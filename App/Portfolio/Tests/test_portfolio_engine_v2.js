'use strict';
var assert=require('assert'),PE=require('../Engine/portfolio_engine');
var rows=[
 {event_type:'ORDER_FILLED',exchange:'KRAKEN',symbol:'BTC/EUR',side:'BUY',position_side:'LONG',quantity:0.1,price:50000,fee:2,funding:0,timestamp:1,payload_json:JSON.stringify({reduce_only:false})},
 {event_type:'ORDER_FILLED',exchange:'KRAKEN',symbol:'BTC/EUR',side:'BUY',position_side:'LONG',quantity:0.1,price:52000,fee:2,funding:0,timestamp:2,payload_json:JSON.stringify({reduce_only:false})},
 {event_type:'POSITION_REDUCED',exchange:'KRAKEN',symbol:'BTC/EUR',side:'SELL',position_side:'LONG',quantity:0.1,price:53000,fee:2,funding:0,timestamp:3,payload_json:JSON.stringify({reduce_only:true})}
];
var out=PE.buildPositions(rows,{'BTC/EUR':54000});assert.equal(out.positions.length,1);assert.equal(out.positions[0].quantity,0.1);assert.equal(Math.round(out.positions[0].average_entry),51000);assert.equal(Math.round(out.positions[0].unrealized_pnl),300);var e=PE.normalizeEvent({event_type:'ORDER_FILLED',exchange:'KRAKEN',symbol:'BTC/EUR',filled_quantity:'0.1',average_price:'53000',request_id:'r1',timestamp:100});assert.equal(e.event_type,'ORDER_FILLED');assert.ok(e.event_id);assert.ok(e.dedup_key.length===64);console.log('PASS Portfolio Engine reconstruction + normalization');


var walletRows=[
 {event_id:'a1',event_type:'ORDER_FILLED',exchange:'GMX',symbol:'ETHUSD',side:'BUY',position_side:'LONG',quantity:1,price:2000,fee:1,funding:0,timestamp:10,payload_json:JSON.stringify({reduce_only:false,metadata:{walletId:'W0001',walletPublicKey:'PUB_A',collateral:500,leverage:4,liquidationPrice:1600}})},
 {event_id:'b1',event_type:'ORDER_FILLED',exchange:'GMX',symbol:'ETHUSD',side:'BUY',position_side:'LONG',quantity:2,price:2100,fee:1,funding:0,timestamp:11,payload_json:JSON.stringify({reduce_only:false,metadata:{walletId:'W0002',walletPublicKey:'PUB_B',collateral:700,leverage:3,liquidationPrice:1650}})}
];
var wout=PE.buildPositions(walletRows,{'ETHUSD':2200});
assert.equal(wout.positions.length,2);
assert.ok(wout.positions.some(function(x){return x.wallet_id==='W0001'&&x.wallet_public_key==='PUB_A'}));
assert.ok(wout.positions.some(function(x){return x.wallet_id==='W0002'&&x.wallet_public_key==='PUB_B'}));
walletRows.push({event_id:'a2',event_type:'POSITION_CLOSED',exchange:'GMX',symbol:'ETHUSD',side:'SELL',position_side:'LONG',quantity:1,price:2300,fee:1,funding:0,timestamp:20,payload_json:JSON.stringify({reduce_only:true,metadata:{walletId:'W0001',walletPublicKey:'PUB_A'}})});
wout=PE.buildPositions(walletRows,{'ETHUSD':2200});
assert.equal(wout.positions.length,1);
assert.equal(wout.closed.length,1);
assert.equal(wout.closed[0].wallet_id,'W0001');
assert.equal(wout.closed[0].wallet_public_key,'PUB_A');
assert.equal(wout.closed[0].status,'CLOSED');
console.log('PASS Portfolio wallet isolation + closed trade ledger');
