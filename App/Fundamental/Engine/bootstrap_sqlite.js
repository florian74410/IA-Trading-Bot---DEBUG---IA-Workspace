'use strict';

/* IA-TB Fundamental Engine V3
 * Node.js 22 / better-sqlite3 12.4.1
 * Runtime validation only. Never install dependencies at startup.
 */

var fs = require('fs');
var path = require('path');

var APP = path.resolve(__dirname, '../..');
var REQUIRED = '12.4.1';

function validate() {
  var db;

  try {
    var nodeMajor = Number(process.versions.node.split('.')[0]);

    if (nodeMajor !== 22) {
      throw new Error('NODE_VERSION_UNSUPPORTED: ' + process.version);
    }

    var modulePath = require.resolve('better-sqlite3', {
      paths: [APP]
    });

    var packagePath = path.join(
      path.dirname(path.dirname(modulePath)),
      'package.json'
    );

    var pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    if (pkg.version !== REQUIRED) {
      throw new Error(
        'SQLITE_VERSION_MISMATCH: ' + pkg.version + ' != ' + REQUIRED
      );
    }

    var Database = require(modulePath);

    db = new Database(':memory:');

    var sqliteVersion = db
      .prepare('SELECT sqlite_version() AS version')
      .get().version;

    return {
      ok: true,
      moduleVersion: REQUIRED,
      sqliteVersion: String(sqliteVersion)
    };

  } catch (e) {
    return {
      ok: false,
      error: String(e && e.message || e)
    };

  } finally {
    if (db) db.close();
  }
}

exports.validate = validate;

exports.ensureSync = function () {
  var result = validate();

  if (!result.ok) {
    throw new Error('SQLITE_RUNTIME_UNAVAILABLE: ' + result.error);
  }

  return {
    ok: true,
    installed: false,
    moduleVersion: result.moduleVersion,
    sqliteVersion: result.sqliteVersion
  };
};
