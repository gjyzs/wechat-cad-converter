const config = require('../../config.js');

Page({
  data: { webUrl: '' },
  onLoad() {
    const candidate = typeof config.webUrl === 'string' ? config.webUrl.trim() : '';
    if (/^https:\/\/[^/\s]+(?:\/|$)/i.test(candidate)) this.setData({ webUrl: candidate });
  },
  onWebViewError() {
    wx.showModal({
      title: '页面暂时无法打开',
      content: '请检查网络和小程序业务域名配置。',
      showCancel: false
    });
  }
});
