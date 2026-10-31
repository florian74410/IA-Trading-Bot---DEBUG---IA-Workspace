'use strict';
// P5 orchestration. Real adapters are deliberately NOT connected until ownership,
// remote status, risk authorization and Portfolio reconciliation are qualified.
const crypto=require('node:crypto');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function quantity(x){if(!/^\d+(\.\d{1,18})?$/.test(String(x)))throw Error('QUANTITY_INVALID');const [a,b='']=String(x).split('.');return BigInt(a)*10n**18n+BigInt(b.padEnd(18,'0'));}
const key=r=>JSON.stringify([r.exchange,r.account,r.market,r.kind,r.id]);
class DrainingStop {
 constructor({lifecycle,provider=null,simulation=false,now=Date.now}={}){
  this.lifecycle=lifecycle;this.db=lifecycle.db;this.provider=provider;this.simulation=simulation;this.now=now;this.busy=false;
  this.db.exec(`CREATE TABLE IF NOT EXISTS trading_drains(id TEXT PRIMARY KEY,owner TEXT NOT NULL,data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS trading_owned_resources(resource_key TEXT PRIMARY KEY,owner TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS trading_drain_actions(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,resource TEXT NOT NULL,phase TEXT NOT NULL,result TEXT);`);
 }
 status(owner){const row=this.db.prepare('SELECT data FROM trading_drains WHERE owner=? ORDER BY rowid DESC LIMIT 1').get(digest(owner));return row?JSON.parse(row.data):null;}
 load(id,owner){const row=this.db.prepare('SELECT data FROM trading_drains WHERE id=? AND owner=?').get(id,digest(owner));if(!row)throw Error('DRAIN_SCOPE_DENIED');return JSON.parse(row.data);}
 save(run,owner){this.db.prepare('INSERT INTO trading_drains VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(run.id,digest(owner),JSON.stringify(run));}
 active(run){const s=this.lifecycle.snapshot();if(s.state==='EMERGENCY_HALTED')throw Error('EMERGENCY_HALTED');if(s.run_id!==run.id||!['DRAINING','DRAINING_BLOCKED','RECONCILING'].includes(s.state))throw Error('DRAIN_SUPERSEDED');}
 async command(params={},identity){
  if(this.busy)return {ok:false,error:'DRAIN_COMMAND_IN_PROGRESS'};this.busy=true;
  try{
   if(!this.provider||!this.simulation){
    if(params.stage==='PREVIEW'&&['SAFE','CLOSE'].includes(params.mode)&&this.lifecycle.snapshot().state!=='EMERGENCY_HALTED')this.lifecycle.transition('DRAINING_BLOCKED','BROKER_RECONCILIATION_NOT_QUALIFIED',{recovery_required:true});
    return {ok:false,error:'BROKER_RECONCILIATION_NOT_QUALIFIED',liveAuthorization:false};
   }
   if(params.stage==='PREVIEW')return await this.preview(params,identity.subject);
   const run=this.load(params.run_id,identity.subject);this.active(run);
   if(params.stage==='CONFIRM')return await this.execute(run,params,identity.subject);
   if(params.stage==='RECONCILE')return await this.reconcile(run,identity.subject);
   return {ok:false,error:'DRAIN_STAGE_INVALID'};
  }catch(e){return {ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'DRAIN_FAILED'};}
  finally{this.busy=false;}
 }
 async preview(params,owner){
  if(!['SAFE','CLOSE'].includes(params.mode))throw Error('DRAIN_MODE_INVALID');
  const s=this.lifecycle.snapshot();if(!['RUNNING','STOPPED'].includes(s.state))throw Error('DRAIN_STATE_BLOCKED');
  const run={id:crypto.randomUUID(),mode:params.mode,phase:'INVENTORY',created_at:this.now(),resources:[],excluded:[],actions:[],residual:[],simulation:true};
  this.db.transaction(()=>{if(!['RUNNING','STOPPED'].includes(this.lifecycle.snapshot().state))throw Error('DRAIN_STATE_BLOCKED');this.save(run,owner);this.lifecycle.transition('DRAINING','ADMIN_DRAIN_PREFLIGHT',{run_id:run.id,recovery_required:true});}).immediate();
  try{
   const scopes=await this.provider.scopes(owner);this.active(run);
   if(!Array.isArray(scopes)||!scopes.length||scopes.length>32)throw Error('ACCOUNT_SCOPE_UNVERIFIED');
   run.scopes=scopes;
   for(const scope of scopes){
    const inventory=await this.provider.inventory(scope);this.active(run);
    if(inventory.complete!==true||!Number.isSafeInteger(inventory.at)||Math.abs(this.now()-inventory.at)>30000||!Array.isArray(inventory.resources))throw Error('INVENTORY_STALE_OR_INCOMPLETE');
    for(const r of inventory.resources){
     if(!r||!['order','position'].includes(r.kind)||!r.id||!r.symbol||r.exchange!==scope.exchange||r.account!==scope.account||r.market!==scope.market)throw Error('INVENTORY_SCOPE_MISMATCH');
     quantity(r.quantity);
     const own=this.db.prepare('SELECT owner FROM trading_owned_resources WHERE resource_key=?').get(key(r));
     if(!own||own.owner!==digest(owner)){run.excluded.push({...r,reason:'OWNERSHIP_UNVERIFIED_OR_MANUAL'});continue;}
     if(run.resources.some(x=>key(x)===key(r)))throw Error('INVENTORY_DUPLICATE');
     const capabilities=await this.provider.capabilities(scope);this.active(run);
     const action=r.kind==='order'?'CANCEL':run.mode==='CLOSE'?'CLOSE':'KEEP';
     if(action==='CANCEL'&&(!capabilities.cancel||!capabilities.status))throw Error('CANCEL_NOT_SUPPORTED');
     if(action==='CLOSE'&&(r.market==='SPOT'||!['LONG','SHORT'].includes(r.side)||!capabilities.reduceOnly||!capabilities.close||!capabilities.status))throw Error('CLOSE_NOT_SUPPORTED');
     run.resources.push({...r,action});
    }
   }
   run.disclosure={fees:'UNKNOWN_SIMULATION_ONLY',slippage:'Possible; partial execution and residual exposure require reconciliation'};
   run.plan_digest=digest({scopes:run.scopes,resources:run.resources,mode:run.mode,disclosure:run.disclosure});run.inventory_complete=true;run.phase='AWAITING_CONFIRMATION';this.save(run,owner);
   return {ok:true,run};
  }catch(e){return this.block(run,owner,e.message);}
 }
 block(run,owner,reason){run.phase='BLOCKED';run.error=/^[A-Z0-9_]+$/.test(reason)?reason:'BROKER_UNAVAILABLE';this.save(run,owner);if(this.lifecycle.snapshot().state!=='EMERGENCY_HALTED')this.lifecycle.transition('DRAINING_BLOCKED',run.error,{recovery_required:true});return {ok:false,error:run.error,run};}
 async execute(run,params,owner){
  if(run.phase!=='AWAITING_CONFIRMATION'||this.now()-run.created_at>30000||params.plan_digest!==run.plan_digest)throw Error('PLAN_EXPIRED_OR_CHANGED');
  if(run.mode==='CLOSE'&&params.close_confirmed!==true)throw Error('CLOSE_CONFIRMATION_REQUIRED');
  this.active(run);run.phase='EXECUTING';this.save(run,owner);
  try{
   for(const resource of run.resources.filter(r=>r.action!=='KEEP')){
    this.active(run);
    const current=await this.provider.status(resource);this.active(run);this.verify(resource,current);
    if(resource.kind==='order'&&['CANCELLED','FILLED','EXPIRED'].includes(current.status))continue;
    if(resource.kind==='position'&&quantity(current.quantity)===0n)continue;
    if(resource.kind==='order'&&!['OPEN','PARTIALLY_FILLED'].includes(current.status))throw Error('ORDER_STATUS_UNCERTAIN');
    if(resource.kind==='position'&&quantity(current.quantity)!==quantity(resource.quantity))throw Error('POSITION_CHANGED');
    const approved=await this.provider.authorize({owner,resource,runId:run.id});this.active(run);
    if(!approved||approved.risk!==true||approved.firewall!==true)throw Error('RISK_FIREWALL_DENIED');
    const id=digest([run.id,key(resource),resource.action]);
    this.db.prepare('INSERT INTO trading_drain_actions VALUES(?,?,?,?,NULL)').run(id,run.id,JSON.stringify(resource),'UNCERTAIN');
    // The provider is an in-memory qualification broker. No LIVE transport is installed.
    await this.lifecycle.submit({id,kind:resource.action,runId:run.id},()=>this.provider.mutate({id,resource,reduceOnly:resource.action==='CLOSE'}));
    // An acknowledgment never confirms a cancellation or a close.
   }
   return await this.reconcile(run,owner);
  }catch(e){return this.block(run,owner,e.message);}
 }
 verify(expected,observed){if(!observed||observed.proven!==true||key(expected)!==key(observed)||expected.symbol!==observed.symbol||!Number.isSafeInteger(observed.at)||Math.abs(this.now()-observed.at)>30000)throw Error('REMOTE_PROOF_INVALID');quantity(observed.quantity);}
 async reconcile(run,owner){
  if(run.inventory_complete!==true||!run.scopes?.length)throw Error('INVENTORY_INCOMPLETE');
  this.active(run);this.lifecycle.transition('RECONCILING','ADMIN_DRAIN_RECONCILE',{recovery_required:true});
  try{
   run.residual=[];
   // Fresh complete inventory is mandatory, including new positions from partial fills.
   for(const scope of run.scopes||[]){
    const inventory=await this.provider.inventory(scope);this.active(run);
    if(inventory.complete!==true||!Number.isSafeInteger(inventory.at)||Math.abs(this.now()-inventory.at)>30000)throw Error('INVENTORY_STALE_OR_INCOMPLETE');
    for(const r of inventory.resources){
     if(r.exchange!==scope.exchange||r.account!==scope.account||r.market!==scope.market)throw Error('INVENTORY_SCOPE_MISMATCH');
     if(quantity(r.quantity)>0n)run.residual.push(r);
     if(run.mode==='CLOSE'&&quantity(r.quantity)>0n&&!run.resources.concat(run.excluded).some(x=>key(x)===key(r)))throw Error('NEW_EXPOSURE_OWNERSHIP_UNCERTAIN');
     const owned=this.db.prepare('SELECT owner FROM trading_owned_resources WHERE resource_key=?').get(key(r));
     if(owned?.owner===digest(owner)&&quantity(r.quantity)>0n&&(r.kind==='order'||run.mode==='CLOSE'))throw Error('RESIDUAL_EXPOSURE');
    }
   }
   for(const r of run.resources.filter(x=>x.action!=='KEEP')){
    const actual=await this.provider.status(r);this.active(run);this.verify(r,actual);
    if(r.kind==='order'&&!['CANCELLED','FILLED','EXPIRED'].includes(actual.status))throw Error('CANCELLATION_UNCONFIRMED');
    if(r.kind==='position'&&quantity(actual.quantity)!==0n)throw Error('CLOSE_PARTIAL_OR_UNCONFIRMED');
    const id=digest([run.id,key(r),r.action]);
    this.db.prepare("UPDATE trading_drain_actions SET phase='CONFIRMED',result=? WHERE id=?").run(JSON.stringify(actual),id);
    this.db.prepare("UPDATE trading_operations SET phase='CONFIRMED',updated_at=? WHERE id=?").run(this.now(),id);
   }
   if(!await this.provider.reconcilePortfolio(run))throw Error('PORTFOLIO_UNCONFIRMED');this.active(run);
   if(this.db.prepare("SELECT count(*) AS n FROM trading_operations WHERE phase='UNCERTAIN'").get().n)throw Error('OPERATIONS_UNCERTAIN');
   run.phase='COMPLETED';run.completed_at=this.now();
   this.db.transaction(()=>{this.save(run,owner);this.lifecycle.transition('STOPPED','DRAIN_CONFIRMED',{recovery_required:true});}).immediate();
   return {ok:true,run};
  }catch(e){return this.block(run,owner,e.message);}
 }
}
module.exports={DrainingStop,key,digest,quantity};
