'use strict';
// Auth21 P2.2: independent maintenance tools must not bypass a held global snapshot.
if(process.env.IATB_AUTH21_LOCAL_SNAPSHOT_TRIAL==='1'&&process.env.IATB_AUTH21_SNAPSHOT_IPC_TRIAL==='1')throw Error('AUTH21_MAINTENANCE_BLOCKED_DURING_SNAPSHOT');

// Private SSH-only UI bridge: host Unix socket -> Docker loopback UI.
// No TCP listener, no Docker published ports, no access to external networks.
const fs=require('node:fs'),net=require('node:net'),path=require('node:path');
const root=process.env.IATB_RUNTIME_ROOT||'/iatb/debug/runtime';
const socketPath=path.join(root,'ssh-ui.sock');
const UI_HOST='127.0.0.1',UI_PORT=+(process.env.IATB_UI_PORT||8000);
let server,closing=false;
function fatal(e){console.error('SSH_UI_BRIDGE_ERROR',e&&e.stack||e);process.exitCode=1;}
function removeOwnedSocket(){
 try{
  const s=fs.lstatSync(socketPath);
  if(!s.isSocket()||s.uid!==process.getuid())throw Error('UNEXPECTED_SOCKET_PATH');
  fs.unlinkSync(socketPath);
 }catch(e){if(e.code!=='ENOENT')throw e;}
}
async function startup(){
 fs.mkdirSync(root,{recursive:true});
 try{
  const stat=fs.lstatSync(socketPath);
  if(!stat.isSocket()||stat.uid!==process.getuid())throw Error('UNEXPECTED_SOCKET_PATH');
  const alive=await new Promise(resolve=>{
   const s=net.createConnection(socketPath);
   s.once('connect',()=>{s.destroy();resolve(true)});
   s.once('error',e=>resolve(e.code!=='ECONNREFUSED'));
  });
  if(alive)throw Error('SSH_UI_BRIDGE_ALREADY_RUNNING');
  removeOwnedSocket();
 }catch(e){if(e.code!=='ENOENT')throw e;}
 server=net.createServer(client=>{
  const upstream=net.createConnection({host:UI_HOST,port:UI_PORT});
  client.on('error',()=>upstream.destroy());
  upstream.on('error',()=>client.destroy());
  client.on('close',()=>upstream.destroy());
  upstream.on('close',()=>client.destroy());
  client.pipe(upstream);
  upstream.pipe(client);
 });
 server.on('error',fatal);
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(socketPath,()=>{server.removeListener('error',reject);resolve()});
 });
 fs.chmodSync(socketPath,0o600);
 console.log('SSH_UI_BRIDGE_READY '+socketPath+' -> '+UI_HOST+':'+UI_PORT);
}
function stop(){
 if(closing)return;closing=true;
 if(server)server.close(()=>{try{removeOwnedSocket()}catch(e){console.error(e.message)}process.exit(0)});
 else {try{removeOwnedSocket()}catch(e){}process.exit(0)}
 setTimeout(()=>{try{removeOwnedSocket()}catch(e){}process.exit(0)},1500).unref();
}
process.on('SIGTERM',stop);
process.on('SIGINT',stop);
startup().catch(fatal);
