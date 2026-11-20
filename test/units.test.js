'use strict';

// Measurement unit conversion (needs libvscphelper 16.0.0.292 or later).
// Set VSCPHELPER_LIB to the helper library; VSCP_UNITS_JSON can point to
// vscp-units.json (default: the vscp checkout next to this one).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helper = require('..');

const TEMPERATURE = 6;
const PRESSURE = 12;
const POSITION = 31;
const NOT_SUPPORTED = 17;
const UNKNOWN_ITEM = 44;
const INVALID_SYNTAX = 58;
const UNITS_JSON = process.env.VSCP_UNITS_JSON ||
  path.join(__dirname, '..', '..', 'vscp', 'src', 'vscp', 'common', 'vscp-units.json');

function near(a, b, rel = 1e-12) {
  return Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
}

describe('measurement unit conversion', function () {
  let api;

  before(function () {
    if (!process.env.VSCPHELPER_LIB) {
      this.skip();
    }
    api = helper.loadHelper();
  });

  it('converts with the unit table', function () {
    let [status, value] = api.convertMeasurementUnit(TEMPERATURE, 2, 1, 212);
    assert.equal(status, 0);
    assert.ok(near(value, 100));
    [status, value] = api.convertMeasurementUnit(PRESSURE, 3, 1, 1);
    assert.equal(status, 0);
    assert.ok(near(value, 1.01325));
    assert.deepEqual(api.convertMeasurementUnit(POSITION, 0, 1, 1), [NOT_SUPPORTED, null]);
    assert.deepEqual(api.convertMeasurementUnit(TEMPERATURE, 0, 9, 1), [UNKNOWN_ITEM, null]);
    assert.throws(() => api.convertMeasurementUnit(TEMPERATURE, 0, 256, 1), RangeError);
  });

  it('describes units', function () {
    assert.deepEqual(api.getMeasurementUnitInfo(TEMPERATURE, 1),
      [0, { name: 'Celsius', symbolAscii: 'C', symbolUtf8: '°C', convertible: true }]);
    const [status, info] = api.getMeasurementUnitInfo(POSITION, 1);
    assert.equal(status, 0);
    assert.equal(info.convertible, false);
  });

  it('converts a measurement event', function () {
    // CLASS2.MEASUREMENT_FLOAT: index, zone, subzone, unit (bar), double MSB first
    const data = Buffer.alloc(12);
    data[3] = 1;
    data.writeDoubleBE(2.5, 4);
    const [status, value] = api.convertMeasurementEx({ vscpClass: 1060, vscpType: PRESSURE, data }, 0);
    assert.equal(status, 0);
    assert.ok(near(value, 250000));
  });

  it('evaluates and loads expressions', function () {
    const [status, value] = api.evalUnitExpression('({{{val}}} + 459.67) * 5/9', 32);
    assert.equal(status, 0);
    assert.ok(near(value, 273.15));
    assert.deepEqual(api.evalUnitExpression('2^3', 0), [INVALID_SYNTAX, null]);
    assert.equal(api.loadUnitExpressionsFromString({
      units: [{ type: 500, unit: 0 },
        { type: 500, unit: 1, conversion0: '{{{val}}}*2', conversion: '{{{val}}}/2' }]
    }), 0);
    assert.deepEqual(api.convertMeasurementUnitExpr(500, 1, 0, 4), [0, 8]);
  });

  it('gives the same results with expressions as with the table', function () {
    if (!fs.existsSync(UNITS_JSON)) {
      this.skip();
    }
    assert.equal(api.loadUnitExpressions(UNITS_JSON), 0);
    for (const type of [TEMPERATURE, PRESSURE, 13, 30, 32, POSITION]) {
      for (let a = 0; a < 8; a++) {
        for (let b = 0; b < 8; b++) {
          const [st, vt] = api.convertMeasurementUnit(type, a, b, 21.5);
          const [se, ve] = api.convertMeasurementUnitExpr(type, a, b, 21.5);
          assert.equal(st, se, `type ${type} ${a}->${b}`);
          if (st === 0) {
            assert.ok(near(vt, ve), `type ${type} ${a}->${b}`);
          }
        }
      }
    }
  });
});
