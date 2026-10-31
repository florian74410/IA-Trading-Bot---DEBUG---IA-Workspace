'use strict';
(function(){
var $=function(id){return document.getElementById(id)},state={range:'7d',overview:null,tradeLimit:10,lastHistory:[]};

function api(url,opt){opt=opt||{};return fetch(url,{method:opt.method||'GET',headers:{'Content-Type':'application/json'},body:opt.body?JSON.stringify(opt.body):undefined,cache:'no-store'}).then(function(r){return r.json().catch(function(){return{};}).then(function(o){if(!r.ok)throw new Error(o.error||('HTTP '+r.status));return o;});});}
function uiRead(action,args){return fetch('/communication/v1/ui/read',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:'portfolio',action:action,arguments:args||{}}),cache:'no-store'}).then(function(r){return r.json().catch(function(){return{};}).then(function(o){if(!r.ok||o.error)throw new Error(o.error||('HTTP '+r.status));return o.data||{};});});}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function money(v,c){if(v==null||!isFinite(+v))return'--';return new Intl.NumberFormat('fr-FR',{style:'currency',currency:c||'EUR',maximumFractionDigits:2}).format(+v)}
function num(v,d){if(v==null||!isFinite(+v))return'--';return(+v).toLocaleString('fr-FR',{maximumFractionDigits:d==null?2:d})}
function pct(v){return v==null||!isFinite(+v)?'--':((+v>=0?'+':'')+(+v).toFixed(2).replace('.',',')+' %')}
function cls(el,v){if(!el)return;el.classList.remove('positive','negative');if(v>0)el.classList.add('positive');if(v<0)el.classList.add('negative')}
function short(v,l,r){v=String(v||'');l=l||8;r=r||6;return v.length>l+r+3?v.slice(0,l)+'…'+v.slice(-r):(v||'--')}
function assetOf(s){return String(s||'').replace(/(?:USDT|USDC|USD|EUR)$/i,'')||String(s||'--')}
function when(ts){return ts?new Date(+ts).toLocaleString('fr-FR'):'--'}
function duration(ms){ms=+ms||0;if(!ms)return'--';var s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);if(d)return d+'j '+(h%24)+'h';if(h)return h+'h '+(m%60)+'m';if(m)return m+'m '+(s%60)+'s';return s+'s'}

function healthBadge(v){v=String(v||'UNKNOWN').toUpperCase();return 'healthBadge '+(v==='HEALTHY'?'healthy':v==='WATCH'?'watch':v==='WARNING'?'warning':v==='CRITICAL'?'critical':'')}

