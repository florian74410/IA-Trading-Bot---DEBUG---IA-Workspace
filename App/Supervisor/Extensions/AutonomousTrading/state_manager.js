'use strict';
var MODES=['OFF','ANALYZE','PAPER','LIVE_GUARDED'];
function State(config){config=config||{};this.mode=MODES.indexOf(config.mode)>=0?config.mode:'OFF';this.masterEnabled=config.masterEnabled===true;this.liveEnabled=false;this.pendingActivation=null;}
State.prototype.requestMode=function(mode){mode=String(mode||'').toUpperCase();if(MODES.indexOf(mode)<0)return{ok:false,error:'INVALID_MODE'};if(!this.masterEnabled&&mode!=='OFF')return{ok:false,error:'AI_AUTONOMY_DISABLED'};if(mode==='LIVE_GUARDED')return{ok:false,error:'LIVE_RUNTIME_NOT_ENABLED'};if(mode==='PAPER'){this.pendingActivation={mode:mode,createdAt:Date.now()};return{ok:true,confirmationRequired:true,mode:mode}}this.mode=mode;return{ok:true,mode:mode};};
State.prototype.confirm=function(){if(!this.pendingActivation)return{ok:false,error:'NO_PENDING_ACTIVATION'};this.mode=this.pendingActivation.mode;this.pendingActivation=null;return{ok:true,mode:this.mode};};
State.prototype.disable=function(){this.mode='OFF';this.pendingActivation=null;return{ok:true,mode:'OFF'};};
module.exports=State;