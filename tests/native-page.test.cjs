const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

const pagePath = path.resolve(__dirname, '../miniprogram-native/pages/index/index.js');
const triangle = Buffer.from(`solid s
 facet normal 0 0 1
  outer loop
   vertex 0 0 0
   vertex 1 0 0
   vertex 0 1 0
  endloop
 endfacet
endsolid s`);

test('mini-program page selects, converts, and shares a local ZIP without uploading', async () => {
  assert.ok(fs.existsSync(pagePath), 'native mini-program page has not been implemented');
  let page;
  let written;
  let shared;
  global.Page = (definition) => { page = definition; };
  global.wx = {
    env: { USER_DATA_PATH: 'local' },
    showToast() {},
    showModal() {},
    uploadFile() { throw new Error('unexpected model upload'); },
    request() { throw new Error('unexpected network request'); },
    chooseMessageFile(options) {
      options.success({ tempFiles: [{ name: 'triangle.stl', path: 'input', size: triangle.length }] });
    },
    getFileSystemManager() {
      return {
        readFile(options) { options.success({ data: triangle.buffer.slice(triangle.byteOffset, triangle.byteOffset + triangle.byteLength) }); },
        writeFile(options) { written = Buffer.from(options.data); options.success({}); }
      };
    },
    shareFileMessage(options) { shared = options; options.success && options.success({}); }
  };
  try {
    delete require.cache[require.resolve(pagePath)];
    require(pagePath);
    page.setData = (changes) => Object.assign(page.data, changes);
    page.chooseFiles();
    assert.equal(page.data.files.length, 1);
    page.chooseFormat({ currentTarget: { dataset: { format: 'obj' } } });
    await page.startConversion();
    assert.equal(page.data.succeeded, 1);
    assert.equal(page.data.failed, 0);
    assert.ok(page.data.resultPath.endsWith('.zip'));
    const zip = await JSZip.loadAsync(written);
    assert.match(await zip.file('triangle.obj').async('string'), /^v\s/m);
    page.shareResult();
    assert.equal(shared.filePath, page.data.resultPath);
  } finally {
    delete global.wx;
    delete global.Page;
  }
});