function drawLine(rows){
 var c=$('equityChart'),empty=$('chartEmpty');if(!c||!empty)return;var ctx=c.getContext('2d'),box=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
 c.width=Math.max(1,Math.round(box.width*dpr));c.height=Math.max(1,Math.round(box.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,box.width,box.height);
 rows=(rows||[]).filter(function(x){return x.equity!=null&&isFinite(+x.equity)});empty.style.display=rows.length>1?'none':'flex';if(rows.length<2)return;
 var vals=rows.map(function(x){return+x.equity}),min=Math.min.apply(null,vals),max=Math.max.apply(null,vals),pad=Math.max((max-min)*.15,1);min-=pad;max+=pad;
 ctx.strokeStyle='#12313d';ctx.lineWidth=1;for(var i=1;i<5;i++){var gy=box.height*i/5;ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(box.width,gy);ctx.stroke();}
 var zeroY=box.height-8-(0-min)/(max-min)*(box.height-16);if(zeroY>0&&zeroY<box.height){ctx.strokeStyle='#344656';ctx.beginPath();ctx.moveTo(0,zeroY);ctx.lineTo(box.width,zeroY);ctx.stroke();}
 ctx.strokeStyle=(vals[vals.length-1]||0)>=0?'#30df8b':'#ff5d68';ctx.lineWidth=2;ctx.beginPath();
 rows.forEach(function(r,i){var x=i/(rows.length-1)*(box.width-12)+6,y=box.height-8-(+r.equity-min)/(max-min)*(box.height-16);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();
}

function renderHealth(source,positions){
 var rows=source&&Array.isArray(source.positions)?source.positions:(positions||[]),n={HEALTHY:0,WATCH:0,WARNING:0,CRITICAL:0,UNKNOWN:0};
 rows.forEach(function(p){var h=String(p.health||'UNKNOWN').toUpperCase();if(n[h]==null)h='UNKNOWN';n[h]++;});
 $('healthHealthy').textContent=n.HEALTHY;$('healthWatch').textContent=n.WATCH;$('healthWarning').textContent=n.WARNING;$('healthCritical').textContent=n.CRITICAL;$('healthUnknown').textContent=n.UNKNOWN;
 $('healthUpdated').textContent=new Date().toLocaleTimeString('fr-FR');
}

function positionRow(p,ccy){
 var walletId=p.wallet_id||p.walletId||'UNASSIGNED',walletName=p.wallet_name||p.walletName||'Wallet',pub=p.wallet_public_key||p.walletPublicKey||'',health=String(p.health||'UNKNOWN').toUpperCase();
 return '<tr>'+
  '<td class="walletCell"><b>'+esc(walletName)+'</b><small>ID '+esc(walletId)+' · '+esc(short(pub,12,8))+'</small></td>'+
  '<td class="assetCell"><b>'+esc(assetOf(p.symbol))+'</b><small>'+esc(p.symbol||'--')+'</small></td>'+
  '<td>'+esc(p.exchange||'--')+'</td>'+
  '<td class="'+(String(p.side).toUpperCase()==='LONG'?'sideLong':'sideShort')+'">'+esc(p.side||'--')+'</td>'+
  '<td>'+num(p.quantity,8)+'</td>'+
  '<td>'+money(p.collateral!=null?p.collateral:p.margin,ccy)+'</td>'+
  '<td>'+(p.leverage==null?'--':num(p.leverage,2)+'×')+'</td>'+
  '<td>'+money(p.average_entry,ccy)+'</td>'+
  '<td>'+money(p.mark_price,ccy)+'</td>'+
  '<td>'+money(p.liquidation_price,ccy)+(p.liquidation_distance_pct==null?'':' <small>'+num(p.liquidation_distance_pct,1)+'%</small>')+'</td>'+
  '<td class="'+((p.unrealized_pnl||0)>=0?'pos':'neg')+'">'+money(p.unrealized_pnl,ccy)+'</td>'+
  '<td>'+when(p.opened_at)+'</td>'+
  '<td><span class="'+healthBadge(health)+'">'+esc(health)+'</span></td>'+
 '</tr>';
}
function renderPositions(pos,ccy){
 pos=Array.isArray(pos)?pos:[];$('openCount').textContent=pos.length;$('positionCount').textContent=pos.length+' position'+(pos.length>1?'s':'');
 $('positionsBody').innerHTML=pos.length?pos.map(function(p){return positionRow(p,ccy)}).join(''):'<tr><td colspan="13" class="emptyCell">Aucune position ouverte.</td></tr>';
}

function tradeRow(t,ccy){
 var wallet=t.wallet_id||t.walletId||'UNASSIGNED',walletName=t.wallet_name||t.walletName||'Wallet',pub=t.wallet_public_key||t.walletPublicKey||'';
 return '<tr class="tradeRow" data-trade-id="'+esc(t.trade_id)+'">'+
  '<td>'+when(t.closed_at)+'</td>'+
  '<td class="walletCell"><b>'+esc(walletName)+'</b><small title="'+esc(pub)+'">ID '+esc(wallet)+' · '+esc(short(pub,10,7))+'</small></td>'+
  '<td class="assetCell"><b>'+esc(t.asset||assetOf(t.symbol))+'</b><small>'+esc(t.symbol||'--')+'</small></td>'+
  '<td>'+esc(t.exchange||'--')+'</td>'+
  '<td class="'+(String(t.side).toUpperCase()==='LONG'?'sideLong':'sideShort')+'">'+esc(t.side||'--')+'</td>'+
  '<td>'+num(t.quantity,8)+'</td>'+
  '<td>'+money(t.entry_price,ccy)+'</td>'+
  '<td>'+money(t.exit_price,ccy)+'</td>'+
  '<td>'+(t.leverage==null?'--':num(t.leverage,2)+'×')+'</td>'+
  '<td class="'+((t.realized_pnl||0)>=0?'pos':'neg')+'">'+money(t.realized_pnl,ccy)+'</td>'+
  '<td>'+duration(t.duration_ms)+'</td>'+
 '</tr>';
}
function renderTrades(rows,ccy){
 rows=Array.isArray(rows)?rows:[];$('tradeCount').textContent=rows.length+' trade'+(rows.length>1?'s':'');
 $('tradesBody').innerHTML=rows.length?rows.map(function(t){return tradeRow(t,ccy)}).join(''):'<tr><td colspan="11" class="emptyCell">Aucun trade fermé enregistré.</td></tr>';
 Array.prototype.slice.call(document.querySelectorAll('.tradeRow')).forEach(function(tr){tr.onclick=function(){openTrade(tr.getAttribute('data-trade-id'))}});
}
function renderStats(st,ccy){
 st=st||{};$('winRate').textContent=st.win_rate==null?'--':num(st.win_rate,1)+' %';$('profitFactor').textContent=num(st.profit_factor);$('trades').textContent=st.trades==null?'--':st.trades;$('drawdown').textContent=pct(st.drawdown);cls($('drawdown'),st.drawdown);$('avgWin').textContent=money(st.avg_win,ccy);$('avgLoss').textContent=money(st.avg_loss,ccy);$('bestTrade').textContent=money(st.best_trade,ccy);$('worstTrade').textContent=money(st.worst_trade,ccy);
}
function render(o){
 state.overview=o;var s=o.snapshot||{},st=o.statistics||{},ccy=o.baseCurrency||'EUR',pos=o.positions||[];
 $('unrealized').textContent=money(s.unrealized_pnl,ccy);cls($('unrealized'),s.unrealized_pnl);
 $('realized').textContent=money(s.realized_pnl,ccy);cls($('realized'),s.realized_pnl);
 $('marginUsed').textContent=money(s.margin_used,ccy);$('exposure').textContent=money(s.positions_value,ccy);
 renderPositions(pos,ccy);renderHealth(o.positionHealth,pos);renderStats(st,ccy);
 $('updatedAt').textContent=new Date(o.updatedAt||Date.now()).toLocaleTimeString('fr-FR');
 $('refreshInfo').textContent='Santé/PnL '+((o.settings&&o.settings.pnlRefreshSec)||3)+' s · Ledger persistant';
}

function loadOverview(){
 return uiRead('portfolio.overview').then(function(o){$('engineBadge').textContent='Portfolio ONLINE';$('engineBadge').className='pill ok';render(o);return loadHistory();}).catch(function(e){$('engineBadge').textContent='Portfolio OFFLINE';$('engineBadge').className='pill bad';$('updatedAt').textContent=e.message;});
}
function loadHistory(){
 var ccy=(state.overview&&state.overview.baseCurrency)||'EUR';
 return Promise.all([
  uiRead('portfolio.history',{range:state.range}),
  uiRead('portfolio.trades',{limit:state.tradeLimit})
 ]).then(function(rs){state.lastHistory=rs[0].history||[];drawLine(state.lastHistory);renderTrades(rs[1].trades||[],ccy);});
}

function detailCell(label,value,wide,code){return '<div class="'+(wide?'wide':'')+'"><small>'+esc(label)+'</small>'+(code?'<code>'+esc(value==null?'--':value)+'</code>':'<b>'+esc(value==null?'--':value)+'</b>')+'</div>'}
function openTrade(id){
 if(!id)return;uiRead('portfolio.trade.detail',{id:id}).then(function(o){var t=o.trade||{},ccy=(state.overview&&state.overview.baseCurrency)||'EUR',html='<div class="tradeDetailGrid">'+
  detailCell('Trade ID',t.trade_id,true,true)+
  detailCell('Statut',t.status||'CLOSED')+
  detailCell('Wallet',t.wallet_name||'Wallet')+
  detailCell('Wallet ID',t.wallet_id||'UNASSIGNED')+
  detailCell('Public Key',t.wallet_public_key||'--',true,true)+
  detailCell('Asset',t.asset||assetOf(t.symbol))+
  detailCell('Paire',t.symbol)+
  detailCell('Exchange',t.exchange)+
  detailCell('Market type',t.market_type||'--')+
  detailCell('Chain',t.chain||'--')+
  detailCell('Sens',t.side)+
  detailCell('Quantité',num(t.quantity,8))+
  detailCell('Collatéral',money(t.collateral!=null?t.collateral:t.margin,ccy))+
  detailCell('Levier',t.leverage==null?'--':num(t.leverage,2)+'×')+
  detailCell('Prix entrée',money(t.entry_price,ccy))+
  detailCell('Prix sortie',money(t.exit_price,ccy))+
  detailCell('Liquidation',money(t.liquidation_price,ccy))+
  detailCell('Stop Loss',money(t.stop_loss,ccy))+
  detailCell('Take Profit',money(t.take_profit,ccy))+
  detailCell('PnL brut',money(t.gross_pnl,ccy))+
  detailCell('Frais',money(t.fees,ccy))+
  detailCell('Funding',money(t.funding,ccy))+
  detailCell('PnL réalisé',money(t.realized_pnl,ccy))+
  detailCell('Ouverture',when(t.opened_at))+
  detailCell('Fermeture',when(t.closed_at))+
  detailCell('Durée',duration(t.duration_ms))+
  detailCell('Source event',t.source_event_id||'--',true,true)+
 '</div>';$('tradeDetailBody').innerHTML=html;$('tradeDetailTitle').textContent=(t.asset||assetOf(t.symbol))+' · '+(t.side||'')+' · '+(t.exchange||'');$('tradeDetailLayer').hidden=false;
 }).catch(function(e){$('tradeDetailBody').innerHTML='<div class="emptyCell">'+esc(e.message)+'</div>';$('tradeDetailLayer').hidden=false;});
}
function closeTrade(){$('tradeDetailLayer').hidden=true}

function services(){
 api('/router-health').then(function(r){var map={Core:r.core,MarketData:r.marketData,Trading:r.trading,Portfolio:r.portfolio};document.querySelectorAll('#services span').forEach(function(el){var t=el.textContent.trim().replace(/\s+/g,'');if(t==='Firewall')return;var x=map[t];el.className=x&&x.ok?'ok':'bad';});}).catch(function(){});
}

document.querySelectorAll('.ranges button').forEach(function(b){b.onclick=function(){document.querySelectorAll('.ranges button').forEach(function(x){x.classList.remove('active')});b.classList.add('active');state.range=b.getAttribute('data-range');$('rangeLabel').textContent=b.textContent;loadHistory();};});
$('tradeLimit').onchange=function(){state.tradeLimit=Math.max(1,Math.min(100,+this.value||10));loadHistory();};
$('tradeDetailClose').onclick=closeTrade;$('tradeDetailLayer').onclick=function(e){if(e.target===$('tradeDetailLayer'))closeTrade()};document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('tradeDetailLayer').hidden)closeTrade()});
window.addEventListener('resize',function(){if(state.lastHistory.length)drawLine(state.lastHistory)});

function scheduleOverview(){loadOverview().finally(function(){var sec=state.overview&&state.overview.settings&&+state.overview.settings.pnlRefreshSec||3;setTimeout(scheduleOverview,Math.max(1,Math.min(60,sec))*1000);});}
scheduleOverview();services();setInterval(services,10000);
})();