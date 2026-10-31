'use strict';
/* IA-TB TLS CA helper v1.0
   - Keeps TLS verification enabled.
   - Uses the bundled Mozilla CA roots when the old macOS / Node trust store is incomplete.
   - Zero npm dependency, Node.js 16 compatible. */
var fs=require('fs'),path=require('path');
var BUNDLE_PATH=path.join(__dirname,'..','Certificates','cacert.pem'),CACHE;
function load(){
 if(CACHE!==undefined)return CACHE;
 try{
  var s=fs.readFileSync(BUNDLE_PATH,'utf8');
  CACHE=s.indexOf('-----BEGIN CERTIFICATE-----')>=0?s:null;
 }catch(e){CACHE=null;}
 return CACHE;
}
function apply(options){options=options||{};var ca=load();if(ca)options.ca=ca;return options;}
function curlArgs(){return load()?['--cacert',BUNDLE_PATH]:[];}
module.exports={bundlePath:BUNDLE_PATH,load:load,apply:apply,curlArgs:curlArgs,available:function(){return !!load();}};
