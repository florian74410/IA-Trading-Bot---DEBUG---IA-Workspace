'use strict';

var PRIORITIES=['P0','P1','P2','P3'];
var FRESHNESS=['REALTIME','FAST','STANDARD','SLOW'];
var CRITICALITY=['CRITICAL','HIGH','NORMAL','LOW'];

function normEnum(v,allowed,fallback){v=String(v||fallback).toUpperCase();return allowed.indexOf(v)>=0?v:fallback;}
function Policy(o){
 o=o||{};
 this.version='1.0';
 this.rules=Object.create(null);
 this.providerDefaults=Object.create(null);
 (o.rules||[]).forEach(this.register.bind(this));
}
Policy.prototype.setProviderDefaults=function(provider,defaults){
 provider=String(provider||'').toUpperCase();
 this.providerDefaults[provider]=Object.assign({
  priority:'P2',freshness:'STANDARD',criticality:'NORMAL',
  cacheTtlMs:300000,mode:'ON_DEMAND',firewallRequired:true,
  retention:'MEMORY',distribution:'ROUTER_CP1'
 },defaults||{});
 return this.providerDefaults[provider];
};
Policy.prototype.register=function(rule){
 rule=rule||{};
 var provider=String(rule.provider||'').toUpperCase(),dataset=String(rule.dataset||'').toUpperCase();
 if(!provider||!dataset)throw new Error('DATA_SOURCE_POLICY_INVALID_RULE');
 var base=this.providerDefaults[provider]||{};
 var r=Object.assign({},base,rule);
 r.provider=provider;r.dataset=dataset;
 r.priority=normEnum(r.priority,PRIORITIES,'P2');
 r.freshness=normEnum(r.freshness,FRESHNESS,'STANDARD');
 r.criticality=normEnum(r.criticality,CRITICALITY,'NORMAL');
 r.cacheTtlMs=Math.max(0,+r.cacheTtlMs||0);
 r.mode=String(r.mode||'ON_DEMAND').toUpperCase();
 r.firewallRequired=r.firewallRequired!==false;
 r.retention=String(r.retention||'MEMORY').toUpperCase();
 r.distribution=String(r.distribution||'ROUTER_CP1').toUpperCase();
 r.alternates=Array.isArray(r.alternates)?r.alternates.map(function(x){return String(x).toUpperCase();}):[];
 this.rules[provider+'|'+dataset]=r;
 return r;
};
Policy.prototype.resolve=function(provider,dataset){
 provider=String(provider||'').toUpperCase();dataset=String(dataset||'').toUpperCase();
 var exact=this.rules[provider+'|'+dataset];
 if(exact)return Object.assign({},exact);
 var base=this.providerDefaults[provider]||{};
 return Object.assign({
  provider:provider,dataset:dataset,priority:'P2',freshness:'STANDARD',
  criticality:'NORMAL',cacheTtlMs:300000,mode:'ON_DEMAND',
  firewallRequired:true,retention:'MEMORY',distribution:'ROUTER_CP1',alternates:[]
 },base,{provider:provider,dataset:dataset});
};
Policy.prototype.snapshot=function(){return{version:this.version,providers:Object.keys(this.providerDefaults),rules:Object.keys(this.rules).map(function(k){return this.rules[k];},this)};};

module.exports=Policy;
