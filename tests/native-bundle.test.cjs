const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JSZip = require('jszip');

const bundle = path.resolve(__dirname, '../miniprogram-native/lib/mesh.js');
const tinyStl = `solid s
 facet normal 0 0 1
  outer loop
   vertex 0 0 0
   vertex 1 0 0
   vertex 0 1 0
  endloop
 endfacet
endsolid s`;

test('native bundle converts locally without browser APIs or network', async () => {
  assert.ok(fs.existsSync(bundle), 'native mini-program bundle has not been built');
  const context = vm.createContext({
    module: { exports: {} },
    console,
    setTimeout,
    clearTimeout,
    fetch: () => { throw new Error('unexpected network'); },
    XMLHttpRequest: class { constructor() { throw new Error('unexpected network'); } }
  });
  try {
    vm.runInContext(fs.readFileSync(bundle, 'utf8'), context, { timeout: 5000 });
  } catch (error) {
    assert.fail(`bundle initialization failed: ${error.message}`);
  }
  const data = vm.runInContext(`new TextEncoder().encode(${JSON.stringify(tinyStl)}).buffer`, context);
  const encodedName = vm.runInContext(`Array.from(new TextEncoder().encode('模型😀'))`, context);
  assert.deepEqual(Array.from(encodedName), Array.from(Buffer.from('模型😀')));
  const result = await context.module.exports.convertMesh({ data, extension: 'stl', target: 'glb', unit: 'mm' });
  assert.equal(result.triangles, 1);
  assert.equal(Buffer.from(result.result).toString('ascii', 0, 4), 'glTF');
  const hostBytes = Buffer.from(tinyStl);
  const foreignBuffer = hostBytes.buffer.slice(hostBytes.byteOffset, hostBytes.byteOffset + hostBytes.byteLength);
  const foreignResult = await context.module.exports.convertMesh({ data: foreignBuffer, extension: 'stl', target: 'obj', unit: 'mm' });
  assert.match(Buffer.from(foreignResult.result).toString('utf8'), /^v\s/m);
  const entries = vm.runInContext(`[{ name: '模型😀.txt', data: '几何结果' }]`, context);
  const archive = context.module.exports.makeZip(entries);
  const zip = await JSZip.loadAsync(Buffer.from(archive));
  assert.equal(await zip.file('模型😀.txt').async('string'), '几何结果');
});
