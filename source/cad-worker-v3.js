import { OccSession } from 'occt.ts';
import makeModule from '../node_modules/occt.ts/dist/wasm/occtjs.js';

let enginePromise = null;
async function getEngine(gzip) {
  if (!enginePromise) {
    if (!gzip) throw new Error('CAD 转换组件未初始化，请刷新后重试。');
    if (typeof DecompressionStream !== 'function') throw new Error('浏览器版本不支持本地解压，请使用最新版 Chrome 或 Edge。');
    enginePromise = (async () => {
      const stream = new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip'));
      const wasmBinary = new Uint8Array(await new Response(stream).arrayBuffer());
      const module = await makeModule({ wasmBinary, locateFile: () => 'occtjs.wasm', print: () => {}, printErr: () => {} });
      module.setVerbose(false);
      return module;
    })();
  }
  return enginePromise;
}
const mmPerUnit = { mm: 1, cm: 10, m: 1000, inch: 25.4 };
const cadTypes = new Set(['step', 'stp', 'iges', 'igs', 'brep']);
const category = (type) => type === 'stp' ? 'step' : type === 'igs' ? 'iges' : type;

function readShape(occ, extension, data, unit) {
  if (extension === 'step' || extension === 'stp') return occ.readStep(data, { unit: 'mm' });
  if (extension === 'iges' || extension === 'igs') return occ.readIges(data);
  if (extension === 'brep') {
    const shape = occ.readBrep(data);
    const scale = mmPerUnit[unit] || 1;
    return scale === 1 ? shape : occ.scale(shape, scale);
  }
  throw new Error('CAD 输出只接受 STEP、IGES 或 BREP 输入。');
}

function stats(shape) {
  if (shape.isNull()) throw new Error('模型没有可转换的 CAD 几何。');
  if (!shape.isValid()) throw new Error('模型几何未通过有效性检查，请在 CAD 软件中检查。');
  const bounds = shape.bounds();
  const dims = bounds.max.map((x, index) => x - bounds.min[index]);
  if (!dims.every(Number.isFinite)) throw new Error('模型尺寸无效，请检查源文件。');
  const area = Math.abs(shape.area());
  const volume = Math.abs(shape.volume());
  if (!Number.isFinite(area) || !Number.isFinite(volume)) throw new Error('模型的几何测量结果无效。');
  return {
    solids: shape.count('Solid'),
    faces: shape.count('Face'),
    edges: shape.count('Edge'),
    area,
    volume,
    min: bounds.min,
    max: bounds.max,
    dims
  };
}

function compare(before, after, target) {
  const warnings = [];
  const span = Math.max(1, ...before.dims.map(Math.abs));
  const tolerance = Math.max(0.0001, span * 0.00001);
  for (let index = 0; index < 3; index++) {
    if (Math.abs(before.min[index] - after.min[index]) > tolerance || Math.abs(before.max[index] - after.max[index]) > tolerance) {
      throw new Error('导出后尺寸或位置变化超出检查范围，已停止输出。');
    }
  }
  if (before.area > 0.000001 && Math.abs(before.area - after.area) > Math.max(0.001, before.area * 0.0001)) {
    throw new Error('导出后表面积变化超出检查范围，已停止输出。');
  }
  if (before.solids > 0 && after.solids > 0 && Math.abs(before.volume - after.volume) > Math.max(0.001, before.volume * 0.0001)) {
    throw new Error('导出后体积变化超出检查范围，已停止输出。');
  }
  if (before.solids !== after.solids) {
    warnings.push(target === 'iges' && after.solids === 0
      ? 'IGES 导出后为曲面，未保留实体结构'
      : '导出前后实体数量发生变化');
  }
  if (before.faces !== after.faces) warnings.push('导出前后曲面数量发生变化');
  if (before.solids === 0 && after.solids === 0) warnings.push('源模型没有可识别的实体');
  return warnings;
}

self.onmessage = async (event) => {
  const { id, extension, target, unit, data, cadWasmGzip } = event.data;
  let occ;
  try {
    if (!cadTypes.has(extension)) throw new Error('CAD 输出只接受 STEP、IGES 或 BREP 输入，不能从三角网格恢复精确实体。');
    if (category(extension) === target) throw new Error('输入与输出格式相同，请直接使用原文件。');
    self.postMessage({ id, stage: '加载 CAD 引擎' });
    const module = await getEngine(cadWasmGzip);
    occ = new OccSession(module);
    self.postMessage({ id, stage: '读取 CAD 模型' });
    const shape = readShape(occ, extension, new Uint8Array(data), unit);
    const before = stats(shape);
    if (!before.faces && !before.edges) throw new Error('模型中没有可转换的曲面或边线。');
    self.postMessage({ id, stage: '写出并检查' });
    const output = target === 'step' ? occ.writeStep(shape, { unit: 'mm' }) :
      target === 'iges' ? occ.writeIges(shape) :
      target === 'brep' ? occ.writeBrep(shape) : null;
    if (!output || !output.length) throw new Error('CAD 文件生成失败。');
    const reloaded = readShape(occ, target, output, 'mm');
    const after = stats(reloaded);
    const warnings = compare(before, after, target);
    const summary = {
      input: category(extension).toUpperCase(),
      output: target.toUpperCase(),
      before, after, warnings,
      limitations: '仅检查几何的基本指标；名称、颜色、装配层级和参数历史不保留。请在目标 CAD 软件中核对。'
    };
    const result = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
    self.postMessage({ id, result, cadSummary: summary }, [result]);
  } catch (error) {
    self.postMessage({ id, error: error && error.message ? error.message : 'CAD 文件读取或转换失败。' });
  } finally {
    if (occ) {
      try { occ.dispose(); } catch (_) {}
    }
  }
};

