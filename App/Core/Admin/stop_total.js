'use strict';
// P2.2: no launcher/restart/stop side effects during isolated snapshot trials.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')
 throw Error('AUTH21_OPERATOR_SCRIPT_DISABLED_DURING_SNAPSHOT_TRIAL');
/* IA-TB — Total Stop Helper.
   Action fixe uniquement: laisse le Core répondre puis arrête les processus IA-TB
   connus via stop.command. Aucun module d'optimisation système n'est impliqué.
*/
var fs=require('fs'),path=require('path'),child=require('child_process');
var ROOT=path.resolve(__dirname,'../..'),LOG=path.join(ROOT,'Core','Admin','stop_total.log');
function log(s){var line=new Date().toISOString()+' '+s+'\n';try{fs.appendFileSync(LOG,line,'utf8');}catch(e){}}
function finish(code){setTimeout(function(){process.exit(code||0);},80);}
log('=== ARRÊT TOTAL IA-TB ===');
/* Laisser le temps à la réponse HTTP et au launcher/start.command de fermer proprement. */
setTimeout(function(){
 var stopScript=path.join(ROOT,'stop.command');
 if(!fs.existsSync(stopScript)){log('ERREUR stop.command introuvable.');return finish(2);}
 child.execFile('/bin/bash',[stopScript],{cwd:ROOT,timeout:14000,maxBuffer:256*1024},function(e,stdout,stderr){
  if(e){log('ERREUR stop.command: '+String(stderr||stdout||e.message).trim());return finish(2);}
  log('Processus IA-TB arrêtés / vérifiés. Arrêt total terminé.');
  finish(0);
 });
},3200);
