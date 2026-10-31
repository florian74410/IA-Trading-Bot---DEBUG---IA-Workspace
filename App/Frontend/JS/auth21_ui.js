'use strict';
/* Browser code handles UI state only. Every decision is enforced in Core.
 * No bearer token, client secrets or session credentials in JS storage.
 */
(()=>{
 const by=id=>document.getElementById(id);
 const panels=['login-panel','unlock-panel','session-panel'];
 const state={user:null,csrf:null,lastActivity:0,lastSent:0,locked:false,lockTimer:null};
 const status=(message,error=false)=>{by('status').textContent=message;by('status').dataset.error=error?'1':'0';};
 const show=name=>{for(const panel of panels)by(panel).hidden=panel!==name;};
 const result=message=>{by('result').textContent=String(message||'');};
 const fetchJson=async(url,{method='GET',body=null,mutation=false}={})=>{
  const headers={};
  if(body!==null)headers['Content-Type']='application/json';
  if(mutation){if(!state.csrf)throw Error('CSRF_NOT_AVAILABLE');headers['X-IATB-CSRF']=state.csrf;}
  const r=await fetch(url,{method,credentials:'same-origin',cache:'no-store',
   headers,body:body===null?undefined:JSON.stringify(body)});
  let data;try{data=await r.json();}catch(_){throw Error('SERVER_INVALID_JSON');}
  return {ok:r.ok,status:r.status,data};
 };
 const setLoggedOut=()=>{
  state.user=null;state.csrf=null;state.locked=false;
  result('');by('market-result').textContent='';
  if(state.lockTimer)clearTimeout(state.lockTimer);
  by('password').value='';by('unlockPassword').value='';
  show('login-panel');status('Authentification requise.');
 };
 const setLocked=()=>{
  if(!state.user)return;
  state.locked=true;result('');by('market-result').textContent='';show('unlock-panel');status('Session verrouillée : mot de passe nécessaire.',true);
 };
 const lockOnServer=async()=>{
  setLocked();
  try{
   const response=await fetchJson('/auth21/lock',{method:'POST',body:{},mutation:true});
   if(response.status===401){setLoggedOut();return;}
   if(!response.ok)throw Error('LOCK_NOT_CONFIRMED');
  }catch(_){status('Verrouillage serveur non confirmé. Réessayez la déconnexion.',true);}
 };
 const scheduleLock=()=>{
  if(state.lockTimer)clearTimeout(state.lockTimer);
  state.lockTimer=setTimeout(lockOnServer,300000);
 };
 const setConnected=(user,csrf)=>{
  state.user=user;state.csrf=csrf;state.locked=false;state.lastActivity=Date.now();
  state.lastSent=Date.now();scheduleLock();
  by('identity').textContent=user.clientId+' · '+user.role;
  by('user-writes').hidden=user.role==='GUEST';
  by('admin-writes').hidden=user.role!=='ADMIN';
  show('session-panel');status('Session authentifiée. Les permissions sont vérifiées par Core et chaque Engine.');
 };
 const authenticated=async()=>{
  const session=await fetchJson('/auth21/state');
  if(!session.ok){setLoggedOut();return;}
  state.csrf=session.data.csrfToken;
  if(session.data.locked){state.user={};setLocked();return;}
  const me=await fetchJson('/auth21/me');
  if(!me.ok){setLoggedOut();return;}
  const token=await fetchJson('/auth21/csrf');
  if(!token.ok||typeof token.data.csrfToken!=='string')throw Error('CSRF_UNAVAILABLE');
  setConnected(me.data,token.data.csrfToken);
 };
 const mutation=async(url,body)=>{
  if(state.locked)throw Error('SESSION_LOCKED');
  const response=await fetchJson(url,{method:'POST',body,mutation:true});
  if(response.status===401){setLoggedOut();throw Error('SESSION_EXPIRED');}
  if(response.status===403&&response.data.error==='AUTH21_CSRF_DENIED'){
   setLocked();throw Error('CSRF_REJECTED');
  }
  if(!response.ok)throw Error(response.data.error||'REQUEST_FAILED');
  return response.data;
 };
 by('login-form').addEventListener('submit',async event=>{
  event.preventDefault();status('Connexion en cours…');
  try{
   const response=await fetchJson('/auth21/login',{method:'POST',
    body:{clientId:by('clientId').value.trim(),password:by('password').value}});
   by('password').value='';
   if(!response.ok)throw Error(response.data.error||'LOGIN_FAILED');
   await authenticated();
  }catch(e){status('Connexion refusée : '+e.message,true);}
 });
 by('unlock-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try{
   const result=await fetchJson('/auth21/unlock',{method:'POST',
    body:{password:by('unlockPassword').value},mutation:true});
   by('unlockPassword').value='';
   if(!result.ok)throw Error(result.data.error||'UNLOCK_FAILED');
   await authenticated();
  }catch(e){status('Déverrouillage refusé : '+e.message,true);}
 });
 by('lock').addEventListener('click',lockOnServer);
 const logout=async()=>{
  try{
   const response=await fetchJson('/auth21/logout',{method:'POST',body:{},mutation:true});
   if(!response.ok)throw Error(response.data.error||'LOGOUT_NOT_CONFIRMED');
   setLoggedOut();
  }catch(_){
   setLocked();
   status('Déconnexion non confirmée par le serveur. Session verrouillée ; réessayez ou fermez le navigateur.',true);
  }
 };
 by('logout').addEventListener('click',logout);
 by('locked-logout').addEventListener('click',logout);
 by('market-read').addEventListener('click',async()=>{
  try{
   const response=await fetchJson('/auth21/business/marketdata/metadata');
   if(!response.ok)throw Error(response.data.error||'READ_DENIED');
   by('market-result').textContent=JSON.stringify(response.data,null,2);
  }catch(e){by('market-result').textContent=e.message;}
 });
 by('preference-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try{
   const scope=by('target').value==='strategy'?'strategy':'portfolio';
   const data=await mutation('/auth21/business/'+scope+'/preference',
    {ownerClientId:state.user.clientId,key:by('pref-key').value,value:by('pref-value').value});
   result('Préférence enregistrée : '+data.action);
  }catch(e){result('Erreur : '+e.message);}
 });
 by('market-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try{await mutation('/auth21/business/marketdata/settings',
   {refreshMs:Number(by('refresh-ms').value)});result('Réglages MarketData enregistrés.');}
  catch(e){result('Erreur : '+e.message);}
 });
 by('indicator-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try{await mutation('/auth21/business/indicator/settings',
   {enabled:by('indicator-enabled').checked,refreshMs:Number(by('indicator-refresh').value)});
   result('Réglages Indicator enregistrés.');}
  catch(e){result('Erreur : '+e.message);}
 });
 const activity=event=>{
  if(!event.isTrusted||!state.user||state.locked)return;
  const now=Date.now();
  state.lastActivity=now;scheduleLock();
  if(now-state.lastSent<30000)return;
  state.lastSent=now;
  fetchJson('/auth21/activity',{method:'POST',body:{},mutation:true})
   .then(r=>{if(r.status===401)setLocked();})
   .catch(()=>{});
 };
 for(const kind of ['pointerdown','keydown','touchstart'])
  document.addEventListener(kind,activity,{passive:true});
 authenticated().catch(()=>setLoggedOut());
})();
