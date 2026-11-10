// editor-app.mjs — 컴포넌트 CSS 편집 화면. editor-server.mjs가 같은 출처로 내준다.
// 사용자가 CSS를 직접 고친다: 요소를 골라 걸린 규칙의 속성·값을 고치거나(스타일 탭), <style> 원문을 바로 고친다(CSS 전체 탭).
// 고치는 대로 미리보기에 반영하고, 저장해야 파일(새 버전)에 남는다. 박스 모델(margin·border·padding·content)은 색으로 겹쳐 보여 준다.

import {
  parseCss, setDecl, insertDecl, styleBlocks, replaceStyleBlocks, specificity, cmpSpec, splitSelectors,
  varRefs, countVarUses, nudge, lineOf,
} from "./css-model.mjs";
import { initExport } from "./export-panel.mjs";

const $ = (id) => document.getElementById(id);
/** 로컬 시간대 오프셋을 붙인 ISO 문자열(library.mjs의 localIso와 같은 형식) */
function nowLocal(d = new Date()) {
  const p = (x) => String(Math.abs(x)).padStart(2, "0"); const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? "+" : "-"}${p(Math.trunc(off / 60))}:${p(off % 60)}`;
}
const TOKEN = new URLSearchParams(location.search).get("t") || "";
const ID = decodeURIComponent(location.pathname.split("/").filter(Boolean)[1] || "");
const STATE_PSEUDO = /:(hover|focus|focus-visible|focus-within|active|visited|target)\b/g;

const S = {
  meta: null, source: "", hash: "", saved: [], styles: [], undo: [], redo: [], log: [],
  selected: null, selPath: null, hovered: null, pick: false, all: false, editable: true, editing: null, conflict: false,
};
let win = null, doc = null, styleEls = [], needDraw = true, draftTimer = null, firstLoad = true;
const collapsed = new Set();

// ---------- 서버 ----------

// 토큰은 주소의 ?t= 또는 서버가 남긴 쿠키(목록에서 넘어온 경우)로 확인한다.
function api(path = "", opt = {}) {
  return fetch(`/api/${encodeURIComponent(ID)}${path}`, {
    ...opt, headers: { ...(TOKEN ? { "x-webd-token": TOKEN } : {}), "content-type": "application/json" }, cache: "no-store",
  });
}

async function load() {
  const r = await api();
  if (!r.ok) { banner(`불러오지 못했습니다 (${r.status}). 터미널에 나온 주소로 다시 여세요.`); return; }
  const d = await r.json();
  $("back").hidden = !d.library;
  S.meta = d.meta; S.source = d.html; S.hash = d.hash; S.conflict = false;
  $("canvas").classList.toggle("ui-checkerboard", !d.meta.background);
  $("preview-bg").textContent = d.meta.background ? "조각 원본 배경" : "투명 배경";
  S.saved = styleBlocks(d.html);
  S.styles = S.saved.slice(); S.undo = []; S.redo = []; S.log = []; S.editing = null;
  $("name").textContent = d.meta.name;
  $("cid").textContent = d.meta.id;
  document.title = `${d.meta.name} · CSS 편집`;
  if (firstLoad) setupViewports(d.meta.viewport);
  hideBanner();
  $("frame").src = `/lib/${encodeURIComponent(ID)}/component.html?h=${d.hash}`;
  updateState();
  if (firstLoad && d.draft && d.draft.baseHash === d.hash && Array.isArray(d.draft.styles) &&
      d.draft.styles.length === S.saved.length && d.draft.styles.some((t, i) => t !== S.saved[i])) {
    const when = String(d.draft.savedAt || "").slice(0, 16).replace("T", " ");
    banner(`저장하지 않은 화면 변경이 남아 있습니다${when ? ` (${when})` : ""}.`, [
      ["이어서 편집", () => { record(); S.styles = d.draft.styles.slice(); S.log = d.draft.log || []; afterChange(); hideBanner(); }],
      ["버리기", () => { api("/draft", { method: "POST", body: "null" }); hideBanner(); }],
    ]);
  }
  firstLoad = false;
}

async function save(force = false) {
  if (S.editing) commitEditing();
  if (!isDirty() && !force) return;
  let html;
  try { html = replaceStyleBlocks(S.source, S.styles); } catch (e) { banner(e.message); return; }
  setState("저장 중…");
  const r = await api("/save", { method: "POST", body: JSON.stringify({ html, baseHash: S.hash, force }) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 409) {
    S.conflict = true; updateState();
    banner("편집을 시작한 뒤 파일이 바뀌어 저장하지 않았습니다(다른 작업이나 창에서 저장한 것으로 보입니다).", [
      ["내 화면 내용으로 덮어쓰기", () => save(true)],
      ["파일 다시 불러오기 (화면 변경 버림)", () => discardAndReload()],
    ]);
    return;
  }
  if (!r.ok) { banner(`저장하지 못했습니다: ${d.error || r.status}`); updateState(); return; }
  S.source = d.html; S.hash = d.hash; S.meta = d.meta; S.conflict = false;
  S.saved = styleBlocks(d.html); S.log = [];
  hideBanner(); updateState(`저장됨 · 버전 ${d.meta.versions}`);
}

/** 화면 변경을 버리고 파일을 다시 읽는다. 남은 초안도 지운다. */
async function discardAndReload() {
  clearTimeout(draftTimer);
  await api("/draft", { method: "POST", body: "null" }).catch(() => {});
  await load();
}

function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const body = isDirty()
      ? { baseHash: S.hash, baseUpdatedAt: S.meta.updatedAt, savedAt: nowLocal(), styles: S.styles, log: S.log }
      : null;
    api("/draft", { method: "POST", body: JSON.stringify(body) }).catch(() => {});
  }, 800);
}

function listen() {
  const es = new EventSource(`/api/${encodeURIComponent(ID)}/events${TOKEN ? `?t=${encodeURIComponent(TOKEN)}` : ""}`);
  es.onmessage = (ev) => {
    let d; try { d = JSON.parse(ev.data); } catch { return; }
    if (!d.hash || d.hash === S.hash) return;
    if (!isDirty()) { load().then(() => setState("파일이 바뀌어 다시 불러옴")); return; }
    S.conflict = true; updateState();
    banner("파일이 밖에서 바뀌었습니다(다른 작업이나 창에서 저장). 화면에 저장하지 않은 변경이 있습니다.", [
      ["파일 다시 불러오기 (화면 변경 버림)", () => discardAndReload()],
      ["화면 변경 유지", () => hideBanner()],
    ]);
  };
}

// ---------- 상태 ----------

const isDirty = () => S.styles.length !== S.saved.length || S.styles.some((t, i) => t !== S.saved[i]);
function setState(text) { $("state").textContent = text; }
function updateState(text) {
  const dirty = isDirty();
  $("state").classList.toggle("dirty", dirty);
  setState(text || (dirty ? `저장 안 한 변경${S.log.length ? ` ${S.log.length}개` : ""}` : "저장됨"));
  $("save").disabled = !dirty || !S.editable;
  $("undo").disabled = !S.undo.length; $("redo").disabled = !S.redo.length;
  $("ver").textContent = S.meta ? `버전 ${S.meta.versions} · 수정 ${S.meta.updatedAt.slice(0, 16).replace("T", " ")}` : "";
}
function banner(text, actions = []) {
  const b = $("banner"); b.replaceChildren(document.createTextNode(text));
  for (const [label, fn] of actions) { const btn = document.createElement("button"); btn.type = "button"; btn.textContent = label; btn.onclick = fn; b.append(btn); }
  b.hidden = false;
}
function hideBanner() { $("banner").hidden = true; }

/** 바꾸기 전 상태를 되돌리기 목록에 넣는다. */
function record(pre = S.styles) { S.undo.push({ styles: pre.slice(), log: S.log.slice() }); if (S.undo.length > 200) S.undo.shift(); S.redo = []; }
function afterChange({ panel = true } = {}) {
  applyStyles(); updateState(); scheduleDraft();
  if (panel) { renderPanel(); renderBlocks(); }
}
function undo() {
  if (S.editing) commitEditing();
  const prev = S.undo.pop(); if (!prev) return;
  S.redo.push({ styles: S.styles.slice(), log: S.log.slice() });
  S.styles = prev.styles; S.log = prev.log; afterChange();
}
function redo() {
  const next = S.redo.pop(); if (!next) return;
  S.undo.push({ styles: S.styles.slice(), log: S.log.slice() });
  S.styles = next.styles; S.log = next.log; afterChange();
}

// ---------- 미리보기 ----------

const norm = (s) => String(s).replace(/\r\n?/g, "\n");
function applyStyles() {
  if (!S.editable) return;
  let changed = false;
  styleEls.forEach((el, i) => { if (norm(el.textContent) !== norm(S.styles[i])) { el.textContent = S.styles[i]; changed = true; } });
  needDraw = true;
  if (changed) exp?.stylesChanged();
}
/** 지금 화면 그대로의 문서(저장 안 한 CSS 변경 포함). 내보내기가 쓴다. */
function currentHtml() {
  if (!S.source) throw new Error("아직 조각을 불러오지 못했습니다.");
  return S.editable ? replaceStyleBlocks(S.source, S.styles) : S.source;
}

function setupViewports(vp) {
  const sel = $("vp");
  const saved = vp?.width || 1200;
  const height = vp?.height || 720;
  const opts = [[String(saved), `${saved}×${height}px (저장 크기)`], ...[1440, 1200, 768, 375].filter((w) => w !== saved).map((w) => [String(w), `${w}px`]), ["fit", "패널 폭에 맞춤"]];
  for (const [v, t] of opts) sel.append(new Option(t, v));
  sel.value = matchMedia("(max-width: 1400px)").matches ? "fit" : String(saved);
  const apply = () => {
    $("canvas").style.width = sel.value === "fit" ? "100%" : sel.value + "px";
    $("canvas").style.height = height + "px";
    $("preview-size").textContent = `${sel.value === "fit" ? "패널 폭" : sel.value + "px"} × ${height}px`;
    needDraw = true;
  };
  sel.addEventListener("change", apply); apply();
}

$("frame").addEventListener("load", () => {
  win = $("frame").contentWindow; doc = $("frame").contentDocument;
  if (!doc) { banner("미리보기 문서에 접근하지 못했습니다."); return; }
  styleEls = [...doc.querySelectorAll("style")];
  S.editable = styleEls.length === S.saved.length && styleEls.every((el, i) => norm(el.textContent) === norm(S.saved[i]));
  if (!S.editable) banner("이 컴포넌트는 스크립트가 <style>을 더하거나 바꿔서 화면에서 편집할 수 없습니다. 고칠 내용을 에이전트에게 말로 요청하세요.");
  applyStyles();
  doc.addEventListener("mousemove", (e) => { if (!S.pick) return; const t = e.target; S.hovered = t && t.nodeType === 1 && t !== doc.documentElement ? t : null; needDraw = true; }, true);
  doc.addEventListener("mouseleave", () => { S.hovered = null; needDraw = true; });
  doc.addEventListener("click", (e) => { if (!S.pick) return; e.preventDefault(); e.stopPropagation(); select(e.target); }, true);
  doc.addEventListener("submit", (e) => { if (S.pick) e.preventDefault(); }, true);
  doc.addEventListener("keydown", onKey);
  win.addEventListener("scroll", () => { needDraw = true; }, { passive: true });
  win.addEventListener("resize", () => { needDraw = true; });
  S.selected = S.selPath ? resolvePath(S.selPath) : null;
  renderTree(); renderPanel(); renderBlocks(); updateState();
  exp?.frameLoaded();
  new MutationObserver(() => {
    if (S.selected && !S.selected.isConnected) { S.selected = null; S.selPath = null; needDraw = true; renderPanel(); }
    else if (S.selected) S.selPath = pathOf(S.selected);
    renderTree();
  }).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["id", "class"] });
});

function pathOf(el) { const p = []; while (el && el.parentElement) { p.unshift([...el.parentElement.children].indexOf(el)); el = el.parentElement; } return p; }
function resolvePath(p) { let el = doc.documentElement; for (const i of p) { el = el?.children[i]; if (!el) return null; } return el; }

function select(el, focusTree = false) {
  if (!el || el.nodeType !== 1) return;
  if (S.editing) commitEditing();
  S.selected = el; S.selPath = pathOf(el); needDraw = true;
  for (let n = el.parentElement; n && n !== doc.documentElement; n = n.parentElement) collapsed.delete(pathOf(n).join("."));
  renderTree();
  if (focusTree && !matchMedia("(max-width: 760px)").matches) $("tree").querySelector('[aria-selected="true"] > .tree-row > .tree-pick')?.focus();
  if (matchMedia("(max-width: 760px)").matches) showMobilePane("style");
  // 내보내기 탭을 보는 중이면 탭을 바꾸지 않고 내보내기 대상만 따라 바꾼다
  if (currentTab === "export") exp?.selectionChanged(el); else showTab("rules");
  renderPanel();
}

function renderTree() {
  const root = $("tree");
  if (!doc?.body) { root.replaceChildren(); $("tree-count").textContent = ""; return; }
  const visualChildren = (node) => [...node.children].filter((child) => !["SCRIPT", "STYLE", "TEMPLATE"].includes(child.tagName));
  const iconFor = (node) => {
    const tag = node.tagName.toLowerCase();
    if (tag === "body") return "layout-template";
    if (tag === "button") return "mouse-pointer-2";
    if (tag === "a") return "link";
    if (tag === "img" || tag === "picture" || tag === "canvas" || tag === "video") return "image";
    if (tag === "input" || tag === "textarea" || tag === "select") return "text-cursor-input";
    if (tag === "label") return "tag";
    if (tag === "svg") return "shapes";
    if (["ul", "ol", "li", "dl", "dt", "dd"].includes(tag)) return "list";
    if (["table", "thead", "tbody", "tr", "td", "th"].includes(tag)) return "table";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "p") return "align-left";
    if (tag === "form") return "form-input";
    if (tag === "span" || tag === "strong" || tag === "em" || tag === "small") return "type";
    return "square";
  };
  function branch(node) {
    const path = pathOf(node).join(".");
    const children = visualChildren(node);
    const item = document.createElement("div"); item.className = "tree-item"; item.dataset.path = path; item.setAttribute("role", "treeitem");
    item.setAttribute("aria-selected", String(node === S.selected));
    if (children.length) item.setAttribute("aria-expanded", String(!collapsed.has(path)));
    const row = document.createElement("div"); row.className = "tree-row";
    const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "tree-toggle";
    if (children.length) {
      toggle.textContent = collapsed.has(path) ? "▸" : "▾";
      toggle.setAttribute("aria-label", `${label(node)} 하위 요소 ${collapsed.has(path) ? "펼치기" : "접기"}`);
      toggle.onclick = () => {
        collapsed.has(path) ? collapsed.delete(path) : collapsed.add(path);
        renderTree();
        [...root.querySelectorAll(".tree-item")].find((item) => item.dataset.path === path)?.querySelector(":scope > .tree-row > .tree-toggle")?.focus();
      };
    } else { toggle.disabled = true; toggle.setAttribute("aria-hidden", "true"); }
    const pick = document.createElement("button"); pick.type = "button"; pick.className = "tree-pick";
    const icon = document.createElement("span"); icon.className = "tree-icon"; icon.setAttribute("aria-hidden", "true");
    icon.style.maskImage = `url(/assets/icon-${iconFor(node)}.svg)`;
    pick.append(icon, document.createTextNode(label(node)));
    pick.title = label(node); pick.onclick = () => select(node, true);
    row.append(toggle, pick); item.append(row);
    if (children.length && !collapsed.has(path)) {
      const group = document.createElement("div"); group.className = "tree-children"; group.setAttribute("role", "group");
      for (const child of children) group.append(branch(child));
      item.append(group);
    }
    return item;
  }
  root.replaceChildren(branch(doc.body));
  $("tree-count").textContent = `${1 + [...doc.body.querySelectorAll("*")].filter((node) => !["SCRIPT", "STYLE", "TEMPLATE"].includes(node.tagName)).length}개 요소`;
}

// ---------- 박스 모델 오버레이 ----------

function boxOf(el) {
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  const cs = win.getComputedStyle(el); const n = (p) => parseFloat(cs.getPropertyValue(p)) || 0;
  const four = (pre, post = "") => ["top", "right", "bottom", "left"].map((s) => n(`${pre}-${s}${post}`));
  return { r, m: four("margin"), b: four("border", "-width"), p: four("padding") };
}
function addBox(frag, cls, x, y, w, h, bw) {
  const d = document.createElement("div"); d.className = cls;
  d.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px;border-width:${bw ? bw.map((v) => Math.max(0, v) + "px").join(" ") : "0"}`;
  frag.append(d); return d;
}
function layers(frag, bx, extra, content = true) {
  const { r, m, b, p } = bx; const M = m.map((v) => Math.max(0, v));
  addBox(frag, `ov-m ${extra}`, r.left - M[3], r.top - M[0], r.width + M[1] + M[3], r.height + M[0] + M[2], M);
  addBox(frag, `ov-b ${extra}`, r.left, r.top, r.width, r.height, b);
  addBox(frag, `ov-p ${extra}`, r.left + b[3], r.top + b[0], r.width - b[1] - b[3], r.height - b[0] - b[2], p);
  if (content) addBox(frag, `ov-c ${extra}`, r.left + b[3] + p[3], r.top + b[0] + p[0], r.width - b[1] - b[3] - p[1] - p[3], r.height - b[0] - b[2] - p[0] - p[2]);
}
function label(el) {
  let s = el.tagName.toLowerCase();
  if (el.id) s += "#" + el.id;
  if (el.classList.length) s += "." + [...el.classList].slice(0, 3).join(".");
  return s;
}
let lastKey = "";
function draw() {
  if (needDraw && doc) {
    needDraw = false;
    const items = [];
    if (S.all && doc.body) for (const el of [...doc.body.querySelectorAll("*")].slice(0, 800)) items.push([el, "ov-all"]);
    if (S.pick && S.hovered && S.hovered !== S.selected && S.hovered.isConnected) items.push([S.hovered, "ov-hover"]);
    if (S.selected && S.selected.isConnected) items.push([S.selected, "ov-sel"]);
    const boxes = items.map(([el, cls]) => [el, cls, boxOf(el)]).filter((x) => x[2]);
    const key = boxes.map(([, cls, bx]) => cls + [bx.r.left, bx.r.top, bx.r.width, bx.r.height, ...bx.m, ...bx.b, ...bx.p].map((v) => Math.round(v * 10)).join(",")).join("|");
    if (key !== lastKey) {
      lastKey = key;
      const frag = document.createDocumentFragment();
      for (const [el, cls, bx] of boxes) {
        layers(frag, bx, cls, cls !== "ov-all");
        if (cls === "ov-sel") {
          const t = addBox(frag, "ov-tag", 0, 0, 0, 0);
          t.style.width = "auto"; t.style.height = "auto";
          t.textContent = `${label(el)}  ${Math.round(bx.r.width)}×${Math.round(bx.r.height)}`;
          const top = bx.r.top - Math.max(0, bx.m[0]);
          t.style.left = Math.max(0, bx.r.left) + "px";
          t.style.top = (top > 22 ? top - 21 : bx.r.bottom + Math.max(0, bx.m[2]) + 2) + "px";
        }
      }
      $("overlay").replaceChildren(frag);
    }
  }
  requestAnimationFrame(draw);
}
setInterval(() => { needDraw = true; }, 300); // 애니메이션·폰트 로딩으로 바뀌는 크기 따라가기
requestAnimationFrame(draw);

