const { convertMesh, convertTriangles, makeZip } = require('./mesh.js');
const { loadCadPart } = require('./load-cad-parts.js');
const meshInputs = new Set(['stl', 'obj', 'ply']);
const cadInputs = new Set(['step', 'stp', 'iges', 'igs', 'brep']);
const cadOutputs = new Set(['step', 'iges', 'brep']);
const outputFormats = new Set(['stl', 'obj', 'ply', 'glb', 'step', 'iges', 'brep']);
const maxFileBytes = 20 * 1024 * 1024;
const maxTotalBytes = 60 * 1024 * 1024;

function safeName(value) {
  const part = String(value || 'model').split(/[\\/]/).pop();
  return part.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 160) || 'model';
}

function extension(name) {
  const last = name.lastIndexOf('.');
  return last > 0 ? name.slice(last + 1).toLowerCase() : '';
}

function outputName(name, target, used) {
  const clean = safeName(name);
  const last = clean.lastIndexOf('.');
  const stem = (last > 0 ? clean.slice(0, last) : clean) || 'model';
  let candidate = `${stem}.${target}`;
  let number = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${stem} (${number++}).${target}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

async function convertBatch({ files, target, unit = 'mm', readFile, writeFile, onProgress = () => {} }) {
  if (!Array.isArray(files) || !files.length) throw new Error('请先选择文件。');
  if (files.length > 20) throw new Error('一次最多选择 20 个文件。');
  if (!outputFormats.has(target)) throw new Error('请选择支持的输出格式。');
  const totalBytes = files.reduce((total, file) => total + Math.max(0, Number(file.size) || 0), 0);
  if (totalBytes > maxTotalBytes) throw new Error('文件总大小不能超过 60 MB。');
  const entries = [];
  const failures = [];
  const reports = [];
  const used = new Set();
  let actualTotalBytes = 0;
  for (const [index, file] of files.entries()) {
    const name = safeName(file.name);
    try {
      const type = extension(name);
      if (!meshInputs.has(type) && !cadInputs.has(type)) throw new Error('当前原生原型暂不支持此格式。');
      if (meshInputs.has(type) && cadOutputs.has(target)) throw new Error('三角网格不能恢复为精确 CAD 实体。');
      if (Number(file.size) > maxFileBytes) throw new Error('单个文件不能超过 20 MB。');
      const data = await readFile(file.path);
      if (!data || !Number.isFinite(data.byteLength)) throw new Error('无法读取模型文件。');
      if (data.byteLength > maxFileBytes) throw new Error('单个文件不能超过 20 MB。');
      actualTotalBytes += data.byteLength;
      if (actualTotalBytes > maxTotalBytes) throw new Error('文件总大小不能超过 60 MB。');
      const result = cadInputs.has(type)
        ? await require('./cad.js').convertCad({ data, extension: type, target, unit, convertTriangles, loadPart: loadCadPart })
        : await convertMesh({ data, extension: type, target, unit });
      entries.push({ name: outputName(name, target, used), data: result.result });
      if (result.cadSummary) reports.push({ name, summary: result.cadSummary });
    } catch (error) {
      failures.push(`${name}：${error && error.message ? error.message : '转换失败'}`);
    }
    onProgress({ processed: index + 1, total: files.length, succeeded: entries.length, failed: failures.length });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!entries.length) throw new Error(`没有文件转换成功。${failures[0] ? ` ${failures[0]}` : ''}`);
  const succeeded = entries.length;
  if (reports.length) {
    const lines = ['CAD 转换检查', '仅检查基本几何指标；请在目标 CAD 软件中核对。', ''];
    for (const { name, summary } of reports) {
      lines.push(`${name}: ${summary.input} → ${summary.output}`,
        `实体数量：${summary.before.solids} → ${summary.after.solids}`,
        `曲面数量：${summary.before.faces} → ${summary.after.faces}`,
        `尺寸(mm)：${summary.after.dims.map((n) => Number(n.toFixed(5))).join(' × ')}`,
        `提示：${summary.warnings.length ? summary.warnings.join('；') : '基本几何检查通过'}`, '');
    }
    lines.push('名称、颜色、装配层级和建模历史不保证保留。');
    entries.push({ name: 'CAD转换检查.txt', data: lines.join('\n') + '\n' });
  }
  if (failures.length) entries.push({ name: '转换失败说明.txt', data: failures.join('\n') + '\n' });
  const archive = makeZip(entries);
  const outputPath = await writeFile(archive);
  return { path: outputPath, succeeded, failed: failures.length, needsReview: reports.filter(({ summary }) => summary.warnings.length).length };
}

module.exports = { convertBatch };
