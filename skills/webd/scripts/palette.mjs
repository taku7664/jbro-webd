#!/usr/bin/env node
// palette.mjs — OKLCH 기반 색 단계 생성기. 의존성 없음, Node 18+.
//
// 기준 색상(hue 또는 #hex) 하나로 라이트·다크 12단계 포인트·무채색 단계와 기능 색을 만든다.
// 단계 역할(Radix식): 1–2 바탕, 3–5 컴포넌트 면, 6–8 경계, 9 진한 면(버튼), 10 hover, 11 보조 글자, 12 본문 글자.
// 대비는 계산해서 맞춘다: 11단계 ≥ 4.5, 12단계 ≥ 7 (2단계 바탕 기준), 9단계 위 글자 ≥ 4.5.
// sRGB 밖 색은 색상·밝기를 유지한 채 채도를 줄여 안으로 넣는다.
//
// 사용법:
//   node palette.mjs --seed 150
//   node palette.mjs --seed "#1F4D3A" --chroma muted --harmony complementary --prefix brand- --json
// 옵션:
//   --seed     <0-360 | #hex>                         기준 색상 (필수)
//   --chroma   muted | balanced | vivid               채도 성격 (기본 balanced)
//   --harmony  mono | analogous | complementary | split | triadic   보조 포인트 (기본 mono)
//   --scheme   light | dark | both                    (기본 both)
//   --prefix   <문자열>                               CSS 변수 접두어 (기본 없음)
//   --json                                            JSON 출력
// 종료 코드: 0 성공, 1 사용 오류

import { pathToFileURL } from "node:url";

// ---------- OKLab / OKLCH ↔ sRGB (Björn Ottosson의 공개 공식) ----------

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055);

export function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGamma);
}

export function rgbToOklch(r, g, b) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C: Math.hypot(A, B), H };
}

const inGamut = (rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** 색상·밝기를 유지하고 채도만 줄여 sRGB 안으로. */
export function fitGamut(L, C, H) {
  if (inGamut(oklchToRgb(L, C, H))) return { L, C, H };
  let lo = 0, hi = C;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; inGamut(oklchToRgb(L, mid, H)) ? (lo = mid) : (hi = mid); }
  return { L, C: lo, H };
}

export function toHex({ L, C, H }) {
  return "#" + oklchToRgb(L, C, H).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
}

export function hexToOklch(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`hex 형식이 아님: ${hex}`);
  return rgbToOklch(...[0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255));
}

