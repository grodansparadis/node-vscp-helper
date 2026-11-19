'use strict';

const { loadHelper, ENCRYPTION } = require('..');

function check(status, operation) {
  if (status !== 0) {
    throw new Error(`${operation} failed (VSCP error ${status})`);
  }
}

function main() {
  const api = loadHelper();
  const client = api.newUdpClient();
  if (!client) {
    throw new Error('Could not create UDP client');
  }
  try {
    const config = {
      ip: process.env.VSCP_DATAGRAM_ENDPOINT || 'udp://127.0.0.1:9598',
      encryption: ENCRYPTION.AES256,
      key: process.env.VSCP_DATAGRAM_AES_KEY,
      'hmac-key': process.env.VSCP_DATAGRAM_HMAC_KEY
    };
    if (!/^[0-9a-f]{64}$/i.test(config.key || '') ||
        !/^[0-9a-f]{64}$/i.test(config['hmac-key'] || '')) {
      throw new Error('Set independent AES and HMAC keys as 64 hex digits each');
    }
    check(api.configureDatagramClient(client, config), 'configure');
    check(api.connectDatagramClient(client), 'connect');
    check(api.sendDatagramEventEx(client, {
      vscpClass: 10, vscpType: 6, data: Buffer.from([42])
    }), 'send');
    const [status, event] = api.receiveDatagramEventEx(client, 3000);
    check(status, 'receive');
    console.log(`Received class ${event.vscpClass}, type ${event.vscpType}, data ${event.data.toString('hex')}`);
  } finally {
    const status = api.closeDatagramClient(client);
    if (status !== 0) {
      console.error(`Close failed (VSCP error ${status})`);
    }
  }
}

main();
