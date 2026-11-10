const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'experiments/native-cad-split/packages');
const tool = process.env.WASM_SPLIT;
if (!tool || !fs.existsSync(tool)) throw new Error('Set WASM_SPLIT to the Binaryen 132 wasm-split executable.');
const versions = spawnSync(tool, ['--version'], { encoding: 'utf8' });
if (versions.status !== 0 || !/\b132\b/.test(versions.stdout)) throw new Error('Binaryen version 132 is required.');
const inputs = {
  mesh: ['node_modules/occt-import-js/dist/occt-import-js.wasm', '33391fc9d94ea5c869a6718488bf0a9a464222bac9bdc764dfe1690cef281952'],
  cad: ['node_modules/occt.ts/dist/wasm/occtjs.wasm', '407caf5b458eac0d7bb9b947d4a0ade6056bf43b8474062c5fbff94a4404a8a5']
};
for (const [file, hash] of Object.values(inputs)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  if (actual !== hash) throw new Error(`Unexpected upstream binary: ${file}`);
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-wasm-split-'));
function run(args) {
  const log = path.join(work, `split-${Date.now()}.log`);
  const fd = fs.openSync(log, 'w');
  const result = spawnSync(tool, args, { stdio: ['ignore', 'ignore', fd] });
  fs.closeSync(fd);
  if (result.error || result.status !== 0) {
    throw new Error(`wasm-split failed: ${result.error ? result.error.message : fs.readFileSync(log, 'utf8').slice(0, 1000)}`);
  }
}
const flags = ['--enable-exception-handling', '--enable-mutable-globals', '--enable-bulk-memory', '--no-placeholders'];
const meshList = path.join(work, 'mesh-functions.txt');
fs.writeFileSync(meshList, Array.from({ length: 20422 - 10211 }, (_, i) => String(i + 10211)).join('\n'));
run([path.join(root, inputs.mesh[0]), '--split-funcs', `@${meshList}`, ...flags,
  '--primary-output', path.join(work, 'mesh-primary.wasm'), '--secondary-output', path.join(work, 'mesh-secondary.wasm')]);
const groups = [];
let number = 1;
for (let start = 6000; start <= 37748; start += 5000) {
  const names = Array.from({ length: Math.min(5000, 37749 - start) }, (_, i) => String(start + i));
  groups.push([`part${number++}`, ...names].join('\n'));
}
const manifest = path.join(work, 'cad-manifest.txt');
fs.writeFileSync(manifest, groups.join('\n\n') + '\n');
run([path.join(root, inputs.cad[0]), '--multi-split', '--manifest', manifest, '--out-prefix', path.join(work, 'cad-'), ...flags,
  '-o', path.join(work, 'cad-primary.wasm')]);

const parts = [
  ['mesh-core', 'mesh-primary.wasm'], ['mesh-extra', 'mesh-secondary.wasm'], ['cad-core', 'cad-primary.wasm'],
  ...Array.from({ length: 7 }, (_, i) => [`cad-${i + 1}`, `cad-part${i + 1}.wasm`])
];
for (const [name, file] of parts) {
  const raw = fs.readFileSync(path.join(work, file));
  // Validate before distribution; actual WXWebAssembly compatibility remains unverified.
  new WebAssembly.Module(raw);
  const quality = name === 'mesh-core' ? 10 : 6;
  const compressed = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality } });
  if (compressed.length > 1900000) throw new Error(`${name} exceeds the experimental package budget.`);
  const folder = path.join(output, name);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'kernel.wasm.br'), compressed);
  console.log(`${name}: ${compressed.length} bytes`);
}
