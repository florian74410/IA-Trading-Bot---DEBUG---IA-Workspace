(function(){'use strict';
var button=document.getElementById('p3BridgeCheck'),state=document.getElementById('p3BridgeState');if(!button||!state)return;
var emergency=document.getElementById('p4Emergency'),preview=document.getElementById('p5Preview'),recover=document.getElementById('p4Recover'),lock=document.getElementById('p4State'),report=document.getElementById('p5Report');
function disable(){[emergency,preview,recover].forEach(function(b){if(b)b.disabled=true;});}
async function command(commandName,params){
 button.disabled=true;disable();state.textContent='VALIDATING · vérification de la chaîne sécurisée…';
 try{
  var auth=await fetch('/auth21/csrf',{credentials:'same-origin',cache:'no-store'});if(!auth.ok)throw Error('AUTH_UNAVAILABLE');var csrf=await auth.json();
  var payload={command:commandName,command_id:crypto.randomUUID(),timestamp:Date.now(),confirmed:true};if(params)payload.params=params;
  var response=await fetch('/auth21/admin/trading/command',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-IATB-CSRF':csrf.csrfToken},body:JSON.stringify(payload)});
  var result=await response.json();if(!result.bridge)throw Error(response.status===401||response.status===403?'AUTH_UNAVAILABLE':'DIAGNOSTIC_UNAVAILABLE');
  var data=result.data||{};
  state.textContent=result.bridge.state+' · '+result.bridge.reason+' · LIVE non autorisé';
  if(lock)lock.textContent=data.state?data.state.state+' · '+data.state.reason+(data.maintenance?' · À réconcilier : '+data.maintenance.pendingReconciliation:''):'État du moteur non confirmé.';
  if(report)report.textContent=JSON.stringify({draining:data.run||data.draining||null,maintenance:data.maintenance||null,error:data.error||null},null,2);
  if(result.bridge.state==='READY'&&data.security&&data.security.mutationsEnabled){if(emergency)emergency.disabled=false;if(preview)preview.disabled=false;if(recover)recover.disabled=!(data.state&&data.state.state==='EMERGENCY_HALTED');}
 }catch(e){state.textContent=(e.message==='AUTH_UNAVAILABLE'?'AUTH_UNAVAILABLE':'ERROR')+' · diagnostic indisponible';if(lock)lock.textContent='État non confirmé : vérifier STATUS avant une nouvelle action.';}
 finally{button.disabled=false;}
}
button.addEventListener('click',function(){command('STATUS');});
if(emergency)emergency.addEventListener('click',function(){if(window.confirm('Confirmer l’arrêt d’urgence persistant ? Aucune position ne sera liquidée et aucun ordre déjà envoyé ne sera annulé.'))command('EMERGENCY_STOP');});
if(preview)preview.addEventListener('click',function(){command('DRAINING_STOP',{stage:'PREVIEW',mode:'SAFE'});});
if(recover)recover.addEventListener('click',function(){if(window.confirm('Demander la vérification de reprise ? Sans réconciliation et contrôles Risk/Firewall qualifiés, le verrou reste actif.'))command('RECOVER');});
})();
