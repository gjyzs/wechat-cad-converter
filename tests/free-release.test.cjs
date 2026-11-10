const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'web', 'index.html');

function embedded(html, id) {
  const marker = `<script id="${id}"`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `missing embedded ${id}`);
  const body = html.indexOf('>', start) + 1;
  const end = html.indexOf('</script>', body);
  assert.ok(body > start && end > body, `invalid embedded ${id}`);
  return html.slice(body, end).trim();
}

test('free browser package includes both conversion engines and no activation gate', () => {
  assert.ok(fs.existsSync(output), 'free browser package has not been built');
  const html = fs.readFileSync(output, 'utf8');
  assert.match(html, /id="file-input"/);
  assert.match(html, /id="start-button"/);
  assert.match(html, /id="download-button"/);
  for (const format of ['stl', 'obj', 'ply', 'glb', 'step', 'iges', 'brep']) {
    assert.match(html, new RegExp(`value="${format}"`), `missing ${format} output`);
  }
  assert.doesNotMatch(html, /输入授权码|激活授权|license-input|首次激活后/);
  assert.ok(embedded(html, 'converter-worker').length > 1000);
  assert.ok(embedded(html, 'cad-worker').length > 1000);
  assert.deepEqual(Buffer.from(embedded(html, 'converter-wasm'), 'base64').subarray(0, 4), Buffer.from([0, 97, 115, 109]));
  assert.deepEqual(zlib.gunzipSync(Buffer.from(embedded(html, 'cad-wasm-gzip'), 'base64')).subarray(0, 4), Buffer.from([0, 97, 115, 109]));
});

test('mini-program never pretends a placeholder URL is a usable converter', () => {
  const config = path.join(root, 'miniprogram', 'config.js');
  assert.ok(fs.existsSync(config), 'mini-program configuration has not been prepared');
  const settings = require(config);
  assert.equal(settings.webUrl, '', 'unconfigured release must not point to a fake site');
  const page = fs.readFileSync(path.join(root, 'miniprogram', 'pages', 'index', 'index.wxml'), 'utf8');
  assert.match(page, /wx:if="{{webUrl}}"/);
});
