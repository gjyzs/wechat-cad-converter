// Experimental: requires actual WXWebAssembly and subpackage verification.
const part = (name) => ({ name, path: `/packages/${name}/kernel.wasm.br` });
const descriptors = {
  mesh: [part('mesh-core'), part('mesh-extra')],
  cad: [part('cad-core'), ...Array.from({ length: 7 }, (_, index) => part(`cad-${index + 1}`))]
};

async function loadSplitKernel({ factory, runtime, wasm, parts }) {
  if (typeof factory !== 'function' || !runtime || typeof runtime.loadSubpackage !== 'function' || !wasm || typeof wasm.instantiate !== 'function') {
    throw new Error('当前环境暂不支持加载本地 CAD 引擎。');
  }
  let rejectLoad;
  const loadFailure = new Promise((_, reject) => { rejectLoad = reject; });
  const modulePromise = factory({
    print: () => {},
    printErr: () => {},
    instantiateWasm(imports, receive) {
      (async () => {
        for (const item of parts) {
          await new Promise((resolve, reject) => runtime.loadSubpackage({ name: item.name, success: resolve, fail: reject }));
        }
        const primary = await wasm.instantiate(parts[0].path, imports);
        if (!primary || !primary.instance || !primary.instance.exports) throw new Error('主引擎初始化失败。');
        for (const item of parts.slice(1)) await wasm.instantiate(item.path, { primary: primary.instance.exports });
        receive(primary.instance, primary.module);
      })().catch((error) => rejectLoad(new Error(`CAD 引擎加载失败：${error && (error.message || error.errMsg) || '未知错误'}`)));
      return {};
    }
  });
  return Promise.race([modulePromise, loadFailure]);
}

module.exports = { loadSplitKernel, descriptors };
