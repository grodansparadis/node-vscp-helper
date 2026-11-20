# Changes in node-vscp-helper

Every change that goes into a release is listed here, newest release first.
Add each change under **Unreleased** when it is made. When a release is
tagged, rename **Unreleased** to the version and date, and start a new
**Unreleased** section above it.

## Unreleased

- Bindings for all 191 helper functions: vscp-helper-lib dd468b3 exports the functions that were declared under other names (`vscphlp_getMeasurementSensorIndex`, `vscphlp_convertLevel1MeasurementToLevel2*`, `vscphlp_shutDownServer`) and the 12 that were missing (UDP frame, encryption token, data-from-string and set-to-now functions); signatures regenerated
- Measurement unit conversion: `convertMeasurementUnit`, `getMeasurementUnitInfo`, `convertMeasurementEx` (unit table of the helper library) and `loadUnitExpressions`, `loadUnitExpressionsFromString`, `convertMeasurementUnitExpr`, `evalUnitExpression` (expressions loaded at runtime). Needs libvscphelper 16.0.0.292 or later; vscp-helper-lib submodule and signatures updated. Tests in test/units.test.js
- Added tests (929a68f)
- Security updates (69ec5bf)
- added packa-lock again (24b0353)
- Removed patreon from funding (81e2f4c)
- Bump picomatch (cbc6dde)
- Bump flatted from 3.3.1 to 3.4.2 (f9714d7)
- Bump minimatch (7934270)
- Bump tar, node-gyp and npm-check-updates (b3099fc)
- Security update (579047e)
- Bump js-yaml from 4.1.0 to 4.1.1 (175a820)

## v1.0.4 - 2024-07-30

- Fixed known vulnerabilities (2d6f91c)
- Bump braces from 3.0.2 to 3.0.3 (65f7a6b)
- Bump ip from 1.1.8 to 1.1.9 (d5b693f)
- Bump word-wrap from 1.2.3 to 1.2.4 (23acda6)
- Bump yaml from 2.2.1 to 2.2.2 (112b19f)
- Bump cacheable-request from 6.1.0 to 10.2.7 (0d31111)
- Bump http-cache-semantics from 4.1.0 to 4.1.1 (d66326b)
- Bump minimatch from 3.0.4 to 3.1.2 (b311125)
- Bump json5 from 2.2.1 to 2.2.3 (a9a9371)
