'use strict';
/* Dynamic Indicator Engine settings. Registry is the source of truth.
   Mutable settings live exclusively in the per-user SQLite Settings Store. */
var path=require('path'),Store=require('../../Core/Settings/sqlite_settings_store');
var REFRESH_PRESETS=[1000,5000,15000,30000,60000],SCOPE='indicator_engine',KEY='settings';
function Settings(root,registry,opt){
 opt=opt||{};this.root=root;this.registry=registry;this.appRoot=path.resolve(root,'..');
 var trial=process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1';
 var business=trial&&process.env.IATB_AUTH21_BUSINESS_TRIAL==='1'&&
  process.env.IATB_AUTH21_IPC_PROBE_TRIAL==='1';
 this.readOnlyTrial=trial&&!business;
 if(business){
  var verified=require('../../Core/Backup/auth21_core_local_trial_wiring').preflightEnv(process.env);
  var username=String(process.env.IATB_USERDATA_USER||'fixture');
  if(!/^[A-Za-z0-9._-]{1,64}$/.test(username))throw Error('AUTH21_INDICATOR_USER_INVALID');
  var file=path.join(verified.root,'userdata','User Data',username,'user_data.db');
  if(process.env.IATB_USER_DB&&path.resolve(process.env.IATB_USER_DB)!==file)
   throw Error('AUTH21_INDICATOR_DB_OUTSIDE_TRIAL');
  if(!opt.snapshotGate||typeof opt.snapshotGate.assertWritable!=='function')
   throw Error('AUTH21_INDICATOR_SNAPSHOT_GATE_REQUIRED');
  this.store=new Store(this.appRoot,{dbPath:file,username:username,snapshotGate:opt.snapshotGate});
 }else this.store=this.readOnlyTrial?{ready:true,get:function(){return null;},
  set:function(){throw Error('AUTH21_INDICATOR_READ_ONLY');}}:new Store(this.appRoot);
 this.state=this._load();
}
Settings.prototype._defaultEnabled=function(meta){return meta&&meta.operation!=='liquidity_heatmap';};
Settings.prototype._normalize=function(raw){raw=raw&&typeof raw==='object'?raw:{};var items=this.registry.list(),old=raw.enabled&&typeof raw.enabled==='object'?raw.enabled:{},enabled={},self=this;items.forEach(function(m){enabled[m.id]=Object.prototype.hasOwnProperty.call(old,m.id)?old[m.id]!==false:self._defaultEnabled(m);});var refresh=+raw.refreshMs;if(REFRESH_PRESETS.indexOf(refresh)<0)refresh=15000;return{schema:'iatb.indicator.settings/1.0',refreshMs:refresh,enabled:enabled,updatedAt:raw.updatedAt||new Date().toISOString()};};
Settings.prototype._load=function(){var raw=this.store.get(SCOPE,KEY,null),n=this._normalize(raw||{});if(!this.readOnlyTrial)this._save(n);return n;};
Settings.prototype._save=function(o){if(!this.store.ready)throw new Error('INDICATOR_SETTINGS_STORE_UNAVAILABLE: '+(this.store.lastError||''));this.store.set(SCOPE,KEY,o);};
Settings.prototype.reconcile=function(){this.state=this._normalize(this.state);this._save(this.state);return this.get();};
Settings.prototype.get=function(){var self=this;return{schema:this.state.schema,refreshMs:this.state.refreshMs,refreshPresets:REFRESH_PRESETS.slice(),indicators:this.registry.list().map(function(m){return{id:m.id,name:m.name,version:m.version,category:m.category||'other',kind:m.kind,operation:m.operation,available:m.operation!=='liquidity_heatmap',enabled:self.state.enabled[m.id]!==false,chartAvailable:m.chartAvailable!==false,outputs:m.outputs||{},display:m.display||{},reason:m.operation==='liquidity_heatmap'?'EXTERNAL_ENGINE_REQUIRED':null};}),updatedAt:this.state.updatedAt};};
Settings.prototype.update=function(patch){patch=patch&&typeof patch==='object'?patch:{};var items=this.registry.list(),known=Object.create(null),enabled=this.state.enabled||{},i;for(i=0;i<items.length;i++)known[items[i].id]=items[i];if(patch.enabled&&typeof patch.enabled==='object'&&!Array.isArray(patch.enabled)){Object.keys(patch.enabled).forEach(function(id){if(known[id])enabled[id]=patch.enabled[id]!==false;});}var r=+patch.refreshMs;if(REFRESH_PRESETS.indexOf(r)>=0)this.state.refreshMs=r;this.state.enabled=enabled;this.state.updatedAt=new Date().toISOString();this.state=this._normalize(this.state);this._save(this.state);return this.get();};
Settings.prototype.enabledIds=function(){var s=this.state.enabled||{};return this.registry.list().filter(function(m){return s[m.id]!==false&&m.operation!=='liquidity_heatmap';}).map(function(m){return m.id;});};
module.exports={Settings:Settings,REFRESH_PRESETS:REFRESH_PRESETS};
