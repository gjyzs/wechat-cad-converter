const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram-native');
const cadBundle = path.join(miniRoot, 'lib/cad.js');

test('experimental native CAD bundle reads and exports without browser or network APIs', { timeout: 30000 }, async () => {
  assert.ok(fs.existsSync(cadBundle), 'experimental native CAD bundle has not been built');
  const loaded = [];
  const context = vm.createContext({
    module: { exports: {} }, console, setTimeout, clearTimeout, WebAssembly: undefined,
    wx: { loadSubpackage: ({ name, success }) => { loaded.push(name); success({}); } },
    WXWebAssembly: { instantiate: async (file, imports) => {
      const bytes = zlib.brotliDecompressSync(fs.readFileSync(path.join(miniRoot, file.replace(/^\//, ''))));
      return WebAssembly.instantiate(bytes, imports);
    } },
    fetch: () => { throw new Error('unexpected network'); },
    XMLHttpRequest: class { constructor() { throw new Error('unexpected network'); } }
  });
  const wrapped = (file) => `(function(module, exports) {\n${fs.readFileSync(file, 'utf8')}\n})(module, module.exports);`;
  try { vm.runInContext(wrapped(path.join(miniRoot, 'lib/mesh.js')), context, { timeout: 5000 }); }
  catch (error) { assert.fail(`mesh bundle initialization failed: ${error.message}`); }
  const mesh = context.module.exports;
  context.module = { exports: {} };
  try { vm.runInContext(wrapped(cadBundle), context, { timeout: 5000 }); }
  catch (error) { assert.fail(`CAD bundle initialization failed: ${error.message}`); }
  const cad = context.module.exports;
  const inputBytes = fs.readFileSync(path.join(root, 'node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.stp'));
  const input = vm.runInContext(`new Uint8Array(${JSON.stringify(Array.from(inputBytes))})`, context);
  let iges;
  try { iges = await cad.convertCad({ data: input, extension: 'step', target: 'iges', unit: 'mm', convertTriangles: mesh.convertTriangles }); }
  catch (error) { assert.fail(`CAD conversion failed: ${error.message}`); }
  assert.ok(iges.result.byteLength > 100);
  assert.equal(iges.cadSummary.before.solids, 1);
  assert.equal(iges.cadSummary.after.solids, 0);
  assert.match(iges.cadSummary.warnings.join(' '), /曲面/);
  const stl = await cad.convertCad({ data: input, extension: 'step', target: 'stl', unit: 'mm', convertTriangles: mesh.convertTriangles });
  assert.ok(stl.triangles >= 12);
  assert.equal(Buffer.from(stl.result).readUInt32LE(80), stl.triangles);
  const brep = await cad.convertCad({ data: input, extension: 'step', target: 'brep', unit: 'mm', convertTriangles: mesh.convertTriangles });
  const inches = await cad.convertCad({ data: brep.result, extension: 'brep', target: 'step', unit: 'inch', convertTriangles: mesh.convertTriangles });
  for (const dimension of inches.cadSummary.after.dims) assert.ok(Math.abs(dimension - 254) < 0.001);
  await assert.rejects(() => cad.convertCad({ data: input, extension: 'stp', target: 'step', unit: 'mm' }), /格式相同/);
  assert.equal(loaded.length, 8, 'CAD engine should be loaded only once');
});
