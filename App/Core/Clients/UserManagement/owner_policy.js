'use strict';
const policies=Object.freeze({
 supervisor:{read:['health','status','capabilities','context','data.catalog','data.read'],write:['reason','structured']},
 strategy:{read:['health','capabilities','catalog','stats','state'],write:['validate','evaluate','dry_run','reload','pause','resume','reset_stats','definition.save','definition.delete']},
 portfolio:{read:['health','overview','settings.get','positions','position.health','trades','trade.detail','balances','history','statistics','events'],write:['settings.set','snapshot']}
});
function permission(engine,action){const p=policies[engine];if(!p||typeof action!=='string'||!action.startsWith(engine+'.'))return null;const suffix=action.slice(engine.length+1);return p.read.includes(suffix)?'self.read':p.write.includes(suffix)?'self.write':null;}
module.exports={permission,policies};
