#!/usr/bin/env node
// css-inventory.mjs — 화면의 CSS에서 실제로 쓰인 값을 세어 토큰 후보를 만든다. 의존성 없음, Node 18+.
// direction.md 경로 D(화면에서 시스템 뽑기)와 ops/system.md extract, audit의 토큰 일관성 점검용.
//
// HTML의 <style>·style="" 과 .css 파일을 읽어 다음을 센다:
//   색(hex·rgb·hsl·oklch), 글자 크기, 간격(margin·padding·gap·inset), 반경, 그림자, 굵기, 행간, 전환 시간
// 값마다 사용 횟수와, 서로 가까워 하나로 묶을 만한 값(예: 15px·16px)을 보여 준다.
// var(--x) 정의와 사용 횟수도 따로 센다(이미 토큰이 있는지 보려고).
// 계산된 값이 아니라 소스에 적힌 글자 그대로다. 스크립트가 넣는 스타일은 보지 않는다.
//
// 사용법: node css-inventory.mjs <파일·폴더> [--json]
// 종료 코드: 0 성공, 1 사용 오류

import { readFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next"]);

function files(p) {
  const st = statSync(p);
  if (st.isFile()) return [p];
  return readdirSync(p).flatMap((n) => (SKIP.has(n) ? [] : files(join(p, n)))).filter((f) => [".css", ".html", ".htm"].includes(extname(f).toLowerCase()));
}

function cssOf(text, ext) {
  if (ext === ".css") return text;
  const blocks = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const inline = [...text.matchAll(/\sstyle="([^"]*)"/gi)].map((m) => `x{${m[1]}}`);
  return [...blocks, ...inline].join("\n");
}

const CATS = {
  fontSize: /^font-size$/,
  spacing: /^(margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left)(-|$)/,
  radius: /^border(-[a-z]+)*-radius$/,
  shadow: /^(box-shadow|text-shadow)$/,
  weight: /^font-weight$/,
  lineHeight: /^line-height$/,
  duration: /^(transition|transition-duration|animation|animation-duration)$/,
};
const COLOR_RE = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\((?:[^()]|\([^()]*\))*\)/gi;

export function inventory(paths) {
  const decls = [];
  for (const f of paths) {
    const css = cssOf(readFileSync(f, "utf8"), extname(f).toLowerCase()).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([-a-z]+)\s*:\s*([^;{}]+)/gi)) decls.push({ prop: m[1].toLowerCase(), value: m[2].trim(), file: f });
  }
  const count = (arr) => { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const varsDefined = decls.filter((d) => d.prop.startsWith("--"));
  const real = decls.filter((d) => !d.prop.startsWith("--"));
  const varUse = count(real.flatMap((d) => [...d.value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])));

  const norm = (c) => c.toLowerCase().replace(/\s+/g, " ").replace(/\s*([(,/])\s*/g, "$1").replace(/\s+\)/g, ")");
  const colorsLiteral = count(real.flatMap((d) => (d.value.match(COLOR_RE) || []).map(norm)));
  const colorsInVars = count(varsDefined.flatMap((d) => (d.value.match(COLOR_RE) || []).map(norm)));
  // 단위 있는 길이·시간. 굵기·행간은 단위 없는 숫자와 낱말도 센다
  const lengths = (cat) => count(real.filter((d) => CATS[cat].test(d.prop)).flatMap((d) =>
    d.value.match(cat === "weight" || cat === "lineHeight" ? /-?\d*\.?\d+(px|rem|em|%)?|\bnormal\b|\bbold\b/g : /-?\d*\.?\d+(px|rem|em|%|ch|vh|vw|dvh|ms|s)\b|(?<![\w.%-])0(?![\w.%])/g) || []));
  const shadows = count(real.filter((d) => CATS.shadow.test(d.prop)).map((d) => d.value));

  const out = {
    files: paths.length, declarations: real.length,
    customProperties: { defined: varsDefined.length, used: varUse.reduce((s, [, n]) => s + n, 0), top: varUse.slice(0, 15) },
    colors: { literalInRules: colorsLiteral, inCustomProperties: colorsInVars.length },
    fontSize: lengths("fontSize"), spacing: lengths("spacing"), radius: lengths("radius"),
    weight: lengths("weight"), lineHeight: lengths("lineHeight"), duration: lengths("duration"), shadows,
  };
  out.nearDuplicates = near(out);
  return out;
}

