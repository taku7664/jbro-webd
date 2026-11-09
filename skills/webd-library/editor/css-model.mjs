// css-model.mjs — CSS 원문을 그대로 두고 필요한 자리만 고치는 텍스트 모델.
// 편집 화면(브라우저)과 테스트(Node) 둘 다에서 쓴다. 의존성 없음.
//
// 원칙: 원문을 다시 직렬화하지 않는다. 규칙·선언의 위치(offset)를 기억했다가 그 구간만 바꾼다.
// 그래서 들여쓰기·주석·순서가 그대로 남는다.
// 끈 선언은 개발자 도구처럼 `/* 속성: 값; */` 주석으로 남기고, 다시 읽을 때 꺼진 선언으로 되살린다.

const SKIP_AT = /^@(keyframes|-webkit-keyframes|font-face|page|counter-style|property|font-feature-values)\b/i;

/**
 * CSS 텍스트를 규칙 목록으로 읽는다.
 * 규칙: { index, selector, media: [조건...], bodyStart, bodyEnd, decls: [{ name, value, start, end, disabled }] }
 * bodyStart는 `{` 바로 뒤, bodyEnd는 `}`의 위치. @media·@supports·@layer·@container 안은 조건과 함께 읽고,
 * @keyframes·@font-face 등은 건너뛴다.
 */
export function parseCss(text) {
  const rules = [];
  const n = text.length;
  const groups = []; // [{ cond, end }]
  let i = 0, preludeStart = 0;

  const skipComment = (p) => { const e = text.indexOf("*/", p + 2); return e < 0 ? n : e + 2; };
  const skipString = (p) => { const q = text[p]; let k = p + 1; while (k < n && text[k] !== q) { if (text[k] === "\\") k++; k++; } return k + 1; };
  const matchBrace = (open) => { // `{` 위치 → 짝 `}` 위치
    let depth = 0;
    for (let k = open; k < n; k++) {
      const c = text[k];
      if (c === "/" && text[k + 1] === "*") { k = skipComment(k) - 1; continue; }
      if (c === '"' || c === "'") { k = skipString(k) - 1; continue; }
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) return k;
    }
    return n;
  };

  while (i < n) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") { const e = skipComment(i); if (text.slice(preludeStart, i).trim() === "") preludeStart = e; i = e; continue; }
    if (c === '"' || c === "'") { i = skipString(i); continue; }
    if (c === ";") { i++; preludeStart = i; continue; }
    if (c === "}") { groups.pop(); i++; preludeStart = i; continue; }
    if (c === "{") {
      const prelude = stripComments(text.slice(preludeStart, i)).trim();
      if (prelude.startsWith("@")) {
        if (SKIP_AT.test(prelude)) { i = matchBrace(i) + 1; preludeStart = i; continue; }
        groups.push({ cond: prelude });
        i++; preludeStart = i; continue;
      }
      const close = matchBrace(i);
      const body = text.slice(i + 1, close);
      if (/\{/.test(stripComments(body))) { i = close + 1; preludeStart = i; continue; } // 중첩 CSS는 다루지 않음
      rules.push({
        index: rules.length,
        selector: prelude.replace(/\s+/g, " "),
        media: groups.map((g) => g.cond),
        bodyStart: i + 1,
        bodyEnd: close,
        decls: parseDecls(text, i + 1, close),
      });
      i = close + 1; preludeStart = i; continue;
    }
    i++;
  }
  return { rules };
}

function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ""); }

/** 규칙 본문 [from, to)의 선언. 위치는 CSS 텍스트 전체 기준. */
export function parseDecls(text, from, to) {
  const out = [];
  let p = from;
  while (p < to) {
    while (p < to && /\s/.test(text[p])) p++;
    if (p >= to) break;
    if (text[p] === "/" && text[p + 1] === "*") {
      const e = Math.min(to, (text.indexOf("*/", p + 2) + 1 || to - 1) + 1);
      const inner = text.slice(p + 2, e - 2);
      const m = /^\s*(--[\w-]+|-?[a-zA-Z][\w-]*)\s*:\s*([\s\S]*?)\s*;?\s*$/.exec(inner);
      if (m && !inner.includes("/*")) out.push({ name: m[1], value: m[2], start: p, end: e, disabled: true });
      p = e; continue;
    }
    let k = p, depth = 0;
    while (k < to) {
      const c = text[k];
      if (c === '"' || c === "'") { const q = c; k++; while (k < to && text[k] !== q) { if (text[k] === "\\") k++; k++; } k++; continue; }
      if (c === "(") depth++;
      else if (c === ")") depth = Math.max(0, depth - 1);
      else if (c === ";" && depth === 0) break;
      else if (c === "/" && text[k + 1] === "*" && depth === 0) break;
      k++;
    }
    const hasSemi = text[k] === ";";
    const raw = text.slice(p, k);
    const colon = raw.indexOf(":");
    let end = hasSemi ? k + 1 : k;
    if (!hasSemi) while (end > p && /\s/.test(text[end - 1])) end--;
    if (colon > 0) out.push({ name: raw.slice(0, colon).trim(), value: raw.slice(colon + 1).trim(), start: p, end, disabled: false });
    p = hasSemi ? k + 1 : k;
  }
  return out;
}

/** 선언 하나를 바꾼다. name이 비면 지운다. 결과 텍스트를 돌려준다. */
export function setDecl(text, decl, name, value, disabled = false) {
  name = String(name).trim(); value = String(value).trim();
  if (!name) return removeSpan(text, decl.start, decl.end);
  const body = `${name}: ${value};`;
  return text.slice(0, decl.start) + (disabled ? `/* ${body} */` : body) + text.slice(decl.end);
}

