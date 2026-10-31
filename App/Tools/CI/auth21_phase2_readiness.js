'use strict';
/* Explicit phase 2 release gate: fixture success cannot attest live coordination.
 * Inputs must be independent, operator-signed evidence from an isolated trial.
 * This tool never touches live storage or triggers deployment.
 */
const REQUIRED=Object.freeze([
 'sqliteMigrationFixture','argon2Node22','lastAdminDbGuard',
 'lastAdminUpgradePersistence','writerInventoryComplete',
 'interserviceQuiesce','crashRecovery','encryptedRestoreWithOriginalKey',
 'rollbackIntegrity','performanceP95P99','gen1Argon2Calibration'
]);
function evaluate(evidence={}){
 const results=Object.create(null);
 for(const id of REQUIRED){
  const v=evidence&&Object.hasOwn(evidence,id)?evidence[id]:null;
  results[id]={passed:!!(v&&v.pass===true&&typeof v.artifact==='string'&&
   /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+(?:#[-A-Za-z0-9_]+)?$/.test(v.artifact))};
 }
 const missing=REQUIRED.filter(id=>!results[id].passed);
 return {phase:'P2',ready:missing.length===0,missing,results,deployAllowed:false};
}
module.exports={REQUIRED,evaluate};
