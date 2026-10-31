'use strict';
/*
 * Auth21 chantier A: audit of legacy Core HTTP routes.
 * Run: node App/Core/Tests/auth21_core_legacy_route_audit.js
 *      node App/Core/Tests/auth21_core_legacy_route_audit.js --strict
 *
 * This deliberately DOES NOT authorize any legacy route. The isolated Core
 * gate remains deny-by-default until owner-aware handlers are implemented.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const sourceFile = path.join(__dirname, '..', 'Server', 'server.js');
const source = fs.readFileSync(sourceFile, 'utf8');
const gateFile = path.join(__dirname, '..', 'Clients', 'auth21_core_route_gate.js');
const gate = fs.readFileSync(gateFile, 'utf8');
assert(gate.includes("deny(res,404,'NOT_FOUND')"), 'Fail-closed Auth21 Core gate missing');
assert(source.includes('AUTH21_CORE_AUTH.handler'), 'Core is not wired to Auth21 isolated gate');
const matches = [];
// Literal routes are discovered without executing Core or touching customer data.
// Unsupported dynamic route expressions are listed separately for manual review.
const rx = /req\.method\s*===\s*['"]([A-Z]+)['"]\s*&&\s*p\s*===\s*['"]([^'"]+)['"]/g;
let m;
while ((m = rx.exec(source))) matches.push({method:m[1], path:m[2], line:source.slice(0,m.index).split('\n').length});
const unique = [...new Map(matches.map(x => [x.method + ' ' + x.path, x])).values()];
const dynamicLines = source.split('\n').flatMap((line,i) => (
  /\bp\s*(?:===|==|\.startsWith\(|\.indexOf\(|\.match\(|\.slice\()/.test(line) &&
  /\/api\/|\/communication\/|\/auth\//.test(line) &&
  !/req\.method\s*===\s*['"][A-Z]+['"]\s*&&\s*p\s*===\s*['"][^'"]+['"]/.test(line)
) ? [{line:i+1, excerpt:line.trim().slice(0,220)}] : []);
const highRisk = /(?:wallet|bank|vault|secret|key|admin|session|account|client|profile|recovery|order|trade|swap|bridge|transfer|withdraw|settings|update|strategy|notification)/i;
const summary = {
  audit:'Auth21 chantier A - legacy Core API inventory',
  mode:'report-only; zero legacy routes granted',
  count:unique.length,
  highRiskCount:unique.filter(x=>highRisk.test(x.path)).length,
  dynamicExpressionCount:dynamicLines.length,
  routes:unique.map(x=>({...x,classification:highRisk.test(x.path)?'SENSITIVE_REQUIRES_OWNER_AND_RBAC':'REQUIRES_EXPLICIT_AUTH21_POLICY'})),
  dynamicExpressions:dynamicLines
};
if (process.argv.includes('--json')) console.log(JSON.stringify(summary,null,2));
else {
 console.log('Auth21 Core legacy inventory: '+summary.count+' literal method/path pairs; '+summary.highRiskCount+' sensitive; '+summary.dynamicExpressionCount+' dynamic candidate lines.');
 console.log('All legacy paths remain DENIED in isolated Core mode. Migration status: NOT COMPLETE.');
 unique.forEach(x=>console.log(x.method+' '+x.path+' (line '+x.line+')'));
}
if (process.argv.includes('--strict') && (summary.count || summary.dynamicExpressionCount)) {
 console.error('AUTH21_CORE_LEGACY_ROUTES_UNMIGRATED');
 process.exitCode=1;
}
