const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

const file = path.resolve(__dirname, '../miniprogram-native/lib/batch.js');
const sample = Buffer.from(`solid s
 facet normal 0 0 1
  outer loop
   vertex 0 0 0
   vertex 1 0 0
   vertex 0 1 0
  endloop
 endfacet
endsolid s`);

test('batch conversion keeps distinct names, reports failures, and writes one local archive', async () => {
  assert.ok(fs.existsSync(file), 'native batch workflow has not been implemented');
  const { convertBatch } = require(file);
  const progress = [];
  let output;
  const result = await convertBatch({
    files: [
      { name: '模型.stl', path: 'first', size: sample.length },
      { name: '模型.stl', path: 'second', size: sample.length },
      { name: '损坏.step', path: 'bad', size: 8 }
    ],
    target: 'obj', unit: 'mm',
    readFile: async (p) => p === 'bad' ? Buffer.from('bad') : sample,
    writeFile: async (data) => { output = Buffer.from(data); return 'local-result.zip'; },
    onProgress: (state) => progress.push(state)
  });
  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.path, 'local-result.zip');
  assert.equal(progress.at(-1).processed, 3);
  const zip = await JSZip.loadAsync(output);
  assert.match(await zip.file('模型.obj').async('string'), /^v\s/m);
  assert.match(await zip.file('模型 (2).obj').async('string'), /^v\s/m);
  assert.match(await zip.file('转换失败说明.txt').async('string'), /损坏\.step/);
});

test('all invalid inputs do not create a stale or empty archive', async () => {
  assert.ok(fs.existsSync(file), 'native batch workflow has not been implemented');
  const { convertBatch } = require(file);
  let writes = 0;
  await assert.rejects(() => convertBatch({
    files: [{ name: 'bad.step', path: 'bad', size: 3 }], target: 'stl', unit: 'mm',
    readFile: async () => Buffer.from('bad'),
    writeFile: async () => { writes++; }
  }), /没有|未成功|不支持/);
  assert.equal(writes, 0);
});

test('actual file bytes are limited even when metadata understates their size', async () => {
  const { convertBatch } = require(file);
  let writes = 0;
  await assert.rejects(() => convertBatch({
    files: [{ name: 'large.stl', path: 'large', size: 1 }], target: 'obj', unit: 'mm',
    readFile: async () => new Uint8Array(20 * 1024 * 1024 + 1),
    writeFile: async () => { writes++; }
  }), /20 MB/);
  assert.equal(writes, 0);
});

test('triangle meshes cannot be presented as exact CAD solids', async () => {
  const { convertBatch } = require(file);
  let reads = 0;
  await assert.rejects(() => convertBatch({
    files: [{ name: 'mesh.stl', path: 'mesh', size: sample.length }], target: 'step', unit: 'mm',
    readFile: async () => { reads++; return sample; },
    writeFile: async () => { throw new Error('unexpected output'); }
  }), /不能恢复/);
  assert.equal(reads, 0);
});
