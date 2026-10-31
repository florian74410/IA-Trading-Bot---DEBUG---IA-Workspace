'use strict';
/* IA-TB CP/1 Console - Layer 2/4: permissions/capabilities. */
var TOOLS={parse:'observation',grep:'observation',filter:'observation',sort:'observation',tri:'observation',head:'observation',tail:'observation',count:'observation',wc:'observation',cat:'observation',inspect:'observation',watch:'observation'};
var VIRTUAL={registry:1,capabilities:1,services:1,'server.status':1,'server.logs':1};
function caller(ctx){ctx=ctx||{};var role=String(ctx.role||'').toUpperCase(),id=String(ctx.caller||'').trim();if(role!=='ADMIN')throw new Error('CP1_CALLER_ROLE_FORBIDDEN');if(!id||id.length>160)throw new Error('CP1_CALLER_IDENTITY_INVALID');return{caller:id,role:role};}
function tool(name){name=String(name||'').toLowerCase();return TOOLS[name]||'';}
function virtualResource(name){name=String(name||'').toLowerCase();if(!VIRTUAL[name])throw new Error('CP1_VIRTUAL_RESOURCE_FORBIDDEN');return name;}
function list(){return Object.keys(TOOLS).map(function(k){return{name:k,mode:TOOLS[k]};});}
module.exports={TOOLS:TOOLS,VIRTUAL:VIRTUAL,caller:caller,tool:tool,virtualResource:virtualResource,list:list};
