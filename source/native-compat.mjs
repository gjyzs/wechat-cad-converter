import { decodeUtf8, encodeUtf8 } from './native-utf8.mjs';
import { byteView, isArrayBuffer } from './native-bytes.mjs';

// The converter only parses local bytes; no network loader uses this signal.
if (typeof globalThis.AbortController === 'undefined') {
  globalThis.AbortController = class AbortController {
    constructor() { this.signal = { aborted: false, addEventListener() {}, removeEventListener() {} }; }
    abort() { this.signal.aborted = true; }
  };
}
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoder {
    encode(value = '') { return encodeUtf8(String(value)); }
  };
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoder {
    decode(value = new Uint8Array()) {
      return decodeUtf8(byteView(value));
    }
  };
}
// The GLB exporter uses these browser objects only for untextured binary data.
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = class Blob {
    constructor(parts = [], options = {}) {
      const pieces = parts.map((part) => {
        if (typeof part === 'string') return new TextEncoder().encode(part);
        if (isArrayBuffer(part) || ArrayBuffer.isView(part)) return byteView(part);
        if (part && part._bytes instanceof Uint8Array) return part._bytes;
        throw new Error('无法处理 GLB 数据。');
      });
      this.size = pieces.reduce((sum, piece) => sum + piece.byteLength, 0);
      this.type = options.type || '';
      this._bytes = new Uint8Array(this.size);
      let offset = 0;
      for (const piece of pieces) { this._bytes.set(piece, offset); offset += piece.byteLength; }
    }
    arrayBuffer() { return Promise.resolve(this._bytes.buffer.slice(0)); }
  };
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        if (this.onloadend) this.onloadend();
      }).catch((error) => {
        this.error = error;
        if (this.onerror) this.onerror(error);
      });
    }
  };
}
