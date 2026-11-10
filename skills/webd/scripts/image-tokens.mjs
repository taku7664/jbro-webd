#!/usr/bin/env node
// image-tokens.mjs — 레퍼런스 이미지(스크린샷)에서 색을 "재서" 뽑는다. 의존성 없음, Node 22+.
// direction.md 경로 B용. 눈으로 hex를 짐작하지 않고 실제 픽셀을 센다.
//
// 설치된 Chrome·Edge를 헤드리스로 띄워 캔버스로 픽셀을 읽는다(render-check와 같은 브라우저).
//   - 면적이 큰 색부터: 비슷한 색(OKLab 거리)끼리 묶고 면적 비율을 낸다
//   - 역할 추정: 가장 넓은 색 = 바탕, 바탕 대비가 큰 색 = 글자 후보, 바탕과 구분되는(대비 1.3 이상) 채도 높은 색 = 포인트 후보
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

import { analyzeImage, measurePixels } from "./browser/image-measure.mjs";

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

export async function imageTokens(file, { colors = 10, at = [], crop = null } = {}) {
  const path = resolve(file);
  if (!existsSync(path)) throw Object.assign(new Error(`파일이 없음: ${file}`), { code: 1 });
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) throw Object.assign(new Error(`지원하지 않는 형식: ${extname(path)} (png, jpg, webp, gif)`), { code: 1 });
  const exe = findBrowser();
  if (!exe) throw Object.assign(new Error("Chrome·Edge·Chromium을 찾지 못함. 내부 브라우저에서 tools/image-tokens.html을 쓰세요."), { code: 1 });
  const src = `data:${mime};base64,${readFileSync(path).toString("base64")}`;
  const browser = await launch(exe);
  let cdp;
  try {
    cdp = await connect(browser.port);
    await cdp.send("Runtime.enable");
    const res = await cdp.evaluate(analyzeImage, { src, colors, at, crop }, measurePixels);
    return { file: path, ...res };
  } finally {
    cdp?.close();
    await browser.close();
  }
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
    console.log(`\n역할 추정: 바탕 ${r.roles.background}${r.roles.surface ? ` · 면 ${r.roles.surface}` : ""}${r.roles.text ? ` · 글자 ${r.roles.text}` : ""}${r.roles.accent ? "" : " · 기준을 만족한 포인트 후보 없음"}`);
    for (const a of r.roles.accentCandidates || []) console.log(`  포인트 후보 ${a.hex}  면적 ${pct(a.area).trim()} · 색상 ${Math.round(a.h)}° · 바탕 대비 ${a.contrastToBg.toFixed(2)}`);
    console.log(`채도 있는 색 면적 ${pct(r.chromaticArea).trim()} · ${r.darkBackground ? "어두운 바탕" : "밝은 바탕"}`);
    for (const s of r.samples) console.log(s.error ? `  지점 ${s.x},${s.y}: ${s.error}` : `  지점 ${s.x},${s.y}: ${s.hex} (바탕 대비 ${s.contrastToBg.toFixed(2)})`);
    console.log("\n역할은 면적·대비로 짐작한 것입니다. 이미지를 보고 확인하세요. 포인트가 글자에만 쓰였으면 면적이 작아 후보에서 밀릴 수 있으니 --at으로 그 글자 픽셀을 찍어 확인합니다. 간격·반경·글자 크기는 재지 않으니 추정치로 적습니다.");
    return 0;
  }).catch((e) => { console.error(e.message); return e.code ?? 1; });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().then((c) => { process.exitCode = c; });
