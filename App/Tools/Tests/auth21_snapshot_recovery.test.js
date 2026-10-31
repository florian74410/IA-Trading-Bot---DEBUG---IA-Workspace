'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SnapshotCoordinator,LocalSnapshotWriter}=require('../../Core/Backup/snapshot_coordinator');
test('failed RELEASE blocks future snapshots until explicit same-epoch recovery',async()=>{
 const writer=new LocalSnapshotWriter('clients');
 let fail=true;
 const c=new SnapshotCoordinator({writerIds:['clients'],timeoutMs:200});
 c.register('clients',{prepare:e=>writer.prepare(e),release:e=>{
  if(fail)throw Error('CONNECTION_DROPPED');writer.release(e);
 },abort:e=>writer.abort(e)});
 await assert.rejects(c.execute(async()=>({snapshot:'ok'})),/SNAPSHOT_CLEANUP_FAILED/);
 assert.equal(c.state,'BLOCKED');
 assert.throws(()=>writer.assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
 await assert.rejects(c.execute(async()=>{}),/SNAPSHOT_COORDINATOR_BUSY/);
 await assert.rejects(c.recoverBlocked(),/SNAPSHOT_RECOVERY_INCOMPLETE/);
 assert.equal(c.state,'BLOCKED');
 fail=false;
 assert.equal((await c.recoverBlocked()).recovered,true);
 assert.equal(c.state,'IDLE');
 assert.doesNotThrow(()=>writer.assertWritable());
 assert.deepEqual(await c.execute(async()=>({snapshot:'next'})),{snapshot:'next'});
});
test('failed ABORT remains blocked and cannot silently resume writer',async()=>{
 const writer=new LocalSnapshotWriter('settings');let disconnected=true;
 const c=new SnapshotCoordinator({writerIds:['settings'],timeoutMs:200});
 c.register('settings',{prepare:e=>writer.prepare(e),release:e=>writer.release(e),
  abort:e=>{if(disconnected)throw Error('DISCONNECTED');writer.abort(e);}});
 await assert.rejects(c.execute(async()=>{throw Error('ARCHIVE_CORRUPT')}),/SNAPSHOT_CLEANUP_FAILED/);
 assert.throws(()=>writer.assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
 disconnected=false;
 await c.recoverBlocked();
 assert.equal(c.state,'IDLE');
 assert.doesNotThrow(()=>writer.assertWritable());
});
test('IDLE recovery is forbidden',async()=>{
 const c=new SnapshotCoordinator({writerIds:['clients']});
 await assert.rejects(c.recoverBlocked(),/SNAPSHOT_NOT_BLOCKED/);
});
