const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

const root = path.resolve(__dirname, '..');
const archive = path.join(root, 'dist', 'release', '三维转换-免费开源试验版.zip');
test('release archive includes source and excludes seller keys and installed dependencies', async () => {
  assert.ok(fs.existsSync(archive), 'release archive has not been prepared');
  const zip = await JSZip.loadAsync(fs.readFileSync(archive));
  for (const name of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'project.config.json', 'miniprogram-native/pages/index/index.js', 'miniprogram-native/packages/cad-core/kernel.wasm.br', 'source/native-mesh.mjs', 'source/native-cad.mjs', 'dist/web/index.html']) {
    assert.ok(zip.file(name), `release is missing ${name}`);
  }
  const entries = Object.keys(zip.files);
  assert.ok(entries.every((name) => !/(^|\/)(node_modules|卖家专用|私钥|授权码库存)(\/|$)/i.test(name)));
});
