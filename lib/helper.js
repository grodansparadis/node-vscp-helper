'use strict';

const koffi = require('koffi');
const signatures = require('./signatures.json');
const types = require('./types');

const ENCRYPTION = Object.freeze({ NONE: 0, AES128: 1, AES192: 2, AES256: 3, FROM_TYPE_BYTE: 15 });

function bytes(value, name, optional = false) {
  if (value == null && optional) {
    return null;
  }
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${name} must be a Buffer or Uint8Array${optional ? ' or null' : ''}`);
  }
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function number(value, name) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError(`${name} must be a number`);
  }
  return value;
}

function unsigned(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 0 and ${maximum}`);
  }
  return value;
}

function uint64(value, name) {
  if (typeof value === 'bigint') {
    if (value >= 0n && value <= 0xffffffffffffffffn) {
      return value;
    }
  } else if (Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  throw new RangeError(`${name} must be an unsigned 64-bit bigint or a safe integer`);
}

function encodeEventEx(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('event must be an object');
  }
  const data = bytes(event.data === undefined ? Buffer.alloc(0) : event.data, 'event.data');
  if (data.length > 512 || (event.sizeData !== undefined && event.sizeData !== data.length)) {
    throw new RangeError('event data must be at most 512 bytes and match sizeData');
  }
  const guid = bytes(event.guid === undefined ? Buffer.alloc(16) : event.guid, 'event.guid');
  if (guid.length !== 16) {
    throw new RangeError('event.guid must contain 16 bytes');
  }
  let head = unsigned(event.head ?? 0, 'event.head', 0xffff);
  const calendarFields = ['day', 'hour', 'minute', 'second', 'timestamp'];
  let time;
  if (event.timestampNs !== undefined) {
    if (calendarFields.some((key) => event[key] !== undefined)) {
      throw new TypeError('event.timestampNs cannot be combined with calendar time fields');
    }
    if (event.head === undefined) {
      head |= 0x0100;
    } else if ((head & 0x0300) !== 0x0100) {
      throw new TypeError('event.timestampNs requires a version-1 event head');
    }
    time = { timestamp_ns: uint64(event.timestampNs, 'event.timestampNs') };
  } else {
    if ((head & 0x0300) === 0x0100 && calendarFields.some((key) => event[key] !== undefined)) {
      throw new TypeError('version-1 events use timestampNs rather than calendar time fields');
    }
    time = { datetime: {
      day: unsigned(event.day ?? 0, 'event.day', 255),
      hour: unsigned(event.hour ?? 0, 'event.hour', 255),
      minute: unsigned(event.minute ?? 0, 'event.minute', 255),
      second: unsigned(event.second ?? 0, 'event.second', 255),
      timestamp: unsigned(event.timestamp ?? 0, 'event.timestamp', 0xffffffff)
    } };
  }
  const payload = Buffer.alloc(512);
  data.copy(payload);
  const native = {
    head,
    obid: unsigned(event.obid ?? 0, 'event.obid', 0xffffffff),
    year: unsigned(event.year ?? 0, 'event.year', 0xffff),
    month: unsigned(event.month ?? 0, 'event.month', 255),
    time,
    crc: unsigned(event.crc ?? 0, 'event.crc', 0xffff),
    vscp_class: unsigned(event.vscpClass ?? 0, 'event.vscpClass', 0xffff),
    vscp_type: unsigned(event.vscpType ?? 0, 'event.vscpType', 0xffff),
    GUID: guid,
    sizeData: data.length,
    data: payload
  };
  const buffer = Buffer.alloc(koffi.sizeof(types.EventEx));
  koffi.encode(buffer, types.EventEx, native);
  return buffer;
}

