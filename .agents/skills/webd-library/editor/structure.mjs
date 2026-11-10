// structure.mjs — 하이라키 구조 편집(복사·붙여넣기·만들기)에 쓰는 텍스트 도구. 브라우저와 테스트(Node) 둘 다에서 쓴다.
//
// 원칙: 구조를 바꾸지 않았으면 원문을 그대로 둔다. 구조를 바꿨을 때만 <body> 안쪽을 바꿔 넣고,
// <head>·<body> 여는 태그·그 밖의 글자는 손대지 않는다.

import { parseCss, splitSelectors, varRefs } from "./css-model.mjs";

/** <body ...>와 </body> 사이 [start, end). 없거나 여러 개면 null(구조 편집을 막는다). */
export function bodyRange(html) {
  const s = String(html);
  const opens = [...s.matchAll(/<body\b[^>]*>/gi)];
  const closes = [...s.matchAll(/<\/body\s*>/gi)];
  if (opens.length !== 1 || closes.length !== 1) return null;
  const start = opens[0].index + opens[0][0].length, end = closes[0].index;
  return end >= start ? { start, end } : null;
}

/**
 * <body> 안쪽을 inner로 바꾼다. 나머지 글자는 그대로.
 * 앞뒤 공백은 원문 것을 지킨다(브라우저는 </body> 뒤 줄바꿈을 body 안으로 옮겨 읽어서, 그대로 쓰면 빈 줄이 늘어난다).
 */
export function replaceBody(html, inner) {
  const r = bodyRange(html);
  if (!r) throw new Error("<body>를 하나로 찾지 못해 구조 변경을 저장할 수 없습니다.");
  const s = String(html), old = s.slice(r.start, r.end);
  const lead = /^\s*/.exec(old)[0], trail = /\s*$/.exec(old)[0];
  const core = String(inner).trim();
  return s.slice(0, r.start) + (core ? lead + core + trail : old.trim() ? lead + trail : old) + s.slice(r.end);
}

// 상태·가상 요소를 떼어 내고 "이 요소에 걸리는 규칙인가"를 본다.
const PSEUDO_ELEMENT = /::?(before|after|marker|placeholder|selection|first-line|first-letter|backdrop|file-selector-button)(?![\w-])/gi;
const STATE_PSEUDO = /:(hover|focus-visible|focus-within|focus|active|visited|target|checked|disabled|enabled)(?![\w-])/gi;
/** 선택자 하나를 요소 일치 검사용으로 바꾼다. 비면 null. */
export function matchableSelector(part) {
  const s = String(part).replace(PSEUDO_ELEMENT, "").replace(STATE_PSEUDO, "").trim();
  if (!s || /[>+~]$/.test(s)) return null;
  return s;
}

/** 규칙 하나를 원문 그대로(@media 같은 조건으로 감싸) 꺼낸다. */
export function ruleText(styleText, rule) {
  let out = `${rule.selector} {${styleText.slice(rule.bodyStart, rule.bodyEnd)}}`;
  for (const cond of [...rule.media].reverse()) out = `${cond} {\n${indent(out)}\n}`;
  return out;
}
const indent = (t) => t.split("\n").map((l) => (l ? "  " + l : l)).join("\n");

/** 이름별 @keyframes 블록 원문 */
function keyframeBlocks(text) {
  const out = new Map();
  for (const m of String(text).matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 0, k = m.index + m[0].length - 1;
    for (; k < text.length; k++) { if (text[k] === "{") depth++; else if (text[k] === "}" && --depth === 0) break; }
    if (!out.has(m[1])) out.set(m[1], text.slice(m.index, k + 1));
  }
  return out;
}

/**
 * 복사한 요소에 필요한 CSS를 모은다.
 * matches(selector) → 복사한 요소(또는 그 자손) 중 하나라도 맞으면 true.
 * ancestorMatches(selector) → 복사한 요소의 조상이 맞으면 true(조상에 정의한 토큰을 함께 담는다).
 * 결과: 걸린 규칙 + 그 규칙이 쓰는 토큰(:root·조상에 정의한 것, 이어서 쓰는 토큰까지) + 쓰는 @keyframes.
 * 토큰은 scope 선택자(복사한 요소 자신의 클래스) 블록에 담는다. 붙여넣은 곳의 같은 이름 토큰을 덮어쓰지 않고,
 * 붙인 요소 안에서만 원래 값으로 보이게 하려는 것. scope가 없으면 :root. 조상의 상태별 값은 담지 않는다.
 */
