'use strict';
/* Run from App: node tests/test_v23_admin_ui_regressions.js */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const core=read('Core/Server/server.js'),admin=read('Core/Clients/UserManagement/admin_routes.js'),settings=read('Frontend/JS/settings.js'),ui=read('Frontend/Pages/settings.html'),nav=read('Frontend/JS/global_navigation_v2.0.js'),fund=read('Frontend/Pages/fundamental_v3.html'),manifest=JSON.parse(read('manifest.json'));
assert.match(core,/\/router-health/,'Router health fallback missing');
assert.match(core,/api\/admin\/firewall\/status/,'Core Firewall ADMIN proxy missing');
assert.match(admin,/GET \/api\/admin\/firewall\/status/,'Firewall endpoint must be ADMIN-only');
assert.match(settings,/api\/admin\/firewall\/status/,'Settings must use Auth21 Core');
assert.doesNotMatch(nav,/global_sidebar_v2\.0\.(?:js|css)/,'retired sidebar assets requested');
assert.doesNotMatch(ui,/1\.12_DEBUG/,'retired build badge');
assert.doesNotMatch(fund,/id="calendarUnifiedEvents"/,'retired unified calendar');
assert.match(fund,/id="fedCalendarGrid"/,'FED calendar must remain');
assert.match(fund,/id="cmeCalendarGrid"/,'CME calendar must remain');
assert.equal(read('VERSION').trim(),manifest.version);
assert.equal(manifest.status,'DEV');
console.log('PASS: v2.3 ADMIN and calendar regression source-contract checks');
