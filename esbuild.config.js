/* eslint @typescript-eslint/no-var-requires: "off" */

const esbuild = require('esbuild');
const fs = require('fs');

// Build client
esbuild.build({
  entryPoints: [
    './client/src/extension.ts'
  ],
  bundle: true,
  outfile: './out/client.js',
  platform: 'node',
  external: [
    'vscode'
  ],
  format: 'cjs',
  tsconfig: './client/tsconfig.json',
}).catch(() => process.exit(1));

// Build server
esbuild.build({
  entryPoints: [
    './server/src/server.ts'
  ],
  bundle: true,
  outfile: './out/server.js',
  platform: 'node',
  external: [
    'vscode',
  ],
  format: 'cjs',
  tsconfig: './server/tsconfig.json',
}).catch(() => process.exit(1));

// Build debugger
esbuild.build({
  entryPoints: [
    './debugger/src/debugger.ts'
  ],
  bundle: true,
  outfile: './out/debugger.js',
  platform: 'node',
  external: [
    'vscode',
  ],
  format: 'cjs',
  tsconfig: './debugger/tsconfig.json',
}).catch(() => process.exit(1));

// Copy tree-sitter.wasm and tree-sitter-metamodelica.wasm and
// tree-sitter-gdbmi.wasm to the output directory
if (!fs.existsSync('out')) {
  fs.mkdirSync('out');
}
fs.copyFileSync('./server/src/tree-sitter-metamodelica.wasm', './out/tree-sitter-metamodelica.wasm');
fs.copyFileSync('./debugger/src/parser/tree-sitter-gdbmi.wasm', './out/tree-sitter-gdbmi.wasm');
fs.copyFileSync('./server/node_modules/web-tree-sitter/tree-sitter.wasm', './out/tree-sitter.wasm');