export function cssForCopy(styles, matches, ancestorMatches = () => false, scope = ":root") {
  const chosen = [], tokenDefs = new Map(), ancestorDefs = new Map(), frames = new Map();
  const hit = (parts, fn) => parts.some((p) => {
    if (fn === ancestorMatches && p !== matchableSelector(p)) return false;   // 조상은 상태 없는 규칙만
    const m = matchableSelector(p); if (!m) return false; try { return fn(m); } catch { return false; }
  });
  styles.forEach((text) => {
    for (const [name, block] of keyframeBlocks(text)) if (!frames.has(name)) frames.set(name, block);
    for (const rule of parseCss(text).rules) {
      const parts = splitSelectors(rule.selector);
      if (parts.some((p) => p === ":root" || p === "html")) {
        for (const d of rule.decls) if (!d.disabled && d.name.startsWith("--")) tokenDefs.set(d.name, d.value);
        continue;
      }
      if (rule.media.length === 0 && hit(parts, ancestorMatches)) {
        for (const d of rule.decls) if (!d.disabled && d.name.startsWith("--")) ancestorDefs.set(d.name, d.value);
      }
      if (hit(parts, matches)) chosen.push({ text, rule });
    }
  });
  for (const [k, v] of ancestorDefs) tokenDefs.set(k, v);   // 조상 쪽이 더 가깝다
  // 쓰는 토큰을 이어서 따라간다(토큰이 다른 토큰을 쓸 수 있음)
  const need = new Set(), queue = [];
  const want = (v) => { for (const n of varRefs(v)) if (!need.has(n) && tokenDefs.has(n)) { need.add(n); queue.push(n); } };
  for (const { rule } of chosen) for (const d of rule.decls) if (!d.disabled) want(d.value);
  while (queue.length) want(tokenDefs.get(queue.shift()));
  // 쓰는 애니메이션
  const usedFrames = [];
  for (const { rule } of chosen) for (const d of rule.decls) {
    if (d.disabled || !/^(-webkit-)?animation(-name)?$/i.test(d.name)) continue;
    for (const name of frames.keys()) if (new RegExp(`(^|[\\s,])${name}($|[\\s,])`).test(d.value) && !usedFrames.includes(name)) usedFrames.push(name);
  }
  const parts = [];
  if (need.size) parts.push(`${scope || ":root"} {\n${[...need].map((n) => `  ${n}: ${tokenDefs.get(n)};`).join("\n")}\n}`);
  for (const { text, rule } of chosen) parts.push(ruleText(text, rule));
  for (const n of usedFrames) parts.push(frames.get(n));
  return parts.join("\n\n");
}

const squash = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,])\s*/g, "$1").replace(/;}/g, "}").trim();

/** 최상위 블록(규칙·@media·@keyframes)으로 나눈다. */
export function topLevelBlocks(css) {
  const out = []; const t = String(css); let depth = 0, start = 0;
  for (let k = 0; k < t.length; k++) {
    const c = t[k];
    if (c === "/" && t[k + 1] === "*") { const e = t.indexOf("*/", k + 2); k = e < 0 ? t.length : e + 1; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { const b = t.slice(start, k + 1).trim(); if (b) out.push(b); start = k + 1; }
  }
  return out;
}

/**
 * 다른 컴포넌트에서 가져온 CSS 중 이 스타일에 아직 없는 블록만 뒤에 붙인다.
 * 이미 같은 블록(공백·주석 무시)이 있으면 건너뛴다. 결과: { text, added }
 */
export function mergeCss(styleText, css, note = "") {
  const have = new Set(topLevelBlocks(styleText).map(squash));
  const add = topLevelBlocks(css).filter((b) => !have.has(squash(b)));
  if (!add.length) return { text: styleText, added: 0 };
  const sep = /\n\s*$/.test(styleText) || !styleText ? "" : "\n";
  const head = note ? `\n/* ${note.replace(/\*\//g, "* /")} */\n` : "\n";
  return { text: `${styleText}${sep}${head}${add.join("\n\n")}\n`, added: add.length };
}

/** 클래스 입력값 → class 속성 값(공백으로 나눈 이름, 중복 제거). 비면 "". */
export function classValue(input) {
  return [...new Set(String(input).trim().split(/\s+/).filter(Boolean).map((c) => c.replace(/^\./, "")))].join(" ");
}

/** 클립보드에 넣을 글: 쓰는 CSS와 HTML */
export function clipboardText(html, css) {
  return css ? `<style>\n${css}\n</style>\n${html}\n` : `${html}\n`;
}
