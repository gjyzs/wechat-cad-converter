// Experimental: requires actual WXWebAssembly and subpackage verification.
const part = (name) => ({ name, path: `/packages/${name}/kernel.wasm.br` });
const descriptors = {
  mesh: [part('mesh-core'), part('mesh-extra')],
  cad: [part('cad-core'), ...Array.from({ length: 7 }, (_, index) => part(`cad-${index + 1}`))]
};

async function loadSplitKernel({ factory, loadPart, wasm, parts }) {
  if (typeof factory !== 'function') throw new Error('本地 CAD 引擎组件不可用。');
  if (typeof loadPart !== 'function') throw new Error('小程序分包加载组件不可用。');
  if (!wasm || typeof wasm.instantiate !== 'function') throw new Error('当前环境不支持 WXWebAssembly，无法加载本地 CAD 引擎。');
  let rejectLoad;
  const loadFailure = new Promise((_, reject) => { rejectLoad = reject; });
  const modulePromise = factory({
    print: () => {},
    printErr: () => {},
    instantiateWasm(imports, receive) {
      let stage = '准备分包';
      (async () => {
        for (const item of parts) {
          stage = `分包 ${item.name}`;
          try { await loadPart(item.name); }
          catch (error) { throw new Error(`分包 ${item.name} 加载失败：${error && (error.message || error.errMsg) || '未知错误'}`); }
        }
        stage = `主模块 ${parts[0].name}`;
        const primary = await wasm.instantiate(parts[0].path, imports);
        if (!primary || !primary.instance || !primary.instance.exports) throw new Error('主引擎初始化失败。');
        for (const item of parts.slice(1)) {
          stage = `副模块 ${item.name}`;
          await wasm.instantiate(item.path, { primary: primary.instance.exports });
        }
        stage = '初始化 CAD 引擎';
        receive(primary.instance, primary.module);
      })().catch((error) => rejectLoad(new Error(`CAD 引擎加载失败（${stage}）：${error && (error.message || error.errMsg) || '未知错误'}`)));
      return {};
    }
  });
  return Promise.race([modulePromise, loadFailure]);
}

module.exports = { loadSplitKernel, descriptors };