// ---------- 규칙 찾기 ----------

function mediaOk(conds) {
  return conds.every((c) => {
    const m = /^@(media|supports)\s+([\s\S]+)$/i.exec(c.trim());
    if (!m) return true;
    try { return m[1].toLowerCase() === "media" ? win.matchMedia(m[2]).matches : win.CSS.supports(m[2]); } catch { return true; }
  });
}
/** el에 걸린 규칙. 명시도 높은 것·나중 것이 먼저. state: :hover 같은 상태일 때만 걸리는 규칙 */
function matchedRules(el, parsed) {
  const out = [];
  parsed.forEach(({ rules }, bi) => {
    for (const rule of rules) {
      if (!mediaOk(rule.media)) continue;
      let best = null, state = null;
      for (const part of splitSelectors(rule.selector)) {
        if (/::/.test(part)) continue;
        try {
          if (el.matches(part)) { const sp = specificity(part); if (!best || cmpSpec(sp, best) > 0) best = sp; }
          else {
            const pseudos = part.match(STATE_PSEUDO);
            if (pseudos) {
              const bare = part.replace(STATE_PSEUDO, "").trim();
              if (bare && !/[>+~]$/.test(bare) && el.matches(bare)) state = state || pseudos.join("");
            }
          }
        } catch { /* 브라우저가 모르는 선택자 */ }
      }
      if (best) out.push({ bi, rule, spec: best, order: bi * 1e6 + rule.index, state: null });
      else if (state) out.push({ bi, rule, spec: [0, 0, 0], order: bi * 1e6 + rule.index, state });
    }
  });
  out.sort((a, b) => (a.state ? 1 : 0) - (b.state ? 1 : 0) || cmpSpec(b.spec, a.spec) || b.order - a.order);
  return out;
}
/** 같은 속성이 여러 규칙에 있으면 이긴 것 하나만 남기고 나머지를 '덮임'으로 표시할 키 집합 */
function overridden(matches) {
  const winner = new Map(); const all = [];
  for (const m of matches) {
    if (m.state) continue;
    m.rule.decls.map((d, di) => [d, di]).reverse().forEach(([d, di]) => { if (!d.disabled) all.push({ key: `${m.bi}:${m.rule.index}:${di}`, name: d.name.toLowerCase(), imp: /!important\s*$/i.test(d.value) }); });
  }
  for (const x of all) { const w = winner.get(x.name); if (!w || (x.imp && !w.imp)) winner.set(x.name, x); }
  return new Set(all.filter((x) => winner.get(x.name) !== x).map((x) => x.key));
}
function tokenDefs(parsed) {
  const defs = new Map();
  parsed.forEach(({ rules }, bi) => {
    for (const rule of rules) {
      if (!mediaOk(rule.media)) continue;
      if (!splitSelectors(rule.selector).some((p) => p === ":root" || p === "html")) continue;
      rule.decls.forEach((d, di) => { if (!d.disabled && d.name.startsWith("--")) defs.set(d.name, { bi, rule, di, decl: d }); });
    }
  });
  return defs;
}

