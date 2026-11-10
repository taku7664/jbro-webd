// png.mjs — 의존성 없는 PNG 읽기·쓰기. 내보내기 후처리(트림·시트 배치)용.
// 읽기: 비트 깊이 8, 비월(non-interlaced), 색 형식 2(RGB)·6(RGBA)·0(회색)·4(회색+알파). 브라우저 스크린샷은 이 범위 안에 있다.
// 쓰기: 항상 RGBA 8비트. 줄마다 다섯 필터 중 절댓값 합이 가장 작은 것을 고른다(libpng 기본 휴리스틱과 같은 방식).
// 이미지 표현: { width, height, data: Uint8Array(width*height*4) } — 미리 곱하지 않은(straight) 알파.

import { deflateSync, inflateSync } from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function createImage(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0) throw new RangeError(`이미지 크기가 잘못됨: ${width}×${height}`);
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function decodePng(buf) {
  buf = Buffer.from(buf);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error("PNG 파일이 아닙니다.");
  let off = 8, ihdr = null; const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("latin1", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") ihdr = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error("PNG에 IHDR이 없습니다.");
  const ch = CHANNELS[ihdr.color];
  if (ihdr.depth !== 8 || !ch || ihdr.interlace) throw new Error(`지원하지 않는 PNG 형식(깊이 ${ihdr.depth}, 색 ${ihdr.color}, 비월 ${ihdr.interlace})`);
  const { width: w, height: h } = ihdr;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = new Uint8Array(stride * h);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      else if (f !== 0) throw new Error(`알 수 없는 PNG 필터 ${f}`);
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  const img = createImage(w, h);
  for (let i = 0, j = 0; i < w * h; i++, j += ch) {
    const o = i * 4;
    if (ch === 4) { img.data[o] = px[j]; img.data[o + 1] = px[j + 1]; img.data[o + 2] = px[j + 2]; img.data[o + 3] = px[j + 3]; }
    else if (ch === 3) { img.data[o] = px[j]; img.data[o + 1] = px[j + 1]; img.data[o + 2] = px[j + 2]; img.data[o + 3] = 255; }
    else if (ch === 2) { img.data[o] = img.data[o + 1] = img.data[o + 2] = px[j]; img.data[o + 3] = px[j + 1]; }
    else { img.data[o] = img.data[o + 1] = img.data[o + 2] = px[j]; img.data[o + 3] = 255; }
  }
  return img;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0); out.write(type, 4, "latin1"); body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

export function encodePng(img) {
  const { width: w, height: h, data } = img;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const cand = Array.from({ length: 5 }, () => new Uint8Array(stride));
  for (let y = 0; y < h; y++) {
    const cur = data.subarray(y * stride, (y + 1) * stride);
    const prev = y ? data.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f]; let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
        const p = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (cur[i] - p) & 0xff; out[i] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best;
    raw.set(cand[best], y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
