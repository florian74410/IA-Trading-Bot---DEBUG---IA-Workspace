'use strict';
// Read-only fail-closed census of legacy Core API literals.
// Classification is a migration plan, NOT authorization to reopen routes.
const fs=require('node:fs'),path=require('node:path');
const source=path.join(__dirname,'../../Core/Server/server.js');
const RE=/if\s*\(\s*req\.method\s*===?\s*['"](GET|POST|PUT|DELETE|PATCH)['"]\s*&&\s*p\s*===?\s*['"]([^'"]+)['"]/g;
const GROUPS=Object.freeze({
 'bootstrap-obsolete':/^\/api\/(?:setup|login|logout|recovery\/)/,
 'administration':/^\/api\/(?:admin\/|shutdown$|updates(?:\/|$)|ai-updates(?:\/|$)|security\/firewall\/toggle$)/,
 'wallet-key-transfer-denied':/^\/api\/(?:bank\/|security\/wallets(?:\/|$)|transfers(?:\/|$)|onchain(?:\/|$)|swap-bridge(?:\/|$))/,
 'legacy-account':/^\/api\/(?:client\/|profile$|session\/)/,
 'external-side-effects':/^\/api\/(?:chat$|companion\/|chart-viewer\/chat$|settings\/test-|notifications\/test$)/,
 'user-private-settings':/^\/api\/(?:settings(?!\/test-)(?:\/|$)|app-settings\/|notifications(?!\/test$)(?:\/|$)|mosaics(?:\/|$)|credits\/|token-usage$)/,
 'diagnostics':/^\/api\/(?:health$|bootstrap$|status$|logs$|chart-viewer\/status$)/
});
function scan(src=fs.readFileSync(source,'utf8')){
 const found=[],seen=new Set();
 for(const match of src.matchAll(RE)){
  const route=match[1]+' '+match[2];
  if(seen.has(route))throw Error('AUTH21_LEGACY_ROUTE_DUPLICATE:'+route);
  seen.add(route);
  const owners=Object.entries(GROUPS).filter(([,re])=>re.test(match[2])).map(([name])=>name);
  found.push({method:match[1],path:match[2],group:owners.length===1?owners[0]:null,
   decision:'DENY_UNTIL_MIGRATED'});
 }
 const baseline=require('../../../Tools/CI/baselines/core_routes_251.json'),retired=["GET /api/ai-updates","GET /api/ai-updates/package","GET /api/ai-updates/settings","GET /api/updates","POST /api/ai-updates/execute","POST /api/ai-updates/settings","POST /api/updates/fetch","POST /api/updates/install","POST /api/updates/upload"];
 const expected=baseline.filter(r=>!retired.includes(r)),actual=found.map(r=>r.method+' '+r.path);
 const inventoryErrors=[...expected.filter(r=>!actual.includes(r)).map(r=>'MISSING:'+r),...actual.filter(r=>!expected.includes(r)).map(r=>'UNEXPECTED:'+r)];
 return {routes:found,inventoryErrors,unclassified:found.filter(r=>!r.group),
  groups:Object.fromEntries(Object.keys(GROUPS).map(g=>[g,found.filter(r=>r.group===g).length]))};
}
if(require.main===module){
 const r=scan();
 process.stdout.write(JSON.stringify({count:r.routes.length,groups:r.groups,
  unclassified:r.unclassified,inventoryErrors:r.inventoryErrors},null,2)+'\n');
 if(r.unclassified.length||r.inventoryErrors.length)process.exitCode=1;
}
module.exports={scan,GROUPS};
