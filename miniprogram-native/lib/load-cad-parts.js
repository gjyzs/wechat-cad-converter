// Keep these paths literal so the mini-program compiler can find each subpackage.
function loadCadPart(name) {
  if (typeof require.async !== 'function') throw new Error('当前微信版本不支持异步加载分包，请升级微信或基础库。');
  switch (name) {
    case 'cad-core': return require.async('../packages/cad-core/entry.js');
    case 'cad-1': return require.async('../packages/cad-1/entry.js');
    case 'cad-2': return require.async('../packages/cad-2/entry.js');
    case 'cad-3': return require.async('../packages/cad-3/entry.js');
    case 'cad-4': return require.async('../packages/cad-4/entry.js');
    case 'cad-5': return require.async('../packages/cad-5/entry.js');
    case 'cad-6': return require.async('../packages/cad-6/entry.js');
    case 'cad-7': return require.async('../packages/cad-7/entry.js');
    default: throw new Error(`未知 CAD 引擎分包：${name}`);
  }
}

module.exports = { loadCadPart };
