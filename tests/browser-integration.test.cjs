const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('free browser build converts real CAD examples and exercises its UI without network', { timeout: 120000 }, () => {
  const script = path.join(__dirname, 'browser-ui-check.cjs');
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 110000, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined, result.error && result.error.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /STEP -> IGES ZIP/);
  assert.match(result.stdout, /IGES -> STEP ZIP/);
});
