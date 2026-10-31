'use strict';
var wt=require('worker_threads'),path=require('path');

function Manager(o){
 o=o||{};this.collector=o.collector;this.telemetryStore=o.telemetryStore||null;this.enabled=o.enabled!==false;this.providers=o.providers||{BINANCE_FUTURES:true,OKX:true,BYBIT:true};this.workers=Object.create(null);this.states=Object.create(null);this.accepted=0;this.rejected=0;this.startedAt=0;
}
Manager.prototype._telemetry=function(id,eventType,state,extra){if(!this.telemetryStore||typeof this.telemetryStore.saveStream!=='function')return;var s=this.states[id]||{},x=Object.assign({timestamp:Date.now(),provider:id,eventType:eventType||'STATUS',state:state||s.state||'',connections:s.connections||0,reconnects:s.retries||0,subscriptions:Array.isArray(s.subscriptions)?s.subscriptions.length:(+s.subscriptions||0),messages:s.events||0,lastMessageAt:s.lastEventAt||null,lastHeartbeatAt:s.lastHeartbeatAt||null,errorCode:s.lastError||''},extra||{});try{this.telemetryStore.saveStream(x);}catch(e){}};
Manager.prototype._spawn=function(id,file){
 var self=this,w=new wt.Worker(path.resolve(__dirname,'../Workers',file),{env:process.env});self.workers[id]=w;self.states[id]={provider:id,state:'STARTING',events:0,lastEventAt:null,lastHeartbeatAt:null,lastError:null,retries:0,connections:0,subscriptions:[]};self._telemetry(id,'CONNECT','STARTING');
 w.on('message',function(m){if(!m)return;if(m.type==='status'){var prev=self.states[id]&&self.states[id].state;self.states[id]=Object.assign({},self.states[id],m);self._telemetry(id,prev!==m.state?'STATE_CHANGE':'STATUS',m.state);return;}if(m.type==='liquidation'&&m.event){self.collector.acceptLiquidation(m.event,function(e,result){if(e){self.rejected++;self.states[id].lastError=e.message;}else if(!(result&&result.duplicate))self.accepted++;});}});
 w.on('error',function(e){self.states[id]=Object.assign({},self.states[id],{state:'ERROR',lastError:e.message});self._telemetry(id,'ERROR','ERROR');});
 w.on('exit',function(code){self.states[id]=Object.assign({},self.states[id],{state:self.enabled?'EXITED':'STOPPED',exitCode:code});self._telemetry(id,'DISCONNECT',self.states[id].state,{meta:{exitCode:code}});delete self.workers[id];});
};
Manager.prototype.start=function(){
 if(!this.enabled||this.startedAt)return this.status();this.startedAt=Date.now();
 if(this.providers.BINANCE_FUTURES!==false)this._spawn('BINANCE_FUTURES','binance_liquidations_worker.js');
 if(this.providers.OKX!==false)this._spawn('OKX','okx_liquidations_worker.js');
 if(this.providers.BYBIT!==false)this._spawn('BYBIT','bybit_liquidations_worker.js');
 return this.status();
};
Manager.prototype.configure=function(o){
 o=o||{};if(typeof o.enabled==='boolean')this.enabled=o.enabled;if(o.providers)this.providers=Object.assign({},this.providers,o.providers);
 var self=this,defs={BINANCE_FUTURES:'binance_liquidations_worker.js',OKX:'okx_liquidations_worker.js',BYBIT:'bybit_liquidations_worker.js'};
 Object.keys(defs).forEach(function(id){var want=self.enabled&&self.providers[id]!==false,has=!!self.workers[id];if(want&&!has)self._spawn(id,defs[id]);else if(!want&&has){try{self.workers[id].postMessage({op:'stop'});}catch(e){}}});
 return this.status();
};
Manager.prototype.watchSymbol=function(symbol){
 var s=String(symbol||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(!s)return this.status();
 var w=this.workers.BYBIT;if(w)try{w.postMessage({op:'subscribe',symbol:s});this._telemetry('BYBIT','SUBSCRIBE',this.states.BYBIT&&this.states.BYBIT.state,{meta:{symbol:s}});}catch(e){this.states.BYBIT=Object.assign({},this.states.BYBIT,{lastError:e.message});this._telemetry('BYBIT','ERROR','ERROR',{errorCode:e.message});}
 return this.status();
};
Manager.prototype.stop=function(){
 this.enabled=false;Object.keys(this.workers).forEach(function(k){try{this.workers[k].postMessage({op:'stop'});}catch(e){}},this);return this.status();
};
Manager.prototype.status=function(){return{ok:true,enabled:this.enabled,mode:'WORKER_PER_PROVIDER',startedAt:this.startedAt||null,accepted:this.accepted,rejected:this.rejected,providers:Object.keys(this.states).map(function(k){return this.states[k];},this)};};
module.exports=Manager;
