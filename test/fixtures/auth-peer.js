'use strict';

const crypto = require('node:crypto');
const net = require('node:net');

const algorithm = Number(process.argv[2]);
const tamper = process.argv[3] === 'tamper';
const expectEvent = process.argv[4] === 'event';
const aesKey = Buffer.from(Array.from({ length: 32 }, (_, i) => i)).subarray(0, 8 * (algorithm + 1));
const hmacKey = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 32));
const plaintext = Buffer.from('e000076de8', 'hex');

const server = net.createServer((socket) => {
  let pending = Buffer.alloc(0);
  let binary = false;
  let completed = false;

  function fail(error) {
    console.error(error.message);
    process.exitCode = 1;
    socket.destroy();
    server.close();
  }

  socket.write('+OK - test peer\r\n');
  socket.on('error', fail);
  socket.on('data', (data) => {
    try {
      pending = Buffer.concat([pending, data]);
      while (!binary) {
        const end = pending.indexOf(0x0a);
        if (end < 0) {
          return;
        }
        const command = pending.subarray(0, end).toString('ascii').trim().split(' ')[0].toUpperCase();
        pending = pending.subarray(end + 1);
        if (command === 'VERS') {
          socket.write('26,10,1\r\n+OK\r\n');
        } else if (command === 'CHID') {
          socket.write('1\r\n+OK\r\n');
        } else {
          socket.write('+OK\r\n');
        }
        binary = command === 'BINARY';
      }
      if (completed || pending.length < 3) {
        return;
      }
      const length = pending.readUInt16BE(1) & 0x1fff;
      if (pending.length < length + 3) {
        return;
      }
      const wire = Buffer.from(pending.subarray(0, length + 3));
      if (wire[0] !== 0x55 || (wire.readUInt16BE(1) >> 13) !== 1 ||
          (wire[3] & 0x0f) !== algorithm || (!expectEvent && wire[3] !== (plaintext[0] | algorithm))) {
        throw new Error('Invalid authenticated binary header');
      }
      const tag = crypto.createHmac('sha256', hmacKey).update(wire.subarray(0, -16)).digest().subarray(0, 16);
      if (!crypto.timingSafeEqual(tag, wire.subarray(-16))) {
        throw new Error('Invalid outgoing HMAC');
      }
      const decipher = crypto.createDecipheriv(`aes-${aesKey.length * 8}-cbc`, aesKey, wire.subarray(-32, -16));
      const decoded = Buffer.concat([decipher.update(wire.subarray(4, -32)), decipher.final()]);
      if (expectEvent) {
        const event = Buffer.concat([Buffer.from([wire[3] & 0xf0]), decoded]);
        if (event.length < 38 || event.readUInt16BE(14) !== 10 || event.readUInt16BE(16) !== 7) {
          throw new Error('Invalid outgoing event');
        }
      } else if (!decoded.equals(plaintext.subarray(1))) {
        throw new Error('Invalid outgoing AES plaintext');
      }
      completed = true;
      if (tamper) {
        wire[wire.length - 1] ^= 1;
      }
      socket.end(wire, () => server.close());
    } catch (error) {
      fail(error);
    }
  });
});

server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