function decodeEventEx(buffer) {
  const event = koffi.decode(buffer, types.EventEx);
  if (event.sizeData > 512) {
    throw new RangeError('native event data length exceeds 512 bytes');
  }
  const result = {
    head: event.head,
    obid: event.obid,
    year: event.year,
    month: event.month,
    crc: event.crc,
    vscpClass: event.vscp_class,
    vscpType: event.vscp_type,
    guid: Buffer.from(event.GUID),
    sizeData: event.sizeData,
    data: Buffer.from(event.data).subarray(0, event.sizeData)
  };
  if ((event.head & 0x0300) === 0x0100) {
    result.timestampNs = event.time.timestamp_ns;
  } else {
    Object.assign(result, event.time.datetime);
  }
  return result;
}

function sizeOutput() {
  return koffi.sizeof('size_t') === 8 ? new BigUint64Array(1) : new Uint32Array(1);
}

function loadNative(path) {
  if (path !== undefined) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new TypeError('library path must be a nonempty string');
    }
    return koffi.load(path);
  }
  if (process.env.VSCPHELPER_LIB) {
    return koffi.load(process.env.VSCPHELPER_LIB);
  }
  const names = process.platform === 'win32'
    ? ['libvscphelper16.dll', 'libvscphelper.dll', 'libvscphelper15.dll']
    : process.platform === 'darwin'
      ? ['libvscphelper16.so', 'libvscphelper16.dylib', 'libvscphelper.dylib',
        'libvscphelper15.so', 'libvscphelper15.dylib']
      : ['libvscphelper16.so', 'libvscphelper.so', 'libvscphelper.so.16',
        'libvscphelper15.so', 'libvscphelper.so.15'];
  const failures = [];
  for (const name of names) {
    try {
      return koffi.load(name);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }
  throw new Error(`Unable to load the VSCP helper library; set VSCPHELPER_LIB. ${failures.join('; ')}`);
}

