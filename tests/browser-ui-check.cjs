const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const JSZip = require('jszip');
const base = path.resolve(__dirname, '..');
const htmlPath = path.join(base, 'dist/web/index.html');
const html = fs.readFileSync(htmlPath, 'utf8').replace(/(\} catch \(error\) \{\s*)(showMessage\()/g, '$' + '1console.error("ZIPDEBUG",error); $' + '2');
const workerBundle = fs.readFileSync(path.join(base, 'source/worker-bundle.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const cube = fs.readFileSync(path.join(base, 'node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.stp'));
let blobRecords = [];
let anchorDownload = null;
let workers = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (error) => { console.error('DOM:', error.message); }); vc.on('error', (...args) => console.error(...args));
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://offline-test.invalid/',
  virtualConsole: vc,
  beforeParse(w) {
    w.setImmediate = setImmediate;
    w.clearImmediate = clearImmediate;
    w.fetch = () => { throw new Error('Unexpected network request'); }; w.XMLHttpRequest = class { constructor() { throw new Error('Unexpected XHR'); } }; w.TextEncoder = TextEncoder;
    w.TextDecoder = TextDecoder;
    w.Blob = Blob;
    w.File = class extends Blob {
      constructor(parts, name, options = {}) { super(parts, options); this.name = name; this.lastModified = 1; }
    };
    w.URL.createObjectURL = (blob) => { blobRecords.push(blob); return 'blob:offline-' + blobRecords.length; };
    w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function () { anchorDownload = this.download; };
    w.Worker = class {
      constructor(url, options) {
        const shim = options && options.name === 'cad-engine' ? 'test-cad-worker-shim.cjs' : 'test-worker-shim.cjs';
        this.nodeWorker = new Worker(path.join(base, 'tests', shim));
        workers.push(this.nodeWorker);
        this.nodeWorker.on('message', (data) => {
          if (data.result) { const copy = new w.Uint8Array(data.result.byteLength); copy.set(new Uint8Array(data.result)); data.result = copy.buffer; }
          if (this.onmessage) this.onmessage({ data });
        });
        this.nodeWorker.on('error', (err) => { if (this.onerror) this.onerror(err); });
      }
      postMessage(msg, transfer) { this.nodeWorker.postMessage(msg, transfer); }
      terminate() { this.nodeWorker.terminate(); }
    };
  }
});
const w = dom.window;
const doc = w.document;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(test, label, timeout = 30000) {
  const stop = Date.now() + timeout;
  while (!test()) {
    if (Date.now() > stop) throw new Error('timeout: ' + label + ', feedback=' + doc.getElementById('feedback').textContent);
    await sleep(20);
  }
}
async function main() {
  assert.equal(doc.getElementById('converter-worker').textContent, workerBundle, 'artifact worker differs from tested bundle'); assert.deepEqual(Buffer.from(doc.getElementById('converter-wasm').textContent.trim(), 'base64'), fs.readFileSync(path.join(base, 'node_modules/occt-import-js/dist/occt-import-js.wasm')), 'embedded wasm differs from tested engine');
  const cadWorkerText = fs.readFileSync(path.join(base, 'source/cad-worker-v3-bundle.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  assert.equal(doc.getElementById('cad-worker').textContent, cadWorkerText);
  const compressed = Buffer.from(doc.getElementById('cad-wasm-gzip').textContent.trim(), 'base64');
  assert.deepEqual(require('node:zlib').gunzipSync(compressed), fs.readFileSync(path.join(base, 'node_modules/occt.ts/dist/wasm/occtjs.wasm')));
  assert.equal(doc.querySelector('.flow-step[aria-current="step"]').dataset.step, '1');
  assert.equal(doc.querySelectorAll('input[name="output-format"]').length, 7);
  assert.equal(doc.querySelector('input[name="output-format"]:checked').value, 'stl');
  const input = doc.getElementById('file-input');
  const selected = [
    new w.File([cube], '块.step'),
    new w.File([cube], '块.stp'),
    new w.File(['not a model'], '坏.xyz')
  ];
  Object.defineProperty(input, 'files', { value: selected, configurable: true });
  input.dispatchEvent(new w.Event('change'));
  assert.equal(doc.querySelectorAll('.file-row').length, 3);
  assert.equal(doc.querySelector('.flow-step[aria-current="step"]').dataset.step, '2');
  assert.equal(doc.getElementById('start-button').disabled, false);
  doc.getElementById('start-button').click();
  assert.ok(Array.from(doc.querySelectorAll('input[name="output-format"]')).every((option) => option.disabled));
  await until(() => doc.getElementById('progress-text').textContent === '处理完成 3 / 3', 'batch conversion');
  assert.equal(doc.querySelectorAll('.file-status.done').length, 2);
  assert.equal(doc.querySelector('.flow-step[aria-current="step"]').dataset.step, '3');
  assert.equal(doc.getElementById('start-label').textContent, '重新转换');
  assert.equal(doc.getElementById('download-label').textContent, '下载结果 · 2 个');
  assert.equal(doc.getElementById('download-button').classList.contains('ready'), true);
  assert.equal(doc.querySelectorAll('.file-status.failed').length, 1);
  assert.equal(doc.getElementById('download-button').disabled, false);
  doc.getElementById('download-button').click();
  await until(() => anchorDownload !== null || doc.getElementById('feedback').classList.contains('is-error'), 'download', 6000);
  assert.equal(anchorDownload, '三维模型转换结果.zip');
  const archiveBlob = blobRecords[blobRecords.length - 1];
  const zip = await JSZip.loadAsync(await archiveBlob.arrayBuffer());
  assert.ok(zip.file('块.stl'));
  assert.ok(zip.file('块 (2).stl'));
  assert.match(await zip.file('转换失败说明.txt').async('string'), /坏\.xyz.*格式不受支持/);
  const stl = await zip.file('块.stl').async('uint8array');
  assert.ok(stl.length > 84);
  console.log('DOM simulation: batch selection, successful and failed statuses, duplicated filenames, ZIP download and failure report passed');
  const objOption = doc.querySelector('input[name="output-format"][value="obj"]');
  objOption.click();
  assert.equal(doc.getElementById('target-format').value, 'obj');
  assert.equal(objOption.checked, true);
  assert.equal(doc.querySelector('.flow-step[aria-current="step"]').dataset.step, '2');
  assert.equal(doc.getElementById('download-button').disabled, true);
  assert.equal(doc.querySelectorAll('.file-status.waiting').length, 3);
  assert.ok(Array.from(doc.querySelectorAll('input[name="output-format"]')).every((option) => !option.disabled));
  anchorDownload = null;
  doc.getElementById('start-button').click();
  await until(() => doc.getElementById('progress-text').textContent === '处理完成 3 / 3', 'OBJ batch');
  assert.equal(doc.querySelectorAll('.file-status.done').length, 2);
  doc.getElementById('download-button').click();
  await until(() => anchorDownload !== null, 'OBJ download');
  const objZip = await JSZip.loadAsync(await blobRecords[blobRecords.length - 1].arrayBuffer());
  assert.match(await objZip.file('块.obj').async('string'), /^v\s/m);
  assert.ok(objZip.file('块 (2).obj'));
  console.log('DOM simulation: selected output card produces valid OBJ files and safe duplicate names');
  doc.getElementById('clear-files').click();
  assert.equal(doc.querySelectorAll('.file-row').length, 0);
  assert.equal(doc.querySelector('.flow-step[aria-current="step"]').dataset.step, '1');
  assert.equal(doc.getElementById('start-button').disabled, true);
  console.log('DOM simulation: changing settings resets stale results; clear list resets controls');
  assert.equal(blobRecords.length, 3, 'no extra network or asset objects expected');
  const igesOption = doc.querySelector('input[name="output-format"][value="iges"]');
  igesOption.click();
  assert.match(doc.getElementById('format-helper').textContent, /IGES/);
  Object.defineProperty(input, 'files', { value: [new w.File([cube], '零件.step'), new w.File(['not a mesh'], '表面.stl')], configurable: true });
  input.dispatchEvent(new w.Event('change'));
  anchorDownload = null;
  doc.getElementById('start-button').click();
  await until(() => doc.getElementById('progress-text').textContent === '处理完成 2 / 2', 'IGES batch');
  assert.equal(doc.querySelectorAll('.file-status.done.review').length, 1);
  assert.match(doc.querySelector('.file-status.done.review').textContent, /曲面/);
  assert.equal(doc.querySelectorAll('.file-status.failed').length, 1);
  assert.match(doc.querySelector('.file-status.failed').textContent, /不能从三角网格恢复/);
  doc.getElementById('download-button').click();
  await until(() => anchorDownload !== null, 'IGES download');
  const cadZip = await JSZip.loadAsync(await blobRecords[blobRecords.length - 1].arrayBuffer());
  assert.ok(cadZip.file('零件.iges'));
  assert.match(await cadZip.file('CAD转换检查.txt').async('string'), /实体数量：1 → 0/);
  assert.match(await cadZip.file('转换失败说明.txt').async('string'), /表面\.stl/);
  const igesBytes = await cadZip.file('零件.iges').async('uint8array');
  const occImporter = await require('occt-import-js')();
  assert.ok(occImporter.ReadIgesFile(igesBytes, null).success);
  console.log('DOM simulation: STEP -> IGES ZIP, solid-loss warning, report, mesh refusal and independent readback passed');
  doc.getElementById('clear-files').click();
  doc.querySelector('input[name="output-format"][value="step"]').click();
  const cubeIges = fs.readFileSync(path.join(base, 'node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.igs'));
  Object.defineProperty(input, 'files', { value: [new w.File([cubeIges], '零件.igs')], configurable: true });
  input.dispatchEvent(new w.Event('change'));
  anchorDownload = null;
  doc.getElementById('start-button').click();
  await until(() => doc.getElementById('progress-text').textContent === '处理完成 1 / 1', 'STEP batch');
  assert.equal(doc.querySelectorAll('.file-status.done:not(.review)').length, 1);
  doc.getElementById('download-button').click();
  await until(() => anchorDownload !== null, 'STEP download');
  const stepZip = await JSZip.loadAsync(await blobRecords[blobRecords.length - 1].arrayBuffer());
  assert.ok(stepZip.file('零件.step'));
  assert.match(await stepZip.file('CAD转换检查.txt').async('string'), /实体数量：1 → 1/);
  assert.ok(occImporter.ReadStepFile(await stepZip.file('零件.step').async('uint8array'), null).success);
  console.log('DOM simulation: IGES -> STEP ZIP preserves cube solid count and independently reads back');
}
main().finally(async () => {
  await Promise.all(workers.map((worker) => worker.terminate()));
  dom.window.close();
}).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });





