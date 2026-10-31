'use strict';
var fs=require('fs'),path=require('path');
var root=__dirname;
function clean(v){return String(v||'').trim().replace(/^v/,'');}
function fail(m){console.error('[VERSION-GUARD] '+m);process.exit(2);}
var version=clean(fs.readFileSync(path.join(root,'VERSION'),'utf8'));
var manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
var release=JSON.parse(fs.readFileSync(path.join(root,'Updates','current_release.dat'),'utf8'));
var mv=clean(manifest.version),rv=clean(release.version);
if(!version||version!==mv||version!==rv)fail('incoherence: VERSION='+version+' manifest='+mv+' current_release='+rv);
console.log('[VERSION-GUARD] OK '+version);
