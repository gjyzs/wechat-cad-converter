import JSZip from 'jszip';

const $ = (id) => document.getElementById(id);
const fileInput = $('file-input');
const dropZone = $('drop-zone');
const addFiles = $('add-files');
const clearFiles = $('clear-files');
const startButton = $('start-button');
const downloadButton = $('download-button');
const targetSelect = $('target-format');
const formatRadios = Array.from(document.querySelectorAll('input[name="output-format"]'));
const flowSteps = Array.from(document.querySelectorAll('.flow-step'));
const startLabel = $('start-label');
const downloadLabel = $('download-label');
const unitSelect = $('input-unit');
const list = $('file-list');
const listEmpty = $('list-empty');
const queueCount = $('queue-count');
const feedback = $('feedback');
const progress = $('progress');
const progressText = $('progress-text');
const allowed = new Set(['step', 'stp', 'iges', 'igs', 'brep', 'stl', 'obj', 'ply']);
const cadExtensions = new Set(['step', 'stp', 'iges', 'igs', 'brep']);
const cadOutputs = new Set(['step', 'iges', 'brep']);
let files = [];
let busy = false;
let worker = null;
let pending = null;
let wasmSent = false;
let cadWorker = null;
let cadPending = null;
let cadWasmSent = false;
let nextId = 1;

function showMessage(text, isError = false) {
  feedback.textContent = text;
  feedback.classList.toggle('is-error', isError);
}

