const { convertBatch } = require('../../lib/batch.js');
const allowed = new Set(['step', 'stp', 'iges', 'igs', 'brep', 'stl', 'obj', 'ply']);
const formatKeys = new Set(['stl', 'obj', 'ply', 'glb', 'step', 'iges', 'brep']);
const sizeLabel = (bytes) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

Page({
  data: {
    files: [],
    formats: [{ key: 'stl', label: 'STL' }, { key: 'obj', label: 'OBJ' }, { key: 'ply', label: 'PLY' }, { key: 'glb', label: 'GLB' }, { key: 'step', label: 'STEP' }, { key: 'iges', label: 'IGES' }, { key: 'brep', label: 'BREP' }],
    unitLabels: ['毫米 mm', '厘米 cm', '米 m', '英寸 inch'],
    unitValues: ['mm', 'cm', 'm', 'inch'],
    unitIndex: 0,
    target: 'stl',
    busy: false,
    processed: 0,
    succeeded: 0,
    failed: 0,
    resultPath: '',
    status: '请选择微信聊天中的模型文件。'
  },

  chooseFiles() {
    if (this.data.busy) return;
    const remaining = 20 - this.data.files.length;
    if (remaining <= 0) return wx.showToast({ title: '最多选择 20 个文件', icon: 'none' });
    wx.chooseMessageFile({
      count: remaining,
      type: 'file',
      success: ({ tempFiles = [] }) => {
        const accepted = tempFiles.filter((file) => allowed.has(String(file.name || '').split('.').pop().toLowerCase()));
        const files = this.data.files.concat(accepted.map((file, index) => ({
          id: `${Date.now()}-${index}-${this.data.files.length}`,
          name: file.name,
          path: file.path,
          size: Number(file.size) || 0,
          sizeText: sizeLabel(Number(file.size) || 0)
        })));
        const rejected = tempFiles.length - accepted.length;
        this.setData({ files, resultPath: '', succeeded: 0, failed: 0, processed: 0,
          status: rejected ? `已跳过 ${rejected} 个不支持的文件。` : `已选择 ${files.length} 个文件。` });
      },
      fail: () => this.setData({ status: '未选择文件。请从微信聊天中选择模型文件。' })
    });
  },

  removeFile(event) {
    if (this.data.busy) return;
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.files.length) return;
    const files = this.data.files.filter((_, position) => position !== index);
    this.setData({ files, resultPath: '', processed: 0, succeeded: 0, failed: 0, status: files.length ? `已选择 ${files.length} 个文件。` : '请选择微信聊天中的模型文件。' });
  },

  clearFiles() {
    if (this.data.busy) return;
    this.setData({ files: [], resultPath: '', processed: 0, succeeded: 0, failed: 0, status: '请选择微信聊天中的模型文件。' });
  },

  chooseFormat(event) {
    if (this.data.busy) return;
    const target = event.currentTarget.dataset.format;
    if (!formatKeys.has(target)) return;
    this.setData({ target, resultPath: '', processed: 0, succeeded: 0, failed: 0, status: '格式已更新，可以开始转换。' });
  },

  chooseUnit(event) {
    if (this.data.busy) return;
    const unitIndex = Number(event.detail.value);
    if (!Number.isInteger(unitIndex) || unitIndex < 0 || unitIndex >= this.data.unitValues.length) return;
    this.setData({ unitIndex, resultPath: '', processed: 0, succeeded: 0, failed: 0, status: '单位已更新，可以开始转换。' });
  },

  async startConversion() {
    if (this.data.busy || !this.data.files.length) return;
    const filesystem = wx.getFileSystemManager();
    const outputPath = `${wx.env.USER_DATA_PATH}/3d-converted.zip`;
    this.setData({ busy: true, resultPath: '', processed: 0, succeeded: 0, failed: 0, status: '正在设备上转换，请稍候。' });
    try {
      const result = await convertBatch({
        files: this.data.files,
        target: this.data.target,
        unit: this.data.unitValues[this.data.unitIndex],
        readFile: (filePath) => new Promise((resolve, reject) => filesystem.readFile({ filePath, success: ({ data }) => resolve(data), fail: reject })),
        writeFile: (data) => new Promise((resolve, reject) => filesystem.writeFile({ filePath: outputPath, data, success: () => resolve(outputPath), fail: reject })),
        onProgress: ({ processed, total }) => this.setData({ processed, status: `正在转换 ${processed} / ${total}` })
      });
      const details = [result.failed ? `${result.failed} 个未成功` : '', result.needsReview ? `${result.needsReview} 个需核对` : ''].filter(Boolean).join('，');
      this.setData({ resultPath: result.path, succeeded: result.succeeded, failed: result.failed,
        status: `完成 ${result.succeeded} 个文件${details ? `，${details}，详情见压缩包。` : '，可以转发结果。'}` });
    } catch (error) {
      this.setData({ resultPath: '', status: error && error.message ? error.message : '转换失败，请检查文件后重试。' });
    } finally {
      this.setData({ busy: false });
    }
  },

  shareResult() {
    if (!this.data.resultPath || this.data.busy) return;
    if (typeof wx.shareFileMessage !== 'function') {
      return wx.showModal({ title: '暂无法转发', content: '当前微信版本不支持文件转发，请升级微信后重试。', showCancel: false });
    }
    wx.shareFileMessage({
      filePath: this.data.resultPath,
      fileName: '三维转换结果.zip',
      fail: () => wx.showToast({ title: '未发送，结果仍保存在小程序内', icon: 'none' })
    });
  }
});
