const fs = require('fs');

fs.copyFileSync('../node_modules/tree-sitter-gdbmi/tree-sitter-gdbmi.wasm', '../src/debugger/parser/tree-sitter-gdbmi.wasm');