function extension(name) {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function invalidateResults() {
  for (const entry of files) {
    entry.state = 'waiting';
    entry.result = null;
    entry.error = '';
    entry.triangles = 0;
    entry.cadSummary = null;
    entry.warning = '';
    entry.outputName = '';
  }
  progress.value = 0;
  progressText.textContent = '准备就绪';
}

function setControls() {
  const converted = files.filter((entry) => entry.state === 'done').length;
  fileInput.disabled = busy;
  dropZone.disabled = busy;
  addFiles.disabled = busy;
  clearFiles.disabled = busy || files.length === 0;
  targetSelect.disabled = busy;
  formatRadios.forEach((radio) => { radio.disabled = busy; radio.checked = radio.value === targetSelect.value; });
  unitSelect.disabled = busy;
  $('format-helper').textContent = cadOutputs.has(targetSelect.value) ? '仅支持 CAD 输入；不保留装配名称、颜色和建模历史。IGES 可能转为曲面。' : '转换为三角网格，不保留可编辑 CAD 实体。';
  startButton.disabled = busy || files.length === 0;
  downloadButton.disabled = busy || converted === 0;
  startButton.classList.toggle('is-busy', busy);
  startButton.classList.toggle('after-results', converted > 0 && !busy);
  downloadButton.classList.toggle('ready', converted > 0 && !busy);
  startLabel.textContent = busy ? '处理中…' : (converted > 0 ? '重新转换' : '开始转换');
  downloadLabel.textContent = converted > 0 ? '下载结果 · ' + converted + ' 个' : '下载转换结果';
  const currentStep = converted > 0 ? 3 : (files.length ? 2 : 1);
  flowSteps.forEach((step) => {
    const index = Number(step.dataset.step);
    step.classList.toggle('active', index === currentStep);
    step.classList.toggle('complete', index < currentStep);
    if (index === currentStep) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
  });
  queueCount.textContent = files.length + ' 个文件';
}

function render() {
  list.replaceChildren();
  listEmpty.hidden = files.length !== 0;
  for (const entry of files) {
    const row = document.createElement('li');
    row.className = 'file-row';
    const badge = document.createElement('span');
    badge.className = 'file-badge';
    badge.textContent = (extension(entry.file.name) || 'FILE').toUpperCase().slice(0, 4);
    const info = document.createElement('div');
    info.className = 'file-info';
    const title = document.createElement('div');
    title.className = 'file-name';
    title.textContent = entry.file.name;
    title.title = entry.file.name;
    const sub = document.createElement('div');
    sub.className = 'file-meta';
    sub.textContent = formatSize(entry.file.size);
    info.append(title, sub);
    const status = document.createElement('div');
    status.className = 'file-status ' + entry.state + (entry.warning ? ' review' : '');
    status.textContent = entry.state === 'waiting' ? '等待转换' :
      entry.state === 'processing' ? (entry.stage || '正在转换') :
      entry.state === 'done' ? (entry.warning ? '完成 · 需核对' : '转换完成') : '转换失败';
    if (entry.error) {
      const detail = document.createElement('span');
      detail.className = 'status-detail';
      detail.textContent = entry.error;
      status.appendChild(detail);
    } else if (entry.state === 'done') {
      const detail = document.createElement('span');
      detail.className = 'status-detail';
      detail.textContent = entry.warning || (entry.cadSummary ? '已检查 · ' + entry.cadSummary.after.solids + ' 个实体 / ' + entry.cadSummary.after.faces + ' 个曲面' : entry.triangles.toLocaleString('zh-CN') + ' 个三角面');
      status.appendChild(detail);
    }
    const remove = document.createElement('button');
    remove.className = 'remove-file';
    remove.type = 'button';
    remove.disabled = busy;
    remove.textContent = '×';
    remove.title = '移除文件';
    remove.setAttribute('aria-label', '移除 ' + entry.file.name);
    remove.addEventListener('click', () => {
      files = files.filter((item) => item.id !== entry.id);
      invalidateResults();
      showMessage(files.length ? '文件列表已更新，可以重新开始转换。' : '选择文件后开始。');
      render();
    });
    row.append(badge, info, status, remove);
    list.appendChild(row);
  }
  setControls();
}

function addSelected(selected) {
  if (busy || !selected || !selected.length) return;
  const incoming = Array.from(selected);
  for (const file of incoming) {
    files.push({ id: nextId++, file, state: 'waiting', result: null, error: '', triangles: 0 });
  }
  invalidateResults();
  const unsupported = incoming.filter((file) => !allowed.has(extension(file.name))).length;
  showMessage(unsupported ? '已添加文件，其中 ' + unsupported + ' 个格式不受支持，转换时会标明。' : '已添加 ' + incoming.length + ' 个文件，可以开始转换。', unsupported > 0);
  render();
}

function ensureWorker() {
  if (worker) return;
  const source = $('converter-worker').textContent;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); throw error; }
  worker.onmessage = (event) => {
    const message = event.data;
    if (!pending || message.id !== pending.id) return;
    if (message.stage) {
      pending.entry.stage = message.stage + '中';
      render();
      return;
    }
    const current = pending;
    pending = null;
    if (message.error) current.reject(new Error(message.error));
    else current.resolve(message);
  };
  worker.onerror = () => {
    if (pending) {
      const current = pending;
      pending = null;
      current.reject(new Error('转换组件意外中断，请刷新网页后重试。'));
    }
    URL.revokeObjectURL(url);
    worker.terminate();
    worker = null;
    wasmSent = false;
  };
}

