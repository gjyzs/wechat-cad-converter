const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const experiment = path.join(root, 'experiments', 'native-cad-split');
const loaderPath = path.join(experiment, 'split-loader.cjs');

function fakeRuntime() {
  const loaded = [];
  return {
    loaded,
    wx: { loadSubpackage: ({ name, success }) => { loaded.push(name); success({}); } },
    wasm: { instantiate: async (filePath, imports) => {
      const bytes = zlib.brotliDecompressSync(fs.readFileSync(path.join(experiment, filePath.replace(/^\//, ''))));
      return WebAssembly.instantiate(bytes, imports);
    } }
  };
}

test('split kernels locally read and exchange real CAD geometry', { timeout: 30000 }, async () => {
  assert.ok(fs.existsSync(loaderPath), 'split kernel loader has not been prepared');
  const { loadSplitKernel, descriptors } = require(loaderPath);
  const runtime = fakeRuntime();
  const meshFactory = require('occt-import-js');
  const mesh = await loadSplitKernel({ factory: meshFactory, runtime: runtime.wx, wasm: runtime.wasm, parts: descriptors.mesh });
  const fixture = path.join(root, 'node_modules/occt-import-js/test/testfiles/cube-10x10mm');
  const step = new Uint8Array(fs.readFileSync(path.join(fixture, 'Cube 10x10.stp')));
  const iges = new Uint8Array(fs.readFileSync(path.join(fixture, 'Cube 10x10.igs')));
  for (const result of [mesh.ReadStepFile(step, null), mesh.ReadIgesFile(iges, null)]) {
    assert.equal(result.success, true);
    assert.ok(result.meshes.length > 0);
  }
  const cadFactory = (await import(pathToFileURL(path.join(root, 'node_modules/occt.ts/dist/wasm/occtjs.js')).href)).default;
  const { OccSession } = await import('occt.ts');
  const module = await loadSplitKernel({ factory: cadFactory, runtime: runtime.wx, wasm: runtime.wasm, parts: descriptors.cad });
  module.setVerbose(false);
  const occ = new OccSession(module);
  try {
    const shape = occ.readStep(step, { unit: 'mm' });
    const outIges = occ.writeIges(shape);
    const readIges = occ.readIges(outIges);
    const outStep = occ.writeStep(occ.readIges(iges), { unit: 'mm' });
    const readStep = occ.readStep(outStep, { unit: 'mm' });
    const readBrep = occ.readBrep(occ.writeBrep(shape));
    assert.equal(shape.count('Solid'), 1);
    assert.equal(readIges.count('Solid'), 0);
    assert.equal(readStep.count('Solid'), 1);
    assert.equal(readBrep.count('Solid'), 1);
    for (const model of [readIges, readStep, readBrep]) {
      const bounds = model.bounds();
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(bounds.max[i] - bounds.min[i] - 10) < 0.001);
    }
    const assembly = new Uint8Array(fs.readFileSync(path.join(root, 'node_modules/occt-import-js/test/testfiles/cax-if/as1_pe_203.stp')));
    const originalAssembly = occ.readStep(assembly, { unit: 'mm' });
    const convertedAssembly = occ.readBrep(occ.writeBrep(originalAssembly));
    assert.equal(originalAssembly.count('Solid'), 18);
    assert.equal(convertedAssembly.count('Solid'), 18);
  } finally { occ.dispose(); }
  assert.equal(runtime.loaded.length, descriptors.mesh.length + descriptors.cad.length);
});

test('subpackage failure rejects promptly instead of leaving initialization stuck', async () => {
  assert.ok(fs.existsSync(loaderPath), 'split kernel loader has not been prepared');
  const { loadSplitKernel, descriptors } = require(loaderPath);
  const factory = (options) => {
    options.instantiateWasm({}, () => {});
    return new Promise(() => {});
  };
  const runtime = { loadSubpackage: ({ fail }) => fail({ errMsg: 'load failed' }) };
  await assert.rejects(() => loadSplitKernel({ factory, runtime, wasm: {}, parts: descriptors.mesh }), /加载|失败/);
});
