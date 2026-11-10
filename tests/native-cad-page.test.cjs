const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const JSZip = require('jszip');

const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'miniprogram-native');
const pagePath = path.join(mini, 'pages/index/index.js');
test('experimental mini-program batch converts STEP to IGES with a geometry report', { timeout: 30000 }, async () => {
  let page, archive;
  const loaded = [];
  const input = fs.readFileSync(path.join(root, 'node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.stp'));
  const foreignInput = vm.runInNewContext(`new Uint8Array(${JSON.stringify(Array.from(input))}).buffer`);
  const wx = {
    env: { USER_DATA_PATH: 'local' },
    showToast() {}, showModal() {},
    request() { throw new Error('unexpected model upload'); },
    uploadFile() { throw new Error('unexpected model upload'); },
    chooseMessageFile: ({ success }) => success({ tempFiles: [{ name: '零件.step', path: 'input', size: input.length }] }),
    getFileSystemManager: () => ({
      readFile: ({ success }) => success({ data: foreignInput }),
      writeFile: ({ data, success }) => { archive = Buffer.from(data); success({}); }
    })
  };
  const WXWebAssembly = { instantiate: async (file, imports) => {
    assert.ok(loaded.includes(file.split('/')[2]), `subpackage should be loaded before ${file}`);
    const bytes = zlib.brotliDecompressSync(fs.readFileSync(path.join(mini, file.replace(/^\//, ''))));
    return WebAssembly.instantiate(bytes, imports);
  } };
  const context = vm.createContext({
    wx, WXWebAssembly, WebAssembly: undefined, console, setTimeout, clearTimeout,
    Page: (definition) => { page = definition; }
  });
  // Mini-programs do not permit constructing executable code from strings.
  vm.runInContext(`Function = new Proxy(Function, {
    apply() { throw new TypeError('dynamic Function is unavailable'); },
    construct() { throw new TypeError('dynamic Function is unavailable'); }
  });`, context);
  const cache = new Map();
  function loadModule(file) {
    const resolved = require.resolve(file);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const module = { exports: {} };
    cache.set(resolved, module);
    const localRequire = (specifier) => loadModule(path.resolve(path.dirname(resolved), specifier));
    // Simulate the documented mini-program cross-package module loader.
    localRequire.async = async (specifier) => {
      const target = path.resolve(path.dirname(resolved), specifier);
      loaded.push(path.basename(path.dirname(target)));
      return loadModule(target);
    };
    const wrapped = new vm.Script(`(function(require,module,exports){\n${fs.readFileSync(resolved, 'utf8')}\n})`, { filename: resolved });
    wrapped.runInContext(context)(localRequire, module, module.exports);
    return module.exports;
  }
  loadModule(pagePath);
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
  assert.deepEqual(loaded, ['cad-core', 'cad-1', 'cad-2', 'cad-3', 'cad-4', 'cad-5', 'cad-6', 'cad-7']);
});
