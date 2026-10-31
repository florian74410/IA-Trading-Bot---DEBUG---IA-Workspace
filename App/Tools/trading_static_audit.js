'use strict';
// Auth21 P2.2: independent maintenance tools must not bypass a held global snapshot.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')throw Error('AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT');

// Static-only audit. Never require() trading modules or start Trading Engine.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const paths=['services/trading-engine/trading_service.js','services/trading-engine/trading-engine.js','services/trading-engine/http-transport.js','services/trading-engine/secret-provider.js','services/trading-engine/registry.js'];
let bad=0;
function check(label,fn){try{fn();console.log(label+': OK');}catch(e){bad++;console.error(label+': FAILED '+e.message);}}
for(const p of paths)check('SYNTAX '+p,()=>{assert(fs.existsSync(p),'MISSING');const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8',timeout:5000});assert.equal(r.status,0,(r.stderr||r.error||'NODE_CHECK_FAILED').toString().slice(0,500));});
const code=fs.readFileSync(paths[0],'utf8');
check('TRADING DEFAULT LIVE DISABLED',()=>assert(code.includes("process.env.IATB_TRADING_LIVE||'0'")));
check('TRADING DISABLED EXECUTION GUARD',()=>assert(code.includes("if(!SERVICE_ENABLED)return send(res,409")));
check('TRADING MUTATION FIREWALL GUARD',()=>assert(code.includes("if(mutating(v.action)&&!firewallForwardOK(req,raw))")));
check('TRADING MUTATION RISK APPROVAL',()=>{for(const a of ["trading.execute","trading.cancel","trading.close_position"])assert(code.includes(a));assert(code.includes("required=['risk_approval_id'"));});
check('TRADING CP1 AUTH',()=>assert(code.includes("if(!CP.verifyToken(ROOT,token))")));
check('TRADING LOOPBACK ONLY',()=>assert(code.includes("HOST='127.0.0.1'")));
check('TRADING NO RUNTIME START',()=>assert(!process.argv.includes('--start-trading')));
console.log('TRADING STATIC AUDIT:',bad?'FAILED '+bad:'SUCCESS');
if(bad)process.exitCode=1;
