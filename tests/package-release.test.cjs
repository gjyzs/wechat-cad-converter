const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
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

test('building a release uses a clean project config without publishing local developer settings', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-cad-release-test-'));
  try {
    for (const dir of ['source', 'scripts', 'tests', 'licenses', 'miniprogram-native', 'miniprogram', 'experiments', 'dist/web']) {
      fs.mkdirSync(path.join(tempRoot, dir), { recursive: true });
    }
    for (const name of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.gitignore', 'package.json', 'package-lock.json', 'dist/web/index.html']) {
      fs.writeFileSync(path.join(tempRoot, name), 'fixture');
    }
    fs.writeFileSync(path.join(tempRoot, 'package.json'), '{}');
    fs.copyFileSync(path.join(root, 'scripts/package-release.cjs'), path.join(tempRoot, 'scripts/package-release.cjs'));
    fs.writeFileSync(path.join(tempRoot, 'project.config.json'), JSON.stringify({ appid: 'wx0123456789abcdef', privateMarker: 'LOCAL_ONLY' }));
    fs.writeFileSync(path.join(tempRoot, 'project.private.config.json'), 'PRIVATE_SETTINGS');
    execFileSync(process.execPath, [path.join(tempRoot, 'scripts/package-release.cjs')], {
      env: { ...process.env, NODE_PATH: path.join(root, 'node_modules') }, stdio: 'pipe'
    });
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(tempRoot, 'dist/release/三维转换-免费开源试验版.zip')));
    const configText = await zip.file('project.config.json').async('string');
    assert.equal(JSON.parse(configText).appid, 'touristappid');
    assert.doesNotMatch(configText, /LOCAL_ONLY|wx0123456789abcdef/);
    assert.equal(zip.file('project.private.config.json'), null);
  } finally {
    if (path.dirname(path.resolve(tempRoot)) !== path.resolve(os.tmpdir())) throw new Error('Unexpected temporary release test path');
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
