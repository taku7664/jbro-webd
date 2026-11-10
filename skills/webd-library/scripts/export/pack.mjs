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

/**
 * MaxRects(Best Short Side Fit) 배치. 사각형들을 maxW×maxH 판에 빈틈을 채우며 놓고, 다 안 들어가면 다음 판으로 넘긴다.
 * 회전하지 않는다(엔진에서 UI를 돌려 그리는 일이 드물고, 9-slice 인셋이 꼬이지 않게).
 * @param {{ w, h }[]} sizes  각 칸 크기(간격·돌출 포함)
 * @param {{ maxW: number, maxH: number }} o
 * @returns {{ w, h, items: { i, x, y }[] }[]}  판마다 실제로 쓴 너비·높이와 놓인 자리
 */
export function maxRects(sizes, { maxW, maxH }) {
  sizes.forEach((s, i) => {
    if (s.w > maxW || s.h > maxH) { const e = new Error(`${i + 1}번째 칸(${s.w}×${s.h})이 최대 크기 ${maxW}×${maxH}보다 큽니다.`); e.status = 422; throw e; }
  });
  // 큰 것부터: 긴 변 → 넓이 순. 같으면 원래 순서
  let rest = sizes.map((s, i) => ({ ...s, i })).sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || a.i - b.i);
  const pages = [];
  while (rest.length) {
    let free = [{ x: 0, y: 0, w: maxW, h: maxH }];
    const placed = [], left = [];
    for (const r of rest) {
      let best = null;
      for (const f of free) {
        if (r.w > f.w || r.h > f.h) continue;
        const shortSide = Math.min(f.w - r.w, f.h - r.h), longSide = Math.max(f.w - r.w, f.h - r.h);
        if (!best || shortSide < best.s || (shortSide === best.s && longSide < best.l) || (shortSide === best.s && longSide === best.l && (f.y < best.y || (f.y === best.y && f.x < best.x))))
          best = { x: f.x, y: f.y, s: shortSide, l: longSide };
      }
      if (!best) { left.push(r); continue; }
      const p = { x: best.x, y: best.y, w: r.w, h: r.h };
      placed.push({ i: r.i, x: p.x, y: p.y, w: r.w, h: r.h });
      free = splitFree(free, p);
    }
    if (!placed.length) throw new Error("배치하지 못했습니다.");   // 위에서 크기를 확인해 생기지 않음
    pages.push({ w: Math.max(...placed.map((p) => p.x + p.w)), h: Math.max(...placed.map((p) => p.y + p.h)), items: placed.map(({ i, x, y }) => ({ i, x, y })) });
    rest = left;
  }
  return pages;
}

function splitFree(free, p) {
  const out = [];
  for (const f of free) {
    if (p.x >= f.x + f.w || p.x + p.w <= f.x || p.y >= f.y + f.h || p.y + p.h <= f.y) { out.push(f); continue; }
    if (p.x > f.x) out.push({ x: f.x, y: f.y, w: p.x - f.x, h: f.h });
    if (p.x + p.w < f.x + f.w) out.push({ x: p.x + p.w, y: f.y, w: f.x + f.w - (p.x + p.w), h: f.h });
    if (p.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, h: p.y - f.y });
    if (p.y + p.h < f.y + f.h) out.push({ x: f.x, y: p.y + p.h, w: f.w, h: f.y + f.h - (p.y + p.h) });
  }
  // 다른 빈 사각형 안에 들어가는 것은 버림
  return out.filter((a, i) => !out.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
}

/** n 이상인 가장 작은 2의 거듭제곱 */
export function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

/**
 * 한 판에 다 들어가는 가장 작은 판을 찾는다(넓이가 작은 순, 같으면 정사각형에 가까운 순).
 * 후보 변은 2의 거듭제곱과 그 1.5배(pot면 2의 거듭제곱만). 최대 크기에도 안 들어가면 최대 크기로 여러 판.
 * @param {{ w, h }[]} sizes
 * @param {{ max: number, pot?: boolean, pad?: number }} o  pad: 칸 크기에 이미 더한 간격(판 크기 비교에서 뺌)
 */
export function packBest(sizes, { max, pot = false, pad = 0 }) {
  const area = sizes.reduce((a, s) => a + s.w * s.h, 0);
  const minW = Math.max(...sizes.map((s) => s.w)) - pad, minH = Math.max(...sizes.map((s) => s.h)) - pad;
  const sides = [];
  for (let p = 16; p <= max; p *= 2) { sides.push(p); if (!pot && p * 1.5 <= max) sides.push(p * 1.5); }
  if (!sides.includes(max)) sides.push(max);
  const pairs = [];
  for (const w of sides) for (const h of sides) if (w >= minW && h >= minH && w * h >= area * 0.9) pairs.push({ w, h });
  pairs.sort((a, b) => a.w * a.h - b.w * b.h || Math.abs(a.w - a.h) - Math.abs(b.w - b.h) || b.w - a.w);
  for (const { w, h } of pairs) {
    const pages = maxRects(sizes, { maxW: w + pad, maxH: h + pad });
    if (pages.length === 1) return pages;
  }
  return maxRects(sizes, { maxW: max + pad, maxH: max + pad });
}
