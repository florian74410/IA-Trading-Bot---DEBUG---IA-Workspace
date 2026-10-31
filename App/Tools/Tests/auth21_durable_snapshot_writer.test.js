'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DurableSnapshotWriter}=require('../../Core/Backup/auth21_durable_snapshot_writer');
const {SnapshotCoordinator}=require('../../Core/Backup/snapshot_coordinator');
test('snapshot freeze survives writer restart and requires same-epoch signed control decision',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const before=new DurableSnapshotWriter('portfolio',root);
 assert.equal(before.prepare(7).pending,0);
 assert.throws(()=>before.assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
 const restarted=new DurableSnapshotWriter('portfolio',root);
 assert.equal(restarted.lastEpoch,7);
 assert.throws(()=>restarted.assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
 assert.throws(()=>restarted.release(6),/SNAPSHOT_EPOCH_MISMATCH/);
 restarted.abort(7);
 const third=new DurableSnapshotWriter('portfolio',root);
 assert.doesNotThrow(()=>third.assertWritable());
 assert.equal(third.lastEpoch,7);
 assert.throws(()=>third.prepare(7),/SNAPSHOT_STALE_OR_BUSY_EPOCH/);
 third.prepare(8);
 assert.throws(()=>new DurableSnapshotWriter('portfolio',root).assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
 third.release(8);
});
test('corrupt or insecure durable state never fails open',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 new DurableSnapshotWriter('fundamental',root);
 const f=path.join(root,'runtime','auth21-snapshot-fundamental.json');
 fs.writeFileSync(f,'{"writerId":"fundamental","heldEpoch":null,"lastEpoch":-1}',{mode:0o600});
 assert.throws(()=>new DurableSnapshotWriter('fundamental',root),/SNAPSHOT_DURABLE_INVALID_STATE/);
 fs.chmodSync(f,0o644);
 assert.throws(()=>new DurableSnapshotWriter('fundamental',root),/SNAPSHOT_DURABLE_UNSAFE_STATE/);
});

test('Core retries a persisted RELEASE after the remote HTTP response was lost',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-auth21-core-runtime-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const gate=new DurableSnapshotWriter('marketdata',root);
 const coord=new SnapshotCoordinator({writerIds:['marketdata']});
 let drop=true;
 coord.register('marketdata',{
  prepare:epoch=>gate.prepare(epoch),
  release:epoch=>{gate.release(epoch);if(drop){drop=false;throw Error('ACK_LOST');}},
  abort:epoch=>gate.abort(epoch)
 });
 await assert.rejects(coord.execute(()=>({ok:true})),/SNAPSHOT_CLEANUP_FAILED/);
 assert.equal(coord.state,'BLOCKED');
 assert.equal(new DurableSnapshotWriter('marketdata',root).heldEpoch,null);
 await coord.recoverBlocked();
 assert.equal(coord.state,'IDLE');
 assert.throws(()=>gate.release(0),/SNAPSHOT_EPOCH_MISMATCH/);
 await coord.execute(()=>({ok:true}));
 assert.equal(coord.state,'IDLE');
});
