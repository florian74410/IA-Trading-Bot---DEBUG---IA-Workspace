'use strict';
// Offline source-contract audit only: do not require or start any Engine.
const fs=require('node:fs'),assert=require('node:assert/strict');
let failed=0;
const read=p=>fs.readFileSync(p,'utf8');
const registry=JSON.parse(read('Core/Communication/ProtocolRegistry/trading.json'));
const firewall=read('Core/Firewall/firewall_service.js');
const riskClient=read('Core/Firewall/risk_approval_client.js');
const trading=read('services/trading-engine/trading_service.js');
const router=read('Core/Communication/communication_router_v1.js');
const check=(label,fn)=>{try{fn();console.log(label+': OK');}catch(e){failed++;console.log(label+': FAILED '+e.message)}};
check('ROUTER TO FIREWALL CP1 BOUNDARY',()=>{
 assert.equal(registry.endpoint.port,8017);
 assert.equal(registry.routing.via,'FIREWALL');
 assert.equal(registry.routing.securityBoundary,true);
 assert.equal(registry.routing.processPort,8016);
 assert(router.includes('this.protocolRegistry.list()'));
 assert(router.includes("path:e.cpPath||'/cp/v1'"));
});
check('FIREWALL FORWARD SIGNATURE CONTRACT',()=>{
 assert(firewall.includes("'X-IATB-FW-Forwarded':'1'"));
 assert(firewall.includes("'X-IATB-FW-Internal-Signature':hmac(b,token)"));
 assert(trading.includes("req.headers['x-iatb-fw-forwarded']"));
 assert(trading.includes("req.headers['x-iatb-fw-internal-signature']"));
 assert(trading.includes("crypto.timingSafeEqual"));
});
check('FIREWALL RISK APPROVAL CONSUMPTION',()=>{
 assert(firewall.includes('verifyRiskApproval(msg,function(re,approval)'));
 assert(firewall.includes("if(!approval.ok)"));
 assert(firewall.includes("RISK_APPROVAL_REQUIRED"));
 assert(riskClient.includes("'risk.gate.verify'"));
 assert(riskClient.includes('consume:consume===true'));
 assert(firewall.includes('RISK_APPROVAL.verify(id,approvalIntent(msg),true'));
});
check('MUTATING ACTIONS REQUIRE GATES',()=>{
 for(const action of ['trading.execute','trading.cancel','trading.close_position']){
  const entry=registry.table.commands.find(x=>x.name===action);
  assert(entry,action+' MISSING FROM REGISTRY');
  assert(entry.arguments.required.includes('risk_approval_id'),action+' NO REQUIRED RISK ID');
  assert(firewall.includes(action));
  assert(trading.includes(action));
 }
 assert(trading.includes('if(mutating(v.action)&&!firewallForwardOK(req,raw))'));
 assert(trading.includes('if(!SERVICE_ENABLED)return send(res,409'));
});
check('BYPASS FAIL CLOSED FOR MUTATIONS',()=>{
 assert(firewall.includes("'MUTATING_TRADING_BLOCKED_IN_FIREWALL_BYPASS'"));
 assert(firewall.includes('if(!FIREWALL_ENABLED){if(mutatingTrading(msg))'));
});
check('NO EXECUTION DURING AUDIT',()=>assert.equal(process.env.IATB_TRADING_LIVE||'0','0'));
console.log('TRADING BOUNDARY CONTRACT AUDIT:',failed?'FAILED '+failed:'SUCCESS');
if(failed)process.exitCode=1;