function removeSpan(text, start, end) {
  let s = start, e = end;
  while (e < text.length && (text[e] === " " || text[e] === "\t")) e++;
  const lineStart = text.lastIndexOf("\n", s - 1) + 1;
  const before = text.slice(lineStart, s);
  if (/^[ \t]*$/.test(before) && (text[e] === "\n" || text[e] === "\r" || e >= text.length)) {
    s = lineStart;
    if (text[e] === "\r") e++;
    if (text[e] === "\n") e++;
  }
  return text.slice(0, s) + text.slice(e);
}

/** 규칙 끝에 선언을 더한다. 여러 줄 규칙이면 첫 선언의 들여쓰기를 따른다. */
export function insertDecl(text, rule, name, value) {
  name = String(name).trim(); value = String(value).trim();
  if (!name) return text;
  let t = text;
  let at = rule.bodyEnd;
  while (at > rule.bodyStart && /\s/.test(t[at - 1])) at--;
  const last = [...rule.decls].reverse().find((d) => !d.disabled);
  let shift = 0;
  if (last && t[last.end - 1] !== ";" && last.end === at) { t = t.slice(0, at) + ";" + t.slice(at); at++; shift = 1; }
  const body = t.slice(rule.bodyStart, rule.bodyEnd + shift);
  const decl = `${name}: ${value};`;
  if (body.includes("\n")) {
    const first = rule.decls[0];
    let indent = "  ";
    if (first) { const ls = t.lastIndexOf("\n", first.start - 1) + 1; const m = /^[ \t]*/.exec(t.slice(ls, first.start)); if (m && ls > rule.bodyStart - 1) indent = m[0]; }
    else { const ls = t.lastIndexOf("\n", rule.bodyStart - 1) + 1; indent = (/^[ \t]*/.exec(t.slice(ls)) || [""])[0] + "  "; }
    return t.slice(0, at) + "\n" + indent + decl + t.slice(at);
  }
  return t.slice(0, at) + (at === rule.bodyStart ? " " : " ") + decl + (t[at] === "}" ? " " : "") + t.slice(at);
}

/** HTML에서 <style> 본문을 순서대로 꺼낸다. */
export function styleBlocks(html) {
  return [...String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
}

/** HTML의 <style> 본문을 순서대로 바꿔 넣는다. 나머지 글자는 그대로. 개수가 다르면 오류. */
export function replaceStyleBlocks(html, texts) {
  const found = styleBlocks(html).length;
  if (found !== texts.length) throw new Error(`<style> 개수가 다릅니다: 원문 ${found}개, 바꿀 내용 ${texts.length}개`);
  let k = 0;
  return String(html).replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open, _body, close) => open + texts[k++] + close);
}

/** 선택자 하나(쉼표 없음)의 명시도 [id, class, type]. :where()는 0, :is/:not/:has는 안쪽 중 가장 큰 것. */
export function specificity(sel) {
  let s = String(sel).replace(/"[^"]*"|'[^']*'/g, '""');
  let a = 0, b = 0, c = 0;
  s = s.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, "");
  s = s.replace(/:(is|not|has|matches)\(((?:[^()]|\([^()]*\))*)\)/g, (_, _f, inner) => {
    const best = splitSelectors(inner).map(specificity).sort(cmpSpec).pop() || [0, 0, 0];
    a += best[0]; b += best[1]; c += best[2];
    return "";
  });
  c += (s.match(/::[\w-]+/g) || []).length;
  s = s.replace(/::[\w-]+(\([^)]*\))?/g, " ");
  a += (s.match(/#[\w-]+/g) || []).length;
  b += (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+(\([^)]*\))?/g) || []).length;
  c += (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+(\([^)]*\))?/g, " ").match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return [a, b, c];
}
export function cmpSpec(x, y) { return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }

/** 쉼표로 나눈다(괄호 안 쉼표는 무시). */
export function splitSelectors(sel) {
  const out = []; let depth = 0, cur = "";
  for (const ch of String(sel)) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** 값 안의 var(--x) 이름들 */
export function varRefs(value) { return [...String(value).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]); }

/** 모든 블록에서 var(--name) 쓰는 횟수 */
export function countVarUses(texts, name) {
  const re = new RegExp("var\\(\\s*" + name.replace(/[-]/g, "\\-") + "(?![\\w-])", "g");
  return texts.reduce((n, t) => n + (stripComments(t).match(re) || []).length, 0);
}

/**
 * 커서 근처 숫자를 delta만큼 바꾼다. 개발자 도구처럼 ↑↓ 1, Shift 10, Alt 0.1.
 * 숫자가 없으면 그대로. { value, caret }를 돌려준다.
 */
export function nudge(value, caret, delta) {
  const re = /-?\d*\.?\d+/g;
  let m, pick = null;
  while ((m = re.exec(value))) {
    if (pick === null) pick = m;
    if (caret >= m.index && caret <= m.index + m[0].length) { pick = m; break; }
  }
  if (!pick) return { value, caret };
  const dec = Math.max((pick[0].split(".")[1] || "").length, String(delta).includes(".") ? 1 : 0);
  const num = (parseFloat(pick[0]) + delta).toFixed(dec).replace(/^-0(\.0+)?$/, "0");
  const out = value.slice(0, pick.index) + num + value.slice(pick.index + pick[0].length);
  return { value: out, caret: pick.index + num.length };
}

/** 원문 위치 → 줄 번호(1부터) */
export function lineOf(text, offset) { let l = 1; for (let k = 0; k < offset && k < text.length; k++) if (text[k] === "\n") l++; return l; }
