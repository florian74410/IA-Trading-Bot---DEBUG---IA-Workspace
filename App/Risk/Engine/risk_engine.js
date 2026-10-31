'use strict';
/*
 IA-Trading-Bot - Risk Engine base v0.1 (target v1.7.9 debug)
 Pure analytical engine. No order approval, modification or rejection.
 Node.js 16 compatible, zero npm dependencies.
*/

function finite(v, fallback) {
  v = +v;
  return isFinite(v) ? v : (fallback == null ? 0 : fallback);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, finite(v))); }
function pct(n, d) { return d > 0 ? (n / d) * 100 : 0; }
function mean(a) {
  if (!a || !a.length) return 0;
  var s = 0; for (var i=0;i<a.length;i++) s += finite(a[i]);
  return s / a.length;
}
function stdev(a) {
  if (!a || a.length < 2) return 0;
  var m = mean(a), s = 0;
  for (var i=0;i<a.length;i++) { var d = finite(a[i])-m; s += d*d; }
  return Math.sqrt(s/(a.length-1));
}
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  q = clamp(q, 0, 1);
  var p = (sorted.length-1)*q, lo=Math.floor(p), hi=Math.ceil(p);
  if (lo===hi) return sorted[lo];
  return sorted[lo] + (sorted[hi]-sorted[lo])*(p-lo);
}
function timeframePeriods(tf) {
  return {
    '1m':525600, '5m':105120, '15m':35040, '30m':17520,
    '1h':8760, '4h':2190, '1d':365, '1w':52
  }[String(tf||'1h').toLowerCase()] || 8760;
}
function candleClose(c) {
  if (Array.isArray(c)) return finite(c[4], NaN);
  if (c && typeof c === 'object') return finite(c.close != null ? c.close : c.c, NaN);
  return NaN;
}
function returnsFromCandles(candles) {
  var closes=[], out=[];
  (candles||[]).forEach(function(c){
    var x=candleClose(c); if (isFinite(x) && x>0) closes.push(x);
  });
  for(var i=1;i<closes.length;i++) out.push(Math.log(closes[i]/closes[i-1]));
  return out;
}
function historicalTailRisk(returns, alpha) {
  alpha = clamp(alpha || 0.95, 0.5, 0.999);
  if (!returns || returns.length < 5) return {varPct:0, expectedShortfallPct:0, samples:returns?returns.length:0};
  var losses = returns.map(function(r){return -finite(r);}).sort(function(a,b){return a-b;});
  var threshold = quantile(losses, alpha);
  var tail = losses.filter(function(x){return x>=threshold;});
  return {
    varPct: Math.max(0,threshold*100),
    expectedShortfallPct: Math.max(0,mean(tail)*100),
    samples: returns.length
  };
}
function volatility(candles, timeframe) {
  var r=returnsFromCandles(candles), sd=stdev(r), periods=timeframePeriods(timeframe);
  return {
    samples:r.length,
    periodVolatilityPct:sd*100,
    annualizedVolatilityPct:sd*Math.sqrt(periods)*100,
    meanReturnPct:mean(r)*100
  };
}
function maxDrawdown(candles) {
  var peak=0,maxDd=0,last=0;
  (candles||[]).forEach(function(c){
    var x=candleClose(c); if (!isFinite(x)||x<=0)return;
    last=x; if(x>peak)peak=x;
    if(peak>0)maxDd=Math.max(maxDd,(peak-x)/peak);
  });
  return {historicalMaxDrawdownPct:maxDd*100,lastPrice:last||0};
}
function positionRisk(position, portfolio) {
  position=position||{}; portfolio=portfolio||{};
  var entry=finite(position.entryPrice || position.entry || position.price);
  var stop=finite(position.stopLoss || position.stop);
  var qty=Math.abs(finite(position.quantity || position.qty || position.sizeUnits));
  var notional=Math.abs(finite(position.notional));
  if(!notional && entry>0 && qty>0) notional=entry*qty;
  var leverage=Math.max(1,finite(position.leverage,1));
  var equity=Math.max(0,finite(portfolio.equity || portfolio.totalEquity || portfolio.capital));
  var stopDistancePct=(entry>0&&stop>0)?Math.abs(entry-stop)/entry*100:0;
  var lossAtStop=(entry>0&&stop>0&&qty>0)?Math.abs(entry-stop)*qty:0;
  if(!lossAtStop && notional>0 && stopDistancePct>0) lossAtStop=notional*(stopDistancePct/100);
  var marginUsed=notional/leverage;
  return {
    entryPrice:entry,
    stopLoss:stop,
    notional:notional,
    leverage:leverage,
    marginUsed:marginUsed,
    stopDistancePct:stopDistancePct,
    lossAtStop:lossAtStop,
    capitalAtRiskPct:pct(lossAtStop,equity),
    notionalToEquityPct:pct(notional,equity),
    marginToEquityPct:pct(marginUsed,equity)
  };
}
function portfolioRisk(portfolio) {
  portfolio=portfolio||{};
  var positions=Array.isArray(portfolio.positions)?portfolio.positions:[];
  var equity=Math.max(0,finite(portfolio.equity || portfolio.totalEquity || portfolio.capital));
  var cash=Math.max(0,finite(portfolio.cash || portfolio.availableBalance || portfolio.available));
  var totalNotional=0,totalMargin=0,totalStopLoss=0,byAsset=Object.create(null),unrealized=0;
  positions.forEach(function(p){
    var r=positionRisk(p,{equity:equity});
    totalNotional+=r.notional; totalMargin+=r.marginUsed; totalStopLoss+=r.lossAtStop;
    unrealized+=finite(p.unrealizedPnl || p.pnl);
    var asset=String(p.asset || p.symbol || 'UNKNOWN').toUpperCase();
    byAsset[asset]=(byAsset[asset]||0)+r.notional;
  });
  var concentrations=[];
  Object.keys(byAsset).forEach(function(k){
    concentrations.push({asset:k,notional:byAsset[k],sharePct:totalNotional>0?byAsset[k]/totalNotional*100:0});
  });
  concentrations.sort(function(a,b){return b.sharePct-a.sharePct;});
  return {
    equity:equity,
    cash:cash,
    unrealizedPnl:unrealized,
    openPositions:positions.length,
    totalNotional:totalNotional,
    totalMarginUsed:totalMargin,
    grossExposurePct:pct(totalNotional,equity),
    marginUsagePct:pct(totalMargin,equity),
    aggregateLossAtStops:totalStopLoss,
    aggregateCapitalAtRiskPct:pct(totalStopLoss,equity),
    concentration:concentrations
  };
}
function riskScore(parts,settings) {
  parts=parts||{}; settings=settings||{}; var w=settings.scoreWeights||{};
  var score=0;
  score += clamp(finite(parts.capitalAtRiskPct)*finite(w.capitalAtRisk,8),0,32);
  score += clamp((finite(parts.grossExposurePct)-50)*finite(w.grossExposure,0.20),0,22);
  score += clamp((finite(parts.leverage)-1)*finite(w.leverage,5),0,18);
  score += clamp(finite(parts.annualizedVolatilityPct)*finite(w.volatility,0.20),0,18);
  score += clamp(finite(parts.drawdownPct)*finite(w.drawdown,0.50),0,10);
  return Math.round(clamp(score,0,100));
}
function level(score) {
  if(score>=80)return'CRITICAL';
  if(score>=60)return'HIGH';
  if(score>=35)return'MODERATE';
  if(score>=15)return'LOW';
  return'VERY_LOW';
}
function warningsFor(m,settings) {
  settings=settings||{}; var t=settings.thresholds||{}; var w=[];
  if(m.capitalAtRiskPct>=finite(t.capitalRiskWarningPct,3))w.push('POSITION_CAPITAL_AT_RISK_HIGH');
  if(m.grossExposurePct>=finite(t.grossExposureWarningPct,100))w.push('PORTFOLIO_GROSS_EXPOSURE_HIGH');
  if(m.leverage>=finite(t.leverageWarning,5))w.push('LEVERAGE_HIGH');
  if(m.annualizedVolatilityPct>=finite(t.volatilityWarningPct,100))w.push('VOLATILITY_EXTREME');
  if(m.drawdownPct>=finite(t.drawdownWarningPct,20))w.push('HISTORICAL_DRAWDOWN_HIGH');
  if(m.var95Pct>=finite(t.var95WarningPct,5))w.push('VAR_95_HIGH');
  return w;
}
function analyze(input) {
  input=input||{};
  var market=input.market||{}, portfolio=input.portfolio||{}, position=input.position||input.strategy||{}, settings=input.settings||{};
  var candles=market.candles||[];
  var tf=input.timeframe || market.timeframe || '1h';
  var pos=positionRisk(position,portfolio);
  var port=portfolioRisk(portfolio);
  var vol=volatility(candles,tf);
  var dd=maxDrawdown(candles);
  var rets=returnsFromCandles(candles);
  var h95=historicalTailRisk(rets,0.95), h99=historicalTailRisk(rets,0.99);
  var projectedNotional=port.totalNotional+pos.notional;
  var projectedGross=pct(projectedNotional,port.equity);
  var metrics={
    capitalAtRiskPct:pos.capitalAtRiskPct,
    grossExposurePct:projectedGross,
    leverage:pos.leverage,
    annualizedVolatilityPct:vol.annualizedVolatilityPct,
    drawdownPct:dd.historicalMaxDrawdownPct,
    var95Pct:h95.varPct,
    expectedShortfall95Pct:h95.expectedShortfallPct
  };
  var score=riskScore(metrics,settings);
  return {
    schema:'risk.analysis/0.1',
    generatedAt:Date.now(),
    symbol:String(input.symbol || position.symbol || market.symbol || '').toUpperCase(),
    timeframe:tf,
    score:score,
    level:level(score),
    position:pos,
    portfolio:port,
    projected:{
      grossExposurePct:projectedGross,
      totalNotional:projectedNotional
    },
    marketRisk:{
      volatility:vol,
      drawdown:dd,
      historicalVaR95Pct:h95.varPct,
      historicalExpectedShortfall95Pct:h95.expectedShortfallPct,
      historicalVaR99Pct:h99.varPct,
      historicalExpectedShortfall99Pct:h99.expectedShortfallPct,
      tailSamples:h95.samples
    },
    snapshot:{level:level(score),score:score,capitalAtRiskPct:metrics.capitalAtRiskPct,grossExposurePct:metrics.grossExposurePct,leverage:metrics.leverage,var95Pct:metrics.var95Pct,expectedShortfall95Pct:metrics.expectedShortfall95Pct,drawdownPct:metrics.drawdownPct},
    warnings:warningsFor(metrics,settings),
    notes:[
      'ANALYTICAL_ONLY',
      'NO_ORDER_APPROVAL_OR_BLOCKING',
      'TAIL_RISK_USES_HISTORICAL_RETURNS'
    ]
  };
}

module.exports={
  analyze:analyze,
  positionRisk:positionRisk,
  portfolioRisk:portfolioRisk,
  volatility:volatility,
  maxDrawdown:maxDrawdown,
  historicalTailRisk:historicalTailRisk,
  returnsFromCandles:returnsFromCandles
};
