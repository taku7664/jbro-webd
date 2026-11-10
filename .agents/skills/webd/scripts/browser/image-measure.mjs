// Node와 브라우저가 같은 RGBA 버킷 및 대비 계산을 사용한다.
export function measurePixels({ data: d, width: cw, height: ch }, colors = 10, points = []) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const oklab = (r, gg, b) => {
    const R = lin(r), G = lin(gg), B = lin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const lum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
  const hex = (r, gg, b) => "#" + [r, gg, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // 1) 채널당 5비트로 묶어 센다 (32768칸). 알파가 낮은 픽셀은 뺀다
  //    solid: 가로로 3픽셀 이상 같은 칸인 픽셀만 따로 센다. 글자 가장자리의 서브픽셀 번짐
  //    (ClearType의 노랑·파랑·빨강 테두리)과 안티에일리어싱 중간색을 포인트 후보에서 빼기 위함
  const buckets = new Map(), solid = new Map(); let total = 0, solidTotal = 0;
  const keyAt = (i) => ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
  const add = (map, i) => { const k = keyAt(i); let e = map.get(k); if (!e) { e = { n: 0, r: 0, g: 0, b: 0 }; map.set(k, e); } e.n++; e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2]; };
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      if (d[i + 3] < 200) continue;
      add(buckets, i); total++;
      if (x > 0 && x < cw - 1) { const k = keyAt(i); if (keyAt(i - 4) === k && keyAt(i + 4) === k) { add(solid, i); solidTotal++; } }
    }
  }
  // 2) 큰 칸부터 OKLab 거리 0.035 안의 칸을 흡수
  const merge = (map) => {
    const list = [...map.values()].map((e) => ({ n: e.n, r: e.r / e.n, g: e.g / e.n, b: e.b / e.n })).sort((a, b) => b.n - a.n);
    const gs = [];
    for (const e of list) {
      const lab = oklab(e.r, e.g, e.b);
      const hit = gs.find((gp) => Math.hypot(gp.lab[0] - lab[0], gp.lab[1] - lab[1], gp.lab[2] - lab[2]) < 0.035);
      if (hit) { const n = hit.n + e.n; hit.r = (hit.r * hit.n + e.r * e.n) / n; hit.g = (hit.g * hit.n + e.g * e.n) / n; hit.b = (hit.b * hit.n + e.b * e.n) / n; hit.n = n; }
      else gs.push({ ...e, lab });
    }
    return gs.sort((a, b) => b.n - a.n);
  };
  if (!total) throw new Error("영역에 불투명한 픽셀이 없습니다.");
  const groups = merge(buckets);
  const solidGroups = merge(solid);
  const bg = groups[0];
  const Lbg = lum(bg.r, bg.g, bg.b);
  const ratio = (L) => (Math.max(L, Lbg) + 0.05) / (Math.min(L, Lbg) + 0.05);
  const out = groups.slice(0, colors).map((gp, i) => {
    const [L, a, b] = oklab(gp.r, gp.g, gp.b);
    const C = Math.hypot(a, b), H = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    return { hex: hex(gp.r, gp.g, gp.b), area: gp.n / total, oklch: { l: L, c: C, h: C < 0.02 ? null : H }, contrastToBg: i === 0 ? null : ratio(lum(gp.r, gp.g, gp.b)) };
  });
  // 역할 추정
  const roles = {};
  roles.background = out[0].hex;
  const text = out.slice(1).filter((x) => x.contrastToBg >= 4.5).sort((a, b) => b.area - a.area)[0];
  if (text) roles.text = text.hex;
  // 포인트는 면적이 작아(제목 글자·선택 표시) 상위 색 밖에 있기 쉬우므로 전체 묶음에서 찾는다
  const accentPool = solidGroups.slice(0, 400).map((gp) => { const [, a, b] = oklab(gp.r, gp.g, gp.b); const C = Math.hypot(a, b); return { gp, C, H: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, area: gp.n / Math.max(1, solidTotal) }; })
    .filter((x) => x.C >= 0.05 && x.area >= 0.0002 && ratio(lum(x.gp.r, x.gp.g, x.gp.b)) >= 1.3).sort((p, q) => q.C * Math.sqrt(q.area) - p.C * Math.sqrt(p.area));
  // 색상이 30° 이상 다른 후보 3개까지
  const picked = [];
  for (const x of accentPool) {
    if (picked.some((p) => Math.min(Math.abs(p.h - x.H), 360 - Math.abs(p.h - x.H)) < 30)) continue;
    picked.push({ hex: hex(x.gp.r, x.gp.g, x.gp.b), area: x.area, c: x.C, h: x.H, contrastToBg: ratio(lum(x.gp.r, x.gp.g, x.gp.b)) });
    if (picked.length === 3) break;
  }
  if (picked.length) { roles.accent = picked[0].hex; roles.accentCandidates = picked; }
  const surface = out.slice(1).filter((x) => x.contrastToBg < 1.6 && x.area >= 0.03)[0];
  if (surface) roles.surface = surface.hex;
  const samples = points.map(({ x, y, pixel }) => {
    if (!pixel) return { x, y, error: "이미지 밖" };
    const [r, g, b] = pixel;
    return { x, y, hex: hex(r, g, b), contrastToBg: ratio(lum(r, g, b)) };
  });
  return { colors: out, roles, samples, chromaticArea: accentPool.reduce((sum, candidate) => sum + candidate.area, 0), darkBackground: Lbg < 0.18 };
}

// CDP에서도 이 함수와 측정 함수를 그대로 전달할 수 있게 의존성을 인자로 받는다.
export async function analyzeImage({ src, colors, at = [], crop = null }, measure) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const width = img.naturalWidth, height = img.naturalHeight;
  const [x, y, w, h] = crop
    ? [Math.max(0, crop[0]), Math.max(0, crop[1]), Math.min(crop[2], width - crop[0]), Math.min(crop[3], height - crop[1])]
    : [0, 0, width, height];
  if (!(w > 0 && h > 0)) throw new Error("측정 영역이 이미지 밖입니다.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(img, 0, 0);
  const points = at.map(([x, y]) => ({
    x, y,
    pixel: x >= 0 && y >= 0 && x < width && y < height ? context.getImageData(x, y, 1, 1).data : null,
  }));
  return { width, height, crop: crop ? [x, y, w, h] : null, ...measure(context.getImageData(x, y, w, h), colors, points) };
}
