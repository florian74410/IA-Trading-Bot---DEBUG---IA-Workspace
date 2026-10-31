'use strict';
var fs=require('fs'),path=require('path'),PATHS=require('../../Core/Shared/paths');
function Stats(root,opt){
  opt=opt||{};this.snapshotGate=opt.snapshotGate||null;
  if(this.snapshotGate&&typeof this.snapshotGate.assertWritable!=='function')throw Error('SNAPSHOT_GATE_INVALID');
  this.file=PATHS.RuntimeState.strategyStats;
  this.legacyFile=path.join(root,'Strategy','Data','strategy_stats_v2.json');
  this.state={schema:1,evaluations:0,signals:0,holds:0,errors:0,last_evaluation_at:null,last_signal_at:null,by_strategy:{}};
  if(!this.snapshotGate||this.snapshotGate.heldEpoch===null)this.migrateLegacy();
  this.load();
}
Stats.prototype.migrateLegacy=function(){if(this.snapshotGate)this.snapshotGate.assertWritable();
  try{
    if(this.file!==this.legacyFile&&!fs.existsSync(this.file)&&fs.existsSync(this.legacyFile)){
      fs.mkdirSync(path.dirname(this.file),{recursive:true});
      fs.renameSync(this.legacyFile,this.file);
      try{fs.rmdirSync(path.dirname(this.legacyFile));}catch(e){}
    }
  }catch(e){
    try{
      if(!fs.existsSync(this.file)&&fs.existsSync(this.legacyFile)){
        fs.mkdirSync(path.dirname(this.file),{recursive:true});
        fs.copyFileSync(this.legacyFile,this.file);
        fs.unlinkSync(this.legacyFile);
        try{fs.rmdirSync(path.dirname(this.legacyFile));}catch(x){}
      }
    }catch(x){}
  }
};
Stats.prototype.load=function(){try{var x=JSON.parse(fs.readFileSync(this.file,'utf8'));if(x&&x.schema===1)this.state=x;}catch(e){}return this.state;};
Stats.prototype.save=function(){if(this.snapshotGate)this.snapshotGate.assertWritable();try{fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.state,null,2)+'\n','utf8');}catch(e){}};
Stats.prototype.record=function(results,aggregate){if(this.snapshotGate)this.snapshotGate.assertWritable();this.state.evaluations++;this.state.last_evaluation_at=new Date().toISOString();if(aggregate.action==='HOLD')this.state.holds++;else{this.state.signals++;this.state.last_signal_at=this.state.last_evaluation_at;}var self=this;(results||[]).forEach(function(r){var id=String(r.strategy_id||'unknown'),x=self.state.by_strategy[id]||(self.state.by_strategy[id]={evaluations:0,matches:0,last_score:0,last_at:null});x.evaluations++;if(r.matched)x.matches++;x.last_score=+r.score||0;x.last_at=self.state.last_evaluation_at;});this.save();};
Stats.prototype.error=function(){if(this.snapshotGate)this.snapshotGate.assertWritable();this.state.errors++;this.save();};
Stats.prototype.snapshot=function(){return JSON.parse(JSON.stringify(this.state));};
Stats.prototype.reset=function(){if(this.snapshotGate)this.snapshotGate.assertWritable();this.state={schema:1,evaluations:0,signals:0,holds:0,errors:0,last_evaluation_at:null,last_signal_at:null,by_strategy:{}};this.save();return this.snapshot();};
module.exports=Stats;
