'use strict';
/* IA-TB UI permissions v1.10.0
   The UI never decides permissions in browser JavaScript. This server-side policy
   classifies browser operations before they are forwarded to Core/Router.
   Authentication is disabled in the current build; future auth can replace the
   role resolver without changing page contracts.
*/
var LEVELS={PUBLIC:0,READ:1,USER_WRITE:2,ADMIN_WRITE:3};
function normalizeRole(role){role=String(role||'USER').toUpperCase();if(role==='SUPERADMIN')return'SUPERADMIN';return role==='ADMIN'?'ADMIN':'USER';}
function classify(method,pathname){
 method=String(method||'GET').toUpperCase();pathname=String(pathname||'/');
 if(method==='GET'||method==='HEAD')return{permission:'READ',level:LEVELS.READ};
 if(pathname.indexOf('/api/admin/')===0||pathname==='/api/updates'||pathname.indexOf('/api/updates/')===0||pathname==='/api/ai-updates'||pathname.indexOf('/api/ai-updates/')===0)return{permission:'ADMIN_WRITE',level:LEVELS.ADMIN_WRITE};
 if(pathname==='/api/settings'||pathname.indexOf('/api/settings/')===0||pathname==='/api/profile'||pathname==='/api/app-settings/select'||pathname.indexOf('/api/session/')===0)return{permission:'USER_WRITE',level:LEVELS.USER_WRITE};
 return{permission:'USER_WRITE',level:LEVELS.USER_WRITE};
}
function allowed(role,classification){role=normalizeRole(role);if(!classification)return false;if(classification.level<=LEVELS.USER_WRITE)return true;return role==='ADMIN'||role==='SUPERADMIN';}
module.exports={LEVELS:LEVELS,normalizeRole:normalizeRole,classify:classify,allowed:allowed};
