'use strict';
// P3 ADMIN command controller: fail closed. CP/1 service authentication is NOT ADMIN identity.
// Mounted only behind the Auth21 proof and Firewall forwarding boundary.
const path=require('node:path'),crypto=require('node:crypto');
const ALLOWED=new Set(['STATUS','START','RESTART','DRAINING_STOP','EMERGENCY_STOP','RECOVER']);
class TradingAdminController {
 constructor({lifecycle, verifyPrincipal, journalFile, draining=null, recoveryCheck=null, now=Date.now}={}){
   if(!lifecycle||typeof lifecycle.snapshot!=='function')throw Error('LIFECYCLE_REQUIRED');
   this.draining=draining;this.recoveryCheck=recoveryCheck;this.lifecycle=lifecycle;this.verifyPrincipal=verifyPrincipal;this.now=now;
   this.journalFile=journalFile||path.join(path.dirname(lifecycle.file),'trading_admin_actions.jsonl');
   this.ledger=arguments[0]&&arguments[0].ledger||null;
 }
 async command(input={},context={}){
   const command=String(input.command||'').toUpperCase();
   if(!ALLOWED.has(command))return {ok:false,error:'ADMIN_COMMAND_UNKNOWN'};
   // Fail closed unless the independent Auth21 verifier is actually installed.
   if(typeof this.verifyPrincipal!=='function')return {ok:false,error:'AUTH21_ADMIN_VERIFIER_NOT_CONFIGURED'};
   let identity;
   try {identity=await this.verifyPrincipal(context);} catch(_){return {ok:false,error:'ADMIN_AUTHORIZATION_FAILED'};}
   if(!identity||identity.verified!==true||identity.role!=='ADMIN'||!identity.subject)
     return {ok:false,error:'ADMIN_PERMISSION_DENIED'};
   const id=String(input.command_id||'');
   if(!/^[A-Za-z0-9_-]{16,128}$/.test(id))return {ok:false,error:'COMMAND_ID_INVALID'};
   if(input.confirmed!==true)return {ok:false,error:'ADMIN_CONFIRMATION_REQUIRED'};
   const timestamp=Number(input.timestamp);
   if(!Number.isSafeInteger(timestamp)||Math.abs(this.now()-timestamp)>60000)return {ok:false,error:'COMMAND_EXPIRED'};
   // Record authenticated intent; P4 and its acknowledgment share one SQLite transaction.
   if(!this.ledger)return {ok:false,error:'ADMIN_LEDGER_NOT_CONFIGURED'};
   const fingerprint=crypto.createHash('sha256').update(JSON.stringify({command,id,timestamp,params:input.params||{},subject:String(identity.subject)})).digest('hex');
   let record;
   try{
    const register=()=>{
     record=this.ledger.record({command_id:id,command,actor:identity.subject,fingerprint,decision:command==='EMERGENCY_STOP'?'HALT_REQUESTED':command,detail:'AUTH21_FIREWALL_VERIFIED'});
     if(record.ok&&command==='EMERGENCY_STOP'&&typeof this.lifecycle.transition==='function')
      this.lifecycle.transition('EMERGENCY_HALTED','ADMIN_EMERGENCY_STOP',{recovery_required:true,command_id:id});
    };
    if(this.lifecycle.db&&this.lifecycle.db===this.ledger.db)this.ledger.db.transaction(register).immediate();
    else {if(command==='EMERGENCY_STOP'&&this.lifecycle.db)return {ok:false,error:'ATOMIC_ADMIN_LEDGER_REQUIRED'};register();}
   }catch(e){return {ok:false,error:'ADMIN_LEDGER_UNAVAILABLE'};}
   if(!record.ok)return {ok:false,error:record.error};
   const security={journalDurable:true,liveAuthorization:false,mutationsEnabled:!!this.lifecycle.db,p4p5Qualified:false};
   if(command==='STATUS')return {ok:true,state:this.lifecycle.snapshot(),draining:this.draining?this.draining.status(identity.subject):null,maintenance:this.lifecycle.db?{
    pendingReconciliation:this.lifecycle.db.prepare("SELECT count(*) AS n FROM trading_operations WHERE phase='UNCERTAIN'").get().n,
    lastIntervention:this.ledger.db.prepare("SELECT command,received_at,decision FROM admin_commands WHERE command!='STATUS' ORDER BY received_at DESC,rowid DESC LIMIT 1").get()||null
   }:null,security};
   if(command==='EMERGENCY_STOP'&&this.lifecycle.db)return {ok:true,state:this.lifecycle.snapshot(),command_id:id,security,warning:'Existing broker orders and positions remain exposed; no liquidation or cancellation performed.'};
   if(command==='DRAINING_STOP'&&this.draining){const result=await this.draining.command(input.params||{},identity);return {...result,state:this.lifecycle.snapshot(),security};}
   if(command==='RECOVER'){
    if(!this.recoveryCheck)return {ok:false,error:'RECOVERY_RECONCILIATION_NOT_QUALIFIED'};
    const before=this.lifecycle.snapshot();
    const check=await this.recoveryCheck(identity);
    if(!check||check.exchangesVerified!==true||check.riskReady!==true||check.firewallReady!==true||check.portfolioReconciled!==true)return {ok:false,error:'RECOVERY_CHECKS_FAILED'};
    try{
     this.lifecycle.db.transaction(()=>{
      const latest=this.lifecycle.snapshot();
      if(latest.state!=='EMERGENCY_HALTED'||latest.generation!==before.generation)throw Error('RECOVERY_STATE_CHANGED');
      if(this.lifecycle.db.prepare("SELECT count(*) AS n FROM trading_operations WHERE phase='UNCERTAIN'").get().n)throw Error('RECOVERY_OPERATIONS_UNCERTAIN');
      const next={...latest,state:'STOPPED',reason:'ADMIN_RECOVERY_AUTHORIZED',recovery_required:true,generation:latest.generation+1,updated_at:this.now()};delete next.execution_allowed;
      this.lifecycle.db.prepare('UPDATE trading_lifecycle SET data=? WHERE id=1').run(JSON.stringify(next));
      this.lifecycle.db.prepare('INSERT INTO trading_lifecycle_events(at,state,reason) VALUES(?,?,?)').run(this.now(),'STOPPED','ADMIN_RECOVERY_AUTHORIZED');
     }).immediate();
     return {ok:true,state:this.lifecycle.snapshot(),security};
    }catch(_){return {ok:false,error:'RECOVERY_BLOCKED'};}
   }
   return {ok:false,error:'COMMAND_IMPLEMENTATION_PENDING',command};
 }
}
module.exports={TradingAdminController,ALLOWED};
