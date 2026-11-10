const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'source');
const modules = path.join(root, 'node_modules');
const target = path.join(root, 'dist', 'web', 'index.html');
const read = (base, name) => fs.readFileSync(path.join(base, name), 'utf8');
const safeScript = (text) => text.replace(/<\/script/gi, '<\\/script');
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const licenses = [
  'occt.ts 2.0.0 — LGPL-2.1: https://github.com/LAU-MARS/opencascade-ts',
  read(modules, 'occt.ts/LICENSE'),
  'occt-import-js 0.0.23 — LGPL-2.1: https://github.com/kovacsv/occt-import-js',
  read(modules, 'occt-import-js/dist/license.occt-import-js.txt'),
  'Open CASCADE Technology: https://github.com/Open-Cascade-SAS/OCCT',
  read(modules, 'occt-import-js/dist/license.occt.txt'),
  'Three.js 0.180.0 — MIT: https://github.com/mrdoob/three.js',
  read(modules, 'three/LICENSE'),
  'JSZip 3.10.1 — MIT or GPL-3.0-or-later: https://github.com/Stuk/jszip',
  read(modules, 'jszip/LICENSE.markdown')
].join('\n\n');

let html = read(source, 'template-v3.html');
const replacements = {
  '__LICENSE_TEXT__': escapeHtml(licenses),
  '__WORKER_BUNDLE__': safeScript(read(source, 'worker-bundle.js')),
  '__WASM_BASE64__': fs.readFileSync(path.join(modules, 'occt-import-js/dist/occt-import-js.wasm')).toString('base64'),
  '__CAD_WORKER__': safeScript(read(source, 'cad-worker-v3-bundle.js')),
  '__CAD_GZIP__': zlib.gzipSync(fs.readFileSync(path.join(modules, 'occt.ts/dist/wasm/occtjs.wasm')), { level: 9 }).toString('base64'),
  '__APP_BUNDLE__': safeScript(read(source, 'app-v3-bundle.js'))
};
for (const [placeholder, value] of Object.entries(replacements)) {
  if (html.split(placeholder).length !== 2) throw new Error(`Expected exactly one ${placeholder}`);
  html = html.replace(placeholder, () => value);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, html);
console.log(`Built free browser converter: ${target} (${Buffer.byteLength(html)} bytes)`);
