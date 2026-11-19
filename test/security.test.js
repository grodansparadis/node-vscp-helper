'use strict';

const assert = require('node:assert/strict');
const { fork, execFileSync } = require('node:child_process');
const dgram = require('node:dgram');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const koffi = require('koffi');
const helper = require('..');

const AES_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const HMAC_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 32));
const IV = AES_KEY.subarray(0, 16);
const PLAIN = Buffer.from('e000076de8', 'hex');
const AES256_VECTOR = Buffer.from(
  'e3b865bcf520d83d2708502ae712638aeb' +
  '000102030405060708090a0b0c0d0e0f' +
  '270fec51e9794541f47aab3dd9f947ce', 'hex'
);

function crc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc;
}

function eventFrame(type) {
  const frame = Buffer.alloc(38);
  frame.writeUInt16BE(10, 14);
  frame.writeUInt16BE(type, 16);
  frame.writeUInt16BE(crc16(frame.subarray(1, -2)), 36);
  return frame;
}

function datagram(api, type, key = AES_KEY, algorithm = 3) {
  const [status, inner] = api.encryptFrameV1(eventFrame(type), key, HMAC_KEY, algorithm, IV);
  assert.equal(status, 0);
  const prefix = Buffer.alloc(3);
  prefix[0] = 0x55;
  prefix.writeUInt16BE(0x2000 | inner.length, 1);
  return Buffer.concat([prefix, inner]);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = dgram.createSocket('udp4');
    probe.once('error', reject);
    probe.bind(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function send(socket, payload, port, address) {
  return new Promise((resolve, reject) => {
    socket.send(payload, port, address, (error) => error ? reject(error) : resolve());
  });
}

function startPeer(algorithm, tamper, expectEvent = false) {
  const child = fork(path.join(__dirname, 'fixtures', 'auth-peer.js'),
    [String(algorithm), tamper ? 'tamper' : 'valid', expectEvent ? 'event' : 'frame'], { silent: true });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (data) => { stderr += data; });
  const done = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal, stderr }));
  });
  const ready = new Promise((resolve, reject) => {
    child.once('message', ({ port }) => resolve(port));
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Peer exited before listening: ${code}`)));
  });
  return { child, ready, done };
}

describe('authenticated helper bindings', function () {
  this.timeout(15000);
  let api;

  before(function () {
    if (!process.env.VSCPHELPER_LIB) {
      this.skip();
    }
    api = helper.loadHelper();
  });

  it('exposes the C API and native structures', function () {
    assert.equal(typeof api.raw.vscphlp_getVersionString, 'function');
    assert.match(api.raw.vscphlp_getVersionString(), /^\d+\.\d+\.\d+\.\d+$/);
    assert.equal(api.raw.vscphlp_readStringValue('0x22'), 34);
    assert.ok(koffi.sizeof(api.types.EventEx) >= koffi.offsetof(api.types.EventEx, 'data') + 512);
    if (process.env.VSCPHELPER_HEADER) {
      execFileSync(process.execPath, [
        path.join(__dirname, '..', 'tools', 'generate-signatures.js'),
        process.env.VSCPHELPER_HEADER, '--check'
      ]);
    }
    const knownMissing = new Set([
      'vscphlp_convertLevel1MeasuremenToLevel2Double',
      'vscphlp_convertLevel1MeasuremenToLevel2DoubleEx',
      'vscphlp_convertLevel1MeasuremenToLevel2String',
      'vscphlp_convertLevel1MeasuremenToLevel2StringEx',
      'vscphlp_decryptVscpUdpFrame',
      'vscphlp_encryptVscpUdpFrame',
      'vscphlp_getEncryptionCodeFromToken',
      'vscphlp_getEncryptionTokenFromCode',
      'vscphlp_getMeasuremenSensorIndex',
      'vscphlp_getUDpFrameSizeFromEvent',
      'vscphlp_getUDpFrameSizeFromEventEx',
      'vscphlp_getVscpDataArrayFromString',
      'vscphlp_getVscpDataFromString',
      'vscphlp_serverShutDown',
      'vscphlp_setEventExToNow',
      'vscphlp_setEventToNow',
      'vscphlp_writeEventExToUdpFrame',
      'vscphlp_writeEventToUdpFrame'
    ]);
    for (const name of Object.keys(api.raw)) {
      try {
        assert.equal(typeof api.raw[name], 'function');
      } catch (error) {
        if (!knownMissing.has(name)) throw error;
        assert.match(error.message, /Cannot find function/);
      }
    }
  });

  it('matches native C structure sizes and offsets', function () {
    if (!process.env.VSCPHELPER_VSCP_INCLUDE || process.platform === 'win32') {
      this.skip();
    }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscp-layout-'));
    const executable = path.join(directory, 'native-layout');
    try {
      execFileSync(process.env.CC || 'cc', [
        '-std=c11', '-I', process.env.VSCPHELPER_VSCP_INCLUDE,
        path.join(__dirname, 'fixtures', 'native-layout.c'), '-o', executable
      ]);
      const entries = execFileSync(executable, { encoding: 'utf8' }).trim().split('\n');
      const native = new Map(entries.map((line) => {
        const [type, field, value] = line.split(' ');
        return [`${type}.${field}`, Number(value)];
      }));
      const structures = [
        ['Event', 'vscpEvent', ['head', 'obid', 'year', 'month', 'vscp_class', 'vscp_type', 'GUID',
          'sizeData', 'pdata', 'crc']],
        ['EventEx', 'vscpEventEx', ['head', 'obid', 'year', 'month', 'crc', 'vscp_class', 'vscp_type',
          'GUID', 'sizeData', 'data']],
        ['EventFilter', 'vscpEventFilter', ['filter_priority', 'mask_priority', 'filter_class', 'mask_class',
          'filter_type', 'mask_type', 'filter_GUID', 'mask_GUID']],
        ['Statistics', 'VSCPStatistics', ['cntReceiveFrames', 'cntTransmitFrames', 'cntReceiveData',
          'cntTransmitData', 'cntOverruns', 'x', 'y', 'z']],
        ['Status', 'VSCPStatus', ['channel_status', 'lasterrorcode', 'lasterrorsubcode', 'lasterrorstr']],
        ['CanalMsg', 'canalMsg', ['flags', 'obid', 'id', 'sizeData', 'data', 'timestamp']]
      ];
      for (const [type, nativeType, fields] of structures) {
        assert.equal(koffi.sizeof(api.types[type]), native.get(`${nativeType}.size`), type);
        for (const field of fields) {
          assert.equal(koffi.offsetof(api.types[type], field), native.get(`${nativeType}.${field}`),
            `${type}.${field}`);
        }
      }
      assert.equal(koffi.offsetof(api.types.Event, 'time'), native.get('vscpEvent.timestamp_ns'));
      assert.equal(koffi.offsetof(api.types.EventEx, 'time'), native.get('vscpEventEx.timestamp_ns'));
    } finally {
      if (fs.existsSync(executable)) fs.unlinkSync(executable);
      fs.rmdirSync(directory);
    }
  });

  it('checks authenticated frame vectors, tampering, and input validation', function () {
    for (const algorithm of [1, 2, 3]) {
      const key = AES_KEY.subarray(0, 8 * (algorithm + 1));
      const [status, wire] = api.encryptFrameV1(PLAIN, key, HMAC_KEY, algorithm, IV);
      assert.equal(status, 0);
      if (algorithm === 3) {
        assert.deepEqual(wire, AES256_VECTOR);
      }
      const [decryptStatus, plaintext] = api.decryptFrameV1(wire, key, HMAC_KEY);
      assert.equal(decryptStatus, 0);
      assert.deepEqual(plaintext, Buffer.concat([Buffer.from([PLAIN[0] | algorithm]), PLAIN.subarray(1)]));
      for (const index of [0, 1, wire.length - 17, wire.length - 1]) {
        const changed = Buffer.from(wire);
        changed[index] ^= index === 0 ? 0x10 : 1;
        const [error, output] = api.decryptFrameV1(changed, key, HMAC_KEY);
        assert.notEqual(error, 0);
        assert.equal(output, null);
      }
      assert.notEqual(api.decryptFrameV1(wire, key, Buffer.alloc(32))[0], 0);
      assert.notEqual(api.encryptFrameV1(PLAIN, key, HMAC_KEY, algorithm, IV.subarray(1))[0], 0);
      assert.notEqual(api.encryptFrameV1(PLAIN, key.subarray(1), HMAC_KEY, algorithm, IV)[0], 0);
    }
    assert.throws(() => api.encryptFrameV1('not bytes', AES_KEY, HMAC_KEY, 3), TypeError);
    assert.notDeepEqual(api.encryptFrameV1(PLAIN, AES_KEY, HMAC_KEY, 3)[1],
      api.encryptFrameV1(PLAIN, AES_KEY, HMAC_KEY, 3)[1]);
    const largest = Buffer.alloc(8144);
    largest[0] = 0xe0;
    largest.writeUInt16BE(crc16(largest.subarray(1, -2)), largest.length - 2);
    const [status, encrypted] = api.encryptFrameV1(largest, AES_KEY, HMAC_KEY, 3, IV);
    assert.equal(status, 0);
    assert.equal(encrypted.length, 8177);
    const [decryptStatus, decrypted] = api.decryptFrameV1(encrypted, AES_KEY, HMAC_KEY);
    assert.equal(decryptStatus, 0);
    assert.deepEqual(decrypted, Buffer.concat([Buffer.from([0xe3]), largest.subarray(1)]));
    assert.deepEqual(api.encryptFrameV1(Buffer.alloc(8145), AES_KEY, HMAC_KEY, 3, IV), [64, null]);
  });

  it('keeps security configuration isolated per session', function () {
    const first = api.newSession();
    const second = api.newSession();
    assert.ok(first && second);
    try {
      for (const algorithm of [1, 2, 3]) {
        const key = AES_KEY.subarray(0, 8 * (algorithm + 1));
        assert.equal(api.setBinarySecurity(first, algorithm, key, HMAC_KEY), 0);
        assert.deepEqual(api.getBinarySecurity(first), [0, algorithm]);
        assert.notEqual(api.setBinarySecurity(first, algorithm, key, AES_KEY), 0);
        assert.deepEqual(api.getBinarySecurity(first), [0, algorithm]);
      }
      assert.equal(api.setBinarySecurity(first, helper.ENCRYPTION.NONE), 0);
      assert.deepEqual(api.getBinarySecurity(first), [0, 0]);
      assert.deepEqual(api.getBinarySecurity(second), [0, 0]);
    } finally {
      api.closeSession(first);
      api.closeSession(second);
    }
  });

  for (const algorithm of [1, 2, 3]) {
    for (const tamper of [false, true]) {
      it(`sends and ${tamper ? 'rejects a tampered' : 'receives an'} AES-${64 * (algorithm + 1)} binary frame`, async function () {
        const peer = startPeer(algorithm, tamper);
        let session = 0;
        try {
          const port = await peer.ready;
          session = api.newSession();
          assert.ok(session);
          const key = AES_KEY.subarray(0, 8 * (algorithm + 1));
          assert.equal(api.setBinarySecurity(session, algorithm, key, HMAC_KEY), 0);
          assert.equal(api.open(session, `tcp://127.0.0.1:${port}`, 'admin', 'secret'), 0);
          assert.equal(api.doCmdBinary(session), 0);
          assert.deepEqual(api.isBinaryMode(session), [0, true]);
          assert.equal(api.sendBinaryFrame(session, PLAIN), 0);
          const [status, frame] = api.receiveBinaryFrame(session, 3000);
          if (tamper) {
            assert.notEqual(status, 0);
            assert.equal(frame, null);
          } else {
            assert.equal(status, 0);
            assert.deepEqual(frame, PLAIN);
          }
          api.closeSession(session);
          session = 0;
          const result = await peer.done;
          assert.equal(result.code, 0, `Authenticated peer failed: ${result.stderr || result.error}`);
        } finally {
          if (session) {
            api.closeSession(session);
          }
          if (peer.child.exitCode === null && peer.child.signalCode === null) {
            peer.child.kill();
          }
          await peer.done;
        }
      });
    }
  }

  it('sends and receives authenticated TCP events', async function () {
    const peer = startPeer(3, false, true);
    let session = 0;
    try {
      const port = await peer.ready;
      session = api.newSession();
      assert.ok(session);
      assert.equal(api.setBinarySecurity(session, 3, AES_KEY, HMAC_KEY), 0);
      assert.equal(api.open(session, `tcp://127.0.0.1:${port}`, 'admin', 'secret'), 0);
      assert.equal(api.doCmdBinary(session), 0);
      assert.equal(api.sendEventEx(session, {
        vscpClass: 10, vscpType: 7, data: Buffer.from([0x2a, 0x3b])
      }), 0);
      const [status, event] = api.blockingReceiveEventEx(session, 3000);
      assert.equal(status, 0);
      assert.equal(event.vscpClass, 10);
      assert.equal(event.vscpType, 7);
      assert.deepEqual(event.data, Buffer.from([0x2a, 0x3b]));
      api.closeSession(session);
      session = 0;
      const result = await peer.done;
      assert.equal(result.code, 0, `Authenticated peer failed: ${result.stderr || result.error}`);
    } finally {
      if (session) {
        api.closeSession(session);
      }
      if (peer.child.exitCode === null && peer.child.signalCode === null) {
        peer.child.kill();
      }
      await peer.done;
    }
  });

  it('sends authenticated UDP and drops legacy or tampered datagrams', async function () {
    const port = await freePort();
    const client = api.newUdpClient();
    assert.ok(client);
    const sender = dgram.createSocket('udp4');
    let senderStarted = false;
    try {
      await new Promise((resolve, reject) => {
        sender.once('error', reject);
        sender.bind(0, '127.0.0.1', resolve);
      });
      senderStarted = true;
      for (const field of ['key', 'hmac-key', 'encryption']) {
        assert.throws(() => api.configureDatagramClient(client, { [field]: undefined }), TypeError);
      }
      assert.throws(() => api.configureDatagramClient(client, { 'hmac-key': () => {} }), TypeError);
      assert.equal(api.configureDatagramClient(client, {
        ip: `udp://127.0.0.1:${port}`, encryption: 3,
        key: AES_KEY.toString('hex'), 'hmac-key': HMAC_KEY.toString('hex')
      }), 0);
      assert.equal(api.connectDatagramClient(client), 0);
      assert.deepEqual(api.isDatagramClientConnected(client), [0, true]);
      const data = Buffer.alloc(512, 0xa5);
      const timestampNs = 1700000000123456789n;
      assert.equal(api.sendDatagramEventEx(client, { timestampNs, vscpClass: 10, vscpType: 6, data }), 0);
      const [status, received] = api.receiveDatagramEventEx(client, 3000);
      assert.equal(status, 0);
      assert.equal(received.timestampNs, timestampNs);
      assert.equal(received.vscpClass, 10);
      assert.equal(received.vscpType, 6);
      assert.deepEqual(received.data, data);
      assert.deepEqual(api.getDatagramClientCount(client), [0, 0]);
      assert.equal(api.clearDatagramClientQueue(client), 0);
      assert.throws(() => api.sendDatagramEventEx(client, { data: Buffer.alloc(513) }), RangeError);
      assert.throws(() => api.sendDatagramEventEx(client, { head: 0, timestampNs }), TypeError);

      const wire = datagram(api, 7);
      const bad = Buffer.from(wire);
      bad[bad.length - 1] ^= 1;
      for (const invalid of [eventFrame(7), bad]) {
        await send(sender, invalid, port, '127.0.0.1');
        const [error, event] = api.receiveDatagramEventEx(client, 200);
        assert.notEqual(error, 0);
        assert.equal(event, null);
      }
      await send(sender, wire, port, '127.0.0.1');
      const [ok, event] = api.receiveDatagramEventEx(client, 3000);
      assert.equal(ok, 0);
      assert.equal(event.vscpType, 7);
      assert.equal(api.setDatagramClientFilter(client, {
        filter_priority: 0, mask_priority: 0, filter_class: 0, mask_class: 0,
        filter_type: 8, mask_type: 0xffff, filter_GUID: Buffer.alloc(16), mask_GUID: Buffer.alloc(16)
      }), 0);
      assert.equal(api.sendDatagramEventEx(client, { vscpClass: 10, vscpType: 7 }), 0);
      const [filteredStatus, filteredEvent] = api.receiveDatagramEventEx(client, 200);
      assert.notEqual(filteredStatus, 0);
      assert.equal(filteredEvent, null);
      assert.equal(api.sendDatagramEventEx(client, { vscpClass: 10, vscpType: 8 }), 0);
      const [matchedStatus, matchedEvent] = api.receiveDatagramEventEx(client, 3000);
      assert.equal(matchedStatus, 0);
      assert.equal(matchedEvent.vscpType, 8);
    } finally {
      if (senderStarted) {
        sender.close();
      }
      assert.equal(api.closeDatagramClient(client), 0);
    }
  });

  for (const algorithm of [1, 2, 3]) {
    it(`exchanges authenticated AES-${64 * (algorithm + 1)} UDP`, async function () {
      const port = await freePort();
      const client = api.newUdpClient();
      assert.ok(client);
      try {
        const key = AES_KEY.subarray(0, 8 * (algorithm + 1));
        assert.equal(api.configureDatagramClient(client, {
          ip: `udp://127.0.0.1:${port}`, encryption: algorithm,
          key: key.toString('hex'), 'hmac-key': HMAC_KEY.toString('hex')
        }), 0);
        assert.equal(api.connectDatagramClient(client), 0);
        assert.equal(api.sendDatagramEventEx(client, { vscpClass: 10, vscpType: algorithm }), 0);
        const [status, event] = api.receiveDatagramEventEx(client, 3000);
        assert.equal(status, 0);
        assert.equal(event.vscpType, algorithm);
      } finally {
        assert.equal(api.closeDatagramClient(client), 0);
      }

    });

    it(`receives authenticated AES-${64 * (algorithm + 1)} multicast on loopback`, async function () {
      if (process.platform !== 'linux') {
        this.skip();
      }
      const port = await freePort();
      const group = '239.255.42.99';
      const client = api.newMulticastClient();
      assert.ok(client);
      const sender = dgram.createSocket('udp4');
      let senderStarted = false;
      try {
        await new Promise((resolve, reject) => {
          sender.once('error', reject);
          sender.bind(0, '127.0.0.1', resolve);
        });
        senderStarted = true;
        const key = AES_KEY.subarray(0, 8 * (algorithm + 1));
        assert.notEqual(api.configureDatagramClient(client, {
          encryption: algorithm, 'hmac-key': HMAC_KEY.toString('hex')
        }), 0);
        assert.equal(api.configureDatagramClient(client, {
          ip: `udp://${group}:${port}`, interface: 'lo', ttl: 1, encryption: algorithm,
          key: key.toString('hex'), 'hmac-key': HMAC_KEY.toString('hex')
        }), 0);
        assert.equal(api.connectDatagramClient(client), 0);
        sender.setMulticastInterface('127.0.0.1');
        sender.setMulticastLoopback(true);
        const wire = datagram(api, 7, key, algorithm);
        const bad = Buffer.from(wire);
        bad[bad.length - 1] ^= 1;
        await send(sender, bad, port, group);
        assert.notEqual(api.receiveDatagramEventEx(client, 200)[0], 0);
        await send(sender, wire, port, group);
        const [status, event] = api.receiveDatagramEventEx(client, 3000);
        assert.equal(status, 0);
        assert.equal(event.vscpType, 7);
        assert.equal(api.sendDatagramEventEx(client, { vscpClass: 10, vscpType: 6 }), 0);
      } finally {
        if (senderStarted) {
          sender.close();
        }
        assert.equal(api.closeDatagramClient(client), 0);
      }
    });
  }

  it('preserves event data limits and nanosecond timestamps', async function () {
    const port = await freePort();
    const client = api.newUdpClient();
    assert.ok(client);
    try {
      assert.equal(api.configureDatagramClient(client, {
        ip: `udp://127.0.0.1:${port}`, encryption: 3,
        key: AES_KEY.toString('hex'), 'hmac-key': HMAC_KEY.toString('hex')
      }), 0);
      assert.equal(api.connectDatagramClient(client), 0);
      const guid = Buffer.from(Array.from({ length: 16 }, (_, index) => index));
      const data = Buffer.from(Array.from({ length: 512 }, (_, index) => index % 256));
      const timestampNs = 1700000000123456789n;
      assert.equal(api.sendDatagramEventEx(client, {
        vscpClass: 10, vscpType: 8, guid, data, timestampNs
      }), 0);
      const [status, event] = api.receiveDatagramEventEx(client, 3000);
      assert.equal(status, 0);
      assert.equal(event.timestampNs, timestampNs);
      assert.deepEqual(event.guid, guid);
      assert.deepEqual(event.data, data);
      assert.throws(() => api.sendDatagramEventEx(client, { data: Buffer.alloc(513) }), RangeError);
      assert.throws(() => api.sendDatagramEventEx(client, {
        head: 0, timestampNs
      }), TypeError);
      assert.throws(() => api.sendDatagramEventEx(client, {
        timestampNs, day: 1
      }), TypeError);
    } finally {
      assert.equal(api.closeDatagramClient(client), 0);
    }
  });
});