// ---------- 스타일 패널 ----------

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "text") n.textContent = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
}

function renderPanel() {
  if (S.editing) return;
  const root = $("rules");
  const keep = document.activeElement?.dataset?.key;
  root.replaceChildren();
  const target = S.selected && S.selected.isConnected ? S.selected : null;
  $("hint").hidden = Boolean(target);
  if (!target) return;
  const parsed = S.styles.map((t) => parseCss(t));
  const matches = matchedRules(target, parsed);
  const over = overridden(matches);
  const defs = tokenDefs(parsed);
  const cs = win.getComputedStyle(target);

  // 경로
  const chain = []; for (let n = target; n && n !== doc.documentElement; n = n.parentElement) chain.unshift(n);
  root.append(el("ol", { class: "crumbs", "aria-label": "요소 경로" }, ...chain.map((n) => el("li", {},
    n === target ? el("span", { "aria-current": "true", text: label(n) }) : el("button", { type: "button", text: label(n), onclick: () => select(n) })))));

  // 박스 모델 그림
  const bx = boxOf(target);
  if (bx) {
    const v = (arr, cls) => ["t", "r", "b", "l"].map((s, i) => el("span", { class: `v ${s}`, text: fmt(arr[i]) }));
    root.append(el("div", { class: "boxmodel", role: "img", "aria-label": `margin ${bx.m.map(fmt).join(" ")}, border ${bx.b.map(fmt).join(" ")}, padding ${bx.p.map(fmt).join(" ")}, 내용 ${fmt(bx.r.width - bx.b[1] - bx.b[3] - bx.p[1] - bx.p[3])}×${fmt(bx.r.height - bx.b[0] - bx.b[2] - bx.p[0] - bx.p[2])}` },
      el("div", { class: "bm bm-m" }, el("span", { class: "lbl", text: "margin" }), ...v(bx.m),
        el("div", { class: "bm bm-b" }, el("span", { class: "lbl", text: "border" }), ...v(bx.b),
          el("div", { class: "bm bm-p" }, el("span", { class: "lbl", text: "padding" }), ...v(bx.p),
            el("div", { class: "bm-c", text: `${fmt(bx.r.width - bx.b[1] - bx.b[3] - bx.p[1] - bx.p[3])} × ${fmt(bx.r.height - bx.b[0] - bx.b[2] - bx.p[0] - bx.p[2])}` }))))));
  }

  if (!S.editable) { root.append(el("p", { class: "note", text: "이 컴포넌트는 화면에서 편집할 수 없습니다(위 안내 참고)." })); return; }

  // 이 요소가 쓰는 토큰
  const used = new Set();
  for (const m of matches) if (!m.state) for (const d of m.rule.decls) if (!d.disabled) for (const v of varRefs(d.value)) used.add(v);
  if (used.size) {
    root.append(el("h3", { class: "sect", text: "이 요소가 쓰는 토큰 — 여기서 바꾸면 그 토큰을 쓰는 곳이 모두 바뀝니다" }));
    const box = el("div", { class: "rule" });
    const list = el("ul", { class: "decls" });
    for (const name of used) {
      const def = defs.get(name);
      if (!def) { list.append(el("li", { class: "note", text: `${name}: 정의를 찾지 못함` })); continue; }
      const uses = countVarUses(S.styles, name);
      list.append(declRow(def.bi, def.rule.index, def.di, def.decl, { extraText: `${uses}곳에서 씀 · ${def.rule.selector} · ${lineOf(S.styles[def.bi], def.decl.start)}행` }));
    }
    box.append(list); root.append(box);
  }

  root.append(el("h3", { class: "sect", text: matches.length ? "걸린 규칙 — 위쪽이 우선" : "이 요소에 걸린 규칙이 없습니다" }));
  for (const m of matches) {
    const parts = splitSelectors(m.rule.selector);
    const sel = el("span", { class: "sel" });
    parts.forEach((p, i) => {
      let hit = false; try { hit = target.matches(p); } catch {}
      if (i) sel.append(el("span", { class: "dim", text: ", " }));
      sel.append(hit || m.state ? document.createTextNode(p) : el("span", { class: "dim", text: p }));
    });
    const card = el("section", { class: "rule" },
      el("header", {}, sel, el("span", { class: "where", text: `${S.styles.length > 1 ? `스타일 ${m.bi + 1} · ` : ""}${lineOf(S.styles[m.bi], m.rule.bodyStart)}행` })),
      m.rule.media.length ? el("div", { class: "media", text: m.rule.media.join(" › ") }) : null,
      m.state ? el("div", { class: "media", text: `${m.state} 상태일 때만 적용` }) : null);
    card.append(el("div", { class: "decl-head", "aria-hidden": "true" }, el("span", { text: "속성" }), el("span", { text: "값" })));
    const list = el("ul", { class: "decls" });
    m.rule.decls.forEach((d, di) => list.append(declRow(m.bi, m.rule.index, di, d, { over: over.has(`${m.bi}:${m.rule.index}:${di}`), cs })));
    card.append(list);
    card.append(el("button", { type: "button", class: "add", text: "+ 속성 추가", onclick: (e) => {
      const row = declRow(m.bi, m.rule.index, -1, { name: "", value: "", disabled: false }, {});
      list.append(row); row.querySelector(".nm").focus(); e.currentTarget.hidden = true;
    } }));
    root.append(card);
  }

  if (target.hasAttribute("style")) {
    root.append(el("p", { class: "note", text: `이 요소에는 style 속성이 있습니다: ${target.getAttribute("style")} — style 속성은 화면에서 고치지 않습니다. 필요하면 에이전트에게 말로 요청하세요.` }));
  }

  if (keep) { const k = root.querySelector(`[data-key="${CSS.escape(keep)}"]`); if (k) { k.focus(); if (k.setSelectionRange) k.setSelectionRange(k.value.length, k.value.length); } }
}
const fmt = (n) => { const r = Math.round(n * 10) / 10; return r === 0 ? "–" : String(r); };

