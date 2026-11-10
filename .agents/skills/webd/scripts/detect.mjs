#!/usr/bin/env node
// detect.mjs — WebD 정적 검출기. 의존성 없음, Node 18+.
//
// 소스 파일(HTML/CSS/JSX/TSX/Vue/Svelte/Astro)에서 ai-tells.md·craft-floor.md의
// 항목 중 정규식으로 찾을 수 있는 것만 찾는다. 렌더가 필요한 항목(대비, 카드 반복,
// 위계, 실제 간격 리듬)은 찾지 않는다. 0건이 "AI 티 없음"을 뜻하지 않는다.
//
// 사용법:
//   node detect.mjs <파일 또는 폴더> [...]
//   node detect.mjs src --json
//   node detect.mjs src --allow glassmorphism,hard-offset-shadow   # DESIGN.md에서 고정한 결정
//   node detect.mjs --list-rules
//
// 종료 코드: 0 = high·medium 없음(advisory만 있거나 0건) · 2 = high 또는 medium 있음 · 1 = 사용 오류

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXTS = new Set([".html", ".htm", ".css", ".scss", ".jsx", ".tsx", ".js", ".ts", ".vue", ".svelte", ".astro", ".mdx"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit", "coverage", ".turbo", "out"]);
const SEVERITY_ORDER = { high: 0, medium: 1, advisory: 2 };

// ---------- 규칙 ----------
// scan(text, file) → [{ index, snippet?, note? }]
// project(files) → [{ file, index, note? }]   (프로젝트 전체에 무엇이 "없는지" 보는 규칙)

const OVERUSED_FONTS = ["inter", "roboto", "open sans", "geist", "space grotesk", "system-ui", "-apple-system", "arial", "helvetica"];
const BUZZWORDS = [
  "world-class", "world class", "supercharge", "seamless", "seamlessly", "revolutionary", "revolutionize",
  "cutting-edge", "next-level", "game-changer", "game changer", "unleash", "empower your", "best-in-class",
  "혁신적인", "세계 최고", "차원이 다른", "새로운 차원", "압도적인", "게임 체인저", "완벽한 솔루션",
];
const PURPLE_HEX = ["#6366f1", "#4f46e5", "#8b5cf6", "#7c3aed", "#a855f7", "#9333ea", "#818cf8", "#a78bfa"];

export const RULES = [
  {
    id: "gradient-text", severity: "high", ref: "ai-tells.md 표면",
    name: "그라디언트 텍스트",
    scan: (t) => matches(t, /(?:-webkit-)?background-clip\s*:\s*text|\bbg-clip-text\b/gi),
  },
  {
    id: "side-stripe-border", severity: "high", ref: "ai-tells.md 표면",
    name: "한쪽만 두꺼운 강조 테두리",
    scan: (t) => matches(t, /border-(?:left|right|inline-start|inline-end)(?:-width)?\s*:\s*(?:[2-9]|[1-9]\d)(?:\.\d+)?px|\bborder-[lrse]-(?:2|4|8)\b/gi)
      .filter((m) => !/blockquote|\bquote\b|code|pre\b/i.test(selectorBefore(t, m.index))),
  },
  {
    id: "glassmorphism", severity: "medium", ref: "ai-tells.md 표면",
    name: "글래스모피즘(backdrop blur)",
    scan: (t) => matches(t, /backdrop-filter\s*:\s*[^;"'}]*blur|\bbackdrop-blur(?:-\w+)?\b/gi),
  },
  {
    id: "purple-accent", severity: "medium", ref: "ai-tells.md 색",
    name: "보라–남색 계열 포인트",
    scan: (t) => [
      ...matches(t, new RegExp(PURPLE_HEX.join("|") + "(?![0-9a-f])", "gi")),
      ...matches(t, /\b(?:from|via|to|bg|text|border|ring)-(?:indigo|violet|purple)-[1-9]00\b/g),
    ],
  },
  {
    id: "overused-font", severity: "medium", ref: "ai-tells.md 타이포",
    name: "흔한 기본 폰트를 주 폰트로 사용",
    scan: (t) => {
      const out = [];
      for (const m of t.matchAll(/font-family\s*:\s*([^;}"\n]+)/gi)) {
        const first = m[1].split(",")[0].trim().replace(/^['"]|['"]$/g, "").toLowerCase();
        if (first.startsWith("var(")) continue;
        if (OVERUSED_FONTS.includes(first)) out.push({ index: m.index, snippet: m[0].trim(), note: first });
      }
      for (const m of t.matchAll(/fonts\.googleapis\.com\/css2?\?[^"'\s>]*family=(Inter|Roboto|Open\+Sans|Geist|Space\+Grotesk)\b/gi)) {
        out.push({ index: m.index, snippet: m[0].slice(0, 80), note: m[1] });
      }
      return out;
    },
  },
  {
    id: "uniform-soft-shadow", severity: "medium", ref: "ai-tells.md 표면",
    name: "같은 연한 검정 그림자 반복",
    scan: (t) => {
      const all = matches(t, /box-shadow\s*:[^;}]*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.(?:0[5-9]|1\d?)\s*\)/gi);
      return all.length >= 3 ? [{ ...all[0], note: `${all.length}회` }] : [];
    },
  },
  {
    id: "hard-offset-shadow", severity: "medium", ref: "ai-tells.md 표면",
    name: "블러 없는 오프셋 그림자(네오브루탈리즘이 아니면)",
    scan: (t) => matches(t, /box-shadow\s*:\s*-?[1-9]\d*px\s+-?[1-9]\d*px\s+0(?:px)?\s+(?:0(?:px)?\s+)?(?:#|rgb|[a-z])/gi),
  },
  {
    id: "glow-shadow", severity: "medium", ref: "ai-tells.md 표면",
    name: "오프셋 없는 색 번짐 그림자(glow)",
    scan: (t) => matches(t, /box-shadow\s*:\s*0(?:px)?\s+0(?:px)?\s+[1-9]\d*px[^;}]*(?:#(?!000\b|000000\b)[0-9a-f]{3,8}|rgba?\(\s*(?!0\s*,\s*0\s*,\s*0)\d)/gi),
  },
  {
    id: "radial-glow-bg", severity: "advisory", ref: "ai-tells.md 표면",
    name: "방사형 빛 번짐 배경",
    scan: (t) => matches(t, /background(?:-image)?\s*:[^;}]*radial-gradient\(/gi),
  },
  {
    id: "bounce-easing", severity: "medium", ref: "craft-floor.md 모션",
    name: "튀는 이징(bounce·elastic·overshoot)",
    scan: (t) => {
      const out = matches(t, /\banimate-bounce\b|(?:animation|transition)[\w-]*\s*:[^;}]*\b(?:bounce|elastic)\w*/gi);
      for (const m of t.matchAll(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/gi)) {
        const y1 = parseFloat(m[2]), y2 = parseFloat(m[4]);
        if (y1 > 1 || y2 > 1 || y1 < 0 || y2 < 0) out.push({ index: m.index, snippet: m[0] });
      }
      return out;
    },
  },
  {
    id: "hidden-entrance", severity: "medium", ref: "craft-floor.md 모션",
    name: "내용을 완전히 숨긴 상태에서 시작하는 진입 애니메이션",
    scan: (t) => {
      const out = [];
      for (const m of t.matchAll(/@keyframes\s+[\w-]+\s*\{/gi)) {
        const body = blockAt(t, m.index + m[0].length - 1);
        const first = /(?:\bfrom|\b0%)\s*\{([^{}]*)\}/i.exec(body);
        if (first && /opacity\s*:\s*0(?![.\d])|clip-path\s*:\s*inset\([^)]*100%|visibility\s*:\s*hidden/i.test(first[1])) {
          out.push({ index: m.index, snippet: m[0].slice(0, -1).trim(), note: "애니메이션이 멈추거나 늦으면 내용이 안 보임" });
        }
      }
      return out;
    },
  },
  {
    id: "eyebrow-label", severity: "medium", ref: "ai-tells.md 페이지 뼈대",
    name: "제목 위 작은 라벨(eyebrow·kicker)",
    scan: (t) => {
      const named = matches(t, /class(?:Name)?\s*=\s*["'{`][^"'`}]*\b(?:eyebrow|kicker|overline|pre-?title|section-label)\b/gi);
      return named.length ? [{ ...named[0], note: `${named.length}회` }] : [];
    },
  },
  {
    id: "all-caps-labels", severity: "advisory", ref: "ai-tells.md 타이포",
    name: "대문자 라벨 반복",
    scan: (t) => {
      const all = matches(t, /text-transform\s*:\s*uppercase|\buppercase\b(?=[^"'`]*["'`])/gi);
      return all.length >= 3 ? [{ ...all[0], note: `${all.length}회` }] : [];
    },
  },
  {
    id: "numbered-markers", severity: "advisory", ref: "ai-tells.md 페이지 뼈대",
    name: "01 / 02 / 03 번호 표시",
    scan: (t) => {
      const all = matches(t, />\s*0[1-9]\s*(?:[./—–-]\s*)?</g);
      return all.length >= 3 ? [{ ...all[0], note: `${all.length}회 — 실제 순서가 있는 내용인지 확인` }] : [];
    },
  },
  {
    id: "buzzword-copy", severity: "medium", ref: "ai-tells.md 카피",
    name: "상투적인 홍보 문구",
    scan: (t) => matches(t, new RegExp(BUZZWORDS.map(escapeRe).join("|"), "gi")),
  },
  {
    id: "em-dash-overuse", severity: "advisory", ref: "ai-tells.md 카피",
    name: "엠대시(—) 남발",
    scan: (t) => {
      const all = matches(textOnly(t), /—/g);
      return all.length >= 4 ? [{ index: t.indexOf("—"), snippet: "—", note: `${all.length}회` }] : [];
    },
  },
  {
    id: "arrow-suffix", severity: "advisory", ref: "ai-tells.md 카피",
    name: "링크·버튼 끝 습관적인 →",
    scan: (t) => {
      const all = matches(t, /(?:→|&rarr;)\s*<\/(?:a|button)>/gi);
      return all.length >= 2 ? [{ ...all[0], note: `${all.length}회` }] : [];
    },
  },
  {
    id: "dot-meta", severity: "advisory", ref: "ai-tells.md 카피",
    name: "가운뎃점으로 이은 메타 문자열 반복",
    scan: (t) => {
      const all = matches(textOnly(t), /\S\s·\s\S/g);
      return all.length >= 4 ? [{ index: t.indexOf(" · "), snippet: "A · B", note: `${all.length}회` }] : [];
    },
  },
  {
    id: "pure-black-white", severity: "advisory", ref: "build.md 2차",
    name: "순수 #000·#fff 직접 사용",
    scan: (t) => {
      const all = matches(t, /#(?:000000|ffffff|000|fff)(?![0-9a-f])/gi).filter((m) => !/^\s*--/.test(lineAt(t, m.index)));
      return all.length >= 3 ? [{ ...all[0], note: `${all.length}회 (토큰 선언 줄 제외)` }] : [];
    },
  },
  {
    id: "img-missing-alt", severity: "high", ref: "craft-floor.md 아이콘·이미지",
    name: "alt 없는 이미지",
    scan: (t) => matches(t, /<img\b(?![^>]*\balt\s*=)[^>]*>/gi),
  },
  {
    id: "zoom-disabled", severity: "high", ref: "craft-floor.md 접근성",
    name: "확대 막힘(viewport)",
    scan: (t) => matches(t, /user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0)?(?![\d.])/gi),
  },
  {
    id: "unmodified-shadcn-tokens", severity: "medium", ref: "build.md 컴포넌트 라이브러리",
    name: "수정하지 않은 shadcn 기본 토큰",
    scan: (t) => {
      const hsl = /--primary\s*:\s*222\.2\s+47\.4%\s+11\.2%/.test(t);
      const oklch = /--primary\s*:\s*oklch\(\s*0\.205\s+0\s+0\s*\)/.test(t);
      if (!hsl && !oklch) return [];
      const i = t.search(/--primary\s*:/);
      return [{ index: i, snippet: lineAt(t, i).trim() }];
    },
  },
  {
    id: "placeholder-as-label", severity: "high", ref: "foundations/interaction.md 폼",
    name: "라벨 없이 placeholder만 있는 입력",
    scan: (t) => {
      const out = [];
      const labelled = new Set([...t.matchAll(/<label[^>]*\bfor\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
      for (const m of t.matchAll(/<(input|textarea)\b([^>]*)>/gi)) {
        const attrs = m[2];
        if (!/\bplaceholder\s*=/.test(attrs) || /type\s*=\s*["']?(hidden|submit|button|checkbox|radio)/i.test(attrs)) continue;
        if (/\baria-label(ledby)?\s*=/i.test(attrs)) continue;
        const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
        if (id && labelled.has(id[1])) continue;
        const before = t.slice(Math.max(0, m.index - 300), m.index);
        if (/<label\b(?![\s\S]*<\/label>)/i.test(before)) continue;   // <label>로 감싼 경우
        out.push({ index: m.index, snippet: m[0].slice(0, 80) });
      }
      return out;
    },
  },
  {
    id: "div-button", severity: "high", ref: "foundations/usability.md 견고하게",
    name: "클릭만 붙인 div·span (버튼·링크가 아님)",
    scan: (t) => matches(t, /<(div|span|li)\b(?![^>]*\brole\s*=\s*["'](button|link|tab|menuitem|option|checkbox|switch)["'])[^>]*\bon[Cc]lick\s*=/g),
  },
  {
    id: "positive-tabindex", severity: "medium", ref: "foundations/interaction.md 포커스",
    name: "양수 tabindex (포커스 순서가 화면 순서와 어긋남)",
    scan: (t) => matches(t, /\btab[iI]ndex\s*=\s*["'{]?\s*[1-9]/g),
  },
  {
    id: "skipped-heading", severity: "medium", ref: "foundations/usability.md 견고하게",
    name: "제목 단계 건너뜀 (h1 → h3 등)",
    scan: (t) => {
      const out = []; let prev = 0;
      for (const m of t.matchAll(/<h([1-6])\b/gi)) {
        const lv = Number(m[1]);
        if (prev && lv > prev + 1) out.push({ index: m.index, snippet: m[0], note: `h${prev} 다음 h${lv}` });
        prev = lv;
      }
      return out.slice(0, 3);
    },
  },
  {
    id: "generic-link-text", severity: "advisory", ref: "foundations/ux-writing.md 버튼과 링크",
    name: "맥락 없이는 뜻이 없는 링크 글자",
    scan: (t) => matches(t, /<a\b[^>]*>\s*(여기|여기를 클릭|자세히|자세히 보기|더 보기|click here|here|read more|learn more|more)\s*<\/a>/gi),
  },
  {
    id: "tiny-text", severity: "medium", ref: "foundations/typography.md 본문 읽기",
    name: "12px 미만 글자",
    scan: (t) => matches(t, /font-size\s*:\s*(?:(?:[0-9]|1[01])(?:\.\d+)?px|0?\.[0-6]\d*rem)\b|\btext-\[(?:[0-9]|1[01])px\]/gi),
  },
  {
    id: "justified-text", severity: "advisory", ref: "foundations/typography.md 본문 읽기",
    name: "양쪽 정렬 본문 (웹에서 강물 생김)",
    scan: (t) => matches(t, /text-align\s*:\s*justify\b|\btext-justify\b/gi),
  },
  {
    id: "fixed-wide-width", severity: "medium", ref: "foundations/responsive.md 원칙",
    name: "고정 폭 컨테이너 (좁은 화면에서 넘침)",
    scan: (t) => matches(t, /(?<![-\w])width\s*:\s*(?:[1-9]\d{3})px/gi).filter((m) => !/max-width|min-width/.test(lineAt(t, m.index).slice(0, lineAt(t, m.index).indexOf(m.snippet.split(":")[0]) + 12))),
  },
  {
    id: "viewport-100vh", severity: "advisory", ref: "foundations/responsive.md 안전 영역과 뷰포트",
    name: "100vh (휴대폰 주소창 때문에 화면보다 김 → 100dvh)",
    scan: (t) => matches(t, /\b100vh\b|\bh-screen\b/g),
  },
  {
    id: "autoplay-sound", severity: "medium", ref: "foundations/motion.md 접근성",
    name: "소리가 날 수 있는 자동 재생 영상",
    scan: (t) => matches(t, /<video\b(?=[^>]*\bautoplay\b)(?![^>]*\bmuted\b)[^>]*>/gi),
  },
  {
    id: "emoji-icon", severity: "advisory", ref: "craft-floor.md 아이콘·이미지",
    name: "이모지를 아이콘처럼 사용",
    scan: (t) => {
      const all = matches(t, />\s*(?:\p{Extended_Pictographic}️?)\s*</gu);
      return all.length >= 2 ? [{ ...all[0], note: `${all.length}곳` }] : [];
    },
  },
  {
    id: "focus-removed", severity: "high", ref: "craft-floor.md 접근성",
    name: "포커스 표시 제거 후 대체 없음",
    project: (files) => {
      const hasVisible = files.some((f) => /:focus-visible|:focus\s*[{,]|\bfocus-visible:|\bfocus:(?:ring|outline)/.test(f.text));
      if (hasVisible) return [];
      const out = [];
      for (const f of files) for (const m of matches(f.text, /outline\s*:\s*(?:none|0)\b|\boutline-none\b/gi)) out.push({ file: f, ...m });
      return out.slice(0, 1).map((x) => ({ ...x, note: "프로젝트 전체에 :focus-visible 스타일이 없음" }));
    },
  },
  {
    id: "no-reduced-motion", severity: "medium", ref: "craft-floor.md 접근성",
    name: "모션이 있는데 reduced-motion 대응 없음",
    project: (files) => {
      const hasRM = files.some((f) => /prefers-reduced-motion|\bmotion-(?:reduce|safe):/.test(f.text));
      if (hasRM) return [];
      for (const f of files) {
        const m = /@keyframes|animation\s*:|\banimate-\w+|transition\s*:\s*(?!none)/i.exec(f.text);
        if (m) return [{ file: f, index: m.index, snippet: m[0], note: "프로젝트 전체에 prefers-reduced-motion이 없음" }];
      }
      return [];
    },
  },
];

// 정적 검사로는 찾지 않는 항목. 렌더 확인과 비평 단계에서 본다.
export const NOT_COVERED = [
  "같은 크기 카드 반복(아이콘+제목+설명)", "큰 숫자 히어로", "카드 안의 카드", "위계가 평평함",
  "간격 리듬", "실제 대비 비율", "모든 섹션에 같은 등장 애니메이션", "스크립트로 숨겼다가 보여 주는 내용(IntersectionObserver 등)",
  "유니코드 기호 아이콘(→ ★ 등)", "가운데 정렬 남용", "시그니처 요소가 보이는지", "렌더 대비·작은 글자·한글 대체(→ render-check)",
];

// ---------- 도우미 ----------

function matches(text, re) {
  const out = [];
  for (const m of text.matchAll(re)) out.push({ index: m.index, snippet: m[0].trim().slice(0, 90) });
  return out;
}
/** text[open]이 '{'일 때 짝이 맞는 '}'까지의 안쪽 문자열. */
function blockAt(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function lineOf(text, index) { let n = 1; for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++; return n; }
function lineAt(text, index) {
  const s = text.lastIndexOf("\n", index) + 1; const e = text.indexOf("\n", index);
  return text.slice(s, e === -1 ? text.length : e);
}
function selectorBefore(text, index) {
  const open = text.lastIndexOf("{", index);
  if (open === -1) return lineAt(text, index);
  const prev = Math.max(text.lastIndexOf("}", open), text.lastIndexOf(";", open));
  return text.slice(prev + 1, open) + " " + lineAt(text, index);
}
// 태그·style·script를 지운 텍스트(카피 규칙용). 길이와 줄 위치는 유지하지 않는다.
function textOnly(text) {
  return text.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
}
// 주석을 공백으로 바꿔 줄 번호를 유지한다.
function stripComments(text) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/<!--[\s\S]*?-->/g, blank);
}

function collect(paths) {
  const files = [];
  const walk = (p) => {
    let st; try { st = statSync(p); } catch { throw new Error(`경로를 찾을 수 없음: ${p}`); }
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) if (!SKIP_DIRS.has(name)) walk(join(p, name));
    } else if (EXTS.has(extname(p).toLowerCase()) && !/\.min\.(js|css)$/i.test(p)) {
      files.push({ path: p, text: stripComments(readFileSync(p, "utf8")) });
    }
  };
  paths.forEach(walk);
  return files;
}

export function detect(paths, { allow = [] } = {}) {
  const files = collect(paths);
  const findings = [];
  for (const rule of RULES) {
    if (allow.includes(rule.id)) continue;
    const hits = rule.project
      ? rule.project(files)
      : files.flatMap((f) => rule.scan(f.text, f).map((h) => ({ file: f, ...h })));
    for (const h of hits) {
      findings.push({
        rule: rule.id, severity: rule.severity, name: rule.name, ref: rule.ref,
        file: h.file.path, line: lineOf(h.file.text, h.index), snippet: h.snippet ?? "", note: h.note ?? "",
      });
    }
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  return { files: files.length, findings };
}

// ---------- CLI ----------

function parseArgs(argv) {
  const opts = { paths: [], json: false, allow: [], listRules: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--list-rules") opts.listRules = true;
    else if (a === "--allow") opts.allow.push(...(argv[++i] ?? "").split(",").filter(Boolean));
    else if (a.startsWith("--allow=")) opts.allow.push(...a.slice(8).split(",").filter(Boolean));
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("-")) throw new Error(`알 수 없는 옵션: ${a}`);
    else opts.paths.push(a);
  }
  return opts;
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 1; }
  if (opts.help || (!opts.listRules && opts.paths.length === 0)) {
    console.error("사용법: node detect.mjs <파일|폴더>... [--json] [--allow 규칙,규칙] [--list-rules]");
    return opts.help ? 0 : 1;
  }
  if (opts.listRules) {
    for (const r of RULES) console.log(`${r.severity.padEnd(8)} ${r.id.padEnd(26)} ${r.name}  (${r.ref})`);
    console.log(`\n정적 검사로 찾지 않는 항목: ${NOT_COVERED.join(", ")}`);
    return 0;
  }
  const unknown = opts.allow.filter((id) => !RULES.some((r) => r.id === id));
  if (unknown.length) { console.error(`알 수 없는 규칙: ${unknown.join(", ")}`); return 1; }

  let result;
  try { result = detect(opts.paths.map((p) => resolve(p)), { allow: opts.allow }); } catch (e) { console.error(e.message); return 1; }
  if (result.files === 0) { console.error("검사할 파일이 없음"); return 1; }

  const counts = { high: 0, medium: 0, advisory: 0 };
  result.findings.forEach((f) => counts[f.severity]++);
  const cwd = process.cwd();

  if (opts.json) {
    console.log(JSON.stringify({ ...result, counts, allowed: opts.allow, notCovered: NOT_COVERED,
      findings: result.findings.map((f) => ({ ...f, file: relative(cwd, f.file) })) }, null, 2));
  } else {
    console.log(`webd detect: 파일 ${result.files}개, 지적 ${result.findings.length}건 (high ${counts.high}, medium ${counts.medium}, advisory ${counts.advisory})`);
    if (opts.allow.length) console.log(`허용(DESIGN.md 고정): ${opts.allow.join(", ")}`);
    for (const f of result.findings) {
      console.log(`[${f.severity}] ${f.rule}  ${relative(cwd, f.file)}:${f.line}  ${f.name}${f.note ? ` (${f.note})` : ""}`);
      if (f.snippet) console.log(`    ${f.snippet}`);
    }
    console.log(`\n정적 검사 범위 밖: ${NOT_COVERED.join(", ")} → 렌더 확인과 비평에서 본다.`);
  }
  return counts.high + counts.medium > 0 ? 2 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
