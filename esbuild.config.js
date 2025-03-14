const esbuild = require('esbuild');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const watchStr = watch ? ' watch ' : ' ';

async function main() {
  // Build client
  const client = await esbuild.context({
    entryPoints: ['./src/client/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: './out/client.js',
    external: ['vscode'],
    logLevel: 'warning',
    plugins: [
      /* add to the end of plugins array */
      esbuildClientProblemMatcherPlugin
    ]
  });
  if (watch) {
    await client.watch();
  } else {
    await client.rebuild();
    await client.dispose();
  }

  // Build server
  const server = await esbuild.context({
    entryPoints: ['./src/server/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: './out/server.js',
    external: ['vscode'],
    logLevel: 'warning',
    plugins: [
      /* add to the end of plugins array */
      esbuildServerProblemMatcherPlugin
    ]
  });
  if (watch) {
    await server.watch();
  } else {
    await server.rebuild();
    await server.dispose();
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildClientProblemMatcherPlugin = {
  name: 'esbuild-client-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log(`Client${watchStr}build started`);
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ Client${watchStr}build [ERROR] ${text}`);
        if (location === null) {return;}
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log(`Client${watchStr}build finished`);
    });
  }
};
const esbuildServerProblemMatcherPlugin = {
  name: 'esbuild-server-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log(`Server${watchStr}build started`);
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ Server${watchStr}build [ERROR] ${text}`);
        if (location === null) {return;}
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log(`Server${watchStr}build finished`);
    });
  }
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});

// Copy tree-sitter.wasm and tree-sitter-metamodelica.wasm and
// tree-sitter-gdbmi.wasm to the output directory
if (!fs.existsSync('out')) {
  fs.mkdirSync('out');
}
fs.copyFileSync('./src/server/tree-sitter-metamodelica.wasm', './out/tree-sitter-metamodelica.wasm');
fs.copyFileSync('./src/debugger/parser/tree-sitter-gdbmi.wasm', './out/tree-sitter-gdbmi.wasm');
fs.copyFileSync('./node_modules/web-tree-sitter/tree-sitter.wasm', './out/tree-sitter.wasm');