export function contrast(hexA, hexB) {
  const lum = (hex) => { const h = hex.replace("#", ""); const [r, g, b] = [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [x, y] = [lum(hexA), lum(hexB)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const fmt = ({ L, C, H }) => `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)})`;

// ---------- 단계 설계 ----------

const PEAK = { muted: 0.07, balanced: 0.12, vivid: 0.17 };
const LIGHT_L = [0.99, 0.975, 0.945, 0.915, 0.88, 0.84, 0.785, 0.71, 0.56, 0.51, 0.47, 0.27];
const DARK_L = [0.16, 0.19, 0.235, 0.27, 0.305, 0.345, 0.405, 0.49, 0.64, 0.69, 0.82, 0.95];
// 단계별 채도 비율: 바탕은 거의 무채, 9단계에서 최대
const CHROMA_SHAPE = [0.06, 0.1, 0.22, 0.32, 0.44, 0.55, 0.66, 0.8, 1, 0.97, 0.8, 0.45];
// 다크: 같은 채도가 어두운 바탕에서 형광처럼 튀므로 전체를 낮춘다 (color.md 다크 모드)
const DARK_CHROMA = 0.82;

function rampOf(hue, peak, Ls, dark = false) {
  return Ls.map((L, i) => fitGamut(L, peak * CHROMA_SHAPE[i] * (dark ? DARK_CHROMA : 1), hue));
}

/** 11·12단계 글자가 2단계 바탕 위에서 기준을 넘을 때까지 밝기를 민다. */
function solveText(ramp, dark) {
  const bg = toHex(ramp[1]);
  const targets = [[10, 4.5], [11, 7]];
  for (const [i, need] of targets) {
    let c = ramp[i];
    for (let k = 0; k < 60 && contrast(toHex(c), bg) < need; k++) {
      c = fitGamut(Math.min(0.99, Math.max(0.05, c.L + (dark ? 0.01 : -0.01))), c.C, c.H);
    }
    ramp[i] = c;
  }
  return ramp;
}

/** 9단계(진한 면) 위 글자색: 흰색 또는 가장 어두운 단계 중 대비가 높은 쪽. 둘 다 4.5 미만이면 9단계 밝기를 조정. */
function solveSolid(ramp, darkScheme) {
  const white = "#ffffff";
  for (let k = 0; k < 60; k++) {
    const solid = toHex(ramp[8]);
    const dark = toHex(darkScheme ? ramp[0] : ramp[11]);   // 다크 모드에서 12단계는 밝은 글자이므로 1단계를 씀
    const cw = contrast(white, solid), cd = contrast(dark, solid);
    if (Math.max(cw, cd) >= 4.5) return cw >= cd ? white : dark;
    const towardDark = cw >= cd;   // 흰 글자가 더 나으면 면을 어둡게
    const c = ramp[8];
    ramp[8] = fitGamut(c.L + (towardDark ? -0.01 : 0.01), c.C, c.H);
    ramp[9] = fitGamut(ramp[8].L + (towardDark ? -0.04 : 0.04), ramp[9].C, ramp[9].H);
  }
  return white;
}

function buildScheme(hue, peak, dark) {
  const accent = solveText(rampOf(hue, peak, dark ? DARK_L : LIGHT_L, dark), dark);
  const onSolid = solveSolid(accent, dark);
  const neutral = solveText(rampOf(hue, Math.min(peak, 0.1) * 0.12, dark ? DARK_L : LIGHT_L, dark), dark);
  return { accent, neutral, onSolid };
}

const HARMONY = {
  mono: [],
  analogous: [30],
  complementary: [180],
  split: [150, 210],
  triadic: [120, 240],
};

const FUNCTIONAL = { success: 150, warning: 75, danger: 27, info: 245 };

export function generate({ seed, chroma = "balanced", harmony = "mono", scheme = "both" }) {
  let hue, seedHex = null;
  if (typeof seed === "string" && seed.startsWith("#")) { const o = hexToOklch(seed); hue = o.H; seedHex = seed; }
  else { hue = Number(seed); if (!Number.isFinite(hue)) throw new Error("--seed는 0–360 숫자 또는 #hex"); hue = ((hue % 360) + 360) % 360; }
  if (!PEAK[chroma]) throw new Error("--chroma는 muted, balanced, vivid 중 하나");
  if (!HARMONY[harmony]) throw new Error("--harmony는 mono, analogous, complementary, split, triadic 중 하나");
  const peak = PEAK[chroma];
  const schemes = scheme === "both" ? ["light", "dark"] : [scheme];
  if (!schemes.every((s) => s === "light" || s === "dark")) throw new Error("--scheme은 light, dark, both 중 하나");

  const out = { seed: { hue: Math.round(hue * 10) / 10, hex: seedHex }, chroma, harmony, schemes: {} };
  for (const s of schemes) {
    const dark = s === "dark";
    const main = buildScheme(hue, peak, dark);
    const secondary = HARMONY[harmony].map((d, i) => ({ name: `accent${i + 2}`, ...buildScheme((hue + d) % 360, peak * 0.9, dark) }));
    const functional = Object.fromEntries(Object.entries(FUNCTIONAL).map(([k, h]) => {
      const r = buildScheme(h, Math.max(peak, 0.12), dark);
      return [k, { solid: r.accent[8], text: r.accent[10], subtle: r.accent[2], onSolid: r.onSolid }];
    }));
    const bg = toHex(main.accent[1]);
    const report = {
      "accent-11 / accent-2": contrast(toHex(main.accent[10]), bg),
      "accent-12 / accent-2": contrast(toHex(main.accent[11]), bg),
      "neutral-11 / neutral-2": contrast(toHex(main.neutral[10]), toHex(main.neutral[1])),
      "neutral-12 / neutral-2": contrast(toHex(main.neutral[11]), toHex(main.neutral[1])),
      "on-accent / accent-9": contrast(main.onSolid, toHex(main.accent[8])),
      ...Object.fromEntries(Object.entries(functional).map(([k, v]) => [`${k}-text / neutral-2`, contrast(toHex(v.text), toHex(main.neutral[1]))])),
    };
    out.schemes[s] = { accent: main.accent, neutral: main.neutral, onAccent: main.onSolid, secondary, functional, contrast: report };
  }
  return out;
}

export function toCss(p, prefix = "") {
  const lines = [];
  for (const [name, s] of Object.entries(p.schemes)) {
    const sel = name === "light" ? ":root" : Object.keys(p.schemes).length > 1 ? '@media (prefers-color-scheme: dark) {\n  :root' : ":root";
    const ind = sel.startsWith("@") ? "    " : "  ";
    lines.push(`${sel} {`);
    lines.push(`${ind}/* ${name}: seed hue ${p.seed.hue}${p.seed.hex ? ` (${p.seed.hex})` : ""}, chroma ${p.chroma}, harmony ${p.harmony} */`);
    s.accent.forEach((c, i) => lines.push(`${ind}--${prefix}accent-${i + 1}: ${toHex(c)}; /* ${fmt(c)} */`));
    lines.push(`${ind}--${prefix}on-accent: ${s.onAccent};`);
    s.neutral.forEach((c, i) => lines.push(`${ind}--${prefix}neutral-${i + 1}: ${toHex(c)}; /* ${fmt(c)} */`));
    for (const sec of s.secondary) {
      sec.accent.forEach((c, i) => lines.push(`${ind}--${prefix}${sec.name}-${i + 1}: ${toHex(c)};`));
      lines.push(`${ind}--${prefix}on-${sec.name}: ${sec.onSolid};`);
    }
    for (const [k, v] of Object.entries(s.functional)) {
      lines.push(`${ind}--${prefix}${k}: ${toHex(v.solid)};`, `${ind}--${prefix}${k}-text: ${toHex(v.text)};`, `${ind}--${prefix}${k}-subtle: ${toHex(v.subtle)};`, `${ind}--${prefix}on-${k}: ${v.onSolid};`);
    }
    lines.push(sel.startsWith("@") ? "  }\n}" : "}");
    lines.push("");
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const o = { chroma: "balanced", harmony: "mono", scheme: "both", prefix: "", json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (["--seed", "--chroma", "--harmony", "--scheme", "--prefix"].includes(a)) { if (argv[i + 1] === undefined) throw new Error(`${a}에 값이 없습니다.`); o[a.slice(2)] = argv[++i]; }
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  if (o.seed === undefined) throw new Error("사용법: node palette.mjs --seed <0-360|#hex> [--chroma] [--harmony] [--scheme] [--prefix] [--json]");
  return o;
}

function main() {
  let o, p;
  try { o = parseArgs(process.argv.slice(2)); p = generate(o); } catch (e) { console.error(e.message); return 1; }
  if (o.json) {
    const ser = (c) => ({ hex: toHex(c), oklch: fmt(c) });
    const j = { ...p, schemes: Object.fromEntries(Object.entries(p.schemes).map(([k, s]) => [k, {
      accent: s.accent.map(ser), neutral: s.neutral.map(ser), onAccent: s.onAccent,
      secondary: s.secondary.map((x) => ({ name: x.name, accent: x.accent.map(ser), onAccent: x.onSolid })),
      functional: Object.fromEntries(Object.entries(s.functional).map(([fk, v]) => [fk, { solid: toHex(v.solid), text: toHex(v.text), subtle: toHex(v.subtle), onSolid: v.onSolid }])),
      contrast: Object.fromEntries(Object.entries(s.contrast).map(([ck, v]) => [ck, Math.round(v * 100) / 100])),
    }])) };
    console.log(JSON.stringify(j, null, 2));
  } else {
    console.log(toCss(p, o.prefix));
    for (const [k, s] of Object.entries(p.schemes)) {
      console.log(`/* ${k} 대비: ${Object.entries(s.contrast).map(([ck, v]) => `${ck} ${v.toFixed(2)}`).join(", ")} */`);
    }
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
