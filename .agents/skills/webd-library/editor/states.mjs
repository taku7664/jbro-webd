// states.mjs — 조각의 "상태"(호버·누름·비활성·선택됨 …)를 CSS 선택자에서 찾고, 미리보기·내보내기에서 똑같이 건다.
// 편집기(브라우저)·내보내기(헤드리스 페이지)·테스트(Node)가 함께 쓴다. 설계: docs/EXPORT-DESIGN.md 4·6절.
//
// 상태는 요소 종류가 아니라 CSS 규칙에서 생긴다. 찾는 것:
//   가상 클래스  :hover :active :focus-visible :focus :focus-within :checked :disabled
//   속성        [aria-pressed="true"] [aria-selected="true"] [data-state="low"] [disabled] …
//   클래스      .is-active, BEM 변형 .bar--low, 그 밖에 문서에 아직 없는 클래스
// 거는 법:
//   가상 클래스는 선택자를 :is(:hover,[data-webd-hover])로 바꿔 두고(rewriteStateSelectors), 요소에 data-webd-hover를 붙인다.
//   속성·클래스는 요소에 실제로 붙인다. 되돌릴 때는 applyWebdState가 돌려준 기록으로 원래대로.
// applyWebdState·rewriteStateSelectors는 헤드리스 페이지에 함수 원문으로 넘기므로 바깥 변수를 쓰지 않는다.

import { parseCss, splitSelectors } from "./css-model.mjs";

export const PSEUDO_STATES = ["hover", "active", "focus-visible", "focus-within", "focus", "checked", "disabled"];

/**
 * CSS 원문에서 규칙 선택자(@ 규칙 조건 제외)의 상태 가상 클래스를 :is(:x,[data-webd-x])로 바꾼다.
 * 상태를 걸지 않으면 원래와 똑같이 동작하고, 명시도도 같다. 선언 값·주석·@media 조건은 건드리지 않는다.
 * 가상 요소 바로 뒤(::-webkit-scrollbar:hover)는 :is()를 쓸 수 없어 그대로 둔다.
 */
export function rewriteStateSelectors(css) {
  const text = String(css);
  const re = /(?<!::[\w-]*):(hover|active|focus-visible|focus-within|focus|checked|disabled)(?![\w-])/g;
  const fix = (prelude) => prelude.replace(re, (_, n) => `:is(:${n},[data-webd-${n}])`);
  let out = "", start = 0;
  const stack = [];   // "rule" | "at"
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") { const e = text.indexOf("*/", i + 2); i = e < 0 ? text.length : e + 1; continue; }
    if (c === '"' || c === "'") { let k = i + 1; while (k < text.length && text[k] !== c) { if (text[k] === "\\") k++; k++; } i = k; continue; }
    if (c === "{") {
      const prelude = text.slice(start, i);
      const at = /^\s*(\/\*[\s\S]*?\*\/\s*)*@/.test(prelude);
      out += !at && stack[stack.length - 1] !== "rule" ? fix(prelude) : prelude;
      out += "{"; stack.push(at ? "at" : "rule"); start = i + 1;
    } else if (c === "}") { out += text.slice(start, i + 1); stack.pop(); start = i + 1; }
    else if (c === ";") { out += text.slice(start, i + 1); start = i + 1; }
  }
  return out + text.slice(start);
}

/** 선택자 하나(쉼표 없음)의 가상 클래스도 같은 식으로(편집기 스타일 탭에서 지금 상태에 걸리는 규칙을 찾을 때) */
export function rewriteStateSelector(sel) {
  return String(sel).replace(/(?<!::[\w-]*):(hover|active|focus-visible|focus-within|focus|checked|disabled)(?![\w-])/g, (_, n) => `:is(:${n},[data-webd-${n}])`);
}

