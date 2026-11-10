// Small UTF-8 adapter for mini-program runtimes without TextEncoder/TextDecoder.
function codePoint(text, index) {
  const first = text.charCodeAt(index);
  if (first >= 0xd800 && first <= 0xdbff && index + 1 < text.length) {
    const second = text.charCodeAt(index + 1);
    if (second >= 0xdc00 && second <= 0xdfff) return [0x10000 + ((first - 0xd800) << 10) + second - 0xdc00, 2];
  }
  return [first >= 0xd800 && first <= 0xdfff ? 0xfffd : first, 1];
}

export function encodeUtf8(text) {
  let length = 0;
  for (let i = 0; i < text.length;) {
    const [code, width] = codePoint(text, i);
    length += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    i += width;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let i = 0; i < text.length;) {
    const [code, width] = codePoint(text, i);
    if (code < 0x80) bytes[offset++] = code;
    else if (code < 0x800) { bytes[offset++] = 0xc0 | (code >> 6); bytes[offset++] = 0x80 | (code & 63); }
    else if (code < 0x10000) { bytes[offset++] = 0xe0 | (code >> 12); bytes[offset++] = 0x80 | ((code >> 6) & 63); bytes[offset++] = 0x80 | (code & 63); }
    else { bytes[offset++] = 0xf0 | (code >> 18); bytes[offset++] = 0x80 | ((code >> 12) & 63); bytes[offset++] = 0x80 | ((code >> 6) & 63); bytes[offset++] = 0x80 | (code & 63); }
    i += width;
  }
  return bytes;
}

export function decodeUtf8(bytes) {
  const chunks = [];
  let chars = [];
  const append = (value) => {
    chars.push(value);
    if (chars.length >= 4096) { chunks.push(String.fromCharCode.apply(null, chars)); chars = []; }
  };
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i];
    let length = first < 0x80 ? 1 : first >= 0xc2 && first <= 0xdf ? 2 : first >= 0xe0 && first <= 0xef ? 3 : first >= 0xf0 && first <= 0xf4 ? 4 : 0;
    let value = length === 1 ? first : length === 2 ? first & 31 : length === 3 ? first & 15 : first & 7;
    let valid = length > 0 && i + length <= bytes.length;
    for (let n = 1; valid && n < length; n++) {
      if ((bytes[i + n] & 0xc0) !== 0x80) valid = false;
      else value = (value << 6) | (bytes[i + n] & 63);
    }
    if (valid && ((length === 3 && value < 0x800) || (length === 4 && value < 0x10000) || (value >= 0xd800 && value <= 0xdfff) || value > 0x10ffff)) valid = false;
    if (!valid) { append(0xfffd); i++; continue; }
    if (value <= 0xffff) append(value);
    else { value -= 0x10000; append(0xd800 | (value >> 10)); append(0xdc00 | (value & 1023)); }
    i += length;
  }
  if (chars.length) chunks.push(String.fromCharCode.apply(null, chars));
  return chunks.join('');
}
