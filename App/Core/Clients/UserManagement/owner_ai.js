'use strict';
// Only the Core process opens owner credentials. Engines receive model output,
// never an API key. The canonical provider reconstructs the exact request body.
const crypto=require('node:crypto'),CP=require('../../Communication/communication_protocol_v1'),OpenAI=require('../../../Supervisor/LLM/providers/openai_provider');
function transport({sessions,request,recordUsage=()=>{}}){
 return async function(gateway,payload){
  const current=sessions.verifyHashedSession(gateway.sessionHash);if(!current||current.clientId!==gateway.clientId||!['ADMIN','USER'].includes(current.role))throw Error('OWNER_SESSION_REVOKED');
  const key=sessions.secretForSessionHash(gateway.sessionHash,'OPENAI_API_KEY');if(!key)throw Error('OPENAI_API_KEY_MISSING');
  const method=gateway.operation==='supervisor.structured'?'structured':gateway.operation==='supervisor.reason'?'reason':null;if(!method)throw Error('OWNER_AI_OPERATION_DENIED');
  let response;
  const provider=new OpenAI({model:gateway.configuration?.model||'gpt-5.6',transport:async expected=>{
   if(CP.hashData(expected)!==CP.hashData(payload)||expected.store!==false||!/^gpt-[A-Za-z0-9._-]{2,80}$/.test(expected.model))throw Error('OWNER_AI_PAYLOAD_MISMATCH');
   const active=sessions.verifyHashedSession(gateway.sessionHash);if(!active||active.role!==current.role)throw Error('OWNER_SESSION_REVOKED');
   response=await request({url:'https://api.openai.com/v1/responses',headers:{Authorization:'Bearer '+key},body:expected});
   recordUsage(current,response?.usage||{},expected.model);return response;
  }});
  await provider[method](gateway.spec);return response;
 };
}
module.exports={transport};
