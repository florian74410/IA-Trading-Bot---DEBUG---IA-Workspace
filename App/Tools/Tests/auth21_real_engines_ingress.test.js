'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {setTimeout: delay} = require('node:timers/promises');
const APP = path.resolve(__dirname, '../..');
const specs = [
  ['Indicator', 'Indicators/Engine/indicator_service.js', 'IATB_INDICATOR_PORT'],
  ['MarketData', 'MarketData/market_data_service.js', 'IATB_MARKET_DATA_PORT'],
  ['Liquidity', 'Liquidity/Engine/liquidity_service.js', 'IATB_LIQUIDITY_PORT'],
  ['Fundamental', 'Fundamental/Engine/fundamental_service.js', 'IATB_FUNDAMENTAL_PORT'],
  ['Trading', 'services/trading-engine/trading_service.js', 'IATB_TRADING_ENGINE_PORT'],
  ['Firewall', 'Core/Firewall/firewall_service.js', 'IATB_FIREWALL_PORT'],
  ['Strategy', 'Strategy/Engine/strategy_service.js', 'IATB_STRATEGY_PORT'],
  ['Risk', 'Risk/Engine/risk_service.js', 'IATB_RISK_ENGINE_PORT'],
  ['Portfolio', 'Portfolio/Engine/portfolio_service.js', 'IATB_PORTFOLIO_PORT'],
  ['Supervisor', 'Supervisor/supervisor_service.js', 'IATB_SUPERVISOR_PORT']
];
async function unusedPort() {
  const s = net.createServer(); s.listen(0, '127.0.0.1');
  await once(s, 'listening'); const port = s.address().port;
  await new Promise(resolve => s.close(resolve)); return port;
}
function request(port, method, target, headers = {}, body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port, method, path: target,
      headers, agent: false, timeout: 1500}, res => {
      let text = ''; res.on('data', b => text += b);
      res.on('end', () => resolve({status: res.statusCode, text}));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(Error('TIMEOUT')));
    req.end(body);
  });
}
function rawRequest(port, text) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1'); let result = '';
    socket.setTimeout(1500, () => socket.destroy(Error('TIMEOUT')));
    socket.on('connect', () => socket.end(text));
    socket.on('data', b => result += b);
    socket.on('end', () => resolve(result)); socket.on('error', reject);
  });
}
for (const [name, entry, portKey] of specs) {
  test(`${name}: real isolated process rejects HTTP, forged identity, CP/1, WebSocket and CONNECT`,
    {timeout: 20000}, async t => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iatb-auth21-core-runtime-'));
      fs.chmodSync(root, 0o700);
      const app = path.join(root, 'App');
      fs.cpSync(APP, app, {recursive: true, filter: src => {
        const relative = path.relative(APP, src);
        return !relative.split(path.sep).some(x => ['node_modules', '.runtime', 'Data', 'Logs'].includes(x));
      }});
      fs.symlinkSync(path.join(APP, 'node_modules'), path.join(app, 'node_modules'), 'dir');
      fs.writeFileSync(path.join(root, '.iatb-auth21-core-local-trial'),
        'IATB_AUTH21_CORE_LOCAL_TRIAL_ONLY\n', {mode: 0o600});
      const port = await unusedPort(), routerPort = await unusedPort();
      const env = {...process.env, IATB_AUTH21_CORE_AUTH_TRIAL: '1',
        IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL: '1', IATB_DEBUG_MODE: '1',
        IATB_DEBUG_BOOTSTRAP: '0', IATB_AUTH21_LOCAL_TRIAL_ROOT: root,
        IATB_TRADING_LIVE: '0', IATB_MARKETDATA_OFFLINE_DIAGNOSTIC: '1',
        IATB_FUNDAMENTAL_STDOUT: '1', ROUTER_PORT: String(routerPort), [portKey]: String(port)};
      for (const [key, sub] of [['RUNTIME', 'runtime'], ['DATA', 'userdata'],
        ['ANNEX', 'annexes'], ['UPDATES', 'updates'], ['STATE', 'legacy']]) {
        env['IATB_' + key + '_ROOT'] = path.join(root, sub);
      }
      // No production configuration, keys or persistent data enter this copy.
      delete env.IATB_USER_DB; delete env.IATB_AUTH21_IPC_PROBE_TRIAL;
      const child = spawn(process.execPath, [path.join(app, entry)],
        {cwd: app, env, stdio: ['ignore', 'pipe', 'pipe']});
      let output = '';
      child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
      t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL'); await once(child, 'exit');
        }
        fs.rmSync(root, {recursive: true, force: true});
      });
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) assert.fail(name + ' boot failed: ' + output);
        try { const r = await request(port, 'GET', '/health'); ready = r.status === 403; }
        catch (_) {}
        if (ready) break;
        await delay(50);
      }
      assert.equal(ready, true, name + ' did not become ready: ' + output);
      for (const [method, target, body] of [
        ['GET', '/health', ''], ['GET', '/api/settings?clientId=CLother', ''],
        ['POST', '/cp/v1', JSON.stringify({action: 'trading.execute', role: 'ADMIN'})],
        ['POST', '/api/thread/stop', '{"thread":"data"}'],
        ['DELETE', '/unknown', '']
      ]) {
        const r = await request(port, method, target, {
          'x-iatb-role': 'ADMIN', 'x-client-id': 'CLother',
          'x-iatb-cp-token': 'forged', Authorization: 'Bearer forged'
        }, body);
        assert.equal(r.status, 403, name + ' ' + method + ' ' + target);
        assert.equal(JSON.parse(r.text).error, 'AUTH21_ENGINE_OPERATION_DENIED');
      }
      assert.match(await rawRequest(port,
        'GET /cp/v1 HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'),
        /^HTTP\/1\.1 403 /);
      assert.match(await rawRequest(port,
        'CONNECT localhost:80 HTTP/1.1\r\nHost: localhost\r\n\r\n'), /^HTTP\/1\.1 403 /);
    });
}

test('legacy handler remains available when isolated Auth21 mode is off', async () => {
  let calls = 0;
  const server = require('../../Core/Clients/auth21_engine_ingress').createServer(
    (req, res) => { calls++; res.end('legacy'); }, {});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { assert.equal((await request(server.address().port, 'GET', '/health')).text, 'legacy'); }
  finally { await new Promise(resolve => server.close(resolve)); }
  assert.equal(calls, 1);
});
