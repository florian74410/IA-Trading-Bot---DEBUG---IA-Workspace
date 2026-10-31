'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{firefox}=require('playwright');
const root=path.resolve(__dirname,'../..');
test('Firefox ADMIN: authenticated command envelope, keyboard confirmation, failures disable mutation controls',async()=>{
 const browser=await firefox.launch({headless:true,firefoxUserPrefs:process.env.IATB_FIREFOX_CONTAINER==='1'?{'security.sandbox.content.level':0,'security.sandbox.gpu.level':0,'dom.ipc.forkserver.enable':false}:{}});
 const page=await browser.newPage({viewport:{width:900,height:700}}),calls=[];let failed=false,halted=false;
 try{
  await page.route('**/*',async route=>{
   const req=route.request(),p=new URL(req.url()).pathname;
   if(p==='/admin')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>ADMIN fixture</title>'});
   if(p==='/auth21/csrf')return route.fulfill({json:{csrfToken:'fixture-csrf'}});
   assert.equal(p,'/auth21/admin/trading/command');assert.equal(req.headers()['x-iatb-csrf'],'fixture-csrf');const body=req.postDataJSON();calls.push(body);assert.equal(body.confirmed,true);assert.ok(body.command_id);assert.equal(body.proof,undefined);
   if(failed)return route.fulfill({status:503,json:{bridge:{state:'ERROR',reason:'FIREWALL_UNAVAILABLE'}}});
   if(body.command==='EMERGENCY_STOP')halted=true;
   return route.fulfill({json:{bridge:{state:'READY',reason:'AUTH21_IPC_FIREWALL_ENGINE_VALIDATED'},data:{ok:true,state:{state:halted?'EMERGENCY_HALTED':'STOPPED',reason:halted?'ADMIN_EMERGENCY_STOP':'INITIAL_INSTALL'},security:{mutationsEnabled:true},draining:null}}});
  });
  await page.goto('http://localhost/admin');
  const html=fs.readFileSync(path.join(root,'Frontend/Pages/admin_v1.0.html'),'utf8');
  const section=html.match(/<section class="p3Diagnostic"[\s\S]*?<\/section>/)[0];
  await page.setContent(section);await page.addStyleTag({content:fs.readFileSync(path.join(root,'Frontend/CSS/admin_v1.0.css'),'utf8')});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'Frontend/JS/trading_p3_admin.js'),'utf8')});
  assert.equal(await page.locator('#p4Emergency').isDisabled(),true);
  await page.locator('#p3BridgeCheck').click();await page.waitForFunction(()=>!document.getElementById('p4Emergency').disabled);
  page.once('dialog',d=>d.dismiss());await page.locator('#p4Emergency').click();assert.equal(calls.length,1);
  page.once('dialog',d=>d.accept());await page.locator('#p4Emergency').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('p4State').textContent.includes('EMERGENCY_HALTED'));assert.equal(calls[1].command,'EMERGENCY_STOP');
  for(const width of [900,390]){await page.setViewportSize({width,height:750});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
  if(process.env.IATB_QA_ARTIFACTS){fs.mkdirSync(process.env.IATB_QA_ARTIFACTS,{recursive:true});await page.screenshot({path:path.join(process.env.IATB_QA_ARTIFACTS,'admin-maintenance-390.png')});}
  failed=true;await page.locator('#p3BridgeCheck').click();await page.waitForFunction(()=>document.getElementById('p3BridgeState').textContent.includes('FIREWALL_UNAVAILABLE'));assert.equal(await page.locator('#p4Emergency').isDisabled(),true);assert.equal(await page.locator('#p5Preview').isDisabled(),true);
 }finally{await browser.close();}
});
