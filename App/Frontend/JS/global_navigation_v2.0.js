(function(){'use strict';
var routes=[['/ia-trading','Trading IA','openai'],['/chart-viewer','Chart Viewer','chart'],['/portfolio','Portfolio','portfolio'],['/bank','Banque','bank'],['/fundamental','Fondamental','fundamental'],['/settings','Paramètres','settings'],['/strategy','Stratégies','strategy'],['/statistiques','Statistiques','stats']];
function iconSvg(name){
 var common='viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
 if(name==='openai')return '<svg '+common+' class="navSvg navSvgOpenAI"><g fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.1c2.2-1.25 5 .35 5 2.9 2.6 0 4.1 2.75 2.8 5 2.2 1.3 2.2 4.45 0 5.75-1.3 2.25-4.4 2.45-5.95.45-2.2 1.25-5-.35-5-2.9-2.6 0-4.1-2.75-2.8-5-2.2-1.3-2.2-4.45 0-5.75C7.35 1.3 10.45 1.1 12 3.1Z"/><path d="M8.3 6.15 12 4l3.7 2.15v4.3L12 12.6l-3.7-2.15Z"/><path d="m8.3 10.45 3.7 2.15v4.3l-3.7 2.15-3.7-2.15v-4.3Z"/><path d="m12 12.6 3.7-2.15 3.7 2.15v4.3l-3.7 2.15L12 16.9Z"/></g></svg>';
 if(name==='chart')return '<svg '+common+' class="navSvg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16"/><path d="m6.5 15 3.1-3.4 2.8 2.1 4.8-6.2"/><rect x="7" y="7" width="1.8" height="4.2" rx=".6"/><rect x="12" y="5" width="1.8" height="6.3" rx=".6"/><rect x="17" y="3.5" width="1.8" height="5.2" rx=".6"/></g></svg>';
 if(name==='portfolio')return '<svg '+common+' class="navSvg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9h9A9 9 0 1 1 12 3Z"/><path d="M14.5 3.6A7.8 7.8 0 0 1 20.4 9H14.5Z"/></g></svg>';
 if(name==='bank')return '<svg '+common+' class="navSvg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 8 4H4l8-4Z"/><path d="M5 9h14M6.5 9v7M10 9v7M14 9v7M17.5 9v7M4 18h16M3 21h18"/></g></svg>';
 if(name==='fundamental')return '<svg '+common+' class="navSvg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6Z"/><path d="M15 3v5h5M9 11h7M9 15h7M9 19h5"/></g></svg>';
 if(name==='settings')return '<svg '+common+' class="navSvg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .35 1.9l.05.05-2.85 2.85-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1a1.7 1.7 0 0 0-1.4-1.65 1.7 1.7 0 0 0-1.55.5l-.05.05-2.85-2.85.05-.05A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4v-4h.1A1.7 1.7 0 0 0 4.15 8.2a1.7 1.7 0 0 0-.5-1.55l-.05-.05L6.45 3.75l.05.05A1.7 1.7 0 0 0 8.4 4.2a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 9.8 2.5v-.1h4v.1A1.7 1.7 0 0 0 15.2 4.15a1.7 1.7 0 0 0 1.55-.5l.05-.05 2.85 2.85-.05.05A1.7 1.7 0 0 0 19.2 8.4c.13.35.34.7.6 1 .3.3.68.4 1.1.4h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z"/></g></svg>';
 if(name==='strategy')return '<svg '+common+' class="navSvg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18 10 8l3.2 4L19 5"/><path d="M15 5h4v4"/><circle cx="5" cy="18" r="1.5"/><circle cx="10" cy="8" r="1.5"/><circle cx="13.2" cy="12" r="1.5"/></g></svg>';
 return '<svg '+common+' class="navSvg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10h4v10M10 20V4h4v16M16 20V7h4v13"/><path d="M3 20h18"/></g></svg>';
}

function current(){var p=location.pathname;if(p.indexOf('/chart')===0)return'/chart-viewer';if(p.indexOf('/portfolio')===0)return'/portfolio';if(p.indexOf('/bank')===0)return'/bank';if(p.indexOf('/fundamental')===0)return'/fundamental';if(p.indexOf('/settings')===0)return'/settings';if(p.indexOf('/strategy')===0)return'/strategy';if(p.indexOf('/statistiques')===0)return'/statistiques';return'/ia-trading'}
function ensureGlobalSidebar(){
 // Pages own their navigation/sidebar. Do not request retired global_sidebar_v2.0 assets.
 if(location.pathname.indexOf('/fundamental')===0)document.body.classList.add('iatb-fundamental-page');
 else document.body.classList.remove('iatb-fundamental-page');
 document.body.classList.remove('iatb-no-bank-side');
}
function resolveAdminVisibility(){
 var settingsLink=document.querySelector('#iatb-global-nav a[href="/settings"]');
 if(settingsLink)settingsLink.style.display='none';
 var a=document.getElementById('iatb-admin-link');if(!a)return;
 a.style.display='none';
 fetch('/api/bootstrap',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('BOOTSTRAP_'+r.status);return r.json()}).then(function(o){
  var role=String(o&&o.role||'').toUpperCase();
  if(role==='ADMIN'||role==='SUPERADMIN')a.style.display='inline-flex';
  if(settingsLink&&role!=='GUEST')settingsLink.style.display='';
 }).catch(function(){a.style.display='none';if(settingsLink)settingsLink.style.display='none'});
}

function ensureServiceFooter(){
 if(document.getElementById('iatbServiceStrip'))return;
 if(!document.querySelector('link[data-iatb-service-footer]')){
  var l=document.createElement('link');l.rel='stylesheet';l.href='/assets/global_service_footer_v2.2.4.css';l.setAttribute('data-iatb-service-footer','1');document.head.appendChild(l);
 }
 // The same live health footer is required on Trading IA and Fundamental.
 if(!document.querySelector('script[data-iatb-service-footer]')){
  var js=document.createElement('script');js.src='/assets/global_service_footer_v2.2.4.js';js.setAttribute('data-iatb-service-footer','1');document.head.appendChild(js);
 }
}
function mount(){if(document.getElementById('iatb-global-nav'))return;ensureGlobalSidebar();var active=current(),n=document.createElement('header');n.id='iatb-global-nav';n.setAttribute('role','banner');n.innerHTML='<div class="iatb-nav-frame"><a class="iatb-nav-brand" href="/ia-trading" aria-label="IA-TB"><img src="/assets/ia_tb_logo_v1.7.2.png" alt="IA-TB" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'"><span class="iatb-nav-brand-fallback" style="display:none">IA-TB</span></a><nav class="iatb-nav-links" aria-label="Navigation principale">'+routes.map(function(x){return'<a class="iatb-nav-link '+(x[0]===active?'active':'')+'" href="'+x[0]+'"><span class="iatb-nav-icon">'+iconSvg(x[2])+'</span><span class="iatb-nav-label">'+x[1]+'</span></a>'}).join('')+'</nav><div class="iatb-nav-actions"><a id="iatb-admin-link" class="iatb-nav-action" href="/admin" style="display:none">♙ ADMIN</a></div></div>';document.body.insertBefore(n,document.body.firstChild);var spacer=document.createElement('div');spacer.id='iatb-global-nav-spacer';spacer.setAttribute('aria-hidden','true');n.parentNode.insertBefore(spacer,n.nextSibling);document.body.classList.add('iatb-global-nav-ready');var legacyTop=document.querySelector('body>.app>.top');if(legacyTop)legacyTop.style.display='none';resolveAdminVisibility();ensureServiceFooter();n.querySelectorAll('.iatb-nav-link').forEach(function(a){a.addEventListener('click',function(e){var target=a.getAttribute('href');if(!target)return;e.preventDefault();e.stopPropagation();location.assign(target)},true)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
/* Rich Notification Overlay v2 bootstrap — available on every IA-TB page. */
(function(){if(typeof document==='undefined')return;if(!document.querySelector('link[data-iatb-notify-v2]')){var l=document.createElement('link');l.rel='stylesheet';l.href='/assets/notification_overlay_v2.0.css?v=2001';l.setAttribute('data-iatb-notify-v2','1');document.head.appendChild(l);}if(!window.IATBNotify&&!document.querySelector('script[data-iatb-notify-v2]')){var s=document.createElement('script');s.src='/assets/notification_overlay_v2.0.js?v=2001';s.setAttribute('data-iatb-notify-v2','1');document.head.appendChild(s);}})();
