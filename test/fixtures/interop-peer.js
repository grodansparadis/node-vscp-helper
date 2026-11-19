'use strict';

const dgram = require('node:dgram');
const fs = require('node:fs');
const { loadHelper } = require(process.env.VSCPHELPER_NODE_ROOT);

const mode = process.argv[2];
const port = Number(process.argv[3]);
const aesKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const hmacKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 32));
const iv = aesKey.subarray(0, 16);
const api = loadHelper();

function check(status) {
  if (status !== 0) throw new Error(`VSCP error ${status}`);
}

if (mode === 'send') {
  const [status, encrypted] = api.encryptFrameV1(
    Buffer.from(process.argv[4], 'hex'), aesKey, hmacKey, 3, iv);
  check(status);
  const prefix = Buffer.alloc(3);
  prefix[0] = 0x55;
  prefix.writeUInt16BE(0x2000 | encrypted.length, 1);
  const socket = dgram.createSocket('udp4');
  socket.send(Buffer.concat([prefix, encrypted]), port, '127.0.0.1', (error) => {
    socket.close();
    if (error) throw error;
  });
} else if (mode === 'receive') {
  const client = api.newUdpClient();
  if (!client) throw new Error('Could not create UDP client');
  try {
    check(api.configureDatagramClient(client, {
      ip: `udp://127.0.0.1:${port}`, encryption: 3,
      key: aesKey.toString('hex'), 'hmac-key': hmacKey.toString('hex')
    }));
    check(api.connectDatagramClient(client));
    fs.writeSync(1, 'READY\n');
    const [status, event] = api.receiveDatagramEventEx(client, 3000);
    check(status);
    console.log(JSON.stringify({ vscpClass: event.vscpClass, vscpType: event.vscpType }));
  } finally {
    check(api.closeDatagramClient(client));
  }
} else {
  throw new Error('Expected send or receive mode');
}
