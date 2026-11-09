#!/usr/bin/env node
// check-style.mjs — 스타일 사양(styles/*.md)의 색 대비를 계산한다. 의존성 없음, Node 18+.
//
// 사양 파일에서 두 블록을 읽는다.
//   ``` 로 감싼 색 표:  역할  #hex  설명
//   ```contrast 블록:   전경역할  배경역할  최소대비
// 각 쌍의 WCAG 2 대비를 계산해 최소값과 비교한다.
//
// 사용법: node check-style.mjs <스타일 파일 또는 폴더>... [--json]
// 종료 코드: 0 모두 통과 · 2 기준 미달 또는 정의 안 된 역할 · 1 사용 오류

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";

export function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** 사양 문서에서 색 표와 대비 표를 읽는다. */
export function parseSpec(text) {
  const colors = {};
  const pairs = [];
  for (const m of text.matchAll(/```(\w*)\n([\s\S]*?)```/g)) {
    const lang = m[1], body = m[2];
    if (lang === "contrast") {
      for (const line of body.split("\n")) {
        const p = line.trim().split(/\s+/);
        if (p.length >= 3 && !Number.isNaN(Number(p[2]))) pairs.push({ fg: p[0], bg: p[1], min: Number(p[2]) });
      }
    } else if (lang === "") {
      for (const line of body.split("\n")) {
        const c = /^\s*([a-z][\w-]*)\s+(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/.exec(line);
        if (c) colors[c[1]] = c[2];
      }
    }
  }
  return { colors, pairs };
}

export function checkSpec(text) {
  const { colors, pairs } = parseSpec(text);
  const results = pairs.map((p) => {
    if (!colors[p.fg] || !colors[p.bg]) return { ...p, ratio: null, ok: false, error: `정의 안 된 역할: ${!colors[p.fg] ? p.fg : p.bg}` };
    const ratio = contrast(colors[p.fg], colors[p.bg]);
    return { ...p, fgHex: colors[p.fg], bgHex: colors[p.bg], ratio: Math.round(ratio * 100) / 100, ok: ratio >= p.min };
  });
  return { colors: Object.keys(colors).length, pairs: results, hasContrastBlock: pairs.length > 0 };
}

function collect(paths) {
  const out = [];
  for (const p of paths) {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const n of readdirSync(p)) if (extname(n) === ".md" && !["INDEX.md", "_template.md"].includes(n)) out.push(join(p, n));
    } else out.push(p);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const paths = args.filter((a) => a !== "--json");
  if (!paths.length) { console.error("사용법: node check-style.mjs <스타일 파일 또는 폴더>... [--json]"); return 1; }
  let files;
  try { files = collect(paths); } catch (e) { console.error(`경로를 읽지 못함: ${e.message}`); return 1; }
  let failed = 0;
  const report = files.map((f) => {
    const r = checkSpec(readFileSync(f, "utf8"));
    if (!r.hasContrastBlock) failed++;
    failed += r.pairs.filter((p) => !p.ok).length;
    return { file: f, ...r };
  });
  if (json) { console.log(JSON.stringify(report, null, 2)); return failed ? 2 : 0; }
  for (const r of report) {
    console.log(`${basename(r.file)}  (색 ${r.colors}개, 대비 쌍 ${r.pairs.length}개)`);
    if (!r.hasContrastBlock) console.log("  ✗ contrast 블록이 없음");
    for (const p of r.pairs) {
      const mark = p.ok ? "✓" : "✗";
      console.log(p.error ? `  ✗ ${p.fg} / ${p.bg}: ${p.error}`
        : `  ${mark} ${p.fg} ${p.fgHex} / ${p.bg} ${p.bgHex}  ${p.ratio.toFixed(2)} (기준 ${p.min})`);
    }
  }
  console.log(failed ? `\n미달 ${failed}건` : "\n모두 통과");
  return failed ? 2 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
