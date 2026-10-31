'use strict';
/* Manually authorized P2.2 recovery for a disposable DEBUG trial only.
 * Requires exact confirmation and signed Engine recovery endpoints to be up.
 * No wallet, GEN-1, database mutation or trade execution is supported.
 */
const {createTrial}=require('../../Core/Backup/auth21_core_local_trial_wiring');
async function run(env=process.env){
 if(!env||env.IATB_AUTH21_RECOVERY_CONFIRM!=='ABORT_INCOMPLETE_EPOCH')
  throw Error('AUTH21_RECOVERY_EXPLICIT_CONFIRMATION_REQUIRED');
 const trial=createTrial(env);
 if(trial.coordinator.state!=='BLOCKED')
  return {ok:true,action:'NONE',epoch:trial.coordinator.epoch};
 const recovered=await trial.coordinator.recoverBlocked();
 return {ok:true,action:'ABORT_AND_UNFREEZE',epoch:recovered.epoch};
}
if(require.main===module)run().then(r=>{
 process.stdout.write(JSON.stringify(r)+'\n');
}).catch(e=>{
 process.stderr.write('AUTH21_SNAPSHOT_RECOVERY_FAILED '+String(e&&e.message||e)+'\n');
 process.exitCode=1;
});
module.exports={run};
