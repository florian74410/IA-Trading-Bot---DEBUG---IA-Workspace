'use strict';
const crypto=require('node:crypto');
// Fixed canonical SQL identifiers only, never SQL supplied by a user. Tables
// coexist in the existing Portfolio database; global legacy tables stay intact.
const identifiers=['events','balances','snapshots','closed_trades','settings','idx_events_ts','idx_events_symbol','idx_snapshots_ts','idx_closed_trades_closed_at','idx_closed_trades_wallet'];
function namespace(db,clientId){if(!/^CL[A-Za-z0-9_-]{1,64}$/.test(clientId))throw Error('OWNER_ID_INVALID');const prefix='um_'+crypto.createHash('sha256').update(clientId).digest('hex')+'_',pattern=new RegExp('\\b('+identifiers.join('|')+')\\b','g'),sql=s=>s.replace(pattern,name=>prefix+name);return new Proxy(db,{get(target,key){if(key==='exec'||key==='prepare')return text=>target[key](sql(text));const value=target[key];return typeof value==='function'?value.bind(target):value;}});}
module.exports={namespace};
