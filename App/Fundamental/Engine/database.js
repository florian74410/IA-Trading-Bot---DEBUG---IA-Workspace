'use strict';
/* Fundamental database compatibility bridge.
   Migrates an old build-local DB once, then loads the canonical persistent
   storage implementation without monkey-patching Node path functions. */
var fs=require('fs'),path=require('path'),PATHS=require('../../Core/Shared/paths');
var FUNDAMENTAL_ROOT=path.resolve(__dirname,'..');
var LEGACY_DATA=path.join(FUNDAMENTAL_ROOT,'Data');
var LEGACY_DB=path.join(LEGACY_DATA,'fundamental.db');
var TARGET_DATA=PATHS.PersistentData.fundamental;
var TARGET_DB=PATHS.PersistentData.fundamentalDb;
function ensureDir(p){if(!fs.existsSync(p))fs.mkdirSync(p,{recursive:true});}
function moveFile(src,dst){
 if(!fs.existsSync(src)||fs.existsSync(dst))return;
 try{fs.renameSync(src,dst);}
 catch(e){fs.copyFileSync(src,dst);fs.unlinkSync(src);}
}
function migrateLegacy(){
 ensureDir(TARGET_DATA);
 if(!fs.existsSync(TARGET_DB)&&fs.existsSync(LEGACY_DB)){
  moveFile(LEGACY_DB,TARGET_DB);
  moveFile(LEGACY_DB+'-wal',TARGET_DB+'-wal');
  moveFile(LEGACY_DB+'-shm',TARGET_DB+'-shm');
 }
}
/* Defer migration until an actual storage instance is requested.
 * This keeps the existing default migration timing before SQLite open,
 * and allows an optional snapshot gate to refuse startup without moving files.
 */
var CoreStorage=require('./database_core');
class Storage extends CoreStorage {
 constructor(opts){
  opts=opts||{};
  if(opts.snapshotGate){
   if(typeof opts.snapshotGate.assertWritable!=='function')throw new Error('SNAPSHOT_GATE_INVALID');
   opts.snapshotGate.assertWritable();
  }
  migrateLegacy();
  super(opts);
 }
}
Storage.sha=CoreStorage.sha;
module.exports=Storage;
