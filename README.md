# node-vscp-helper

![VSCP Logo](https://vscp.org/images/logo_100.png)

Node.js bindings for the [VSCP helper library](https://github.com/grodansparadis/vscp-helper-lib).
The development version exposes session, event, binary-frame, AES/HMAC,
UDP/multicast, and low-level C APIs. The original `hello()` addon function
is retained.

## Installation

Install the native VSCP helper shared library separately. The shared library
and Node.js must use the same OS and CPU architecture. Then install a version
of this package containing the changes:

```sh
npm install node-vscp-helper
```

These binding changes are not yet published; install from a source checkout
until a corresponding release is available. If the native library is not on
the system search path, set `VSCPHELPER_LIB` to its absolute path before
starting Node.js, or pass that path to `loadHelper(path)`.

```javascript
const { loadHelper } = require('node-vscp-helper');
const api = loadHelper();
console.log(api.raw.vscphlp_getVersionString());
console.log(api.raw.vscphlp_readStringValue('0x22')); // 34
```

The wrapper targets Node.js, not browsers. Native operations are synchronous:
connection and receive calls can block the event loop, so use a worker thread
when responsiveness is required.

## Authenticated TCP binary mode

AES/HMAC is opt-in. Configure it before binary negotiation, either on a
disconnected session or after opening the connection in text mode:

```javascript
const { loadHelper, ENCRYPTION } = require('node-vscp-helper');
const api = loadHelper();
function check(status) {
  if (status !== 0) throw new Error(`VSCP error ${status}`);
}
function readKey(name) {
  const hex = process.env[name];
  if (!/^[0-9a-f]{64}$/i.test(hex || '')) throw new Error(`Invalid ${name}`);
  return Buffer.from(hex, 'hex');
}
const aesKey = readKey('VSCP_DATAGRAM_AES_KEY');
const hmacKey = readKey('VSCP_DATAGRAM_HMAC_KEY');
const session = api.newSession();
if (session <= 0) throw new Error('Could not create session');
let connected = false;
try {
  check(api.setBinarySecurity(session, ENCRYPTION.AES256, aesKey, hmacKey));
  check(api.open(session, process.env.VSCP_ENDPOINT, process.env.VSCP_USER, process.env.VSCP_PASSWORD));
  connected = true;
  check(api.doCmdBinary(session));
  check(api.sendEventEx(session, { vscpClass: 10, vscpType: 6, data: Buffer.from([42]) }));
} finally {
  if (connected) {
    const status = api.close(session);
    if (status !== 0) console.error(`Close failed: ${status}`);
  }
  api.closeSession(session);
}
```

Use independent keys shared securely with a compatible peer. AES-128, -192,
and -256 require 16, 24, and 32-byte AES keys respectively; the HMAC key is
always 32 bytes. `ENCRYPTION.NONE` disables frame security before negotiation
or after disconnecting. `getBinarySecurity(session)` and `isBinaryMode(session)`
return `[status, value]`.

`sendBinaryFrame(session, frame)` takes a plaintext inner frame including its
CRC; `receiveBinaryFrame(session, timeoutMs)` returns `[status, Buffer | null]`.
The method copies and frees the native receive buffer. Event and raw-frame
APIs handle encryption automatically; do not pre-encrypt their inputs. Raw frame
and event receives consume the same stream and require a dispatch strategy.

## Authenticated UDP and multicast

The configuration is a JavaScript object or JSON string, with keys represented
as hexadecimal strings. This example expects independently provisioned
AES-256 and HMAC keys:

```javascript
const aesHex = process.env.VSCP_DATAGRAM_AES_KEY;
const hmacHex = process.env.VSCP_DATAGRAM_HMAC_KEY;
if (!/^[0-9a-f]{64}$/i.test(aesHex || '') || !/^[0-9a-f]{64}$/i.test(hmacHex || '')) {
  throw new Error('Provide independent AES-256 and HMAC keys as 64 hex digits');
}
const client = api.newUdpClient();
if (!client) throw new Error('Could not create UDP client');
try {
  check(api.configureDatagramClient(client, {
    ip: 'udp://127.0.0.1:9598',
    encryption: ENCRYPTION.AES256,
    key: aesHex,
    'hmac-key': hmacHex
  }));
  check(api.connectDatagramClient(client));
  check(api.sendDatagramEventEx(client, { vscpClass: 10, vscpType: 6, data: Buffer.from([42]) }));
  const [status, event] = api.receiveDatagramEventEx(client, 3000);
  check(status);
  console.log(event.vscpClass, event.vscpType, event.data);
} finally {
  const status = api.closeDatagramClient(client);
  if (status !== 0) console.error(`Close failed: ${status}`);
}
```

This block uses `api`, `check`, and `ENCRYPTION` from the TCP example above.
The [complete UDP loopback example](examples/authenticated-udp.js) can be run
from the checkout:

```sh
export VSCP_DATAGRAM_AES_KEY="$(openssl rand -hex 32)"
export VSCP_DATAGRAM_HMAC_KEY="$(openssl rand -hex 32)"
node examples/authenticated-udp.js
```

For multicast, use `newMulticastClient()` and set an `ip` multicast group,
`ttl`, and an appropriate `interface`, for example `lo` on Linux. A separate
peer is normally needed to receive multicast sent by the client. A nonempty
`hmac-key` enables authenticated send and receive; without it, legacy
datagrams remain unauthenticated. Disconnect and drain or clear the queue
before changing security settings. A receive timeout or rejected datagram
does not return an event.

## Standalone frames

For a valid plaintext inner frame `plain` containing a CRC, and independent
binary `aesKey` and `hmacKey` values:

```javascript
const [encryptStatus, encrypted] = api.encryptFrameV1(
  plain, aesKey, hmacKey, ENCRYPTION.AES256);
check(encryptStatus);
const [decryptStatus, decrypted] = api.decryptFrameV1(encrypted, aesKey, hmacKey);
check(decryptStatus);
```

Outputs are Node-owned buffers, or `null` on failure. Encryption generates a
fresh random IV unless a 16-byte IV is explicitly supplied for testing. These
helpers operate on the inner frame, without the version/length prefix; the
caller must validate the prefix and expected algorithm when transporting it.
Decryption retains the encryption nibble.

## Measurement unit conversion

All measurement classes use the types and units of CLASS1.MEASUREMENT. The
unit table is built into the helper library (16.0.0.292 or later); the
conversion expressions of `vscp-units.json` can be loaded at runtime instead.
Units that can not be converted (latitude/longitude, ppm, ...) give status 17
(`VSCP_ERROR_NOT_SUPPORTED`).

```js
const api = require('node-vscp-helper').loadHelper();

// 25 degrees Celsius (unit 1) to Fahrenheit (unit 2), temperature (type 6)
const [status, fahrenheit] = api.convertMeasurementUnit(6, 1, 2, 25);   // [0, 77]
const [, info] = api.getMeasurementUnitInfo(6, 1);
// { name: 'Celsius', symbolAscii: 'C', symbolUtf8: '°C', convertible: true }

// Value and unit from a measurement event
const [, kelvin] = api.convertMeasurementEx(event, 0);

// The same with expressions loaded at runtime
api.loadUnitExpressions('vscp-units.json');
const [, f] = api.convertMeasurementUnitExpr(6, 1, 2, 25);
```

## API and ownership

Convenience operations include:

* `newSession`, `closeSession`, `open`, `close`, `doCmdBinary`, `isBinaryMode`,
  `setBinarySecurity`, `getBinarySecurity`, `sendBinaryFrame`, and
  `receiveBinaryFrame`.
* `sendEventEx`, `receiveEventEx`, and `blockingReceiveEventEx`.
* `convertMeasurementUnit`, `getMeasurementUnitInfo`, `convertMeasurementEx`,
  `loadUnitExpressions`, `loadUnitExpressionsFromString`,
  `convertMeasurementUnitExpr`, and `evalUnitExpression`.
* `newUdpClient`, `newMulticastClient`, `configureDatagramClient`,
  `connectDatagramClient`, `disconnectDatagramClient`, `closeDatagramClient`,
  `isDatagramClientConnected`, `sendDatagramEventEx`,
  `receiveDatagramEventEx`, `setDatagramClientFilter`,
  `getDatagramClientCount`, and `clearDatagramClientQueue`.
* `encryptFrameV1` and `decryptFrameV1`.

Status-returning methods use `0` for success and nonzero VSCP error codes for
failure. Methods with outputs return `[status, value]`, with `null` on failure.
Invalid JavaScript argument types, timeouts, or oversized event data throw
exceptions. A configuration object explicitly containing an undefined key,
HMAC key, or encryption setting is rejected rather than silently omitting it.

Event-ex objects use `vscpClass`, `vscpType`, `head`, `obid`, `guid`, `data`,
and the calendar fields `year`, `month`, `day`, `hour`, `minute`, `second`,
and `timestamp`. Data is a `Buffer`/`Uint8Array` of at most 512 bytes and GUID
is exactly 16 bytes. `timestampNs` accepts an unsigned `BigInt` or safe integer;
it selects frame version 1 when no `head` is supplied and cannot be combined
with calendar time fields. Received nanosecond values can be `BigInt`.

`api.raw` lazily exposes declarations from `vscphelperlib.h`; `api.bind(...)`
accepts an explicit [Koffi](https://koffi.dev/) function declaration.
`api.types` supplies native event, filter, statistics, status, and CANAL
structure definitions. Raw calls are low-level: all pointer arguments except
`const char *` use `void *`, and callers must provide correctly sized buffers,
native layouts, and the required deallocation. A declared function can be
called only when the installed library exports it. The current native build
exports 159 of 177 declared names; the other 18, including the legacy
`vscphlp_encryptVscpUdpFrame` and `vscphlp_decryptVscpUdpFrame` declarations,
raise a missing-symbol error. TLS setters are available through `api.raw`
when exported; the C++ `VscpRemoteTcpIf` class is not directly wrapped.

## Security limits

Frame security uses AES-CBC with PKCS#7 padding and encrypt-then-MAC
HMAC-SHA-256, truncated to 16 bytes and verified before decryption. It does
not protect text-mode login or commands, authenticate a server's identity,
exchange keys, or prevent replay. Use TLS to protect login and verify the
server, and add application-level replay protection. Never reuse the AES key
as the HMAC key, log configuration containing keys, or commit secrets.
Environment variables used in examples may be visible to other processes.

## Testing

`npm test` rebuilds the addon and runs the Mocha suite. Without
`VSCPHELPER_LIB`, the native integration tests are reported as pending.
To run them against the matching current helper build and verify signature
metadata against its header:

```sh
VSCPHELPER_LIB=/absolute/path/to/the/shared-library \
VSCPHELPER_HEADER=/absolute/path/to/vscphelperlib.h \
VSCPHELPER_VSCP_INCLUDE=/absolute/path/to/vscp/common npm test
```

The tests use loopback sockets. Multicast tests use the Linux `lo` interface
and are skipped elsewhere. `VSCPHELPER_VSCP_INCLUDE` additionally enables
C-compiler checks of the native structure sizes and offsets (not run on
Windows). See [release notes](RELEASE_NOTES.md).
