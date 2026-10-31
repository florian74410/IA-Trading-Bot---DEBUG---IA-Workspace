'use strict';
var SettingsStore=require('../../Core/Settings/sqlite_settings_store');
function SupervisorSettings(root){this.store=new SettingsStore(root);}
SupervisorSettings.prototype.app=function(){var active=this.store.get('app_settings','active_file','DefaultAppSettings.dat'),x=this.store.get('app_profile',active,null);if(!x&&active!=='DefaultAppSettings.dat')x=this.store.get('app_profile','DefaultAppSettings.dat',null);return x&&typeof x==='object'?x:{};};
SupervisorSettings.prototype.llm=function(){var a=this.app(),x=a.ai&&a.ai.llm||{};return{provider:String(x.provider||'MOCK').toUpperCase(),fallbackEnabled:x.fallbackEnabled===true,fallbackProvider:String(x.fallbackProvider||'OPENAI_API').toUpperCase(),openai:Object.assign({model:'gpt-5.6',timeoutMs:45000},x.openai||{}),remote:Object.assign({endpoint:'',model:'',timeoutMs:45000,healthTimeoutMs:5000},x.remote||{}),mock:x.mock||{}};};
SupervisorSettings.prototype.autonomous=function(){var a=this.app(),x=a.ai&&a.ai.autonomousTrading||{};return{masterEnabled:x.masterEnabled===true,mode:String(x.mode||'OFF').toUpperCase(),paperRequiresConfirmation:x.paperRequiresConfirmation!==false,liveGuardedEnabled:x.liveGuardedEnabled===true,chatCommandsEnabled:x.chatCommandsEnabled!==false};};
SupervisorSettings.prototype.status=function(){return this.store.status();};
module.exports=SupervisorSettings;