'use strict';
var fs=require('fs'),os=require('os'),path=require('path');
var eng=require('../Engine/indicator_engine'),regmod=require('../Engine/indicator_registry');
var ROOT=path.resolve(__dirname,'..'),registry=new regmod.Registry(ROOT),fail=[];
function ok(cond,msg){if(!cond)fail.push(msg);else console.log('PASS',msg);}
function near(a,b,t,msg){ok(isFinite(a)&&Math.abs(a-b)<=t,msg+' got='+a+' expected='+b);}
function last(a){for(var i=a.length-1;i>=0;i--)if(a[i]!=null&&isFinite(a[i]))return a[i];return null;}
var candles=[],price=100,i;
for(i=0;i<360;i++){var drift=.12+Math.sin(i/12)*.08,open=price,close=open+drift,high=Math.max(open,close)+.65+(i%4)*.03,low=Math.min(open,close)-.55-(i%3)*.02,vol=900+(i%17)*31;candles.push([1700000000000+i*60000,open,high,low,close,vol]);price=close;}
var list=registry.list();ok(list.length===21,'21 BuiltIn chargés');ok(registry.status().builtIn===21,'registre BuiltIn=21');ok(registry.status().errors.length===0,'aucune erreur de registre');
list.forEach(function(m){if(m.id==='liquidity_heatmap'){ok(m.operation==='liquidity_heatmap','Liquidity HeatMap externe enregistré');return;}try{var x=eng.compute(registry.get(m.id),candles,{});ok(x.state==='READY',m.id+' READY');var ks=Object.keys(x.latest||{}),finite=ks.some(function(k){return x.latest[k]!=null&&isFinite(x.latest[k]);});ok(finite,m.id+' valeur finale finie');ok(x.times.length===x.candleCount,m.id+' timestamps alignés');}catch(e){fail.push(m.id+' exception: '+e.message);}});
// Formules déterministes simples.
var math=eng._math;
var s=[1,2,3,4,5,6];near(last(math.sma(s,3)),5,1e-12,'SMA(3) série croissante');near(last(math.ema(s,3)),5,1e-12,'EMA(3) série croissante');
var up=[];for(i=0;i<30;i++)up.push(i+1);near(last(math.rsi(up,14)),100,1e-10,'RSI tendance haussière = 100');
var flat=[];for(i=0;i<20;i++)flat.push([1700000000000+i*60000,10,11,9,10,100]);near(last(math.atr(eng.normalizeCandles(flat),14)),2,1e-12,'ATR constant = range 2');
// ADX ne doit pas être initialisé trop tôt : premier ADX après environ 2*period-2.
var adx=eng.compute(registry.get('adx'),candles,{period:14});var first=-1;for(i=0;i<adx.values.adx.length;i++)if(adx.values.adx[i]!=null){first=i;break;}ok(first>=26,'ADX Wilder correctement chauffé (index >=26)');
// Bornes oscillateurs.
['rsi','mfi','stochastic','stochastic_rsi','adx'].forEach(function(id){var x=eng.compute(registry.get(id),candles,{}),ks=Object.keys(x.latest);ks.forEach(function(k){var v=x.latest[k];if(v!=null)ok(v>=-1e-9&&v<=100+1e-9,id+'.'+k+' dans [0,100]');});});
var wr=eng.compute(registry.get('williams_r'),candles,{}).latest.value;ok(wr>=-100-1e-9&&wr<=1e-9,'Williams %R dans [-100,0]');
// Garde volume.
var noVol=candles.map(function(c){return c.slice(0,5);});['vwap','vwma','obv','mfi'].forEach(function(id){var good=false;try{eng.compute(registry.get(id),noVol,{});}catch(e){good=e.code==='VOLUME_REQUIRED';}ok(good,id+' refuse absence de volume');});
// Max 32.
var req=[];for(i=0;i<33;i++)req.push({id:'ema'});var maxok=false;try{eng.computeBatch(registry,candles,req);}catch(e){maxok=e.code==='MAX_INDICATORS';}ok(maxok,'limite 32 indicateurs appliquée');
// Runtime incrémental.
var rt=new eng.Runtime(registry,{maxCandles:120,maxSessions:3}),r=rt.update('KRAKEN|BTCUSD|1m',candles.slice(0,100),[{id:'ema'},{id:'rsi'}]);ok(r.candleCount===100&&r.results.length===2,'runtime initial');r=rt.update('KRAKEN|BTCUSD|1m',[candles[100]],[{id:'ema'}]);ok(r.candleCount===101,'runtime incrémental');
// Custom sûr : id distinct, operation native EMA.
var tmp=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-reg-')),bi=path.join(tmp,'BuiltIn'),cu=path.join(tmp,'Custom'),qu=path.join(tmp,'Quarantine');fs.mkdirSync(bi);fs.mkdirSync(cu);fs.mkdirSync(qu);
var custom={schema:'iatb.indicator.v1',id:'ema_fast_custom',name:'EMA Fast Custom',version:'1.0',category:'trend',inputs:{source:{type:'series',default:'close',allowed:['close']},period:{type:'integer',default:7,min:2,max:50}},engine:{operation:'ema'},outputs:{value:{type:'number',strategy:true,chart:true}},display:{pane:'price',min:null,max:null}};
fs.writeFileSync(path.join(cu,'EMA_Fast.indicator.json'),JSON.stringify(custom));var cr=new regmod.Registry(tmp);ok(cr.get('ema_fast_custom')!=null,'Custom JSON sûr chargé');var cx=eng.compute(cr.get('ema_fast_custom'),candles,{});ok(cx.operation==='ema'&&isFinite(cx.latest.value),'Custom utilise operation native EMA');
var bad={schema:'iatb.indicator.v1',id:'evil_custom',name:'Evil',version:'1.0',inputs:{period:{type:'integer',default:5,min:2,max:20}},engine:{operation:'shell'},outputs:{value:{type:'number'}},display:{pane:'separate'}};fs.writeFileSync(path.join(cu,'Evil.indicator.json'),JSON.stringify(bad));cr.reload();ok(cr.get('evil_custom')==null,'Custom opération interdite refusé');ok(fs.readdirSync(qu).some(function(n){return /Evil\.indicator\.json$/.test(n);}), 'Custom refusé déplacé en Quarantine');
try{fs.rmSync(tmp,{recursive:true,force:true});}catch(e){}

// v1.2.2 : Ichimoku doit garder ses 26 valeurs finales null pour Lagging/Chikou.
var ichi=eng.compute(registry.get('ichimoku_cloud'),candles,{});
var lag=ichi.values.lagging||[],trailNull=0;
for(i=lag.length-1;i>=0&&lag[i]==null;i--)trailNull++;
ok(trailNull===26,'Ichimoku Lagging conserve 26 null finaux (pas de faux zéro)');

// v1.2.2 : les 4 indicateurs volume doivent fonctionner avec volume réel.
['vwap','vwma','obv','mfi'].forEach(function(id){
  var x=eng.compute(registry.get(id),candles,{});
  ok(x.state==='READY'&&Object.keys(x.latest).some(function(k){return x.latest[k]!=null&&isFinite(x.latest[k]);}),id+' calcule avec volume réel');
});

if(fail.length){console.error('\nFAILURES\n'+fail.join('\n'));process.exit(1);}console.log('\nALL TESTS PASS · '+list.length+' indicators');
