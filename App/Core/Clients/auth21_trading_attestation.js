'use strict';
const crypto=require('node:crypto'),{hashData}=require('../Communication/communication_protocol_v1');
function sign(secret,stage,payload,body){return {stage,command_id:payload.command_id,signature:crypto.createHmac('sha256',secret).update('IATB:P3:RESPONSE:1\n'+stage+'\n'+payload.command_id+'\n'+hashData(body)).digest('hex')};}
function verify(secret,payload,response){
 const a=response&&response.p3Attestation;if(!a||!['FIREWALL','ENGINE'].includes(a.stage)||a.command_id!==payload.command_id||typeof a.signature!=='string'||!/^[a-f0-9]{64}$/.test(a.signature))return false;
 const body={...response};delete body.p3Attestation;const expected=sign(secret,a.stage,payload,body).signature;
 return a.signature.length===expected.length&&crypto.timingSafeEqual(Buffer.from(a.signature),Buffer.from(expected));
}
module.exports={sign,verify};
