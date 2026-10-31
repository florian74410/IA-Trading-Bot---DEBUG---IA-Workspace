'use strict';
// This describes availability; it never grants access. Every request is still
// authorized by Core and its destination against the current session.
function describe(role){
 return {
  version:require('../../Shared/build_info').version,
  accounts:'LOCAL_ADMIN_CLI',
  profile:true,
  privateWorkspace:role!=='GUEST',
  infrastructureAdministration:role==='ADMIN',
  historicalData:'EXPLICIT_OFFLINE_IMPORT',
  execution:{enabled:false,reason:'Exécution financière non disponible dans cette version authentifiée.'},
  remoteLlm:{enabled:false,reason:'Utiliser OpenAI ou le mode de démonstration.'},
  emailDelivery:{enabled:false,reason:'La récupération du compte est assurée par l’administrateur.'},
  onlineSnapshot:{enabled:false,reason:'Les sauvegardes et imports nécessitent l’arrêt des services.'}
 };
}
module.exports={describe};
