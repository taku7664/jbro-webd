// pack.mjs — 캡처한 프레임 다듬기와 시트 배치. 순수 함수(이미지 = { width, height, data RGBA }).

import { createImage } from "./png.mjs";

/** 알파가 threshold보다 큰 픽셀을 모두 감싸는 사각형. 다 투명하면 null */
export function alphaBounds(img, threshold = 0) {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > threshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** 사각형으로 잘라 낸 새 이미지. 범위를 벗어난 부분은 투명 */
export function crop(img, r) {
  const out = createImage(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const sy = r.y + y; if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < r.w; x++) {
      const sx = r.x + x; if (sx < 0 || sx >= img.width) continue;
      const s = (sy * img.width + sx) * 4, d = (y * r.w + x) * 4;
      out.data[d] = img.data[s]; out.data[d + 1] = img.data[s + 1]; out.data[d + 2] = img.data[s + 2]; out.data[d + 3] = img.data[s + 3];
    }
  }
  return out;
}

/** src를 dst의 (x, y)에 그대로 복사(합성 아님) */
export function blit(dst, src, x, y) {
  for (let row = 0; row < src.height; row++) {
    const dy = y + row; if (dy < 0 || dy >= dst.height) continue;
    for (let col = 0; col < src.width; col++) {
      const dx = x + col; if (dx < 0 || dx >= dst.width) continue;
      const s = (row * src.width + col) * 4, d = (dy * dst.width + dx) * 4;
      dst.data[d] = src.data[s]; dst.data[d + 1] = src.data[s + 1]; dst.data[d + 2] = src.data[s + 2]; dst.data[d + 3] = src.data[s + 3];
    }
  }
}

/** 이미지 가장자리 픽셀을 바깥으로 n픽셀 늘린다(시트에서 확대·필터링할 때 옆 칸 색이 번지는 것 방지) */
export function extrude(img, n) {
  if (!n) return img;
  const out = createImage(img.width + n * 2, img.height + n * 2);
  for (let y = 0; y < out.height; y++) {
    const sy = Math.min(img.height - 1, Math.max(0, y - n));
    for (let x = 0; x < out.width; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, x - n));
      const s = (sy * img.width + sx) * 4, d = (y * out.width + x) * 4;
      out.data[d] = img.data[s]; out.data[d + 1] = img.data[s + 1]; out.data[d + 2] = img.data[s + 2]; out.data[d + 3] = img.data[s + 3];
    }
  }
  return out;
}

/**
 * 프레임들을 한 장에 격자로 배치한다. 칸 크기는 가장 큰 프레임 기준(엔진이 격자로 자르기 쉽게).
 * @param {{ image }[]} frames
 * @param {{ type?: "rows"|"horizontal"|"vertical", columns?: number|"auto", padding?: number, extrude?: number }} o
 * @returns {{ image, cells: { x, y, w, h }[], grid: { columns, rows, cellW, cellH } }}  cells는 프레임이 놓인 자리(돌출 제외)
 */
export function packSheet(frames, { type = "rows", columns = "auto", padding = 0, extrude: ex = 0 } = {}) {
  if (!frames.length) throw new Error("배치할 프레임이 없습니다.");
  const n = frames.length;
  const cols = type === "horizontal" ? n : type === "vertical" ? 1
    : columns === "auto" || !columns ? Math.ceil(Math.sqrt(n)) : Math.max(1, Math.min(n, Math.floor(columns)));
  const rows = Math.ceil(n / cols);
  const cellW = Math.max(...frames.map((f) => f.image.width)), cellH = Math.max(...frames.map((f) => f.image.height));
  const stepX = cellW + ex * 2 + padding, stepY = cellH + ex * 2 + padding;
  const sheet = createImage(cols * stepX - padding, rows * stepY - padding);
  const cells = frames.map((f, i) => {
    const cx = (i % cols) * stepX, cy = Math.floor(i / cols) * stepY;
    blit(sheet, extrude(f.image, ex), cx, cy);
    return { x: cx + ex, y: cy + ex, w: f.image.width, h: f.image.height };
  });
  return { image: sheet, cells, grid: { columns: cols, rows, cellW, cellH } };
}