/** 선언 한 줄. di가 -1이면 새로 더하는 줄 */
function declRow(bi, ri, di, decl, { over = false, cs = null, extraText = "" }) {
  const keyBase = `${bi}:${ri}:${di}`;
  const li = el("li", { class: `decl${decl.disabled ? " off" : ""}${over ? " over" : ""}` });
  const cb = el("input", { type: "checkbox", "aria-label": `${decl.name || "새 속성"} 켜기/끄기`, title: "끄면 /* 주석 */으로 남습니다" });
  cb.checked = !decl.disabled; cb.disabled = di < 0;
  const nm = el("input", { type: "text", class: "nm", spellcheck: "false", autocomplete: "off", "aria-label": "속성 이름", "data-key": keyBase + ":n", placeholder: "속성" });
  const vl = el("input", { type: "text", class: "vl", spellcheck: "false", autocomplete: "off", "aria-label": `${decl.name || "새 속성"} 값`, "data-key": keyBase + ":v", placeholder: "값" });
  nm.value = decl.name; vl.value = decl.value;
  const fitName = () => { nm.size = Math.max(5, nm.value.length + 1); };
  fitName(); nm.addEventListener("input", fitName);
  li.append(cb, nm, el("span", { class: "colon", text: ":" }), vl);

  const extra = el("div", { class: "extra" });
  if (extraText) extra.append(el("span", { text: extraText }));
  for (const v of varRefs(decl.value)) {
    const val = win.getComputedStyle(doc.documentElement).getPropertyValue(v).trim();
    extra.append(el("span", { text: `${v} = ${val || "(없음)"} · ${countVarUses(S.styles, v)}곳` }));
  }
  if (cs && !decl.disabled && !over && decl.name && !decl.name.startsWith("--") && /var\(|calc\(|%|em\b|rem\b|vw|vh|clamp\(|min\(|max\(/.test(decl.value)) {
    const comp = cs.getPropertyValue(decl.name).trim();
    if (comp) extra.append(el("span", { text: `계산값 ${comp}` }));
  }
  if (cs && /color|background/.test(decl.name) && !decl.disabled) {
    const comp = decl.name.startsWith("--") ? "" : cs.getPropertyValue(decl.name.replace(/^background$/, "background-color")).trim();
    if (comp && /^rgb|^#|^hsl|^oklch|^color/.test(comp)) { const sw = el("span", { class: "sw" }); sw.style.background = comp; extra.prepend(el("span", {}, sw, comp)); }
  }
  if (extra.childNodes.length) li.append(el("span"), extra);

  // 편집 세션: 줄 안에서 포커스가 머무는 동안 하나의 변경으로 친다.
  const compute = (pre) => {
    const next = pre.slice();
    const rule = parseCss(pre[bi]).rules[ri];
    if (!rule) return next;
    const name = nm.value.trim(), value = vl.value.trim();
    if (di < 0) { if (name && value) next[bi] = insertDecl(pre[bi], rule, name, value); return next; }
    const d = rule.decls[di]; if (!d) return next;
    if (!name) return next; // 이름을 비우면 저장(포커스 해제) 때 지운다
    next[bi] = setDecl(pre[bi], d, name, value, d.disabled);
    return next;
  };
  li.addEventListener("focusin", (e) => {
    if (e.target === cb) return;
    if (S.editing && S.editing.row !== li) commitEditing();
    if (S.editing) return;
    const session = { row: li, pre: S.styles.slice() };
    S.editing = session;
    session.finish = (cancel) => {
      const pre = session.pre;
      let next;
      if (cancel) next = pre;
      else if (di >= 0 && !nm.value.trim()) { const d = parseCss(pre[bi]).rules[ri]?.decls[di]; next = pre.slice(); if (d) next[bi] = setDecl(pre[bi], d, "", ""); }
      else next = compute(pre);
      return { pre, next, entry: { selector: parseCss(pre[bi]).rules[ri]?.selector, property: nm.value.trim() || decl.name, from: di < 0 ? null : decl.value, to: !nm.value.trim() ? null : vl.value.trim(), kind: di < 0 ? "add" : !nm.value.trim() ? "remove" : "set" } };
    };
  });
  li.addEventListener("focusout", (e) => { if (S.editing?.row === li && !li.contains(e.relatedTarget)) { commitEditing(); setTimeout(renderPanel, 0); } });
  const live = () => { if (S.editing?.row !== li) return; S.styles = compute(S.editing.pre); applyStyles(); updateState(); };
  nm.addEventListener("input", live); vl.addEventListener("input", live);
  for (const inp of [nm, vl]) inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); if (inp === nm && di < 0) vl.focus(); else inp.blur(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (S.editing?.row === li) { commitEditing(true); nm.value = decl.name; vl.value = decl.value; } inp.blur(); }
    else if (inp === vl && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const step = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (e.key === "ArrowUp" ? 1 : -1);
      const r = nudge(vl.value, vl.selectionStart ?? vl.value.length, step);
      vl.value = r.value; vl.setSelectionRange(r.caret, r.caret); live();
    }
  });
  cb.addEventListener("change", () => {
    if (S.editing) commitEditing();
    const rule = parseCss(S.styles[bi]).rules[ri]; const d = rule?.decls[di]; if (!d) return;
    record(); const next = S.styles.slice(); next[bi] = setDecl(S.styles[bi], d, d.name, d.value, !cb.checked); S.styles = next;
    S.log.push({ at: nowLocal(), kind: cb.checked ? "enable" : "disable", selector: rule.selector, property: d.name, value: d.value });
    afterChange();
  });
  return li;
}

function commitEditing(cancel = false) {
  const ed = S.editing; if (!ed) return;
  S.editing = null;
  const { pre, next, entry } = ed.finish(cancel);
  const changed = next.some((t, i) => t !== pre[i]);
  S.styles = changed ? next : pre;
  if (changed) { record(pre); S.log.push({ at: nowLocal(), ...entry }); }
  afterChange({ panel: false });
  renderBlocks();
}

// ---------- CSS 전체 ----------

function renderBlocks() {
  const root = $("blocks");
  if (root.contains(document.activeElement)) return;
  root.replaceChildren();
  S.styles.forEach((text, i) => {
    const ta = el("textarea", { id: `css-${i}`, spellcheck: "false", autocomplete: "off", wrap: "off", disabled: !S.editable });
    ta.value = text;
    ta.addEventListener("focus", () => { if (S.editing) commitEditing(); ta._pre = S.styles.slice(); });
    ta.addEventListener("input", () => { const next = S.styles.slice(); next[i] = ta.value; S.styles = next; applyStyles(); updateState(); });
    ta.addEventListener("blur", () => {
      const pre = ta._pre || S.styles;
      if (pre[i] !== S.styles[i]) { record(pre); S.log.push({ at: nowLocal(), kind: "css-text", block: i }); }
      updateState(); scheduleDraft(); renderPanel();
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); const s = ta.selectionStart, en = ta.selectionEnd;
        ta.setRangeText("  ", s, en, "end"); ta.dispatchEvent(new Event("input"));
      }
    });
    root.append(el("div", { class: "block" }, el("label", { for: `css-${i}`, text: S.styles.length > 1 ? `<style> ${i + 1}` : "<style>" }), ta));
  });
}

// ---------- 탭·도구 ----------

function showMobilePane(which) {
  document.body.dataset.mobilePane = which;
  for (const button of document.querySelectorAll(".mobile-views button")) button.setAttribute("aria-pressed", String(button.dataset.view === which));
}
for (const button of document.querySelectorAll(".mobile-views button")) button.onclick = () => showMobilePane(button.dataset.view);
showMobilePane("tree");

let currentTab = "rules";
function showTab(which) {
  for (const [t, p] of [["tab-rules", "pane-rules"], ["tab-css", "pane-css"], ["tab-export", "pane-export"]]) {
    const on = t === `tab-${which}`; $(t).setAttribute("aria-selected", String(on)); $(p).hidden = !on;
  }
  currentTab = which;
  document.body.classList.toggle("mode-export", which === "export");
  if (which === "css") renderBlocks();
  if (which === "export") exp?.show(); else exp?.hide();
  const hash = which === "export" ? "#export" : "";
  if (location.hash !== hash) history.replaceState(null, "", location.pathname + location.search + hash);
}
$("tab-rules").onclick = () => showTab("rules");
$("tab-css").onclick = () => showTab("css");
$("tab-export").onclick = () => showTab("export");

const exp = ID ? initExport({
  pane: $("pane-export"), overlay: $("xp-overlay"), api, currentHtml, isDirty: () => isDirty(),
  selected: () => (S.selected && S.selected.isConnected ? S.selected : null),
  pathOf, label, resolve: (p) => (doc ? resolvePath(p) : null),
  frameDoc: () => doc, frameWin: () => win,
}) : null;
$("pick").onclick = () => { S.pick = !S.pick; $("pick").setAttribute("aria-pressed", String(S.pick)); S.hovered = null; needDraw = true; };
$("all").onclick = () => { S.all = !S.all; $("all").setAttribute("aria-pressed", String(S.all)); needDraw = true; };
$("undo").onclick = undo; $("redo").onclick = redo; $("save").onclick = () => save();

function onKey(e) {
  const mod = e.ctrlKey || e.metaKey;
  const typing = /^(INPUT|TEXTAREA)$/.test((e.target.ownerDocument === document ? document.activeElement : e.target)?.tagName || "");
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
  else if (mod && !typing && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && !typing && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
  else if (e.key === "Escape" && !typing && S.selected) { S.selected = null; S.selPath = null; needDraw = true; renderTree(); renderPanel(); }
}
document.addEventListener("keydown", onKey);
addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });

if (!ID) banner("주소에 편집할 항목이 없습니다. library.mjs open으로 연 목록에서 카드를 고르세요.");
else {
  load().then(() => { if (location.hash === "#export") showTab("export"); });
  listen();
}
