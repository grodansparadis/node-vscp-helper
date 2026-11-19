'use strict';

const fs = require('node:fs');
const path = require('node:path');

const header = process.argv[2];
if (!header || process.argv.length > 4 ||
    (process.argv[3] && process.argv[3] !== '--check')) {
  throw new Error('Usage: node tools/generate-signatures.js <vscphelperlib.h> [--check]');
}

const source = fs.readFileSync(header, 'utf8')
  .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  .replace(/^\s*#.*$/gm, '');

function ffiType(type, isResult) {
  const normalized = type.replace(/\s+/g, ' ').trim();
  if (normalized.includes('*')) {
    if (/^const\s+char\s*\*$/.test(normalized)) {
      return 'str';
    }
    return 'void *';
  }
  const scalar = normalized.replace(/^const\s+/, '');
  const allowed = new Set([
    'void', 'int', 'long', 'short', 'unsigned char', 'unsigned short',
    'unsigned long', 'unsigned long long', 'uint8_t', 'uint16_t',
    'uint32_t', 'size_t', 'float', 'double'
  ]);
  if (!allowed.has(scalar) || (scalar === 'void' && !isResult)) {
    throw new Error(`Unsupported native type: ${type}`);
  }
  return scalar;
}

const signatures = {};
const declarations = source.matchAll(/\bHELPERLIB_API\s+([^;]+);/g);
for (const declaration of declarations) {
  const match = declaration[1].trim().match(
    /^([\s\S]*?)\s*(vscphlp_[A-Za-z0-9_]+)\s*\(([\s\S]*)\)$/
  );
  if (!match) {
    throw new Error(`Cannot parse declaration: ${declaration[1].trim()}`);
  }
  const [, result, name, parameters] = match;
  const args = parameters.trim() === 'void' ? [] : parameters.split(',').map((param) => {
    const type = param.trim().replace(/\b[A-Za-z_][A-Za-z0-9_]*\s*$/, '').trim();
    return ffiType(type, false);
  });
  const signature = [ffiType(result, true), args];
  if (signatures[name] && JSON.stringify(signatures[name]) !== JSON.stringify(signature)) {
    throw new Error(`Conflicting declarations for ${name}`);
  }
  signatures[name] = signature;
}
if (!Object.keys(signatures).length) {
  throw new Error('No helper API declarations found');
}

const sorted = Object.fromEntries(Object.entries(signatures).sort(([a], [b]) => a.localeCompare(b)));
const output = `${JSON.stringify(sorted, null, 2)}\n`;
const destination = path.join(__dirname, '..', 'lib', 'signatures.json');
if (process.argv[3] === '--check') {
  if (fs.readFileSync(destination, 'utf8') !== output) {
    throw new Error('The saved Node.js signatures do not match the header');
  }
} else {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, output);
}
console.log(`${Object.keys(sorted).length} helper API signatures`);
