const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const bundles = [
  ['worker.js', 'worker-bundle.js'],
  ['cad-worker-v3.js', 'cad-worker-v3-bundle.js'],
  ['app-v3.js', 'app-v3-bundle.js']
];
for (const [input, output] of bundles) {
  esbuild.buildSync({
    entryPoints: [path.join(root, 'source', input)],
    outfile: path.join(root, 'source', output),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    external: ['node:*', 'fs', 'path', 'crypto', 'stream', 'module'],
    logLevel: 'silent',
    legalComments: 'inline'
  });
  console.log(`Bundled ${input}`);
}