function decodeEmbedded(id) {
  const encoded = $(id).textContent.trim();
  const raw = atob(encoded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function convert(entry, target, unit) {
  return new Promise(async (resolve, reject) => {
    try {
      ensureWorker();
      const data = await entry.file.arrayBuffer();
      const ext = extension(entry.file.name);
      const message = { id: entry.id, extension: ext, target, unit, data };
      const transfer = [data];
      if (cadExtensions.has(ext) && !wasmSent) {
        message.wasmBuffer = decodeEmbedded('converter-wasm');
        transfer.push(message.wasmBuffer);
        wasmSent = true;
      }
      pending = { id: entry.id, entry, resolve, reject };
      worker.postMessage(message, transfer);
    } catch (error) {
      pending = null;
      reject(error);
    }
  });
}

function ensureCadWorker() {
  if (cadWorker) return;
  const source = $('cad-worker').textContent;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try { cadWorker = new Worker(url, { name: 'cad-engine' }); }
  catch (error) { URL.revokeObjectURL(url); throw error; }
  cadWorker.onmessage = (event) => {
    const message = event.data;
    if (!cadPending || message.id !== cadPending.id) return;
    if (message.stage) {
      cadPending.entry.stage = message.stage + '中';
      render();
      return;
    }
    const current = cadPending;
    cadPending = null;
    if (message.error) current.reject(new Error(message.error));
    else current.resolve(message);
  };
  cadWorker.onerror = () => {
    if (cadPending) {
      const current = cadPending;
      cadPending = null;
      current.reject(new Error('CAD 转换组件意外中断，请刷新后重试。'));
    }
    URL.revokeObjectURL(url);
    cadWorker.terminate();
    cadWorker = null;
    cadWasmSent = false;
  };
}

async function convertCad(entry, target, unit) {
  const ext = extension(entry.file.name);
  if (!cadExtensions.has(ext)) {
    throw new Error('CAD 输出只接受 STEP、IGES 或 BREP 输入，不能从三角网格恢复精确实体。');
  }
  const group = ext === 'stp' ? 'step' : ext === 'igs' ? 'iges' : ext;
  if (group === target) throw new Error('输入与输出格式相同，请直接使用原文件。');
  ensureCadWorker();
  const data = await entry.file.arrayBuffer();
  const message = { id: entry.id, extension: ext, target, unit, data };
  const transfer = [data];
  if (!cadWasmSent) {
    message.cadWasmGzip = decodeEmbedded('cad-wasm-gzip');
    transfer.push(message.cadWasmGzip);
  }
  return new Promise((resolve, reject) => {
    try {
      cadPending = { id: entry.id, entry, resolve, reject };
      cadWorker.postMessage(message, transfer);
      cadWasmSent = true;
    } catch (error) {
      cadPending = null;
      reject(error);
    }
  });
}

function cadReport(entries) {
  const formatNumber = (number) => Number(number.toPrecision(8)).toString();
  const lines = [
    'CAD 转换基本检查',
    '说明：输出已重新读取，比较了范围、表面积、体积和实体数量；这不能替代目标 CAD 软件中的完整验收。',
    '注意：名称、颜色、装配层级和参数历史不保留。IGES 可能只保留曲面。',
    ''
  ];
  for (const entry of entries) {
    const { before, after, warnings, input, output } = entry.cadSummary;
    lines.push('文件：' + entry.file.name + ' → ' + entry.outputName);
    lines.push('格式：' + input + ' → ' + output);
    lines.push('包围尺寸（毫米）：' + before.dims.map(formatNumber).join(' × ') + ' → ' + after.dims.map(formatNumber).join(' × '));
    lines.push('实体数量：' + before.solids + ' → ' + after.solids);
    lines.push('曲面数量：' + before.faces + ' → ' + after.faces);
    lines.push('表面积（平方毫米）：' + formatNumber(before.area) + ' → ' + formatNumber(after.area));
    lines.push('体积（立方毫米）：' + formatNumber(before.volume) + ' → ' + formatNumber(after.volume));
    lines.push('提示：' + (warnings.length ? warnings.join('；') : '基本指标未发现超限变化，仍需在目标软件中核对。'));
    lines.push('');
  }
  return lines.join('\r\n');
}


function allocateNames(target) {
  const used = new Set();
  for (const entry of files) {
    let stem = entry.file.name.replace(/\.[^.]*$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '');
    if (!stem) stem = 'model';
    let name = stem + '.' + target;
    let i = 2;
    while (used.has(name.toLocaleLowerCase())) name = stem + ' (' + i++ + ').' + target;
    used.add(name.toLocaleLowerCase());
    entry.outputName = name;
  }
}

async function startConversion() {
  if (busy || !files.length) return;
  invalidateResults();
  const target = targetSelect.value;
  const unit = unitSelect.value;
  allocateNames(target);
  busy = true;
  render();
  let finished = 0;
  for (const entry of files) {
    entry.state = 'processing';
    entry.stage = '准备中';
    progressText.textContent = '正在处理 ' + (finished + 1) + ' / ' + files.length;
    showMessage('正在转换，请保持网页打开。');
    render();
    try {
      if (!allowed.has(extension(entry.file.name))) throw new Error('格式不受支持');
      if (!entry.file.size) throw new Error('文件为空');
      const result = cadOutputs.has(target) ? await convertCad(entry, target, unit) : await convert(entry, target, unit);
      entry.result = result.result;
      entry.triangles = result.triangles || 0;
      entry.cadSummary = result.cadSummary || null;
      entry.warning = result.cadSummary ? result.cadSummary.warnings.join('；') : '';
      entry.state = 'done';
    } catch (error) {
      entry.state = 'failed';
      entry.error = error && error.message ? error.message : '转换失败';
    }
    finished++;
    progress.value = finished / files.length * 100;
    render();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  busy = false;
  const succeeded = files.filter((entry) => entry.state === 'done').length;
  const failed = files.length - succeeded;
  const needsReview = files.filter((entry) => entry.state === 'done' && entry.warning).length;
  progressText.textContent = '处理完成 ' + files.length + ' / ' + files.length;
  showMessage(succeeded ? '完成 ' + succeeded + ' 个文件' + (failed ? '，' + failed + ' 个未能转换' : '') + (needsReview ? '，' + needsReview + ' 个需核对。' : '，可以下载结果。') : '没有文件转换成功，请检查文件格式和内容。', succeeded === 0);
  render();
}

async function downloadZip() {
  if (busy) return;
  const completed = files.filter((entry) => entry.state === 'done');
  if (!completed.length) return;
  busy = true;
  render();
  try {
    showMessage('正在打包，请稍候。');
    const zip = new JSZip();
    completed.forEach((entry) => zip.file(entry.outputName, entry.result));
    const checkedCad = completed.filter((entry) => entry.cadSummary);
    if (checkedCad.length) zip.file('CAD转换检查.txt', cadReport(checkedCad));
    const failed = files.filter((entry) => entry.state === 'failed');
    if (failed.length) {
      zip.file('转换失败说明.txt', '以下文件未转换成功：\r\n\r\n' + failed.map((entry) => entry.file.name + '：' + entry.error).join('\r\n'));
    }
    const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } }, (state) => {
      progressText.textContent = '正在打包 ' + Math.round(state.percent) + '%';
    });
    const url = URL.createObjectURL(archive);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '三维模型转换结果.zip';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    progressText.textContent = '打包完成';
    showMessage('下载已开始；如果浏览器询问保存位置，请选择保存。');
  } catch (error) {
    showMessage('打包失败，请尝试减少单次文件数量。', true);
  } finally {
    busy = false;
    render();
  }
}

dropZone.addEventListener('click', () => fileInput.click());
addFiles.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  addSelected(fileInput.files);
  fileInput.value = '';
});
for (const type of ['dragenter', 'dragover']) dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  if (!busy) dropZone.classList.add('dragging');
});
for (const type of ['dragleave', 'drop']) dropZone.addEventListener(type, (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
});
dropZone.addEventListener('drop', (event) => addSelected(event.dataTransfer.files));
clearFiles.addEventListener('click', () => {
  files = [];
  invalidateResults();
  showMessage('选择文件后开始。');
  render();
});
formatRadios.forEach((radio) => radio.addEventListener('change', () => {
  if (!radio.checked || busy) return;
  targetSelect.value = radio.value;
  targetSelect.dispatchEvent(new Event('change'));
}));
for (const control of [targetSelect, unitSelect]) control.addEventListener('change', () => {
  if (files.some((entry) => entry.state !== 'waiting')) {
    invalidateResults();
    showMessage('转换设置已更改，请重新开始转换。');
    render();
  } else {
    formatRadios.forEach((radio) => { radio.checked = radio.value === targetSelect.value; });
    setControls();
  }
});
startButton.addEventListener('click', startConversion);
downloadButton.addEventListener('click', downloadZip);
render();


