import './native-compat.mjs';
import { OccSession } from 'occt.ts';
import makeModule from '../node_modules/occt.ts/dist/wasm/occtjs.js';
import split from '../experiments/native-cad-split/split-loader.cjs';

// The generated OCCT glue refers to RuntimeError on failure. The actual WASM
// instantiation below is delegated to WXWebAssembly, not this compatibility shim.
if (typeof globalThis.WebAssembly === 'undefined') globalThis.WebAssembly = { RuntimeError: Error };

const cadTypes = new Set(['step', 'stp', 'iges', 'igs', 'brep']);
const cadOutputs = new Set(['step', 'iges', 'brep']);
const meshOutputs = new Set(['stl', 'obj', 'ply', 'glb']);
const mmPerUnit = { mm: 1, cm: 10, m: 1000, inch: 25.4 };
const category = (type) => type === 'stp' ? 'step' : type === 'igs' ? 'iges' : type;
let enginePromise;

function getEngine() {
  if (!enginePromise) {
    const runtime = typeof wx === 'undefined' ? null : wx;
    const wasm = typeof WXWebAssembly === 'undefined' ? null : WXWebAssembly;
    enginePromise = split.loadSplitKernel({ factory: makeModule, runtime, wasm, parts: split.descriptors.cad })
      .then((module) => { module.setVerbose(false); return module; })
      .catch((error) => { enginePromise = null; throw error; });
  }
  return enginePromise;
}

function readShape(occ, extension, bytes, unit) {
  if (extension === 'step' || extension === 'stp') return occ.readStep(bytes, { unit: 'mm' });
  if (extension === 'iges' || extension === 'igs') return occ.readIges(bytes);
  if (extension === 'brep') {
    const shape = occ.readBrep(bytes);
    const factor = mmPerUnit[unit];
    return factor === 1 ? shape : occ.scale(shape, factor);
  }
  throw new Error('CAD 输入只支持 STEP、IGES 或 BREP。');
}

function stats(shape) {
  if (shape.isNull()) throw new Error('模型没有可转换的 CAD 几何。');
  if (!shape.isValid()) throw new Error('模型几何未通过有效性检查。');
  const bounds = shape.bounds();
  const dims = bounds.max.map((value, index) => value - bounds.min[index]);
  if (!dims.every(Number.isFinite)) throw new Error('模型尺寸无效。');
  const area = Math.abs(shape.area());
  const volume = Math.abs(shape.volume());
  if (!Number.isFinite(area) || !Number.isFinite(volume)) throw new Error('模型几何测量失败。');
  return { solids: shape.count('Solid'), faces: shape.count('Face'), edges: shape.count('Edge'), area, volume, min: bounds.min, max: bounds.max, dims };
}

function compare(before, after, target) {
  const warnings = [];
  const span = Math.max(1, ...before.dims.map(Math.abs));
  const tolerance = Math.max(0.0001, span * 0.00001);
  for (let index = 0; index < 3; index++) {
    if (Math.abs(before.min[index] - after.min[index]) > tolerance || Math.abs(before.max[index] - after.max[index]) > tolerance) {
      throw new Error('导出后尺寸或位置变化超出检查范围。');
    }
  }
  if (before.area > 0.000001 && Math.abs(before.area - after.area) > Math.max(0.001, before.area * 0.0001)) throw new Error('导出后表面积变化超出检查范围。');
  if (before.solids > 0 && after.solids > 0 && Math.abs(before.volume - after.volume) > Math.max(0.001, before.volume * 0.0001)) throw new Error('导出后体积变化超出检查范围。');
  if (before.solids !== after.solids) warnings.push(target === 'iges' && after.solids === 0 ? 'IGES 导出后为曲面，未保留实体结构' : '导出前后实体数量发生变化');
  if (before.faces !== after.faces) warnings.push('导出前后曲面数量发生变化');
  if (before.solids === 0 && after.solids === 0) warnings.push('源模型没有可识别的实体');
  return warnings;
}

export async function convertCad({ data, extension, target, unit = 'mm', convertTriangles }) {
  const input = String(extension || '').toLowerCase();
  const output = String(target || '').toLowerCase();
  if (!cadTypes.has(input)) throw new Error('CAD 输出只接受 STEP、IGES 或 BREP 输入。');
  if (!cadOutputs.has(output) && !meshOutputs.has(output)) throw new Error('不支持该输出格式。');
  if (!(unit in mmPerUnit)) throw new Error('请选择有效的输入单位。');
  if (cadOutputs.has(output) && category(input) === output) throw new Error('输入与输出格式相同，请直接使用原文件。');
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (!bytes.length) throw new Error('模型文件为空。');
  const occ = new OccSession(await getEngine());
  try {
    const shape = readShape(occ, input, bytes, unit);
    const before = stats(shape);
    if (!before.faces && !before.edges) throw new Error('模型中没有可转换的曲面或边线。');
    if (meshOutputs.has(output)) {
      if (typeof convertTriangles !== 'function') throw new Error('网格转换组件未初始化。');
      const mesh = occ.tessellate(shape, { linearDeflection: 0.001, angularDeflection: 11.46, relative: true });
      return await convertTriangles({ positions: mesh.positions, indices: mesh.indices, target: output, unit: 'mm' });
    }
    const written = output === 'step' ? occ.writeStep(shape, { unit: 'mm' }) : output === 'iges' ? occ.writeIges(shape) : occ.writeBrep(shape);
    if (!written || !written.length) throw new Error('CAD 文件生成失败。');
    const after = stats(readShape(occ, output, written, 'mm'));
    const warnings = compare(before, after, output);
    return {
      result: written.buffer.slice(written.byteOffset, written.byteOffset + written.byteLength),
      cadSummary: { input: category(input).toUpperCase(), output: output.toUpperCase(), before, after, warnings }
    };
  } finally { occ.dispose(); }
}
