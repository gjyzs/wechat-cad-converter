const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const JSZip = require('jszip');

const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'miniprogram-native');
const pagePath = path.join(mini, 'pages/index/index.js');
test('experimental mini-program batch converts STEP to IGES with a geometry report', { timeout: 30000 }, async () => {
  let page, archive;
  const loaded = [];
  const input = fs.readFileSync(path.join(root, 'node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.stp'));
  global.Page = (definition) => { page = definition; };
  global.wx = {
    env: { USER_DATA_PATH: 'local' },
    showToast() {}, showModal() {},
    request() { throw new Error('unexpected model upload'); },
    uploadFile() { throw new Error('unexpected model upload'); },
    chooseMessageFile: ({ success }) => success({ tempFiles: [{ name: '零件.step', path: 'input', size: input.length }] }),
    loadSubpackage: ({ name, success }) => { loaded.push(name); success({}); },
    getFileSystemManager: () => ({
      readFile: ({ success }) => success({ data: input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) }),
      writeFile: ({ data, success }) => { archive = Buffer.from(data); success({}); }
    })
  };
  global.WXWebAssembly = { instantiate: async (file, imports) => {
    const bytes = zlib.brotliDecompressSync(fs.readFileSync(path.join(mini, file.replace(/^\//, ''))));
    return WebAssembly.instantiate(bytes, imports);
  } };
  try {
    delete require.cache[require.resolve(pagePath)];
    require(pagePath);
    page.setData = (changes) => Object.assign(page.data, changes);
    page.chooseFiles();
    assert.equal(page.data.files.length, 1, 'STEP selection must be accepted');
    page.chooseFormat({ currentTarget: { dataset: { format: 'iges' } } });
    await page.startConversion();
    assert.equal(page.data.succeeded, 1, page.data.status);
    const zip = await JSZip.loadAsync(archive);
    assert.ok(zip.file('零件.iges'));
    assert.match(await zip.file('CAD转换检查.txt').async('string'), /曲面/);
    const importer = await require('occt-import-js')({ print: () => {}, printErr: () => {} });
    assert.equal(importer.ReadIgesFile(await zip.file('零件.iges').async('uint8array'), null).success, true);
    assert.equal(loaded.length, 8);
  } finally {
    delete global.wx;
    delete global.WXWebAssembly;
    delete global.Page;
  }
});
