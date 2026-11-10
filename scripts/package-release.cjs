const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'release', '三维转换-免费开源试验版.zip');
const include = [
  'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.gitignore',
  'package.json', 'package-lock.json',
  'source', 'scripts', 'tests', 'licenses', 'miniprogram-native', 'miniprogram', 'experiments', 'dist/web/index.html'
];
const forbidden = /(^|\/)(node_modules|卖家专用|私钥|授权码库存)(\/|$)/i;
const zip = new JSZip();

function add(relative) {
  const normalized = relative.split(path.sep).join('/');
  if (forbidden.test(normalized)) throw new Error(`Refusing to package ${normalized}`);
  const absolute = path.join(root, relative);
  const info = fs.lstatSync(absolute);
  if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${normalized}`);
  if (info.isDirectory()) {
    for (const name of fs.readdirSync(absolute).sort()) add(path.join(relative, name));
  } else if (info.isFile()) {
    zip.file(normalized, fs.readFileSync(absolute));
  }
}

(async () => {
  for (const item of include) add(item);
  // Developer Tools rewrites project.config.json locally; never publish that
  // file or the companion project.private.config.json in a release archive.
  zip.file('project.config.json', JSON.stringify({
    description: 'Free local 3D converter experimental prototype',
    appid: 'touristappid',
    projectname: 'cad-converter-free',
    compileType: 'miniprogram',
    miniprogramRoot: 'miniprogram-native/',
    setting: { es6: true, minified: true, urlCheck: true }
  }, null, 2) + '\n');
  const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, data);
  console.log(`Prepared source and prototype archive: ${output} (${data.length} bytes)`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
