'use strict';
// Close legacy Engine ingress in the isolated Auth21 runtime. This boundary
// deliberately grants no business permissions: those require operation-level
// policy and a verified principal, not a legacy service token or browser role.
const http = require('node:http');
const {active} = require('./auth21_service_boundary');

function createServer(handler, env = process.env, options = {}) {
  const isolated = active(env);
  const authenticated = env.IATB_AUTH_MODE === 'authenticated';
  let snapshotControl = null;
  if (env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL === '1') {
    if (!isolated) throw Error('AUTH21_SNAPSHOT_REQUIRES_ISOLATED_MODE');
    const trial = require('../Backup/auth21_engine_snapshot_trial').currentEngineSnapshotTrial();
    if (!trial) throw Error('AUTH21_SNAPSHOT_WRITER_NOT_BOUND');
    snapshotControl = require('../Backup/auth21_snapshot_control').createSnapshotControl({env,trial});
  }
  let businessHandler = null;
  if (env.IATB_AUTH21_BUSINESS_TRIAL === '1') {
    if (!isolated || env.IATB_AUTH21_IPC_PROBE_TRIAL !== '1')
      throw Error('AUTH21_BUSINESS_PROOF_DISABLED');
    const trial=require('../Backup/auth21_engine_snapshot_trial').currentEngineSnapshotTrial();
    if(trial&&['indicators','marketdata','fundamental','portfolio','strategy'].includes(trial.engine))
      businessHandler=require('./auth21_engine_business_ingress').openBusinessIngress({env,businessHandlers:options.businessHandlers||null});
  }
  const server = http.createServer(function(req, res) {
    if (authenticated) {
      const pathname=String(req.url).split('?')[0];
      if(req.method==='GET'&&pathname==='/health')return handler(req,res);
      if(req.method==='POST'&&(pathname==='/cp/v1'||(options.machinePostPaths||[]).includes(pathname))&&require('../Communication/communication_protocol_v1').verifyToken('',String(req.headers['x-iatb-cp-token']||'')))return handler(req,res);
      res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end('{"error":"AUTH21_ENGINE_OPERATION_DENIED"}');
    }
    if (!isolated) return handler(req, res);
    if (businessHandler && require('./auth21_business_actions').contract(req.url))
      return businessHandler(req,res);
    if (snapshotControl && req.url === '/auth21/snapshot/control')
      return snapshotControl(req,res);
    res.writeHead(403, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Connection': 'close'
    });
    res.end(JSON.stringify({error: 'AUTH21_ENGINE_OPERATION_DENIED'}));
  });
  // Upgrade/CONNECT bypass the HTTP request callback in Node. Reject both
  // before any legacy protocol handler can interpret a message.
  if (isolated || authenticated) {
    const denySocket = (req, socket) => {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    };
    server.on('upgrade', denySocket);
    server.on('connect', denySocket);
  }
  return server;
}

module.exports = {createServer};
