// Assumes an echo server that is listening on port 8000.
const tls = require('tls');
const fs = require('fs');

const options = {
  // Necessary only if the server's cert isn't for "localhost".
  checkServerIdentity: () => { return null; },
};

const context = tls.createSecureContext();
console.log(context)

const socket = tls.connect(443, 'github.com', options, () => {
  console.log('client connected', socket.authorized ? 'authorized' : 'unauthorized');
  console.log('session', socket.getSession());
  console.log('protocol', socket.getProtocol());
  console.log('certificate', socket.getPeerCertificate(true));
  
  process.stdin.pipe(socket);
  process.stdin.resume();
});
socket.setEncoding('utf8');
socket.on('data', (data) => {
  console.log(data);
});
socket.on('end', () => {
  console.log('server ends connection');
});