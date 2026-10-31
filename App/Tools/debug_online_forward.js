'use strict';
// Loopback-only host Docker port 18000 -> internal HTTPS UI 127.0.0.1:8000.
// No HTTP parsing, no proxy authentication bypass, no secret handling.
// The container port MUST be published only to host 127.0.0.1 by Compose.
const net = require('node:net');
const server = net.createServer({allowHalfOpen:false}, client => {
  const backend = net.connect({host:'127.0.0.1',port:8000});
  client.setTimeout(60000);
  backend.setTimeout(60000);
  client.on('timeout',()=>client.destroy());
  backend.on('timeout',()=>backend.destroy());
  client.on('error',()=>backend.destroy());
  backend.on('error',()=>client.destroy());
  backend.on('connect',()=>{client.pipe(backend);backend.pipe(client);});
});
server.on('error',e=>{console.error('DEBUG TLS EDGE BIND FAILED:',e.code);process.exit(1);});
server.listen(18000,'0.0.0.0',()=>console.log('DEBUG TLS edge listening inside container; host mapping must remain 127.0.0.1 only'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