function loadHelper(path) {
  const library = loadNative(path);
  const raw = {};
  for (const [name, [result, args]] of Object.entries(signatures)) {
    let bound;
    Object.defineProperty(raw, name, {
      enumerable: true,
      get() {
        if (!bound) {
          bound = library.func(name, result, args);
        }
        return bound;
      }
    });
  }
  Object.freeze(raw);

  function getInt(name, handle, array) {
    const status = raw[name](handle, array);
    return [status, status === 0 ? array[0] : null];
  }

  function receiveEvent(name, handle, timeout) {
    const event = Buffer.alloc(koffi.sizeof(types.EventEx));
    const status = timeout === undefined ? raw[name](handle, event) : raw[name](handle, event, timeout);
    return [status, status === 0 ? decodeEventEx(event) : null];
  }

  const maxLong = koffi.sizeof('long') === 4 ? 0x7fffffff : Number.MAX_SAFE_INTEGER;
  const maxULong = koffi.sizeof('unsigned long') === 4 ? 0xffffffff : Number.MAX_SAFE_INTEGER;
  return {
    raw,
    bind: (...args) => library.func(...args),
    types,
    newSession: () => raw.vscphlp_newSession(),
    closeSession: (handle) => raw.vscphlp_closeSession(handle),
    open: (handle, host, user, password) => raw.vscphlp_open(handle, host, user, password),
    close: (handle) => raw.vscphlp_close(handle),
    doCmdBinary: (handle) => raw.vscphlp_doCmdBinary(handle),
    isBinaryMode: (handle) => {
      const [status, value] = getInt('vscphlp_isBinaryMode', handle, new Int32Array(1));
      return [status, value === null ? null : Boolean(value)];
    },
    setBinarySecurity(handle, algorithm, key = null, hmacKey = null) {
      key = bytes(key, 'key', true);
      hmacKey = bytes(hmacKey, 'hmacKey', true);
      return raw.vscphlp_setBinarySecurity(handle, algorithm,
        key, key === null ? 0 : key.length, hmacKey, hmacKey === null ? 0 : hmacKey.length);
    },
    getBinarySecurity: (handle) => getInt('vscphlp_getBinarySecurity', handle, new Int32Array(1)),
    sendBinaryFrame(handle, frame) {
      frame = bytes(frame, 'frame');
      return raw.vscphlp_sendBinaryFrame(handle, frame, frame.length);
    },
    receiveBinaryFrame(handle, timeout) {
      unsigned(timeout, 'timeout', 0xffffffff);
      const holder = Buffer.alloc(koffi.sizeof('void *'));
      const length = sizeOutput();
      const status = raw.vscphlp_receiveBinaryFrame(handle, holder, length, timeout);
      if (status !== 0) {
        return [status, null];
      }
      const pointer = koffi.decode(holder, 'void *');
      if (pointer === null || pointer === 0n) {
        throw new Error('The library returned a null binary frame on success');
      }
      try {
        return [status, Buffer.from(koffi.decode(pointer, 'uint8_t', Number(length[0])))];
      } finally {
        raw.vscphlp_freeBinaryFrame(pointer);
      }
    },
    encryptFrameV1(frame, key, hmacKey, algorithm, iv = null) {
      frame = bytes(frame, 'frame');
      key = bytes(key, 'key');
      hmacKey = bytes(hmacKey, 'hmacKey');
      iv = bytes(iv, 'iv', true);
      const output = Buffer.alloc(frame.length + 48);
      const length = sizeOutput();
      const status = raw.vscphlp_encryptFrameV1(output, output.length, length,
        frame, frame.length, key, key.length, hmacKey, hmacKey.length,
        iv, iv === null ? 0 : iv.length, algorithm);
      return [status, status === 0 ? output.subarray(0, Number(length[0])) : null];
    },
    decryptFrameV1(frame, key, hmacKey) {
      frame = bytes(frame, 'frame');
      key = bytes(key, 'key');
      hmacKey = bytes(hmacKey, 'hmacKey');
      const output = Buffer.alloc(Math.max(frame.length, 1));
      const length = sizeOutput();
      const status = raw.vscphlp_decryptFrameV1(output, output.length, length,
        frame, frame.length, key, key.length, hmacKey, hmacKey.length);
      return [status, status === 0 ? output.subarray(0, Number(length[0])) : null];
    },
    // Measurement unit conversion. All measurement classes use the types and
    // units of CLASS1.MEASUREMENT. Needs libvscphelper 16.0.0.292 or later.
    convertMeasurementUnit(vscpType, fromUnit, toUnit, value) {
      const result = new Float64Array(1);
      const status = raw.vscphlp_convertMeasurementUnit(unsigned(vscpType, 'vscpType', 0xffff),
        unsigned(fromUnit, 'fromUnit', 0xff), unsigned(toUnit, 'toUnit', 0xff), number(value, 'value'), result);
      return [status, status === 0 ? result[0] : null];
    },
    getMeasurementUnitInfo(vscpType, unit) {
      const name = Buffer.alloc(256);
      const symbolAscii = Buffer.alloc(64);
      const symbolUtf8 = Buffer.alloc(64);
      const convertible = new Int32Array(1);
      const status = raw.vscphlp_getMeasurementUnitInfo(unsigned(vscpType, 'vscpType', 0xffff),
        unsigned(unit, 'unit', 0xff), name, name.length, symbolAscii, symbolAscii.length,
        symbolUtf8, symbolUtf8.length, convertible);
      if (status !== 0) {
        return [status, null];
      }
      const text = (buffer) => buffer.toString('utf8', 0, Math.max(0, buffer.indexOf(0)));
      return [status, {
        name: text(name),
        symbolAscii: text(symbolAscii),
        symbolUtf8: text(symbolUtf8),
        convertible: convertible[0] !== 0
      }];
    },
    convertMeasurementEx(event, toUnit) {
      const result = new Float64Array(1);
      const status = raw.vscphlp_convertMeasurementEx(encodeEventEx(event),
        unsigned(toUnit, 'toUnit', 0xff), result);
      return [status, status === 0 ? result[0] : null];
    },
    evalUnitExpression(expression, value) {
      if (typeof expression !== 'string') {
        throw new TypeError('expression must be a string');
      }
      const result = new Float64Array(1);
      const status = raw.vscphlp_evalUnitExpression(expression, number(value, 'value'), result);
      return [status, status === 0 ? result[0] : null];
    },
    loadUnitExpressions(path) {
      if (typeof path !== 'string' || path.length === 0) {
        throw new TypeError('path must be a nonempty string');
      }
      return raw.vscphlp_loadUnitExpressions(path);
    },
    loadUnitExpressionsFromString(json) {
      if (json !== null && typeof json === 'object') {
        json = JSON.stringify(json);
      }
      if (typeof json !== 'string') {
        throw new TypeError('json must be a string or an object');
      }
      return raw.vscphlp_loadUnitExpressionsFromString(json);
    },
    convertMeasurementUnitExpr(vscpType, fromUnit, toUnit, value) {
      const result = new Float64Array(1);
      const status = raw.vscphlp_convertMeasurementUnitExpr(unsigned(vscpType, 'vscpType', 0xffff),
        unsigned(fromUnit, 'fromUnit', 0xff), unsigned(toUnit, 'toUnit', 0xff), number(value, 'value'), result);
      return [status, status === 0 ? result[0] : null];
    },
    sendEventEx: (handle, event) => raw.vscphlp_sendEventEx(handle, encodeEventEx(event)),
    receiveEventEx: (handle) => receiveEvent('vscphlp_receiveEventEx', handle),
    blockingReceiveEventEx(handle, timeout) {
      return receiveEvent('vscphlp_blockingReceiveEventEx', handle, unsigned(timeout, 'timeout', maxULong));
    },
    newUdpClient: () => raw.vscphlp_newUdpClient(),
    newMulticastClient: () => raw.vscphlp_newMulticastClient(),
    configureDatagramClient(handle, config) {
      if (config && typeof config === 'object' && !Array.isArray(config)) {
        for (const field of ['key', 'hmac-key']) {
          if (Object.prototype.hasOwnProperty.call(config, field) && typeof config[field] !== 'string') {
            throw new TypeError(`config.${field} must be a hexadecimal string`);
          }
        }
        if (Object.prototype.hasOwnProperty.call(config, 'encryption') &&
            !Number.isInteger(config.encryption)) {
          throw new TypeError('config.encryption must be an integer');
        }
        config = JSON.stringify(config);
      }
      if (typeof config !== 'string') {
        throw new TypeError('config must be a JSON string or object');
      }
      return raw.vscphlp_configureDatagramClient(handle, config);
    },
    connectDatagramClient: (handle) => raw.vscphlp_connectDatagramClient(handle),
    disconnectDatagramClient: (handle) => raw.vscphlp_disconnectDatagramClient(handle),
    closeDatagramClient: (handle) => raw.vscphlp_closeDatagramClient(handle),
    isDatagramClientConnected(handle) {
      const [status, value] = getInt('vscphlp_isDatagramClientConnected', handle, new Int32Array(1));
      return [status, value === null ? null : Boolean(value)];
    },
    sendDatagramEventEx: (handle, event) => raw.vscphlp_sendDatagramEventEx(handle, encodeEventEx(event)),
    receiveDatagramEventEx(handle, timeout) {
      return receiveEvent('vscphlp_receiveDatagramEventEx', handle, unsigned(timeout, 'timeout', maxLong));
    },
    setDatagramClientFilter(handle, filter) {
      if (!filter || typeof filter !== 'object') {
        throw new TypeError('filter must be an object matching types.EventFilter');
      }
      const buffer = Buffer.alloc(koffi.sizeof(types.EventFilter));
      koffi.encode(buffer, types.EventFilter, filter);
      return raw.vscphlp_setDatagramClientFilter(handle, buffer);
    },
    getDatagramClientCount: (handle) => getInt('vscphlp_getDatagramClientCount', handle, new Uint16Array(1)),
    clearDatagramClientQueue: (handle) => raw.vscphlp_clearDatagramClientQueue(handle)
  };
}

module.exports = { loadHelper, ENCRYPTION, types };
