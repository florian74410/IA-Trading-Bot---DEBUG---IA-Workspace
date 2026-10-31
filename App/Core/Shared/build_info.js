'use strict';
var fs=require('fs'),path=require('path');
var ROOT=path.resolve(__dirname,'../..');
function readText(p,d){try{return String(fs.readFileSync(p,'utf8')).trim()||d;}catch(e){return d;}}
function readJson(p,d){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){return d;}}
var manifest=readJson(path.join(ROOT,'manifest.json'),{});
var version=readText(path.join(ROOT,'VERSION'),String(manifest.version||'2.0.0'));
if(!/^\d+\.\d+(?:\.\d+)?$/.test(version))version=String(manifest.version||'2.0.0');
var application=String(manifest.application||'IA-Trading-Bot');
var status=String(manifest.status||'DEBUG').toUpperCase();
module.exports={root:ROOT,application:application,version:version,status:status,label:application+' v'+version+(status?' '+status:'')};
