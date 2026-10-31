'use strict';
/* IA-TB Node 22 SQLite compatibility layer.
 * Preserves sqlite3 -batch -noheader -separator '\t' output and SQL scripts.
 * Each instance owns one better-sqlite3 connection; no runtime installs.
 */
var fs=require('fs'),path=require('path');
var Database=require('better-sqlite3');

function SqliteCompat(file,opts){
  opts=opts||{};
  this.file=path.resolve(file);
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  this.db=new Database(this.file,{timeout:opts.timeoutMs||5000});
  this.db.pragma('busy_timeout = '+Math.max(1,Number(opts.timeoutMs)||5000));
  if(opts.foreignKeys)this.db.pragma('foreign_keys = ON');
}
SqliteCompat.prototype.run=function(sql,read){
  var src=String(sql||'');
  if(!read){this.db.exec(src);return '';}
  var stmt=this.db.prepare(src);
  var values=stmt.all();
  if(!values.length)return '';
  return values.map(function(row){
    return Object.keys(row).map(function(key){
      var v=row[key];
      return v==null?'':String(v);
    }).join('\t');
  }).join('\n')+'\n';
};
SqliteCompat.prototype.close=function(){
  if(this.db&&this.db.open)this.db.close();
};
module.exports=SqliteCompat;
