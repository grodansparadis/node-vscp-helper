const assert = require('node:assert/strict');

describe('node-vscp-helper', function () {
  it('exports a hello function', function () {
    const helper = require('..');

    assert.equal(typeof helper.hello, 'function');
  });

  it('returns the expected greeting', function () {
    const helper = require('..');

    assert.equal(helper.hello(), 'Hello World');
  });
});