'use strict';
/* Auth21 P2.2: read-only syntax-level writer census over App sources.
 * Does not execute imported modules; dynamic calls may escape detection.
 * An unreviewed writer always blocks any claim of exhaustive qualification.
 */
const fs=require('node:fs'),path=require('node:path');
const {WRITERS}=require('./auth21_writer_inventory');
const {classify}=require('./auth21_writer_triage');
const OMIT=new Set(['node_modules','.runtime','.git','Data','Logs','Tests','CI','fixtures','dist','vendor']);
const PATTERNS=[
 ['filesystem',/\b(?:fs|fsp|fsPromises|promises)\.(?:writeFile|appendFile|rename|copyFile|rm|unlink|truncate|mkdir|open|createWriteStream|cp|rmdir)(?:Sync)?\s*\(/g],
 ['sqlite',/\b(?:db|database|sqlite)\.(?:exec|prepare|transaction|run)\s*\(/g],
 ['shell',/(?:\b(?:child|child_process|childProcess|cp)\.(?:execFile|spawn|exec|spawnSync|execSync)|\b(?:execFile|spawn|spawnSync|execSync))\s*\(/g]
];
function census(root){
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('P22_CENSUS_ROOT_REQUIRED');
 const app=path.resolve(root),seen=[],visited=new Set(),reviewed=new Set(WRITERS.map(x=>x.file));
 function walk(folder){
  for(const item of fs.readdirSync(folder,{withFileTypes:true})){
   if(OMIT.has(item.name)||item.name.startsWith('.'))continue;
   const full=path.join(folder,item.name);
   const st=fs.lstatSync(full);
   if(st.isSymbolicLink())throw Error('P22_CENSUS_SYMLINK_REFUSED');
   if(st.isDirectory())walk(full);
   else if(st.isFile()&&item.name.endsWith('.js')){
    const rel=path.relative(app,full).split(path.sep).join('/');
    const src=fs.readFileSync(full,'utf8');
    const kinds=[];
    for(const [kind,pattern] of PATTERNS){
     pattern.lastIndex=0;
     if(pattern.test(src))kinds.push(kind);
    }
    if(kinds.length){
     visited.add(rel);
     seen.push({file:rel,kinds,reviewed:reviewed.has(rel),
      containsSnapshotGate:src.includes('snapshotGate')&&src.includes('assertWritable')});
    }
   }
  }
 }
 walk(app);
 const uncovered=seen.filter(x=>!x.reviewed||!x.containsSnapshotGate).map(x=>({...x,group:classify(x.file),priority:x.kinds.includes('filesystem')?'potential-write':x.kinds.includes('sqlite')?'sql-call':'process-only'}));
 return {scanned:seen.length,reviewed:seen.filter(x=>x.reviewed&&x.containsSnapshotGate).length,
  alreadyReviewedTotal:WRITERS.length,
  untriaged:uncovered.filter(x=>!x.group),
  uncovered:uncovered.sort((a,b)=>a.file.localeCompare(b.file)),
  priorities:Object.fromEntries(['potential-write','sql-call','process-only'].map(k=>[k,uncovered.filter(x=>x.priority===k).length])),
  coverageComplete:uncovered.length===0,
  warning:'Syntactic census only; dynamic writers, scripts and non-JS paths need manual validation'};
}
module.exports={census};
