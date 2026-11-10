const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'miniprogram-native', 'lib', 'mesh.js');
fs.mkdirSync(path.dirname(output), { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(root, 'source', 'native-mesh.mjs')],
  outfile: output,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: ['es2019'],
  minify: true,
  legalComments: 'inline'
});
const size = fs.statSync(output).size;
if (size > 1800000) throw new Error(`Native mesh bundle is unexpectedly large: ${size} bytes`);
console.log(`Built native local mesh bundle: ${size} bytes`);

async function buildCadAndPackages() {
const cadOutput = path.join(root, 'miniprogram-native', 'lib', 'cad.js');
const gluePath = path.join(root, 'node_modules', 'occt.ts', 'dist', 'wasm', 'occtjs.js');
let patchedGlue = false;
await esbuild.build({
  entryPoints: [path.join(root, 'source', 'native-cad.mjs')],
  outfile: cadOutput,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: ['es2019'],
  minify: true,
  define: { process: 'undefined' },
  external: ['node:*', 'fs', 'path', 'crypto', 'stream', 'module'],
  logLevel: 'silent',
  legalComments: 'inline',
  plugins: [{
    name: 'wechat-safe-embind',
    setup(build) {
      build.onLoad({ filter: /occtjs\.js$/ }, (args) => {
        if (path.resolve(args.path) !== gluePath) return;
        const source = fs.readFileSync(args.path, 'utf8');
        const begin = source.indexOf('function newFunc(constructor,argumentList)');
        const end = source.indexOf('var heap32VectorToArray=', begin);
        if (begin < 0 || end < 0 || !source.slice(begin, end).includes('newFunc(Function,args)(...closureArgs)')) {
          throw new Error('Unsupported occt.ts glue: cannot safely replace its dynamic Embind invoker');
        }
        const replacement = fs.readFileSync(path.join(root, 'source', 'wechat-embind-invoker.js'), 'utf8');
        patchedGlue = true;
        return { contents: source.slice(0, begin) + replacement + source.slice(end), loader: 'js', resolveDir: path.dirname(args.path) };
      });
    }
  }]
});
if (!patchedGlue) throw new Error('The occt.ts Embind glue was not patched');
const cadSize = fs.statSync(cadOutput).size;
if (cadSize + size > 1800000) throw new Error(`Native JavaScript bundles are unexpectedly large: ${cadSize + size} bytes`);
console.log(`Built experimental CAD adapter: ${cadSize} bytes`);

for (const name of ['cad-core', ...Array.from({ length: 7 }, (_, index) => `cad-${index + 1}`)]) {
  const from = path.join(root, 'experiments', 'native-cad-split', 'packages', name, 'kernel.wasm.br');
  const to = path.join(root, 'miniprogram-native', 'packages', name);
  if (!fs.existsSync(from)) throw new Error(`Missing split kernel ${name}; see experiments/native-cad-split/README.md`);
  fs.mkdirSync(path.join(to, 'placeholder'), { recursive: true });
  fs.copyFileSync(from, path.join(to, 'kernel.wasm.br'));
  fs.writeFileSync(path.join(to, 'entry.js'), 'module.exports = true;\n');
  fs.writeFileSync(path.join(to, 'placeholder', 'index.js'), 'Page({});\n');
  fs.writeFileSync(path.join(to, 'placeholder', 'index.json'), '{}\n');
  fs.writeFileSync(path.join(to, 'placeholder', 'index.wxml'), '<view>转换组件</view>\n');
  fs.writeFileSync(path.join(to, 'placeholder', 'index.wxss'), '');
}
}

buildCadAndPackages().catch((error) => { console.error(error.message); process.exitCode = 1; });
