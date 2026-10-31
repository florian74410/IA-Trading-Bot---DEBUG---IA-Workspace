'use strict';
/* Minimal RFC6455 WSS client for public market streams.
   Node 16 compatible, zero npm dependencies. Text frames only at API boundary.
*/
var tls=require('tls'),crypto=require('crypto'),URL=require('url').URL,EventEmitter=require('events').EventEmitter;

function frame(op,payload){
 payload=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload==null?'':payload),'utf8');
 var n=payload.length,h=n<126?Buffer.alloc(2):n<=65535?Buffer.alloc(4):Buffer.alloc(10),mask=crypto.randomBytes(4),i;
 h[0]=0x80|(op&15);
 if(n<126){h[1]=0x80|n;}
 else if(n<=65535){h[1]=0x80|126;h.writeUInt16BE(n,2);}
 else{h[1]=0x80|127;h.writeUInt32BE(0,2);h.writeUInt32BE(n,6);}
 for(i=0;i<n;i++)payload[i]^=mask[i%4];
 return Buffer.concat([h,mask,payload]);
}
function WS(url,opt){
 EventEmitter.call(this);this.url=String(url);this.opt=opt||{};this.socket=null;this.buf=Buffer.alloc(0);this.open=false;this.closed=false;this.fragments=[];this.fragmentOp=0;this.maxBytes=Math.max(65536,+this.opt.maxBytes||4*1024*1024);this.connect();
}
WS.prototype=Object.create(EventEmitter.prototype);WS.prototype.constructor=WS;
WS.prototype.connect=function(){
 var self=this,u=new URL(self.url);if(u.protocol!=='wss:')return process.nextTick(function(){self.emit('error',new Error('WSS_REQUIRED'));});
 var port=+(u.port||443),key=crypto.randomBytes(16).toString('base64'),expected=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'),path=(u.pathname||'/')+(u.search||'');
 var s=self.socket=tls.connect({host:u.hostname,port:port,servername:u.hostname,rejectUnauthorized:self.opt.rejectUnauthorized!==false},function(){
  var req='GET '+path+' HTTP/1.1\r\nHost: '+u.hostname+(u.port?':'+u.port:'')+'\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: '+key+'\r\nSec-WebSocket-Version: 13\r\nUser-Agent: IA-TB-MarketData/2.1\r\n\r\n';
  s.write(req);
 });
 var handshake=Buffer.alloc(0),upgraded=false;
 s.setTimeout(Math.max(10000,+self.opt.timeout||30000));
 s.on('timeout',function(){self.emit('error',new Error('WEBSOCKET_TIMEOUT'));try{s.destroy();}catch(e){}});
 s.on('error',function(e){if(!self.closed)self.emit('error',e);});
 s.on('close',function(){var was=self.open;self.open=false;if(!self.closed)self.emit('close',{wasOpen:was});});
 s.on('data',function(chunk){
  if(!upgraded){
   handshake=Buffer.concat([handshake,chunk]);if(handshake.length>32768){self.emit('error',new Error('WEBSOCKET_HANDSHAKE_TOO_LARGE'));return s.destroy();}
   var p=handshake.indexOf('\r\n\r\n');if(p<0)return;
   var head=handshake.slice(0,p).toString('utf8'),rest=handshake.slice(p+4),lines=head.split(/\r?\n/),status=lines.shift()||'',headers={};
   lines.forEach(function(line){var i=line.indexOf(':');if(i>0)headers[line.slice(0,i).trim().toLowerCase()]=line.slice(i+1).trim();});
   if(!/^HTTP\/1\.1 101\b/.test(status)||headers['sec-websocket-accept']!==expected){self.emit('error',new Error('WEBSOCKET_HANDSHAKE_FAILED'));return s.destroy();}
   upgraded=true;self.open=true;s.setTimeout(0);self.emit('open');if(rest.length)self._data(rest);return;
  }
  self._data(chunk);
 });
};
WS.prototype._data=function(chunk){
 this.buf=Buffer.concat([this.buf,chunk]);if(this.buf.length>this.maxBytes*2){this.emit('error',new Error('WEBSOCKET_BUFFER_LIMIT'));return this.close();}
 while(this.buf.length>=2){
  var b0=this.buf[0],b1=this.buf[1],fin=!!(b0&0x80),op=b0&15,masked=!!(b1&0x80),len=b1&0x7f,off=2,i,mask;
  if(len===126){if(this.buf.length<4)return;len=this.buf.readUInt16BE(2);off=4;}
  else if(len===127){if(this.buf.length<10)return;var hi=this.buf.readUInt32BE(2),lo=this.buf.readUInt32BE(6);if(hi!==0)return this.emit('error',new Error('WEBSOCKET_FRAME_TOO_LARGE'));len=lo;off=10;}
  if(len>this.maxBytes){this.emit('error',new Error('WEBSOCKET_FRAME_LIMIT'));return this.close();}
  if(masked){if(this.buf.length<off+4)return;mask=this.buf.slice(off,off+4);off+=4;}
  if(this.buf.length<off+len)return;
  var payload=Buffer.from(this.buf.slice(off,off+len));this.buf=this.buf.slice(off+len);
  if(mask)for(i=0;i<payload.length;i++)payload[i]^=mask[i%4];
  if(op===0x8){try{if(this.socket)this.socket.write(frame(0x8,payload));}catch(e){}this.closed=true;try{this.socket.end();}catch(e){}this.emit('close',{remote:true});return;}
  if(op===0x9){try{if(this.socket)this.socket.write(frame(0xA,payload));}catch(e){}continue;}
  if(op===0xA){this.emit('pong');continue;}
  if(op===0x1||op===0x2){if(fin){this.emit(op===0x1?'message':'binary',payload.toString('utf8'));}else{this.fragmentOp=op;this.fragments=[payload];}continue;}
  if(op===0x0&&this.fragments.length){this.fragments.push(payload);if(fin){var all=Buffer.concat(this.fragments),fop=this.fragmentOp;this.fragments=[];this.fragmentOp=0;this.emit(fop===0x1?'message':'binary',all.toString('utf8'));}}
 }
};
WS.prototype.send=function(data){if(!this.open||!this.socket)throw new Error('WEBSOCKET_NOT_OPEN');this.socket.write(frame(0x1,Buffer.from(String(data),'utf8')));};
WS.prototype.sendJson=function(o){this.send(JSON.stringify(o));};
WS.prototype.ping=function(data){if(this.open&&this.socket)this.socket.write(frame(0x9,Buffer.from(String(data||''),'utf8')));};
WS.prototype.close=function(){this.closed=true;if(this.socket){try{if(this.open)this.socket.write(frame(0x8,Buffer.alloc(0)));}catch(e){}try{this.socket.end();}catch(e){}}this.open=false;};
module.exports=WS;
