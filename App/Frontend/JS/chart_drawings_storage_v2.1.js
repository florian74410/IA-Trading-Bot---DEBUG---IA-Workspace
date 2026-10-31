(function(g){'use strict';
var KEY='iatb.chart.drawings.v21';
function copy(x){return JSON.parse(JSON.stringify(x))}
function read(){try{var s=localStorage.getItem(KEY);if(!s)return{version:1,groups:{}};var x=JSON.parse(s);if(x.version!==1||!x.groups||typeof x.groups!=='object')throw Error('Format dessins inconnu');return x}catch(e){throw Error('Lecture dessins impossible : '+e.message)}}
g.IATBDrawingsStorage={load:function(key){var a=read().groups[key]||[];if(!Array.isArray(a)||a.length>200||a.some(function(o){return !o||typeof o.id!=='string'||!Array.isArray(o.points)||!o.points.length||o.points.length>3||o.points.some(function(p){return !p||!Number.isFinite(p.time)||!Number.isFinite(p.price)})}))throw Error('Groupe de dessins invalide');return copy(a)},save:function(key,items){var x=read();x.groups[key]=copy(items);try{localStorage.setItem(KEY,JSON.stringify(x))}catch(e){throw Error('Sauvegarde dessins impossible : '+e.message)}},key:KEY};
})(window);