/**
 * 상태를 건다. tokens: [{ kind: "pseudo"|"attr"|"class", name, value?, owners: [선택자…] }]
 * scope: 이 요소의 자손·조상에만 건다(내보내기 대상, 편집기에서 고른 요소). body면 문서 전체.
 * 돌려주는 기록을 revertWebdState에 넘기면 원래대로 돌아간다.
 */
export function applyWebdState(doc, tokens, scope) {
  const undo = [];
  const body = doc.body;
  const root = scope && scope !== body && scope.isConnected ? scope : null;
  const inScope = (el) => !root || root === el || root.contains(el) || el.contains(root);
  for (const t of tokens || []) {
    const els = new Set();
    for (const owner of t.owners || []) {
      if (owner === "*") { if (root) els.add(root); continue; }
      let found = [];
      try { found = [...doc.querySelectorAll(owner)]; } catch { continue; }
      for (const el of found) if (body.contains(el) && el !== body && inScope(el)) els.add(el);
    }
    for (const el of els) {
      if (t.kind === "pseudo") {
        const a = "data-webd-" + t.name;
        if (!el.hasAttribute(a)) { el.setAttribute(a, ""); undo.push([el, a, null]); }
      } else if (t.kind === "attr") {
        const old = el.getAttribute(t.name);
        const next = t.value == null ? "" : String(t.value);
        if (old !== next) { el.setAttribute(t.name, next); undo.push([el, t.name, old]); }
      } else if (t.kind === "class") {
        if (!el.classList.contains(t.name)) { el.classList.add(t.name); undo.push([el, "\u0000class", t.name]); }
      }
    }
  }
  return undo;
}

export function revertWebdState(undo) {
  for (const [el, a, v] of [...(undo || [])].reverse()) {
    if (a === "\u0000class") el.classList.remove(v);
    else if (v == null) el.removeAttribute(a);
    else el.setAttribute(a, v);
  }
}

// ---------- 선택자 읽기 ----------

/** 선택자 하나를 겹합 선택자(compound) 목록으로. 각 조각: { kind: "tag"|"id"|"class"|"attr"|"pseudo"|"pseudo-el", raw, name, value? } */
export function compounds(part) {
  const s = String(part).trim();
  const out = [[]];
  let i = 0;
  const cur = () => out[out.length - 1];
  const readParens = (k) => { let depth = 0; for (; k < s.length; k++) { if (s[k] === "(") depth++; else if (s[k] === ")" && --depth === 0) return k + 1; } return s.length; };
  while (i < s.length) {
    const c = s[i];
    if (/\s|>|\+|~/.test(c)) {
      let k = i; while (k < s.length && /[\s>+~]/.test(s[k])) k++;
      if (cur().length) out.push([]);
      i = k; continue;
    }
    if (c === "[") {
      let k = i + 1, q = null;
      for (; k < s.length; k++) { if (q) { if (s[k] === "\\") k++; else if (s[k] === q) q = null; } else if (s[k] === '"' || s[k] === "'") q = s[k]; else if (s[k] === "]") break; }
      const raw = s.slice(i, k + 1);
      const m = /^\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*(?:[is]\s*)?)?\]$/.exec(raw);
      cur().push(m ? { kind: "attr", raw, name: m[1].toLowerCase(), op: m[2] || null, value: m[3] ?? m[4] ?? m[5] ?? null } : { kind: "other", raw });
      i = k + 1; continue;
    }
    if (c === ":" && s[i + 1] === ":") {
      const m = /^::[\w-]+/.exec(s.slice(i)); let k = i + (m ? m[0].length : 2);
      if (s[k] === "(") k = readParens(k);
      cur().push({ kind: "pseudo-el", raw: s.slice(i, k) }); i = k; continue;
    }
    if (c === ":") {
      const m = /^:([\w-]+)/.exec(s.slice(i)); let k = i + (m ? m[0].length : 1);
      if (s[k] === "(") k = readParens(k);
      cur().push({ kind: "pseudo", raw: s.slice(i, k), name: (m?.[1] || "").toLowerCase() }); i = k; continue;
    }
    if (c === "." || c === "#") {
      const m = /^[.#](-?[_a-zA-Z -￿][\w -￿-]*|\\.)+/.exec(s.slice(i));
      const raw = m ? m[0] : c;
      cur().push({ kind: c === "." ? "class" : "id", raw, name: raw.slice(1) }); i += raw.length; continue;
    }
    const m = /^(\*|[a-zA-Z][\w-]*)/.exec(s.slice(i));
    if (m) { cur().push({ kind: "tag", raw: m[0], name: m[0].toLowerCase() }); i += m[0].length; continue; }
    cur().push({ kind: "other", raw: c }); i++;
  }
  return out.filter((c) => c.length);
}