// 글자 크기·반경: 1px 또는 6% 안의 값은 묶을 후보. 간격: 4px 격자 밖 값(0·1·2px 제외)
function near(o) {
  const res = [];
  const off = o.spacing.map(([v, n]) => { const m = /^(-?\d*\.?\d+)(px|rem|em)$/.exec(v); if (!m) return null; const x = Math.abs(Number(m[1]) * (m[2] === "px" ? 1 : 16)); return x > 2 && x % 4 !== 0 ? `${v}(${n})` : null; }).filter(Boolean);
  if (off.length) res.push({ category: "spacing", offGrid: off });
  for (const cat of ["fontSize", "radius"]) {
    const vals = o[cat].map(([v, n]) => { const m = /^(-?\d*\.?\d+)(px|rem|em)$/.exec(v); return m ? { v, n, x: Number(m[1]) * (m[2] === "px" ? 1 : 16) } : null; }).filter((x) => x && x.x > 0).sort((a, b) => a.x - b.x);
    for (let i = 1; i < vals.length; i++) {
      const a = vals[i - 1], b = vals[i];
      if (b.x - a.x <= Math.max(1, a.x * 0.06)) res.push({ category: cat, values: [`${a.v}(${a.n})`, `${b.v}(${b.n})`] });
    }
  }
  return res;
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const target = argv.find((a) => !a.startsWith("-"));
  const bad = argv.find((a) => a.startsWith("-") && a !== "--json");
  if (bad) { console.error(`알 수 없는 옵션: ${bad}`); return 1; }
  if (!target) { console.error("사용법: node css-inventory.mjs <파일·폴더> [--json]"); return 1; }
  if (!existsSync(target)) { console.error(`없음: ${target}`); return 1; }
  const fs = files(target);
  if (!fs.length) { console.error("CSS·HTML 파일이 없음"); return 1; }
  const r = inventory(fs);
  if (json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  const line = (arr, k = 12) => arr.slice(0, k).map(([v, n]) => `${v}×${n}`).join("  ") || "(없음)";
  console.log(`webd css-inventory: 파일 ${r.files}개, 선언 ${r.declarations}개`);
  console.log(`\n사용자 정의 속성: 정의 ${r.customProperties.defined}개, 사용 ${r.customProperties.used}회`);
  console.log(`  많이 쓰는 것: ${line(r.customProperties.top, 10)}`);
  console.log(`\n규칙 안에 직접 쓴 색 ${r.colors.literalInRules.length}종 (토큰 밖): ${line(r.colors.literalInRules, 14)}`);
  console.log(`\n글자 크기 ${r.fontSize.length}종: ${line(r.fontSize)}`);
  console.log(`간격 ${r.spacing.length}종: ${line(r.spacing, 16)}`);
  console.log(`반경 ${r.radius.length}종: ${line(r.radius)}`);
  console.log(`굵기: ${line(r.weight)} · 행간: ${line(r.lineHeight)} · 시간: ${line(r.duration)}`);
  console.log(`그림자 ${r.shadows.length}종${r.shadows.length ? ":\n" + r.shadows.slice(0, 6).map(([v, n]) => `  ${v} ×${n}`).join("\n") : ""}`);
  if (r.nearDuplicates.length) {
    console.log(`\n묶을 후보:`);
    for (const d of r.nearDuplicates) console.log(d.offGrid ? `  간격 4px 격자 밖: ${d.offGrid.join("  ")}` : `  ${d.category}: ${d.values.join(" ≈ ")}`);
  }
  console.log("\n소스에 적힌 값 기준입니다. 많이 쓰인 값을 토큰 후보로, 한두 번 쓰인 값은 가까운 토큰으로 묶을지 사용자에게 제안합니다(경로 D 3단계: 승인 전에는 코드를 바꾸지 않음).");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
