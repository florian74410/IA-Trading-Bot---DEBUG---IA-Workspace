'use strict';
var Provider=require('../Provider/reference_provider'),Settings=require('../Config/market_data_settings'),Registry=require('../Registry/market_registry');
var fail=0;function ok(v,m){console.log((v?'[OK] ':'[FAIL] ')+m);if(!v)fail++;}
var s=Settings.sanitize({coingecko:{registryRefreshMs:1000},providers:{BINANCE:{enabled:true}}});
ok(s.coingecko.registryRefreshMs===60000,'CoinGecko refresh cannot be faster than 60s');
var p=new Provider({settings:s});
ok(p.providers.KRAKEN&&p.providers.GMX&&p.providers.BINANCE,'Kraken GMX Binance providers registered');
ok(!Object.prototype.hasOwnProperty.call(p,'corePort'),'Market providers are decoupled from Core');
var r=new Registry({dbPath:process.env.IATB_MARKET_REGISTRY_TEST_DB||'/tmp/iatb_market_registry_test.db'});
if(!r.ready)console.log('[INFO] SQLite CLI unavailable: registry runtime test deferred');
else{r.upsertAssets([{id:'bitcoin',symbol:'btc',name:'Bitcoin',current_price:1,market_cap:2,market_cap_rank:1,total_volume:3}]);var a=r.get('BTC');ok(a&&a.id==='bitcoin','Registry stores and resolves token metadata');}
console.log('\nMarket Data V2 DEBUG: '+(fail?'FAIL':'PASS')+' ('+fail+' error(s))');process.exitCode=fail?1:0;
