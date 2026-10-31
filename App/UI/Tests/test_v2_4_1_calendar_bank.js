'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),firefox=require('playwright').firefox;let browser;
test.before(async()=>{browser=await firefox.launch({headless:true,firefoxUserPrefs:process.env.IATB_FIREFOX_CONTAINER==='1'?{'security.sandbox.content.level':0,'security.sandbox.gpu.level':0,'dom.ipc.forkserver.enable':false}:{}});});
test.after(async()=>{if(browser)await browser.close();});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('actual calendar renderer fits 390/768/1024/1440px, keeps all events scrollable and labels readable',async()=>{
 const page=await browser.newPage();try{
  await page.setContent('<style>body{margin:0}*{box-sizing:border-box}</style><section id="macroCalendarPanel"><div class="calendarUnified"><div id="calendarUnifiedEvents"></div></div></section>');
  await page.addStyleTag({content:read('Frontend/CSS/fundamental_v3.css')});await page.addScriptTag({content:read('Frontend/JS/calendar_events_v2_2_5.js')});
  const script=read('Frontend/JS/fundamental_controller_v3.js'),render=script.slice(script.indexOf('function renderUnifiedCalendar('),script.indexOf('\nfunction renderCalendars()'));
  await page.addScriptTag({content:`var $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c])),calIso=(y,m,d)=>y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'),calMonthLabel=d=>d.toLocaleDateString('fr-FR',{month:'long',year:'numeric'}),dt=s=>s,calValue=v=>v??'—',LANG='fr',IATB_CAL_ROWS=[],IATB_CAL_MONTH=new Date(2026,9,1),IATB_CAL_SELECTED='2026-10-21',IATB_UNIFIED_SOURCE='ALL',IATB_CAL_EVENT=null;${render}`});
  await page.evaluate(()=>renderUnifiedCalendar({cme:{events:Array.from({length:35},(_,i)=>({calendar:'FINANCE_CALENDAR',id:String(i),date:'2026-10-21',timeLabel:'12:30 UTC',event:'Publication économique avec un titre long pour vérifier le responsive '+i,countryCode:'US',impact:'HIGH',consensus:0,actual:0,prior:2}))}}));
  for(const width of [1440,1024,768,390]){await page.setViewportSize({width,height:1000});const sizes=await page.evaluate(()=>{const e=document.querySelector('.iatb-cal-table');return{body:document.documentElement.scrollWidth,w:innerWidth,table:e.scrollWidth,client:e.clientWidth,height:e.scrollHeight,visible:e.clientHeight,count:document.querySelectorAll('.iatb-cal-row').length};});assert.equal(sizes.count,35);assert(sizes.body<=sizes.w+1,JSON.stringify(sizes));assert(sizes.table<=sizes.client+1,JSON.stringify(sizes));assert(sizes.height>sizes.visible);assert(await page.locator('.iatb-cal-row').first().isVisible());}
  await page.evaluate(()=>{IATB_UNIFIED_SOURCE='CME';renderUnifiedCalendar({cme:{events:[{calendar:'FINANCE_CALENDAR',id:'alias',date:'2026-10-21',timeLabel:'12:30 UTC',event:'Finance filter compatibility'}]}});});assert.equal(await page.locator('.iatb-cal-row').count(),1,'legacy CME filter includes Finance Calendar');
 }finally{await page.close();}
});
test('actual Bank UI hides dormant navigation, ignores direct hashes and aligns Crypto with quantity labels',async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});try{
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname==='/bank')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Bank QA</title>'});if(u.pathname==='/api/security/wallets')return route.fulfill({json:{ok:true,items:[]}});return route.fulfill({json:{ok:true,items:[],vaults:[]}});});
  await page.goto('http://iatb.test/bank');
  // Real Bank markup and styles; scripts loaded explicitly, no outside requests.
  await page.setContent(read('Frontend/Pages/bank_v1.0.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,''));
  for(const f of ['bank_v1.0.css','bank_wallets_v2.0.css','bank_transfer_compact_v1.css'])await page.addStyleTag({content:read('Frontend/CSS/'+f)});
  await page.addScriptTag({content:read('Frontend/JS/bank_controller_v1.0.js')});
  for(const h of ['#swap','#loans','#vault-personal','#vault-shared'])assert.equal(await page.locator('.bankNav a[href="'+h+'"]').isVisible(),false,h);
  await page.evaluate(()=>location.hash='#swap');await page.waitForFunction(()=>location.hash==='');assert.equal(await page.locator('#servicePlaceholder').evaluate(e=>e.classList.contains('active')),false);
  await page.evaluate(()=>{document.getElementById('walletManager').innerHTML='<section id="wvTransfer" class="wvSideBox"></section>';});
  await page.addScriptTag({content:read('Frontend/JS/bank_transfer_compact_v1.js')});await page.waitForSelector('#btcCryptoLabel',{state:'attached'});
  await page.evaluate(()=>{document.querySelector('.bankMain').classList.add('serviceMode');document.getElementById('servicePlaceholder').classList.add('active','walletMode');});
  for(const width of [1280,768,390]){await page.setViewportSize({width,height:1000});const x=await page.evaluate(()=>['#btcCryptoLabel','.btcAmounts label>span'].map(s=>{const r=document.querySelector(s).getBoundingClientRect(),c=getComputedStyle(document.querySelector(s));return{x:r.x,h:r.height,line:c.lineHeight,font:c.fontSize};}));assert(Math.abs(x[0].x-x[1].x)<1,JSON.stringify(x));assert.equal(x[0].line,x[1].line);assert.equal(x[0].font,x[1].font);}
 }finally{await page.close();}
});
test('native chart draws translucent event at exact interpolated candle time and follows pan/zoom',async()=>{
 const page=await browser.newPage();try{
  await page.setContent('<div id="chartArea" style="width:900px;height:450px"></div>');await page.addScriptTag({content:read('Frontend/JS/calendar_events_v2_2_5.js')});await page.addScriptTag({content:read('Frontend/JS/chart_controller_native_v1.2.js')});
  const result=await page.evaluate(async()=>{const c=new IATBChartController({container:document.getElementById('chartArea'),root:document}),at=1792584000;const rows=Array.from({length:120},(_,i)=>({time:at+i*60,open:100,high:110,low:90,close:102,volume:1}));c.setCandles(rows);c.setEconomicMarkers([{id:'timed',time:at+90,source:'FINANCE_CALENDAR'},{id:'outside',time:at-999,source:'FED'}]);c.visibleCount=120;let strokes=[];const ctx=c.canvas.getContext('2d'),original=ctx.stroke.bind(ctx),move=ctx.moveTo.bind(ctx);let markerX=null;ctx.moveTo=function(x,y){if(Math.abs(this.globalAlpha-.38)<.001)markerX=x;return move(x,y);};ctx.stroke=function(){if(Math.abs(this.globalAlpha-.38)<.001)strokes.push({alpha:this.globalAlpha});return original();};c.invalidate();await new Promise(r=>setTimeout(r,100));const initial=strokes.length,positionError=Math.abs(markerX-(c._geom.L+2*c._geom.cw/120));c.panOffset=30;c.visibleCount=40;strokes=[];c.invalidate();await new Promise(r=>setTimeout(r,100));return{initial,positionError,afterPan:strokes.length};});
  assert(result.initial>=1,JSON.stringify(result));assert(result.positionError<.1,JSON.stringify(result));assert.equal(result.afterPan,0);
 }finally{await page.close();}
});