const STATE_ATTR_BARE = new Set(["disabled", "checked", "selected", "open"]);
function stateEligibleAttr(t) {
  if (STATE_ATTR_BARE.has(t.name)) return true;
  return /^(aria|data)-/.test(t.name) && t.op === "=" && t.value != null;
}

/** 상태 조각 하나의 이름표와 파일 이름용 키 */
export function tokenInfo(t) {
  const P = { hover: "호버", active: "누름", "focus-visible": "포커스", "focus-within": "안쪽 포커스", focus: "포커스", checked: "체크", disabled: "비활성" };
  if (t.kind === "pseudo") return { id: `:${t.name}`, label: P[t.name] || t.name, key: t.name };
  if (t.kind === "attr") {
    const A = { "aria-pressed": ["켜짐", "pressed"], "aria-selected": ["선택됨", "selected"], "aria-expanded": ["펼침", "expanded"],
      "aria-checked": ["체크", "checked"], "aria-current": ["현재", "current"], "aria-disabled": ["비활성", "disabled"] };
    if (STATE_ATTR_BARE.has(t.name) && (t.value == null || t.value === "")) {
      const B = { disabled: "비활성", checked: "체크", selected: "선택됨", open: "열림" };
      return { id: `[${t.name}]`, label: B[t.name], key: t.name };
    }
    if (A[t.name] && (t.value === "true" || t.name === "aria-current")) return { id: `[${t.name}=${t.value}]`, label: A[t.name][0], key: A[t.name][1] };
    const short = t.name.replace(/^(aria|data)-/, "");
    return { id: `[${t.name}=${t.value}]`, label: `${short}: ${t.value}`, key: `${short}-${t.value}` };
  }
  const name = t.name;
  const bem = /--(.+)$/.exec(name);
  return { id: `.${name}`, label: bem ? `--${bem[1]}` : `.${name}`, key: bem ? bem[1] : name.replace(/^(is|has)-/, "") };
}
const safeKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9가-힣_-]+/g, "-").replace(/^-+|-+$/g, "") || "state";

/**
 * CSS(<style> 원문들)와 문서에서 상태를 찾는다. 문서는 상태를 걸지 않은 모습이어야 한다.
 * 결과: [{ key, label, tokens: [{ kind, name, value, owners }], combo: bool }] — 하나짜리 상태 다음에 CSS에 실제로 있는 조합.
 */
