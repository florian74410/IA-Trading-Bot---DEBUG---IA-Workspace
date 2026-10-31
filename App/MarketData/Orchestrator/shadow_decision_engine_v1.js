'use strict';

var Passport=require('./provider_passport_v1');
var Alternates=require('./alternate_provider_policy_v1');

function out(action,reason,opt){
 opt=opt||{};
 return{
  mode:'SHADOW',
  action:action,
  reason:reason,
  advisory:opt.advisory===true,
  executable:false,
  blocking:false,
  provider:opt.provider||'',
  dataset:opt.dataset||'',
  priority:opt.priority||'P2',
  criticality:opt.criticality||'NORMAL',
  alternates:Array.isArray(opt.alternates)?opt.alternates.slice():[],
  providerRank:opt.providerRank==null?null:opt.providerRank,
  nextProvider:opt.nextProvider||null,
  nextRank:opt.nextRank==null?null:opt.nextRank,
  chainMode:opt.chainMode||null,
  userMessage:opt.userMessage||null
 };
}

function start(ctx){
 ctx=ctx||{};var p=ctx.policy||{},b=ctx.broker||{},provider=String(ctx.provider||p.provider||'').toUpperCase(),dataset=ctx.dataset||p.dataset,chain=Alternates.get(dataset),rank=Alternates.rank(dataset,provider);
 var base={provider:provider,dataset:dataset,priority:p.priority,criticality:p.criticality,alternates:chain&&chain.providers||p.alternates,providerRank:rank,chainMode:chain&&chain.mode||null};
 if(b.inflightDuplicate)return out('DEDUP_CANDIDATE','IDENTICAL_REQUEST_IN_FLIGHT',base);
 return out('ALLOW','NO_PRECALL_CONSTRAINT',base);
}

function transport(ctx){
 ctx=ctx||{};var p=ctx.policy||{},b=ctx.budget||{},provider=String(ctx.provider||p.provider||'').toUpperCase(),passport=Passport.get(provider);
 var base={provider:provider,dataset:ctx.dataset||p.dataset,priority:p.priority,criticality:p.criticality,alternates:p.alternates};
 if(b.wouldAllow===false){
  if(b.blockingEligible===true)return out('DELAY','BUDGET_WOULD_DENY',base);
  base.advisory=true;return out('ALLOW_WITH_ADVISORY','NON_BLOCKING_QUOTA_SIGNAL',base);
 }
 if(passport&&passport.quota&&passport.quota.enforcementPolicy==='OBSERVE_ONLY_NON_BLOCKING'){
  base.advisory=true;return out('ALLOW_WITH_ADVISORY','QUOTA_OBSERVE_ONLY',base);
 }
 return out('ALLOW','BUDGET_OK_OR_NOT_ENFORCEABLE',base);
}

function end(ctx){
 ctx=ctx||{};var p=ctx.policy||{},provider=String(ctx.provider||p.provider||'').toUpperCase(),dataset=ctx.dataset||p.dataset,chain=Alternates.get(dataset),rank=Alternates.rank(dataset,provider);
 var base={provider:provider,dataset:dataset,priority:p.priority,criticality:p.criticality,alternates:chain&&chain.providers||p.alternates,providerRank:rank,chainMode:chain&&chain.mode||null};
 if(ctx.error){
  var d=Alternates.decision(dataset,provider,ctx.error,ctx.unhealthy||{});
  if(d.action==='TRY_NEXT_PROVIDER'){base.nextProvider=d.nextProvider;base.nextRank=d.nextRank;return out('FALLBACK_CANDIDATE','PRIMARY_PROVIDER_ERROR_WITH_ALTERNATE',base);}
  if(d.action==='AGGREGATE_PARTIAL'){base.advisory=true;return out('AGGREGATE_PARTIAL','AGGREGATE_PROVIDER_MISSING',base);}
  if(d.action==='NO_PROVIDER_AVAILABLE'){base.advisory=true;base.userMessage='Aucun Provider compatible n\'est actuellement disponible pour cette donnée.';return out('NO_PROVIDER_AVAILABLE','FALLBACK_CHAIN_EXHAUSTED',base);}
  base.advisory=true;return out('PROVIDER_ERROR','NON_FALLBACKABLE_PROVIDER_ERROR',base);
 }
 return out('COMPLETE','PROVIDER_RESPONSE_OK',base);
}

function evaluate(phase,ctx){
 phase=String(phase||'').toUpperCase();
 if(phase==='START')return start(ctx);
 if(phase==='TRANSPORT')return transport(ctx);
 if(phase==='END')return end(ctx);
 return out('ALLOW','PHASE_NOT_CLASSIFIED',{});
}

module.exports={evaluate:evaluate,start:start,transport:transport,end:end};
