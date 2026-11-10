const { parentPort } = require('node:worker_threads');
globalThis.self = globalThis;
globalThis.location = { href: 'blob:offline-unit-test' };
globalThis.importScripts = () => {}; globalThis.fetch = () => { throw new Error('Unexpected network request'); }; globalThis.XMLHttpRequest = class { constructor() { throw new Error('Unexpected XHR'); } };
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      if (this.onloadend) this.onloadend();
    }).catch((error) => {
      this.error = error;
      if (this.onerror) this.onerror(error);
    });
  }
};
globalThis.process = undefined;
self.postMessage = (message, transfer) => parentPort.postMessage(message, transfer);
require('../source/worker-bundle.js');
parentPort.on('message', (data) => self.onmessage({ data }));