export function findStates(styles, doc, { max = 16, maxCombos = 8 } = {}) {
  const singles = new Map();   // id → { info, token(owners Set) }
  const combos = new Map();    // "id+id" → [id, id]
  const count = (sel) => { try { return doc.querySelectorAll(sel).length; } catch { return -1; } };
  const exists = (sel) => count(sel) > 0;
  for (const text of styles) {
    for (const rule of parseCss(String(text)).rules) {
      for (const part of splitSelectors(rule.selector)) {
        for (const comp of compounds(part)) {
          const pseudos = [], attrsClasses = [], stat = [];
          let afterPseudoEl = false;
          for (const t of comp) {
            if (t.kind === "pseudo-el") { afterPseudoEl = true; continue; }
            if (t.kind === "pseudo" && PSEUDO_STATES.includes(t.name) && !afterPseudoEl) pseudos.push(t);
            else if ((t.kind === "attr" && stateEligibleAttr(t)) || t.kind === "class") attrsClasses.push(t);
            else if (t.kind !== "pseudo-el") stat.push(t);
          }
          if (!pseudos.length && !attrsClasses.length) continue;
          const join = (list) => list.map((t) => t.raw).join("");
          // 1차: 문서에 하나도 없는 속성·클래스는 상태(또는 변형)
          const absent = attrsClasses.filter((t) => !exists(t.raw));
          let rest = attrsClasses.filter((t) => !absent.includes(t));
          // 2차: 빼면 맞는 요소가 늘어나는 속성(형제 중 일부만 가진 aria-pressed="true" 등)
          const varying = [];
          const base = join([...stat, ...rest]);
          if (base && rest.length) {
            const n0 = count(base);
            for (const t of rest) {
              if (t.kind !== "attr") continue;
              const without = join([...stat, ...rest.filter((x) => x !== t)]);
              if (without && count(without) > n0) varying.push(t);
            }
          }
          rest = rest.filter((t) => !varying.includes(t));
          const states = [...pseudos, ...absent, ...varying];
          if (!states.length) continue;
          let owner = join([...stat, ...rest]);
          if (!owner) {
            const attr = states.find((t) => t.kind === "attr");
            const bem = states.find((t) => t.kind === "class" && t.name.includes("--"));
            if (attr && exists(`[${attr.name}]`)) owner = `[${attr.name}]`;
            else if (bem && exists("." + CSSescape(bem.name.split("--")[0]))) owner = "." + CSSescape(bem.name.split("--")[0]);
            else if (states.every((t) => t.kind === "pseudo")) owner = "*";
            else continue;   // 누구에게 걸지 모르는 클래스(.featured 같은)는 건너뜀
          }
          if (owner !== "*" && !exists(owner)) continue;   // 이 문서에 없는 요소의 규칙
          const ids = [];
          for (const t of states) {
            const info = tokenInfo(t);
            if (!singles.has(info.id)) singles.set(info.id, { info, token: { kind: t.kind, name: t.kind === "class" ? t.name : t.name, value: t.kind === "attr" ? (t.value ?? "") : undefined, owners: new Set() } });
            singles.get(info.id).token.owners.add(owner);
            ids.push(info.id);
          }
          const uniq = [...new Set(ids)].sort();
          if (uniq.length > 1) combos.set(uniq.join("+"), uniq);
        }
      }
    }
  }
  const ORDER = ["hover", "active", "focus-visible", "focus", "focus-within", "checked", "disabled"];
  const rank = (s) => (s.token.kind === "pseudo" ? ORDER.indexOf(s.token.name) : 100);
  const list = [...singles.values()].sort((a, b) => rank(a) - rank(b)).slice(0, max);
  const tokenOf = (s) => ({ kind: s.token.kind, name: s.token.name, ...(s.token.kind === "attr" ? { value: s.token.value } : {}), owners: [...s.token.owners] });
  const out = [];
  const usedKeys = new Set(["normal"]);
  const uniqueKey = (k) => { let key = safeKey(k), n = 2; while (usedKeys.has(key)) key = `${safeKey(k)}-${n++}`; usedKeys.add(key); return key; };
  for (const s of list) out.push({ key: uniqueKey(s.info.key), label: s.info.label, tokens: [tokenOf(s)], combo: false });
  const kept = new Map(list.map((s) => [s.info.id, s]));
  let nc = 0;
  for (const ids of combos.values()) {
    if (nc >= maxCombos || !ids.every((id) => kept.has(id))) continue;
    const parts = ids.map((id) => kept.get(id)).sort((a, b) => rank(b) - rank(a));
    out.push({ key: uniqueKey(parts.map((p) => p.info.key).join("+")), label: parts.map((p) => p.info.label).join(" + "), tokens: parts.map(tokenOf), combo: true });
    nc++;
  }
  return out;
}

function CSSescape(s) { return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, (c) => "\\" + c); }
