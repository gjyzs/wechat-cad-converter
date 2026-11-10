// wx file APIs can return buffers created in a different JavaScript realm.
export function isArrayBuffer(value) {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

export function byteView(value) {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (isArrayBuffer(value)) return new Uint8Array(value);
  throw new Error('文件数据无效。');
}

export function arrayBuffer(value) {
  if (typeof value === 'string') {
    const encoded = new TextEncoder().encode(value);
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  }
  if (isArrayBuffer(value)) return value;
  const bytes = byteView(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
