# Unreleased

* Added synchronous Node.js helper-library bindings using Koffi, while
  retaining the existing native addon `hello()` export.
* Added session and event-ex operations, binary negotiation and frame I/O,
  standalone AES/HMAC frame helpers, and authenticated UDP/multicast clients.
  Convenience receives copy native output and return `[status, value]`.
* Added generated metadata for all 177 C header declarations, native
  structure definitions, and lazy `api.raw` bindings. The current native build
  exports 159 of those names; a missing function raises a lookup error rather
  than being emulated.
* Added an authenticated UDP example and integration tests for AES-128/192/256,
  TCP, UDP, multicast, tampering, invalid inputs, and event timestamps. The
  Python wrapper's optional cross-language test checks datagrams in both
  directions.
* Excluded local build outputs, the third-party source checkout, and environment
  files from the npm package. Install the native helper library separately.

These changes require the matching native helper library and have not yet
been published as a Node.js package. Native calls are synchronous. Frame
security is opt-in, does not protect text login, and provides neither key
exchange nor replay protection.
