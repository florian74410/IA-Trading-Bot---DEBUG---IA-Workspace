'use strict';
/* Auth P2.2 Core-local unit fixtures. Never loads real DBs, secrets or services.
 * The Client SQLite adapter and Settings database are stand-ins, not snapshots.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const { SnapshotCoordinator,LocalSnapshotWriter }=require('../../Core/Backup/snapshot_coordinator');

// Inject a fake compatibility adapter BEFORE importing client_repository:
// no better-sqlite3 dependency and no real database open during this test.
const sqliteCompatPath=require.resolve('../../Core/Shared/sqlite_compat');
class FixtureSqliteCompat {
  constructor(file) { this.file=file;this.queries=[];this.closed=false; }
  run(sql,read) {
    this.queries.push({sql,read});
    if (sql.includes('SELECT COALESCE(MAX(version),0)')) return '0\n';
    return '';
  }
  close() {this.closed=true;}
}
require.cache[sqliteCompatPath]={id:sqliteCompatPath,filename:sqliteCompatPath,loaded:true,exports:FixtureSqliteCompat};
const ClientRepository=require('../../Core/Clients/client_repository');
const SettingsStore=require('../../Core/Settings/sqlite_settings_store');

class FixtureSettingsStore extends SettingsStore {
  openNative() {
    if(!this.native) {
      this.native={
        exec:sql=>{this.fixtureCalls.push({sql,read:false});},
        prepare:sql=>({all:()=>{this.fixtureCalls.push({sql,read:true});return[];}})
      };
    }
    return this.native;
  }
}
FixtureSettingsStore.prototype.fixtureCalls=[];

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'iatb-p22-core-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const migrations=path.join(root,'migrations');
  fs.mkdirSync(migrations);
  return {root,migrations};
}

test('local writer freezes writes by epoch and releases only the current epoch',()=>{
  const writer=new LocalSnapshotWriter('clients');
  assert.deepEqual(writer.prepare(5),{epoch:5,writerId:'clients',pending:0});
  assert.throws(()=>writer.assertWritable(),/SNAPSHOT_WRITE_QUIESCED/);
  assert.throws(()=>writer.prepare(5),/SNAPSHOT_STALE_OR_BUSY_EPOCH/);
  assert.throws(()=>writer.release(4),/SNAPSHOT_EPOCH_MISMATCH/);
  assert.throws(()=>writer.abort(4),/SNAPSHOT_EPOCH_MISMATCH/);
  writer.release(5);
  writer.assertWritable();
  assert.throws(()=>writer.prepare(5),/SNAPSHOT_STALE_OR_BUSY_EPOCH/);
  writer.prepare(6);
  writer.abort(6);
  writer.abort(6); // idempotent cleanup for same generation
  writer.assertWritable();
  assert.throws(()=>new LocalSnapshotWriter('../invalid'),/SNAPSHOT_INVALID_WRITER_ID/);
});

test('Clients and Settings opt-in writers stay functional when no snapshot is running',t=>{
  const {root,migrations}=fixture(t);
  const clientsGate=new LocalSnapshotWriter('clients'),settingsGate=new LocalSnapshotWriter('settings');
  const repo=new ClientRepository({dbPath:path.join(root,'clients','clients.sqlite'),migrationsDir:migrations,snapshotGate:clientsGate});
  const store=new FixtureSettingsStore(root,{dbPath:path.join(root,'settings','user_data.db'),snapshotGate:settingsGate});
  assert.equal(repo.ready,true);
  assert.equal(store.ready,true);
  repo.run("INSERT INTO clients VALUES('fixture')",false);
  assert.equal(store.setRaw('testing','fixture','1'),true);
  assert.ok(repo.native.queries.some(x=>x.sql.includes("INSERT INTO clients")));
  assert.ok(store.fixtureCalls.some(x=>x.sql.includes("iatb_settings_v2")));
});

test('Core-local coordinator blocks SQL (including disguised read) until release',async t=>{
  const {root,migrations}=fixture(t);
  const clientsGate=new LocalSnapshotWriter('clients'),settingsGate=new LocalSnapshotWriter('settings');
  const repo=new ClientRepository({dbPath:path.join(root,'clients','clients.sqlite'),migrationsDir:migrations,snapshotGate:clientsGate});
  const store=new FixtureSettingsStore(root,{dbPath:path.join(root,'settings','user_data.db'),snapshotGate:settingsGate});
  const c=new SnapshotCoordinator({writerIds:['clients','settings']});
  c.register('clients',clientsGate);c.register('settings',settingsGate);
  const out=await c.execute(async({epoch})=>{
    assert.equal(epoch,1);
    assert.throws(()=>repo.run('INSERT INTO clients VALUES(1)',false),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>repo.run('UPDATE clients SET id=1 RETURNING id',true),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>repo.close(),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>store.run('UPDATE iatb_settings_v2 SET value_b64=1',false),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>store.runNative('SELECT 1',true),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>store.setRaw('testing','fixture','changed'),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>store.getRaw('testing','fixture'),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>store.listKeys('testing'),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>store.hasMigration('test'),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>store.seedCanonicalAppDefaults(),/SNAPSHOT_WRITE_QUIESCED/);
    assert.throws(()=>store.markMigration('test',{}),/SNAPSHOT_WRITE_QUIESCED/);
    return 'fixture-captured';
  });
  assert.equal(out,'fixture-captured');
  assert.equal(c.state,'IDLE');
  assert.equal(store.setRaw('testing','fixture','after'),true);
  repo.run('INSERT INTO clients VALUES(2)',false);
  repo.close();
});

test('Core startup and implicit SQLite creation blocked before any directory writes',t=>{
  const {root,migrations}=fixture(t);
  const clientsGate=new LocalSnapshotWriter('clients'),settingsGate=new LocalSnapshotWriter('settings');
  clientsGate.prepare(1);settingsGate.prepare(1);
  const dbPath=path.join(root,'fresh-clients','clients.sqlite');
  const settingsPath=path.join(root,'fresh-settings','user_data.db');
  const repo=new ClientRepository({dbPath,migrationsDir:migrations,snapshotGate:clientsGate});
  const store=new FixtureSettingsStore(root,{dbPath:settingsPath,snapshotGate:settingsGate});
  assert.equal(repo.ready,false);
  assert.equal(store.ready,false);
  assert.match(repo.lastError,/SNAPSHOT_WRITE_QUIESCED/);
  assert.match(store.lastError,/SNAPSHOT_WRITE_QUIESCED/);
  assert.equal(fs.existsSync(path.dirname(dbPath)),false);
  assert.equal(fs.existsSync(path.dirname(settingsPath)),false);
  clientsGate.abort(1);settingsGate.abort(1);
  repo.init();store.init();
  assert.equal(repo.ready,true);
  assert.equal(store.ready,true);
});

test('failed capture aborts both Core writers without touching fixture stores',async t=>{
  const {root,migrations}=fixture(t);
  const clientGate=new LocalSnapshotWriter('clients'),settingGate=new LocalSnapshotWriter('settings');
  const repo=new ClientRepository({dbPath:path.join(root,'clients.db'),migrationsDir:migrations,snapshotGate:clientGate});
  const store=new FixtureSettingsStore(root,{dbPath:path.join(root,'settings.db'),snapshotGate:settingGate});
  const c=new SnapshotCoordinator({writerIds:['clients','settings']});
  c.register('clients',clientGate);c.register('settings',settingGate);
  await assert.rejects(()=>c.execute(()=>{throw Error('FIXTURE_CAPTURE_ERROR');}),/FIXTURE_CAPTURE_ERROR/);
  assert.equal(c.state,'IDLE');
  assert.equal(clientGate.heldEpoch,null);
  assert.equal(settingGate.heldEpoch,null);
  repo.run("INSERT INTO clients VALUES(3)",false);
  assert.equal(store.setRaw('fixture','after-abort','ok'),true);
});

test('default stores have no snapshot guard and remain backward-compatible',t=>{
  const {root,migrations}=fixture(t);
  const repo=new ClientRepository({dbPath:path.join(root,'clients.db'),migrationsDir:migrations});
  const store=new FixtureSettingsStore(root,{dbPath:path.join(root,'user_data.db')});
  assert.equal(repo.snapshotGate,null);
  assert.equal(store.snapshotGate,null);
  assert.equal(repo.ready,true);
  assert.equal(store.ready,true);
  repo.run('INSERT INTO fixture VALUES (42)',false);
  assert.equal(store.setRaw('fixture','key','value'),true);
});
