'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SnapshotCoordinator } = require('../../Core/Backup/snapshot_coordinator');

function participant(id, log = []) {
  return {
    prepare: async epoch => { log.push('prepare:' + id + ':' + epoch); return { epoch, writerId:id, pending:0 }; },
    release: async epoch => { log.push('release:' + id + ':' + epoch); },
    abort: async epoch => { log.push('abort:' + id + ':' + epoch); }
  };
}

test('all ACKs precede capture; all writers released in reverse order', async () => {
  const log = [], c = new SnapshotCoordinator({writerIds:['clients','settings']});
  c.register('clients',participant('clients',log)); c.register('settings',participant('settings',log));
  const out = await c.execute(async ({epoch}) => {log.push('capture:' + epoch);return 'fixture-only';});
  assert.equal(out,'fixture-only'); assert.equal(c.state,'IDLE');
  assert.deepEqual(log,['prepare:clients:1','prepare:settings:1','capture:1','release:settings:1','release:clients:1']);
});

test('missing expected writer fails closed before capture', async () => {
  const c = new SnapshotCoordinator({writerIds:['clients','settings']});
  c.register('clients',participant('clients'));
  await assert.rejects(() => c.execute(() => assert.fail('capture must not run')), /SNAPSHOT_WRITER_MISSING/);
  assert.equal(c.state,'IDLE');
});

test('unknown and duplicate writer are rejected', () => {
  const c = new SnapshotCoordinator({writerIds:['clients']});
  assert.throws(() => c.register('other',participant('other')), /SNAPSHOT_UNKNOWN_WRITER/);
  c.register('clients',participant('clients'));
  assert.throws(() => c.register('clients',participant('clients')), /SNAPSHOT_DUPLICATE_WRITER/);
});

test('invalid ACK aborts and prevents capture', async () => {
  const log=[], c=new SnapshotCoordinator({writerIds:['clients','settings']});
  c.register('clients',participant('clients',log));
  c.register('settings',{...participant('settings',log),prepare:async epoch=>({epoch,writerId:'settings',pending:1})});
  await assert.rejects(() => c.execute(()=>assert.fail('capture must not run')), /SNAPSHOT_INVALID_ACK/);
  assert.deepEqual(log.slice(-2),['abort:settings:1','abort:clients:1']);
  assert.equal(c.state,'IDLE');
});

test('timeout aborts, and capture never runs', async () => {
  const log=[], c = new SnapshotCoordinator({writerIds:['clients'],timeoutMs:10});
  c.register('clients', {...participant('clients',log),prepare:()=>new Promise(()=>{})});
  await assert.rejects(()=>c.execute(()=>assert.fail('capture must not run')), /SNAPSHOT_ACK_TIMEOUT/);
  assert.deepEqual(log,['abort:clients:1']);
  assert.equal(c.state,'IDLE');
});

test('capture failure triggers abort and leaves coordinator idle after successful cleanup',async()=>{
  const log=[],c=new SnapshotCoordinator({writerIds:['clients']}); c.register('clients',participant('clients',log));
  await assert.rejects(()=>c.execute(()=>{throw Error('FIXTURE_DISK_FULL')}), /FIXTURE_DISK_FULL/);
  assert.deepEqual(log,['prepare:clients:1','abort:clients:1']);
  assert.equal(c.state,'IDLE');
});

test('concurrent execute/register/unregister rejected during snapshot',async()=>{
  const c=new SnapshotCoordinator({writerIds:['clients']});let releaseCapture;
  c.register('clients',participant('clients'));
  const active=c.execute(()=>new Promise(resolve=>{releaseCapture=resolve;}));
  while (!releaseCapture) await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(()=>c.execute(()=>{}),/SNAPSHOT_COORDINATOR_BUSY/);
  assert.throws(()=>c.unregister('clients'),/SNAPSHOT_COORDINATOR_BUSY/);
  assert.throws(()=>c.register('clients',participant('clients')),/SNAPSHOT_COORDINATOR_BUSY/);
  releaseCapture('ok'); assert.equal(await active,'ok');
});

test('cleanup failure blocks coordinator instead of claiming readiness',async()=>{
  const c=new SnapshotCoordinator({writerIds:['clients']});
  c.register('clients',{...participant('clients'),release:()=>{throw Error('no release');}});
  await assert.rejects(()=>c.execute(()=>true),/SNAPSHOT_CLEANUP_FAILED/);
  assert.equal(c.state,'BLOCKED');
  await assert.rejects(()=>c.execute(()=>true),/SNAPSHOT_COORDINATOR_BUSY/);
});

test('stale generation ACK is rejected',async()=>{
  const c=new SnapshotCoordinator({writerIds:['clients']});
  c.register('clients',{...participant('clients'),prepare:async epoch=>({epoch:epoch-1,writerId:'clients',pending:0})});
  await assert.rejects(()=>c.execute(()=>assert.fail('must not capture')),/SNAPSHOT_INVALID_ACK/);
});

test('invalid writer registry and hooks fail safely',()=>{
  assert.throws(()=>new SnapshotCoordinator({writerIds:['clients','clients']}),/INVALID_WRITER_ALLOWLIST/);
  assert.throws(()=>new SnapshotCoordinator({writerIds:['../secret']}),/INVALID_WRITER_ALLOWLIST/);
  assert.throws(()=>new SnapshotCoordinator({writerIds:['clients'],timeoutMs:0}),/INVALID_TIMEOUT/);
  const c=new SnapshotCoordinator({writerIds:['clients']});
  assert.throws(()=>c.register('clients',{}),/INVALID_HOOKS/);
});

test('transport failure cleanup retries same epoch',async()=>{const c=new SnapshotCoordinator({writerIds:['remote']});let n=0;c.register('remote',{prepare:async epoch=>({epoch,writerId:'remote',pending:0}),release:async()=>{if(++n===1)throw Object.assign(Error('reset'),{code:'ECONNRESET'});},abort:async()=>{}});await c.execute(()=>true);assert.equal(n,2);assert.equal(c.state,'IDLE');});

test('semantic mismatch blocks snapshot instead of replaying',async()=>{const c=new SnapshotCoordinator({writerIds:['remote']});let n=0;c.register('remote',{prepare:async epoch=>({epoch,writerId:'remote',pending:0}),release:async()=>{n++;throw Error('SNAPSHOT_EPOCH_MISMATCH');},abort:async()=>{}});await assert.rejects(c.execute(()=>true),/SNAPSHOT_CLEANUP_FAILED/);assert.equal(n,1);assert.equal(c.state,'BLOCKED');});
