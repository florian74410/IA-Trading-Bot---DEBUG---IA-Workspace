'use strict';
const {redact}=require('./trading_logs_v2');
const TYPES={ORDER_ACCEPTED:'Ordre accepté',ORDER_FILLED:'Ordre exécuté',ORDER_CANCELLED:'Ordre annulé',POSITION_CLOSED:'Position clôturée',EXECUTION_REJECTED:'Exécution refusée'};
function formatExecutionLog(event){
 const e=redact(event&&typeof event==='object'?event:{});
 return {id:e.event_id??e.execution_id??null,timestamp:e.timestamp==null?null:Number(e.timestamp),title:TYPES[e.event_type]||'Événement de trading',exchange:e.exchange??null,symbol:e.symbol??null,side:e.side??null,status:e.status??null,quantity:e.quantity??null,filledQuantity:e.filled_quantity??null,averagePrice:e.average_price??null,reference:e.exchange_order_id??e.request_id??null,successful:e.ok===true,error:e.metadata?.error==null?null:String(e.metadata.error)};
}
module.exports={formatExecutionLog};
