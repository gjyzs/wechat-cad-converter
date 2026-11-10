const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
test('development project points to the native app and contains no configured network service', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
  assert.equal(config.miniprogramRoot, 'miniprogram-native/');
  // The developer tool may replace the placeholder with the developer's test AppID.
  assert.match(config.appid, /^(?:touristappid|wx[0-9a-f]{16})$/i);
  const miniRoot = path.join(root, config.miniprogramRoot);
  const app = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'));
  for (const page of app.pages) for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.ok(fs.existsSync(path.join(miniRoot, `${page}.${extension}`)), `missing ${page}.${extension}`);
  }
  const main = fs.readFileSync(path.join(miniRoot, 'pages/index/index.js'), 'utf8');
  assert.doesNotMatch(main, /wx\.(?:uploadFile|downloadFile|request)\s*\(/);
  assert.ok(fs.statSync(path.join(miniRoot, 'lib/mesh.js')).size < 1800000);
  const cadBundle = fs.readFileSync(path.join(miniRoot, 'lib/cad.js'), 'utf8');
  assert.doesNotMatch(cadBundle, /new Function|\beval\s*\(/);
  assert.equal(app.subpackages.length, 8);
  const sizeOf = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, item) => {
    const name = path.join(dir, item.name);
    return sum + (item.isDirectory() ? sizeOf(name) : fs.statSync(name).size);
  }, 0);
  const mainSize = fs.readdirSync(miniRoot, { withFileTypes: true }).reduce((sum, item) => {
    if (item.name === 'packages') return sum;
    const name = path.join(miniRoot, item.name);
    return sum + (item.isDirectory() ? sizeOf(name) : fs.statSync(name).size);
  }, 0);
  assert.ok(mainSize < 2 * 1024 * 1024, `main package is ${mainSize} bytes`);
  let total = mainSize;
  for (const pack of app.subpackages) {
    const asset = path.join(miniRoot, pack.root, 'kernel.wasm.br');
    assert.ok(fs.existsSync(asset), `missing ${pack.name} kernel`);
    const size = sizeOf(path.join(miniRoot, pack.root));
    assert.ok(size < 2 * 1024 * 1024, `${pack.name} exceeds the package budget`);
    total += size;
  }
  assert.ok(total < 20 * 1024 * 1024);
});
