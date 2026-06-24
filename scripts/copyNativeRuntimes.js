const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targetRoot = path.join(root, 'dist', 'runtime', 'node_modules');

const copies = [
  ['sqlite3/package.json', 'sqlite3/package.json'],
  ['sqlite3/LICENSE', 'sqlite3/LICENSE'],
  ['sqlite3/lib', 'sqlite3/lib'],
  ['sqlite3/build/Release/node_sqlite3.node', 'sqlite3/build/Release/node_sqlite3.node'],
  ['bindings/package.json', 'bindings/package.json'],
  ['bindings/bindings.js', 'bindings/bindings.js'],
  ['bindings/LICENSE.md', 'bindings/LICENSE.md'],
  ['file-uri-to-path/package.json', 'file-uri-to-path/package.json'],
  ['file-uri-to-path/index.js', 'file-uri-to-path/index.js'],
  ['file-uri-to-path/LICENSE', 'file-uri-to-path/LICENSE'],
  ['oracledb/package.json', 'oracledb/package.json'],
  ['oracledb/index.js', 'oracledb/index.js'],
  ['oracledb/lib', 'oracledb/lib'],
  ['oracledb/plugins', 'oracledb/plugins'],
  ['oracledb/build/Release', 'oracledb/build/Release'],
  ['oracledb/LICENSE.txt', 'oracledb/LICENSE.txt'],
  ['oracledb/NOTICE.txt', 'oracledb/NOTICE.txt'],
  ['oracledb/THIRD_PARTY_LICENSES.txt', 'oracledb/THIRD_PARTY_LICENSES.txt']
];

fs.rmSync(targetRoot, { recursive: true, force: true });

for (const [source, destination] of copies) {
  const from = path.join(root, 'node_modules', source);
  if (!fs.existsSync(from)) {
    throw new Error(`Missing native runtime file: ${from}`);
  }
  const to = path.join(targetRoot, destination);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}
