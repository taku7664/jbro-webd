#!/usr/bin/env node
// image-tokens.mjs — 레퍼런스 이미지(스크린샷)에서 색을 "재서" 뽑는다. 의존성 없음, Node 22+.
// direction.md 경로 B용. 눈으로 hex를 짐작하지 않고 실제 픽셀을 센다.
//
// 설치된 Chrome·Edge를 헤드리스로 띄워 캔버스로 픽셀을 읽는다(render-check와 같은 브라우저).
//   - 면적이 큰 색부터: 비슷한 색(OKLab 거리)끼리 묶고 면적 비율을 낸다
//   - 역할 추정: 가장 넓은 색 = 바탕, 바탕 대비가 큰 색 = 글자 후보, 바탕과 구분되는(대비 2 이상) 채도 높은 색 = 포인트 후보
//   - 각 색의 바탕 대비(WCAG)
//   - --at x,y 로 특정 지점 색을 정확히 읽음 (여러 번 가능)
// 간격·반경·글자 크기는 재지 않는다. 그 값은 이미지에서 추정치로만 적는다.
//
// 스크린샷의 브라우저 틀·스크롤바·겹친 알림은 --crop x,y,너비,높이로 빼고 잰다(--at 좌표는 원본 이미지 기준).
//
// 사용법: node image-tokens.mjs <이미지> [--colors 10] [--crop 0,0,1180,790] [--at 120,40] [--json]
// 종료 코드: 0 성공, 1 사용 오류·브라우저 없음

import { readFileSync, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { findBrowser, launch, connect } from "./render-check.mjs";

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

// 브라우저 안에서 실행 (문자열로 넘어감)
function analyze({ src, colors, at, crop }) {
  return new Promise((done, fail) => {
    const img = new Image();
    img.onerror = () => fail(new Error("이미지를 읽지 못함"));
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const [cx, cy, cw, ch] = crop ? [Math.max(0, crop[0]), Math.max(0, crop[1]), Math.min(crop[2], w - crop[0]), Math.min(crop[3], h - crop[1])] : [0, 0, w, h];
      if (!(cw > 0 && ch > 0)) { fail(new Error("--crop 영역이 이미지 밖")); return; }
      const d = g.getImageData(cx, cy, cw, ch).data;
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
      const groups = merge(buckets);
      const solidGroups = merge(solid);
      const bg = groups[0];
      const Lbg = lum(bg.r, bg.g, bg.b);
      const ratio = (L) => { const [x, y] = [L, Lbg].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
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
      const samples = at.map(([x, y]) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return { x, y, error: "이미지 밖" };
        const all = g.getImageData(x, y, 1, 1).data; const p = 0; const d = all; return { x, y, hex: hex(d[p], d[p + 1], d[p + 2]), contrastToBg: ratio(lum(d[p], d[p + 1], d[p + 2])) };
      });
      const chromaArea = accentPool.reduce((s, x) => s + x.area, 0);
      done({ width: w, height: h, crop: crop ? [cx, cy, cw, ch] : null, colors: out, roles, samples, chromaticArea: chromaArea, darkBackground: Lbg < 0.18 });
    };
    img.src = src;
  });
}

export async function imageTokens(file, { colors = 10, at = [], crop = null } = {}) {
  const path = resolve(file);
  if (!existsSync(path)) throw Object.assign(new Error(`파일이 없음: ${file}`), { code: 1 });
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) throw Object.assign(new Error(`지원하지 않는 형식: ${extname(path)} (png, jpg, webp, gif)`), { code: 1 });
  const exe = findBrowser();
  if (!exe) throw Object.assign(new Error("Chrome·Edge·Chromium을 찾지 못함. WEBD_BROWSER에 실행 파일 경로를 지정하세요."), { code: 1 });
  const src = `data:${mime};base64,${readFileSync(path).toString("base64")}`;
  const browser = await launch(exe);
  try {
    const cdp = await connect(browser.port);
    await cdp.send("Runtime.enable");
    const res = await cdp.evaluate(analyze, { src, colors, at, crop });
    cdp.close();
    return { file: path, ...res };
  } finally { browser.close(); }
}

function main() {
  const argv = process.argv.slice(2);
  const o = { colors: 10, at: [], json: false, file: null };
  try {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--json") o.json = true;
      else if (a === "--colors") { o.colors = Number(argv[++i]); if (!(o.colors >= 2 && o.colors <= 30)) throw new Error("--colors는 2–30"); }
      else if (a === "--at") { const m = /^(\d+),(\d+)$/.exec(argv[++i] || ""); if (!m) throw new Error("--at은 x,y (픽셀 정수)"); o.at.push([Number(m[1]), Number(m[2])]); }
      else if (a === "--crop") { const m = /^(\d+),(\d+),(\d+),(\d+)$/.exec(argv[++i] || ""); if (!m) throw new Error("--crop은 x,y,너비,높이"); o.crop = m.slice(1).map(Number); }
      else if (a.startsWith("-")) throw new Error(`알 수 없는 옵션: ${a}`);
      else o.file = a;
    }
    if (!o.file) throw new Error("사용법: node image-tokens.mjs <이미지> [--colors 10] [--at x,y] [--json]");
  } catch (e) { console.error(e.message); return Promise.resolve(1); }
  return imageTokens(o.file, o).then((r) => {
    if (o.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
    const pct = (v) => (v * 100).toFixed(v < 0.01 ? 2 : 1).padStart(5) + "%";
    console.log(`webd image-tokens: ${r.file} (${r.width}×${r.height}${r.crop ? `, 잰 영역 ${r.crop.join(",")}` : ""})`);
    console.log(`\n면적 순 색 (비슷한 색은 묶음, 측정값):`);
    for (const c of r.colors) {
      const h = c.oklch.h === null ? "무채" : `${Math.round(c.oklch.h)}°`;
      console.log(`  ${c.hex}  ${pct(c.area)}  L ${c.oklch.l.toFixed(2)} C ${c.oklch.c.toFixed(3)} ${h.padStart(4)}${c.contrastToBg ? `  바탕 대비 ${c.contrastToBg.toFixed(2)}` : "  (바탕)"}`);
    }
    console.log(`\n역할 추정: 바탕 ${r.roles.background}${r.roles.surface ? ` · 면 ${r.roles.surface}` : ""}${r.roles.text ? ` · 글자 ${r.roles.text}` : ""}${r.roles.accent ? "" : " · 포인트 없음(채도 0.06 이상 색이 거의 없음)"}`);
    for (const a of r.roles.accentCandidates || []) console.log(`  포인트 후보 ${a.hex}  면적 ${pct(a.area).trim()} · 색상 ${Math.round(a.h)}° · 바탕 대비 ${a.contrastToBg.toFixed(2)}`);
    console.log(`채도 있는 색 면적 ${pct(r.chromaticArea).trim()} · ${r.darkBackground ? "어두운 바탕" : "밝은 바탕"}`);
    for (const s of r.samples) console.log(s.error ? `  지점 ${s.x},${s.y}: ${s.error}` : `  지점 ${s.x},${s.y}: ${s.hex} (바탕 대비 ${s.contrastToBg.toFixed(2)})`);
    console.log("\n역할은 면적·대비로 짐작한 것입니다. 이미지를 보고 확인하세요. 포인트가 글자에만 쓰였으면 면적이 작아 후보에서 밀릴 수 있으니 --at으로 그 글자 픽셀을 찍어 확인합니다. 간격·반경·글자 크기는 재지 않으니 추정치로 적습니다.");
    return 0;
  }).catch((e) => { console.error(e.message); return e.code ?? 1; });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().then((c) => { process.exitCode = c; });
