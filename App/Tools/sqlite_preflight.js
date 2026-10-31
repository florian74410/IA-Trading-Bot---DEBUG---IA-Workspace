'use strict';
// Auth21 P2.2: independent maintenance tools must not bypass a held global snapshot.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')throw Error('AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT');

/* IA-TB migration preflight — read-only against the application.
 * Runs against an in-memory SQLite database; does not open production data.
 * Invoke from App/: node Tools/sqlite_preflight.js
 */
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const appRoot = path.resolve(__dirname, '..');
const manifest = path.join(appRoot, 'package.json');
const expected = '12.4.1';

function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  assert.equal(nodeMajor, 22, 'IA-TB migration runtime must use Node.js 22');
  assert.ok(fs.existsSync(manifest), 'Missing App/package.json; build is not ready');
  const app = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  assert.equal(app.dependencies && app.dependencies['better-sqlite3'], expected,
    'App/package.json must pin better-sqlite3@' + expected);
  const resolved = require.resolve('better-sqlite3', { paths: [appRoot] });
  const moduleRoot = path.dirname(path.dirname(resolved));
  const pkg = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.version, expected, 'Installed better-sqlite3 version mismatch');

  const Database = require(resolved);
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE probe(id INTEGER PRIMARY KEY, value TEXT NOT NULL);');
    const insert = db.prepare('INSERT INTO probe(value) VALUES (?)');
    const tx = db.transaction((values) => values.forEach((v) => insert.run(v)));
    tx(['first', 'second']);
    assert.deepEqual(db.prepare('SELECT value FROM probe ORDER BY id').all().map(r => r.value),
      ['first', 'second']);
    const sqliteVersion = db.prepare('SELECT sqlite_version() AS version').get().version;
    assert.equal(db.pragma('quick_check', { simple: true }), 'ok');
    process.stdout.write(JSON.stringify({
      ok: true, node: process.version, betterSqlite3: pkg.version,
      sqlite: sqliteVersion, resolved, checks: ['insert', 'transaction', 'select', 'quick_check']
    }, null, 2) + '\n');
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  process.stderr.write('[IA-TB SQLITE PREFLIGHT FAILED] ' + error.message + '\n');
  process.exitCode = 1;
}
