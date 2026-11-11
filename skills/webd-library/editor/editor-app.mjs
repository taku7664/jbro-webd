// editor-app.mjs — 컴포넌트 CSS 편집 화면. editor-server.mjs가 같은 출처로 내준다.
// 사용자가 CSS를 직접 고친다: 요소를 골라 걸린 규칙의 속성·값을 고치거나(스타일 탭), <style> 원문을 바로 고친다(CSS 전체 탭).
// 고치는 대로 미리보기에 반영하고, 저장해야 파일(새 버전)에 남는다. 박스 모델(margin·border·padding·content)은 색으로 겹쳐 보여 준다.

import {
  parseCss, setDecl, insertDecl, styleBlocks, replaceStyleBlocks, specificity, cmpSpec, splitSelectors,
  varRefs, countVarUses, nudge, lineOf,
} from "./css-model.mjs";
import { initExport } from "./export-panel.mjs";
import { initTooltips } from "./tooltip.mjs";
import { icon as uiIcon } from "./icons.mjs";
import { createMenubar } from "./menubar.mjs";
import { bodyRange, replaceBody, cssForCopy, mergeCss, classValue, clipboardText } from "./structure.mjs";
import { findStates, applyWebdState, revertWebdState, rewriteStateSelectors, rewriteStateSelector } from "./states.mjs";
import { animInfo, seekAnimations, frameTimes, FPS_CHOICES } from "./anim.mjs";

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
  // pick: 켜져 있으면 미리보기에서 왼쪽 클릭 = 요소 선택(기본). 끄면 컴포넌트를 직접 조작한다.
  selected: null, selPath: null, hovered: null, pick: true, all: false, editable: true, editing: null, conflict: false,
  // 캔버스 보기: x·y = 캔버스 왼쪽 위의 무대 안 위치(px), z = 배율
  view: { x: 0, y: 0, z: 1 }, viewSet: false,
  // 구조 편집: 원문을 따로 읽은 문서(model)를 고치고 미리보기에 옮긴다. 저장할 때만 <body> 안쪽을 바꿔 넣는다.
  model: null, savedBody: "", struct: { ok: false, reason: "아직 불러오는 중입니다." },
  // 상태(타임라인): CSS에서 찾은 상태 목록과 지금 미리보기에 건 상태. 미리보기에만 걸고 저장 파일에는 남지 않는다.
  states: [], stateKey: "normal", stateUndo: [],
  // 프레임 줄: 지금 상태에서 도는 CSS 애니메이션. playing이면 그대로 재생, 아니면 frame 칸 시각에 멈춤.
  anim: { length: 0, count: 0, names: [] }, playing: true, frame: 0,
};
const CLIP_KEY = "webd-editor-clipboard";
function buildModel(html) {
  S.model = new DOMParser().parseFromString(html, "text/html");
  S.savedBody = S.model.body.innerHTML;
}
const bodyChanged = () => Boolean(S.model) && S.model.body.innerHTML !== S.savedBody;
/** 저장·내보내기에 쓸 문서: 구조를 바꿨으면 <body> 안쪽을 바꾸고, <style>은 화면의 CSS로 */
function sourceWithEdits() {
  const base = bodyChanged() ? replaceBody(S.source, S.model.body.innerHTML) : S.source;
  return replaceStyleBlocks(base, S.styles);
}
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
  buildModel(d.html);
  $("canvas").classList.toggle("ui-checkerboard", !d.meta.background);
  $("preview-bg").textContent = d.meta.background ? "원래 배경" : "투명 배경";
  S.saved = styleBlocks(d.html);
  S.styles = S.saved.slice(); S.undo = []; S.redo = []; S.log = []; S.editing = null;
  $("name").textContent = d.meta.name;
  $("cid").textContent = d.meta.id;
  document.title = `${d.meta.name} · CSS 편집`;
  if (firstLoad) setupViewports(d.meta.viewport);
  hideBanner();
  $("frame").src = `/lib/${encodeURIComponent(ID)}/component.html?h=${d.hash}`;
  updateState();
  const draftBody = typeof d.draft?.body === "string" && d.draft.body !== S.savedBody ? d.draft.body : null;
  if (firstLoad && d.draft && d.draft.baseHash === d.hash && Array.isArray(d.draft.styles) &&
      d.draft.styles.length === S.saved.length && (draftBody != null || d.draft.styles.some((t, i) => t !== S.saved[i]))) {
    const when = String(d.draft.savedAt || "").slice(0, 16).replace("T", " ");
    banner(`저장하지 않은 화면 변경이 남아 있습니다${when ? ` (${when})` : ""}.`, [
      ["이어서 편집", () => {
        pushUndo({ dom: S.model.body.innerHTML, styles: S.styles.slice(), log: S.log.slice() });
        S.styles = d.draft.styles.slice(); S.log = d.draft.log || [];
        if (draftBody != null) { S.model.body.innerHTML = draftBody; syncLive(S.selPath); }
        afterChange(); hideBanner();
      }],
      ["버리기", () => { api("/draft", { method: "POST", body: "null" }); hideBanner(); }],
    ]);
  }
  firstLoad = false;
}

async function save(force = false) {
  if (S.editing) commitEditing();
  if (!isDirty() && !force) return;
  let html;
  try { html = sourceWithEdits(); } catch (e) { banner(e.message); return; }
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
  // 저장한 원문으로 모델을 다시 만들되, 미리보기와 같은 구조인지 확인해 둔다(경로가 그대로 맞아야 한다)
  buildModel(d.html);
  hideBanner(); updateState(`저장됨 · 버전 ${d.meta.versions}`);
  refreshLibInfo();
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
      ? { baseHash: S.hash, baseUpdatedAt: S.meta.updatedAt, savedAt: nowLocal(), styles: S.styles, log: S.log, ...(bodyChanged() ? { body: S.model.body.innerHTML } : {}) }
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

const isDirty = () => S.styles.length !== S.saved.length || S.styles.some((t, i) => t !== S.saved[i]) || bodyChanged();
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
// 기록 한 칸은 CSS 변경 { styles, log } 이거나 내보내기 설정 변경 { exportSpec } 이다. 둘은 한 줄로 이어진다.
function pushUndo(entry) { S.undo.push(entry); if (S.undo.length > 200) S.undo.shift(); S.redo = []; }
function record(pre = S.styles) { pushUndo({ styles: pre.slice(), log: S.log.slice() }); }
function recordExport(pre) { pushUndo({ exportSpec: pre }); updateState(); }
function afterChange({ panel = true } = {}) {
  applyStyles(); updateState(); scheduleDraft();
  if (panel) { renderPanel(); renderBlocks(); }
}
/** 기록 한 칸을 적용하고, 그 반대 방향 칸을 돌려준다. */
function applyEntry(entry) {
  if (entry.exportSpec) {
    const cur = exp.snapshot();
    exp.setSpec(entry.exportSpec);
    if (currentTab !== "export") showTab("export");   // 무엇이 되돌아갔는지 보이게
    updateState();
    return { exportSpec: cur };
  }
  if ("dom" in entry) {   // 구조 변경(요소 추가·삭제·붙여넣기 등). 같이 바뀐 CSS도 함께 되돌린다
    const cur = { dom: S.model.body.innerHTML, styles: S.styles.slice(), log: S.log.slice() };
    S.model.body.innerHTML = entry.dom; S.styles = entry.styles; S.log = entry.log;
    syncLive(S.selPath); afterChange();
    return cur;
  }
  const cur = { styles: S.styles.slice(), log: S.log.slice() };
  S.styles = entry.styles; S.log = entry.log; afterChange();
  return cur;
}
function undo() {
  if (S.editing) commitEditing();
  const prev = S.undo.pop(); if (!prev) return;
  S.redo.push(applyEntry(prev));
}
function redo() {
  if (S.editing) commitEditing();
  const next = S.redo.pop(); if (!next) return;
  S.undo.push(applyEntry(next));
}

// ---------- 미리보기 ----------

const norm = (s) => String(s).replace(/\r\n?/g, "\n");
function applyStyles() {
  if (!S.editable) return;
  let changed = false;
  // 미리보기에는 상태 가상 클래스를 :is(:hover,[data-webd-hover])로 바꿔 넣는다(타임라인에서 상태를 걸 수 있게). 저장·원문은 그대로.
  styleEls.forEach((el, i) => { const live = rewriteStateSelectors(S.styles[i]); if (norm(el.textContent) !== norm(live)) { el.textContent = live; changed = true; } });
  needDraw = true;
  if (changed) { exp?.stylesChanged(); scheduleStates(); }
}
/** 지금 화면 그대로의 문서(저장 안 한 CSS 변경 포함). 내보내기가 쓴다. */
function currentHtml() {
  if (!S.source) throw new Error("아직 컴포넌트를 불러오지 못했습니다.");
  return S.editable ? sourceWithEdits() : S.source;
}

function setupViewports(vp) {
  const sel = $("vp");
  const saved = vp?.width || 1200;
  const height = vp?.height || 720;
  const opts = [[String(saved), `${saved}×${height}px (저장 크기)`], ...[1440, 1200, 768, 375].filter((w) => w !== saved).map((w) => [String(w), `${w}px`])];
  for (const [v, t] of opts) sel.append(new Option(t, v));
  sel.value = String(saved);
  const apply = () => {
    $("canvas").style.width = sel.value + "px";
    $("canvas").style.height = height + "px";
    $("preview-size").textContent = `${sel.value} × ${height}px`;
    needDraw = true;
    if (S.viewSet) fitView(true); else { S.viewSet = true; requestAnimationFrame(() => fitView(true)); }
  };
  sel.addEventListener("change", apply); apply();
}

// ---------- 캔버스(무대): 스크롤바 없이 이동·확대 ----------
// 왼쪽 클릭 = 요소 선택 · 오른쪽(또는 가운데) 끌기 = 이동 · 그냥 오른쪽 클릭 = 메뉴 · 휠 = 이동 · Ctrl+휠 = 확대·축소
// Space를 누른 채 왼쪽 끌기도 이동. 미리보기 안(iframe)에서 일어난 입력도 같은 함수로 받는다.
const ZMIN = 0.1, ZMAX = 16;
const canvasSize = () => ({ w: $("canvas").offsetWidth, h: $("canvas").offsetHeight });
function applyView() {
  const { x, y, z } = S.view;
  $("canvas").style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${z})`;
  const st = $("stage"), g = 24 * z;
  st.style.backgroundSize = `${g}px ${g}px`;
  st.style.backgroundPosition = `${Math.round(x)}px ${Math.round(y)}px`;
  const zb = $("zoom"); if (zb) zb.textContent = `${Math.round(z * 100)}%`;
}
/** 화면에 맞춤. cap이면 100%보다 크게 키우지 않는다(처음 열 때) */
function fitView(cap = false) {
  const st = $("stage"), { w, h } = canvasSize();
  if (!st.clientWidth || !w) return;
  let z = Math.min((st.clientWidth - 48) / w, (st.clientHeight - 48) / h);
  z = Math.max(ZMIN, Math.min(cap ? 1 : ZMAX, z));
  S.view = { z, x: (st.clientWidth - w * z) / 2, y: (st.clientHeight - h * z) / 2 };
  applyView();
}
function zoomTo(z, ax, ay) {
  const st = $("stage");
  if (ax == null) { ax = st.clientWidth / 2; ay = st.clientHeight / 2; }
  z = Math.max(ZMIN, Math.min(ZMAX, z));
  const k = z / S.view.z;
  S.view = { z, x: ax - (ax - S.view.x) * k, y: ay - (ay - S.view.y) * k };
  applyView();
}
const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
function zoomStep(dir) {
  const z = S.view.z;
  const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 1e-3) ?? ZMAX : [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-3) ?? ZMIN;
  zoomTo(next);
}
/** 입력 좌표를 무대(stage) 기준으로. 미리보기 안에서 온 입력이면 캔버스 배율을 적용한다 */
function stagePoint(e, fromDoc) {
  const sr = $("stage").getBoundingClientRect();
  if (!fromDoc) return { x: e.clientX - sr.left, y: e.clientY - sr.top };
  const fr = $("frame").getBoundingClientRect();
  return { x: fr.left - sr.left + e.clientX * S.view.z, y: fr.top - sr.top + e.clientY * S.view.z };
}
function onWheel(e, fromDoc) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) { const p = stagePoint(e, fromDoc); zoomTo(S.view.z * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), p.x, p.y); return; }
  const k = e.deltaMode ? 16 : 1;
  const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k, dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
  S.view.x -= dx; S.view.y -= dy; applyView();
}
let pan = null, spaceDown = false, suppressMenu = false, pickSheet = null;
/**
 * 요소 선택 중에는 미리보기 안 모든 요소가 클릭을 받게 한다. 장식 층에 pointer-events: none이 걸려 있으면
 * 클릭이 그 요소를 지나 body가 골라지기 때문이다. 문서에 <style>을 넣지 않고 adoptedStyleSheets로 걸어
 * CSS 편집(style 요소 목록)과 저장 파일에는 영향이 없다.
 */
function applyPickCss() {
  if (!doc || !win) return;
  try {
    if (!pickSheet || pickSheet._win !== win) { pickSheet = new win.CSSStyleSheet(); pickSheet.replaceSync("*, *::before, *::after { pointer-events: auto !important; }"); pickSheet._win = win; }
    const rest = [...doc.adoptedStyleSheets].filter((s) => s !== pickSheet);
    doc.adoptedStyleSheets = S.pick ? [...rest, pickSheet] : rest;
  } catch {}
}
addEventListener("keydown", (e) => { if (e.code === "Space" && !isTextField(document.activeElement) && document.activeElement?.tagName !== "BUTTON") { spaceDown = true; document.body.classList.add("space-pan"); } });
addEventListener("keyup", (e) => { if (e.code === "Space") { spaceDown = false; document.body.classList.remove("space-pan"); } });
/** 끌기 시작. 오른쪽은 움직여야 이동이 되고, 안 움직이고 떼면 메뉴(contextmenu)로 넘긴다 */
function panStart(e) {
  const isPan = e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown);
  if (!isPan) return false;
  pan = { sx: e.screenX, sy: e.screenY, x: S.view.x, y: S.view.y, moved: false, button: e.button };
  if (e.button !== 2) e.preventDefault();
  return true;
}
function panMove(e) {
  if (!pan) return;
  const dx = e.screenX - pan.sx, dy = e.screenY - pan.sy;
  if (!pan.moved && Math.hypot(dx, dy) < 4) return;
  if (!pan.moved) { pan.moved = true; document.body.classList.add("panning"); }
  S.view.x = pan.x + dx; S.view.y = pan.y + dy; applyView();
}
function panEnd(e) {
  if (!pan) return;
  if (pan.moved && pan.button === 2) suppressMenu = true;   // 끌어서 이동했으면 뒤따르는 메뉴는 띄우지 않는다
  pan = null; document.body.classList.remove("panning");
}
/** 오른쪽 클릭(끌지 않음): 그 자리 요소를 고르고 메뉴. target이 없으면 최상위(body) 메뉴 */
function canvasMenu(e, target, fromDoc) {
  e.preventDefault();
  if (suppressMenu) { suppressMenu = false; return; }
  const sr = $("stage").getBoundingClientRect(), p = stagePoint(e, fromDoc);
  const hit = target && target.nodeType === 1 && target !== doc?.documentElement && target !== doc?.body ? target : null;
  if (hit) select(hit);
  openMenu(sr.left + p.x, sr.top + p.y, hit ? S.selected : doc?.body);
}
(function setupStage() {
  const st = $("stage");
  st.addEventListener("wheel", (e) => onWheel(e, false), { passive: false });
  st.addEventListener("pointerdown", (e) => { if (panStart(e)) st.setPointerCapture(e.pointerId); });
  st.addEventListener("pointermove", panMove);
  st.addEventListener("pointerup", panEnd);
  st.addEventListener("pointercancel", panEnd);
  // 캔버스 밖 빈 곳: 왼쪽 클릭 = 선택 해제, 오른쪽 클릭 = 최상위(body) 메뉴
  st.addEventListener("click", (e) => { if (e.target === st && S.selected && !spaceDown) { S.selected = null; S.selPath = null; needDraw = true; renderTree(); renderPanel(); renderTimeline(); } });
  st.addEventListener("contextmenu", (e) => canvasMenu(e, null, false));
  addEventListener("resize", () => { if (S.viewSet) applyView(); });
})();

$("frame").addEventListener("load", () => {
  win = $("frame").contentWindow; doc = $("frame").contentDocument;
  if (!doc) { banner("미리보기 문서에 접근하지 못했습니다."); return; }
  styleEls = [...doc.querySelectorAll("style")];
  S.editable = styleEls.length === S.saved.length && styleEls.every((el, i) => norm(el.textContent) === norm(S.saved[i]));
  if (!S.editable) banner("이 컴포넌트는 스크립트가 <style>을 더하거나 바꿔서 화면에서 편집할 수 없습니다. 고칠 내용을 에이전트에게 말로 요청하세요.");
  S.stateUndo = [];   // 이전 문서에 건 상태 기록은 버린다
  S.struct = checkStruct();
  if (S.struct.ok && bodyChanged()) syncLive(S.selPath);   // 초안에서 이어 편집한 구조를 화면에 옮긴다
  applyStyles();
  // 캔버스 입력: 미리보기 안에서도 오른쪽 끌기 = 이동, 오른쪽 클릭 = 메뉴, 휠 = 이동·확대
  doc.addEventListener("wheel", (e) => onWheel(e, true), { passive: false, capture: true });
  doc.addEventListener("pointerdown", (e) => { if (panStart(e)) { try { doc.documentElement.setPointerCapture(e.pointerId); } catch {} if (e.button !== 2) e.stopPropagation(); } }, true);
  doc.addEventListener("pointermove", panMove, true);
  doc.addEventListener("pointerup", panEnd, true);
  doc.addEventListener("pointercancel", panEnd, true);
  doc.addEventListener("auxclick", (e) => { if (e.button === 1) e.preventDefault(); }, true);
  doc.addEventListener("contextmenu", (e) => canvasMenu(e, e.target, true), true);
  doc.addEventListener("mousemove", (e) => { if (!S.pick || pan) return; const t = e.target; S.hovered = t && t.nodeType === 1 && t !== doc.documentElement ? t : null; needDraw = true; }, true);
  doc.addEventListener("mouseleave", () => { S.hovered = null; needDraw = true; });
  doc.addEventListener("click", (e) => { if (!S.pick || spaceDown) return; e.preventDefault(); e.stopPropagation(); select(e.target); }, true);
  applyPickCss();
  doc.addEventListener("submit", (e) => { if (S.pick) e.preventDefault(); }, true);
  doc.addEventListener("keydown", onKey);
  win.addEventListener("scroll", () => { needDraw = true; }, { passive: true });
  win.addEventListener("resize", () => { needDraw = true; });
  S.selected = S.selPath ? resolvePath(S.selPath) : null;
  renderTree(); renderPanel(); renderBlocks(); updateState();
  exp?.frameLoaded();
  detectStates();
  new MutationObserver(() => {
    if (S.selected && !S.selected.isConnected) { S.selected = null; S.selPath = null; needDraw = true; renderPanel(); }
    else if (S.selected) S.selPath = pathOf(S.selected);
    renderTree();
  }).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["id", "class"] });
});

// ---------- 상태 타임라인(플래시 버튼의 Up·Over·Down처럼) ----------
// CSS에서 찾은 상태를 미리보기 위 한 줄에 칸으로 늘어놓고, 고른 칸의 상태를 미리보기에 건다.
// 상태는 고른 요소(없으면 조각 전체)에 걸린다. 내보내기도 같은 함수(states.mjs)로 건다.

let statesTimer = null;
function scheduleStates() { clearTimeout(statesTimer); statesTimer = setTimeout(detectStates, 350); }
function detectStates() {
  if (!doc?.body || !S.editable) { S.states = []; renderTimeline(); exp?.statesDetected([]); return; }
  revertWebdState(S.stateUndo); S.stateUndo = [];        // 찾기는 상태를 걸지 않은 모습에서
  let found = [];
  try { found = findStates(S.styles, doc); } catch (e) { console.warn("상태 찾기 실패", e); }
  S.states = found;
  if (!found.some((s) => s.key === S.stateKey)) S.stateKey = "normal";
  applyPreviewState();
  renderTimeline();
  exp?.statesDetected(found);
}
/** 지금 고른 상태를 미리보기에 다시 건다(고른 요소가 바뀌거나 구조가 바뀌었을 때도) */
function applyPreviewState() {
  revertWebdState(S.stateUndo); S.stateUndo = [];
  const st = S.states.find((s) => s.key === S.stateKey);
  if (st && doc?.body) {
    const scope = S.selected && S.selected.isConnected && S.selected !== doc.body ? S.selected : doc.body;
    S.stateUndo = applyWebdState(doc, st.tokens, scope);
  }
  needDraw = true;
  refreshAnim();
}

// ---------- 프레임 줄(애니메이션) ----------
// 상태를 걸거나 CSS를 고치면 애니메이션이 새로 시작하므로 한 프레임 뒤에 다시 읽고, 멈춤 중이면 그 칸 시각으로 다시 옮긴다.
const animFps = () => exp?.animation()?.fps || 24;
const animTimes = () => frameTimes(S.anim.length, animFps(), exp?.animation()?.maxFrames || 120);
let animTimer = null;
function refreshAnim() {
  // 화면이 가려져도(백그라운드 탭) 돌도록 rAF 대신 짧은 타이머로
  clearTimeout(animTimer);
  animTimer = setTimeout(() => {
    if (!doc) return;
    S.anim = animInfo(doc);
    const n = animTimes().times.length;
    if (S.frame >= n) S.frame = 0;
    if (!S.playing && S.anim.length) seekAnimations(doc, animTimes().times[S.frame]);
    renderTimeline();
    exp?.animDetected();
  }, 40);
}
function seekFrame(i) {
  const times = animTimes().times;
  S.playing = false; S.frame = Math.max(0, Math.min(times.length - 1, i));
  seekAnimations(doc, times[S.frame]); needDraw = true;
  markFrame();
}
function togglePlay() {
  S.playing = !S.playing;
  if (S.playing) seekAnimations(doc, null); else seekFrame(currentFrame());
  renderTimeline();
}
/** 재생 중 지금 몇 번째 칸인지(가장 긴 애니메이션의 시각 기준) */
function currentFrame() {
  if (!doc || !S.anim.length) return 0;
  const a = doc.getAnimations().filter((x) => x.animationName != null).sort((p, q) => (q.effect?.getTiming?.().duration || 0) - (p.effect?.getTiming?.().duration || 0))[0];
  const ct = Number(a?.currentTime) || 0;
  return Math.floor((ct % S.anim.length) / (1000 / animFps())) % Math.max(1, animTimes().times.length);
}
function markFrame() {
  const f = S.playing ? currentFrame() : S.frame;
  const btn = $("timeline").querySelector(".tl-play");
  if (btn && btn.getAttribute("aria-pressed") !== String(S.playing)) {
    btn.replaceChildren(uiIcon(S.playing ? "pause" : "play")); btn.setAttribute("aria-pressed", String(S.playing));
    btn.setAttribute("aria-label", S.playing ? "멈춤" : "재생"); btn.setAttribute("data-tip", S.playing ? "멈춤\n멈추고 지금 칸을 봅니다." : "재생");
  }
  for (const c of $("timeline").querySelectorAll(".tl-frame")) c.classList.toggle("is-now", Number(c.dataset.i) === f);
  const out = $("timeline").querySelector(".tl-frame-no"); if (out) out.textContent = `${f + 1}/${animTimes().times.length}`;
}
(function tick() { if (S.playing && S.anim.length) markFrame(); requestAnimationFrame(tick); })();
function setPreviewState(key) {
  if (key !== "normal" && !S.states.some((s) => s.key === key)) return;
  S.stateKey = key;
  applyPreviewState(); renderTimeline(); renderPanel();
}
function renderTimeline() {
  const root = $("timeline"); if (!root) return;
  const cells = [{ key: "normal", label: "기본", tokens: [] }, ...S.states];
  const row = el("div", { class: "tl-cells", role: "radiogroup", "aria-label": "미리보기 상태" });
  for (const s of cells) {
    const on = s.key === S.stateKey;
    const how = s.tokens.map((t) => t.kind === "pseudo" ? `:${t.name}` : t.kind === "attr" ? `[${t.name}="${t.value}"]` : `.${t.name}`).join(" + ");
    row.append(el("button", { type: "button", role: "radio", class: "tl-cell" + (s.combo ? " is-combo" : ""), "aria-checked": String(on), tabindex: on ? "0" : "-1",
      "data-tip": s.key === "normal" ? "기본\n아무 상태도 걸지 않은 모습입니다." : `${s.label}\n${how}\n미리보기에만 걸고 저장하지 않습니다.`, "data-key": s.key,
      onclick: () => setPreviewState(s.key) }, el("span", { class: "tl-name", text: s.label })));
  }
  row.addEventListener("keydown", (e) => {   // ← → 로 칸 옮기기
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault(); e.stopPropagation();
    const i = cells.findIndex((c) => c.key === S.stateKey);
    const next = cells[(i + (e.key === "ArrowRight" ? 1 : cells.length - 1)) % cells.length];
    setPreviewState(next.key);
    $("timeline").querySelector(`.tl-cell[data-key="${CSS.escape(next.key)}"]`)?.focus();
  });
  const scope = S.selected && S.selected !== doc?.body && S.selected?.isConnected ? label(S.selected) : "컴포넌트 전체";
  root.replaceChildren(
    el("div", { class: "tl-row" },
      el("span", { class: "tl-label", text: "상태" }),
      S.states.length ? row : el("span", { class: "tl-empty", tabindex: "0", text: "없음", "data-tip": S.editable ? "상태 없음\nCSS에 상태 규칙(:hover, [aria-pressed] 등)이 없습니다." : "상태 없음\n이 컴포넌트는 화면에서 편집할 수 없어 상태를 찾지 않습니다." }),
      S.states.length ? el("span", { class: "tl-scope", text: S.stateKey === "normal" ? `${S.states.length}개 상태` : `${scope}에 걸림 · 저장 안 됨` }) : null),
    frameRow(),
  );
  markFrame();
}

/** 프레임 줄: ▶/❚❚, fps, 프레임 칸(플래시 타임라인처럼 5칸마다 번호). 칸을 누르면 그 시각에 멈춤 */
function frameRow() {
  const r = el("div", { class: "tl-row tl-frames-row" }, el("span", { class: "tl-label", text: "프레임" }));
  if (!S.anim.length) {
    if (doc) r.append(el("span", { class: "tl-empty", tabindex: "0", text: "없음", "data-tip": "프레임 없음\n지금 상태에는 CSS 애니메이션(@keyframes)이 없습니다." }));
    return r;
  }
  const { times, clipped, total } = animTimes();
  const fps = animFps();
  const cells = el("div", { class: "tl-frames", role: "group", "aria-label": "애니메이션 프레임" });
  times.forEach((tm, i) => cells.append(el("button", { type: "button", class: "tl-frame" + (i % 5 === 4 ? " is-fifth" : ""), "data-i": String(i),
    "data-tip": `${i + 1}프레임\n${Math.round(tm)}ms`, "aria-label": `${i + 1}프레임`, onclick: () => seekFrame(i) }, i === 0 || i % 5 === 4 ? el("span", { text: String(i + 1) }) : null)));
  // 끌어서 훑기(플래시 재생헤드처럼): 누른 채 좌우로 움직이면 지나가는 칸 시각으로 멈춤. 줄 끝에 닿으면 저절로 스크롤
  cells.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const n = times.length;
    const at = (x) => {
      const r = cells.getBoundingClientRect();
      if (x > r.right - 12) cells.scrollLeft += 10; else if (x < r.left + 12) cells.scrollLeft -= 10;
      const w = cells.firstElementChild?.getBoundingClientRect().width || 13;
      return Math.max(0, Math.min(n - 1, Math.floor((x - r.left + cells.scrollLeft) / w)));
    };
    let last = -1, lastX = e.clientX;
    const move = (ev) => { lastX = ev.clientX; const i = at(lastX); if (i !== last) { last = i; seekFrame(i); } };
    // 포인터를 줄 끝에 대고 있으면 움직이지 않아도 계속 스크롤하며 훑는다
    const edge = setInterval(() => { const r = cells.getBoundingClientRect(); if (lastX > r.right - 12 || lastX < r.left + 12) move({ clientX: lastX }); }, 40);
    const up = () => {
      clearInterval(edge);
      removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
      document.body.classList.remove("tl-scrubbing");
      cells.querySelector(`.tl-frame[data-i="${last}"]`)?.focus({ preventScroll: true });
    };
    document.body.classList.add("tl-scrubbing");
    addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
    move(e);
  });
  cells.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault(); e.stopPropagation();
    const n = times.length, i = ((S.playing ? currentFrame() : S.frame) + (e.key === "ArrowRight" ? 1 : n - 1)) % n;
    seekFrame(i); cells.querySelector(`.tl-frame[data-i="${i}"]`)?.focus();
  });
  const fpsSel = el("select", { class: "tl-fps", "aria-label": "초당 프레임" }, ...FPS_CHOICES.map((v) => { const o = el("option", { value: String(v), text: `${v}fps` }); if (v === fps) o.selected = true; return o; }));
  fpsSel.addEventListener("change", () => { exp?.setAnimationFps(Number(fpsSel.value)); S.frame = 0; refreshAnim(); });
  r.append(
    el("button", { type: "button", class: "tl-play", "aria-pressed": String(S.playing), "aria-label": S.playing ? "멈춤" : "재생", "data-tip": S.playing ? "멈춤\n멈추고 지금 칸을 봅니다." : "재생", onclick: togglePlay }, uiIcon(S.playing ? "pause" : "play")),
    cells,
    el("span", { class: "tl-scope tl-frame-info" }, el("output", { class: "tl-frame-no" }), ` · ${S.anim.names.slice(0, 3).join(", ")} · ${Math.round(S.anim.length)}ms${clipped ? ` (앞 ${times.length}/${total}칸)` : ""} · `, fpsSel),
  );
  return r;
}

// ---------- 구조 편집(유니티 Hierarchy처럼) ----------
// 잘라내기·복사·붙여넣기·자식으로 붙여넣기·복제·삭제·이름 바꾸기(클래스)·만들기·빈 부모 만들기·맨 앞/뒤로.
// model(원문을 읽은 문서)을 고치고 미리보기 body를 model로 바꿔 끼운다. 되돌리기 한 칸 = 구조 변경 한 번.

/** 미리보기와 원문 구조가 같을 때만 구조 편집을 연다(스크립트가 본문을 바꾸면 경로가 어긋난다). */
function checkStruct() {
  if (!S.editable) return { ok: false, reason: "스크립트가 <style>을 바꾸는 컴포넌트라 구조를 편집할 수 없습니다." };
  if (!bodyRange(S.source)) return { ok: false, reason: "<body> 태그가 없거나 여러 개라 구조를 편집할 수 없습니다." };
  const fresh = new DOMParser().parseFromString(S.source, "text/html");
  const skeleton = (b) => [...b.querySelectorAll("*")].map((e) => e.tagName).join(",");
  if (skeleton(fresh.body) !== skeleton(doc.body)) return { ok: false, reason: "스크립트가 본문 요소를 바꾸는 컴포넌트라 구조 편집(복사·추가·삭제)을 막았습니다. CSS 편집은 됩니다." };
  return { ok: true };
}
const modelAt = (path) => { let n = S.model.documentElement; for (const i of path || []) { n = n?.children[i]; if (!n) return null; } return n; };
function modelPath(n) { const p = []; while (n && n.parentElement) { p.unshift([...n.parentElement.children].indexOf(n)); n = n.parentElement; } return p; }

/** 미리보기 body를 model로 바꿔 끼우고, path의 요소를 고른다. */
function syncLive(path) {
  if (!doc?.body || !S.model) return;
  doc.body.replaceChildren(...[...S.model.body.childNodes].map((n) => doc.importNode(n, true)));
  S.stateUndo = [];   // 걸었던 요소는 바꿔 끼워져 사라졌다
  styleEls = [...doc.querySelectorAll("style")];
  styleEls.forEach((s, i) => { if (S.styles[i] != null) s.textContent = S.styles[i]; });
  const next = path ? resolvePath(path) : null;
  S.selected = next && next !== doc.documentElement ? next : null; S.selPath = S.selected ? pathOf(S.selected) : null;
  for (let n = S.selected?.parentElement; n && n !== doc.documentElement; n = n.parentElement) collapsed.delete(pathOf(n).join("."));
  needDraw = true; renderTree();
  applyPreviewState(); scheduleStates();
  exp?.frameLoaded(); exp?.stylesChanged();
}

let flashTimer = null;
function flash(text) { clearTimeout(flashTimer); setState(text); flashTimer = setTimeout(() => updateState(), 2600); }

/** 구조 변경 한 번. fn()이 { select: model 요소|null }을 돌려주면 기록하고 화면에 옮긴다. false면 취소. */
function mutate(kind, fn, detail = {}) {
  if (!S.struct.ok) { flash(S.struct.reason); return false; }
  if (S.editing) commitEditing();
  const pre = { dom: S.model.body.innerHTML, styles: S.styles.slice(), log: S.log.slice() };
  const styleCount = S.model.querySelectorAll("style").length;
  const res = fn();
  if (!res) return false;
  if (S.model.querySelectorAll("style").length !== styleCount) {   // <style> 수가 바뀌면 CSS 편집이 어긋난다
    S.model.body.innerHTML = pre.dom; S.styles = pre.styles;
    flash("<style>이 들어 있는 요소는 복사·삭제할 수 없습니다."); return false;
  }
  pushUndo(pre);
  S.log.push({ at: nowLocal(), kind, ...detail });
  syncLive(res.select ? modelPath(res.select) : null);
  afterChange();
  return true;
}

// 들여쓰기를 지키며 넣고 뺀다
const isWs = (n) => n && n.nodeType === 3 && !n.textContent.trim();
function insertAfter(ref, node) {
  const ws = isWs(ref.previousSibling) ? ref.previousSibling.cloneNode() : null;
  ref.parentNode.insertBefore(node, ref.nextSibling);
  if (ws) ref.parentNode.insertBefore(ws, node);
}
function insertFirst(parent, node) {
  const first = parent.firstElementChild;
  if (!first) return appendChildTidy(parent, node);
  const ws = isWs(first.previousSibling) ? first.previousSibling.cloneNode() : null;
  parent.insertBefore(node, first);
  if (ws) parent.insertBefore(ws, first);
}
function appendChildTidy(parent, node) {
  if (parent.lastElementChild) return insertAfter(parent.lastElementChild, node);
  if (parent.textContent.trim()) { parent.append(node); return; }
  // 빈 부모: 부모의 들여쓰기 + 2칸
  const before = parent.previousSibling;
  const base = isWs(before) ? before.textContent.replace(/^[\s\S]*\n/, "") : "";
  const doc0 = parent.ownerDocument;
  parent.replaceChildren(doc0.createTextNode(`\n${base}  `), node, doc0.createTextNode(`\n${base}`));
}
function removeTidy(node) {
  if (isWs(node.previousSibling)) node.previousSibling.remove();
  node.remove();
}

const selectedModel = () => (S.selected && S.selected !== doc?.body && S.selected.isConnected ? modelAt(S.selPath) : null);
const readClip = () => { try { return JSON.parse(localStorage.getItem(CLIP_KEY) || "null"); } catch { return null; } };
const writeClip = (v) => { try { v ? localStorage.setItem(CLIP_KEY, JSON.stringify(v)) : localStorage.removeItem(CLIP_KEY); } catch {} };

/** 복사(cut이면 잘라내기 표시). 다른 컴포넌트에 붙여도 모양이 같도록 걸린 CSS도 함께 담는다. */
function copySelected(cut = false) {
  // 타임라인에서 건 상태(속성·data-webd-*)가 복사본에 섞이지 않게 잠깐 풀고 복사한다
  revertWebdState(S.stateUndo); S.stateUndo = [];
  try { copySelectedNow(cut); } finally { applyPreviewState(); }
}
function copySelectedNow(cut) {
  const live = S.selected && S.selected !== doc?.body && S.selected.isConnected ? S.selected : null;
  // 구조 편집을 막은 컴포넌트도 복사는 된다(화면에 보이는 요소 그대로). 잘라내기는 구조 편집이 필요하다.
  const m = S.struct.ok ? selectedModel() : live;
  if (!m || !live) { flash("복사할 요소를 계층에서 고르세요(body는 복사하지 않습니다)."); return; }
  if (cut && !S.struct.ok) { flash(S.struct.reason); return; }
  const ancestors = []; for (let n = live.parentElement; n; n = n.parentElement) ancestors.push(n);
  // 토큰은 복사한 요소의 클래스(없으면 id, 그것도 없으면 :root) 안에만 담아 붙여넣은 곳의 토큰을 덮어쓰지 않는다
  const scope = live.classList.length ? "." + [...live.classList].map((c) => CSS.escape(c)).join(".") : live.id ? "#" + CSS.escape(live.id) : ":root";
  const css = cssForCopy(S.styles, (sel) => live.matches(sel) || Boolean(live.querySelector(sel)), (sel) => ancestors.some((a) => a.matches(sel)), scope);
  const clip = { v: 1, from: ID, html: m.outerHTML, css, label: label(m), cut: cut ? { path: S.selPath.slice(), html: m.outerHTML } : null };
  writeClip(clip);
  navigator.clipboard?.writeText(clipboardText(clip.html, css)).catch(() => {});
  flash(`${cut ? "잘라냄" : "복사함"}: ${clip.label}${css ? " (+CSS)" : ""}`);
  renderTree();
}

/** 붙여넣기: 고른 요소 바로 뒤(형제)로, asChild면 그 안 마지막 자식으로. 고른 게 없으면 body 끝. */
function paste(asChild = false) {
  const clip = readClip();
  if (!clip?.html) { flash("붙여넣을 요소가 없습니다. 먼저 복사하세요(Ctrl+C)."); return; }
  mutate(clip.cut && clip.from === ID ? "element-move" : "element-paste", () => {
    const tpl = S.model.createElement("template"); tpl.innerHTML = clip.html;
    const node = tpl.content.firstElementChild; if (!node) return false;
    const sel = selectedModel();
    let src = null;
    if (clip.cut && clip.from === ID) {
      src = modelAt(clip.cut.path);
      if (!src || src.outerHTML !== clip.cut.html) src = null;       // 그새 바뀌었으면 복사처럼 붙인다
      if (src && sel && (src === sel && !asChild)) { writeClip({ ...clip, cut: null }); return false; }  // 제자리
      if (src && sel && src.contains(sel)) { flash("자기 안으로는 옮길 수 없습니다."); return false; }
    }
    if (clip.from !== ID && clip.css) {
      if (S.styles.length) {
        const k = S.styles.length - 1; const r = mergeCss(S.styles[k], clip.css, `${clip.from}에서 붙여넣은 ${clip.label}`);
        if (r.added) { S.styles = S.styles.slice(); S.styles[k] = r.text; }
      }
    }
    if (!sel) appendChildTidy(S.model.body, node);
    else if (asChild) appendChildTidy(sel, node);
    else insertAfter(sel, node);
    if (src) { removeTidy(src); writeClip({ ...clip, cut: null }); }
    return { select: node };
  }, { label: clip.label, from: clip.from });
}

function duplicateSelected() {
  const m = selectedModel(); if (!m) { flash("복제할 요소를 고르세요."); return; }
  mutate("element-duplicate", () => { const c = m.cloneNode(true); insertAfter(m, c); return { select: c }; }, { label: label(m) });
}
function deleteSelected() {
  const m = selectedModel(); if (!m) { flash("삭제할 요소를 고르세요(body는 지울 수 없습니다)."); return; }
  mutate("element-delete", () => { removeTidy(m); return { select: null }; }, { label: label(m) });
}
function moveSibling(first) {
  const m = selectedModel(); if (!m) return;
  const p = m.parentElement;
  if ((first ? p.firstElementChild : p.lastElementChild) === m) { flash(first ? "이미 맨 앞입니다." : "이미 맨 뒤입니다."); return; }
  mutate(first ? "element-first" : "element-last", () => { removeTidy(m); first ? insertFirst(p, m) : appendChildTidy(p, m); return { select: m }; }, { label: label(m) });
}
function wrapInParent() {
  const m = selectedModel(); if (!m) { flash("감쌀 요소를 고르세요."); return; }
  mutate("element-wrap", () => {
    const wrap = S.model.createElement("div");
    insertAfter(m, wrap); removeTidy(m); appendChildTidy(wrap, m);
    return { select: wrap };
  }, { label: label(m) });
  if (S.selected) startRename(S.selPath);
}
const CREATE = {
  empty: { tag: "div", label: "빈 요소" },
  text: { tag: "span", text: "텍스트", label: "텍스트" },
  button: { tag: "button", text: "버튼", attrs: { type: "button" }, label: "버튼" },
};
/** 만들기. parentPath가 없으면 body 끝(최상위), 있으면 그 요소의 마지막 자식. 만든 뒤 바로 이름(클래스) 입력. */
function createElement(kind, parentPath) {
  const def = CREATE[kind];
  const ok = mutate("element-add", () => {
    const parent = parentPath ? modelAt(parentPath) : S.model.body; if (!parent) return false;
    const n = S.model.createElement(def.tag);
    for (const [k, v] of Object.entries(def.attrs || {})) n.setAttribute(k, v);
    if (def.text) n.textContent = def.text;
    appendChildTidy(parent, n);
    return { select: n };
  }, { tag: def.tag });
  if (ok && S.selected) startRename(S.selPath);
}
function renameAt(path, value) {
  const m = modelAt(path); if (!m || m === S.model.body) return;
  const next = classValue(value);
  if ((m.getAttribute("class") || "") === next) return;
  mutate("element-rename", () => { next ? m.setAttribute("class", next) : m.removeAttribute("class"); return { select: m }; }, { from: m.getAttribute("class") || "", to: next });
}
function setTextAt(path, text) {
  const m = modelAt(path); if (!m || m.textContent === text) return;
  mutate("element-text", () => { m.textContent = text; return { select: m }; }, { label: label(m) });
}

/** 계층에서 이름(클래스) 바꾸기 입력. Enter·포커스 해제 = 확정, Esc = 취소 */
function startRename(path) {
  // 구조를 바꾼 직후면 계층을 다시 그리는 일(MutationObserver)이 먼저 끝난 뒤 입력칸을 띄운다
  if (!S.struct.ok || !path) return;
  setTimeout(() => startRenameNow(path), 0);
}
function startRenameNow(path) {
  const key = path.join(".");
  const item = [...$("tree").querySelectorAll(".tree-item")].find((n) => n.dataset.path === key);
  const pick = item?.querySelector(":scope > .tree-row > .tree-pick"); if (!pick) return;
  const live = resolvePath(path); if (!live || live === doc.body) return;
  const box = el("span", { class: "tree-rename" }, el("span", { class: "tree-rename-tag", text: live.tagName.toLowerCase() + "." }));
  const inp = el("input", { type: "text", value: live.getAttribute("class") || "", placeholder: "클래스 이름", spellcheck: "false", autocomplete: "off", "aria-label": "클래스 이름 (공백으로 여러 개)" });
  box.append(inp); pick.replaceWith(box);
  inp.focus(); inp.select();
  let done = false;
  const finish = (commit) => { if (done) return; done = true; if (commit) renameAt(path, inp.value); renderTree(); $("tree").querySelector('[aria-selected="true"] > .tree-row > .tree-pick')?.focus(); };
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
    e.stopPropagation();
  });
  inp.addEventListener("blur", () => finish(true));
}

// ---------- 오른쪽 클릭 메뉴 ----------
let menuEl = null;
function closeMenu() { menuEl?.remove(); menuEl = null; }
function openMenu(x, y, target) {
  closeMenu();
  const isBody = !target || target === doc?.body;
  const clip = readClip();
  const path = isBody ? null : pathOf(target);
  const can = S.struct.ok;
  const items = [
    ["잘라내기", "Ctrl+X", () => copySelected(true), isBody],
    ["복사", "Ctrl+C", () => copySelected(false), isBody],
    ["붙여넣기", "Ctrl+V", () => paste(false), !clip?.html],
    ["자식으로 붙여넣기", "Ctrl+Shift+V", () => paste(true), !clip?.html],
    null,
    ["이름 바꾸기", "F2", () => startRename(path), isBody],
    ["복제", "Ctrl+D", () => duplicateSelected(), isBody],
    ["삭제", "Delete", () => deleteSelected(), isBody],
    null,
    ["맨 앞으로", "", () => moveSibling(true), isBody],
    ["맨 뒤로", "", () => moveSibling(false), isBody],
    ["빈 부모 만들기", "Ctrl+Shift+G", () => wrapInParent(), isBody],
    null,
    [isBody ? "빈 요소 만들기" : "빈 자식 만들기", isBody ? "" : "Alt+Shift+N", () => createElement("empty", path), false],
    [isBody ? "텍스트 만들기" : "자식 텍스트 만들기", "", () => createElement("text", path), false],
    [isBody ? "버튼 만들기" : "자식 버튼 만들기", "", () => createElement("button", path), false],
  ];
  menuEl = el("div", { class: "ctx-menu", role: "menu", "aria-label": isBody ? "계층" : label(target) });
  if (!can) menuEl.append(el("p", { class: "ctx-note", text: S.struct.reason }));
  for (const it of items) {
    if (!it) { menuEl.append(el("div", { class: "ctx-sep", role: "separator" })); continue; }
    const [text, key, fn, off] = it;
    const b = el("button", { type: "button", role: "menuitem", class: "ctx-item", disabled: off || (!can && text !== "복사") ? true : null },
      el("span", { text }), el("kbd", { text: key }));
    b.addEventListener("click", () => { closeMenu(); fn(); });
    menuEl.append(b);
  }
  menuEl.addEventListener("keydown", (e) => {
    const list = [...menuEl.querySelectorAll(".ctx-item:not(:disabled)")];
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); }
    e.stopPropagation();
  });
  document.body.append(menuEl);
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + "px";
  menuEl.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + "px";
  menuEl.querySelector(".ctx-item:not(:disabled)")?.focus();
}
addEventListener("pointerdown", (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
addEventListener("blur", closeMenu);
addEventListener("resize", closeMenu);

function pathOf(el) { const p = []; while (el && el.parentElement) { p.unshift([...el.parentElement.children].indexOf(el)); el = el.parentElement; } return p; }
function resolvePath(p) { let el = doc.documentElement; for (const i of p) { el = el?.children[i]; if (!el) return null; } return el; }

function select(el, focusTree = false) {
  if (!el || el.nodeType !== 1) return;
  if (S.editing) commitEditing();
  S.selected = el; S.selPath = pathOf(el); needDraw = true;
  if (S.stateKey !== "normal") applyPreviewState();
  renderTimeline();
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
      toggle.replaceChildren(uiIcon(collapsed.has(path) ? "chevron-right" : "chevron-down"));
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
    if (node !== doc.body) pick.ondblclick = (e) => { e.preventDefault(); select(node, true); startRename(pathOf(node)); };
    row.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); select(node, true); openMenu(e.clientX, e.clientY, node); };
    const clip = readClip();
    if (clip?.cut && clip.from === ID && clip.cut.path.join(".") === path) item.classList.add("is-cut");
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
          if (el.matches(rewriteStateSelector(part))) { const sp = specificity(part); if (!best || cmpSpec(sp, best) > 0) best = sp; }
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

  // 글자 내용(자식 요소가 없는 요소만). 만든 텍스트·버튼의 글을 여기서 바꾼다.
  const VOID = /^(img|input|br|hr|meta|link|source|track|wbr|area|col|embed|param|textarea|select|svg|canvas|video|audio|iframe|script|style)$/i;
  if (S.struct.ok && target !== doc.body && !target.children.length && !VOID.test(target.tagName)) {
    const path = S.selPath.slice();
    const ta = el("input", { type: "text", class: "text-content", "data-key": "text-content", "aria-label": "글자 내용", spellcheck: "false", autocomplete: "off", placeholder: "(비어 있음)" });
    ta.value = target.textContent;
    ta.addEventListener("change", () => setTextAt(path, ta.value));
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ta.blur(); } });
    root.append(el("div", { class: "text-row" }, el("span", { class: "text-label", text: "글자" }), ta));
  }

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

  if (!S.editable) { root.append(el("p", { class: "note-chip", tabindex: "0", "data-tip": "편집 불가\n스크립트가 <style>을 더하거나 바꾸는 컴포넌트라 화면에서 고칠 수 없습니다. 고칠 내용은 에이전트에게 말로 요청하세요." }, uiIcon("lock"), "편집 불가")); return; }

  // 이 요소가 쓰는 토큰
  const used = new Set();
  for (const m of matches) if (!m.state) for (const d of m.rule.decls) if (!d.disabled) for (const v of varRefs(d.value)) used.add(v);
  if (used.size) {
    root.append(sectHead("토큰", "token", "토큰\n이 요소가 쓰는 CSS 변수입니다. 여기서 바꾸면 그 토큰을 쓰는 곳이 모두 바뀝니다."));
    const box = el("div", { class: "rule" });
    const list = el("ul", { class: "decls" });
    for (const name of used) {
      const def = defs.get(name);
      if (!def) { list.append(el("li", { class: "note", "data-tip": `${name}\n이 컴포넌트의 CSS에서 정의를 찾지 못했습니다.`, text: `${name} · 정의 없음` })); continue; }
      const uses = countVarUses(S.styles, name);
      list.append(declRow(def.bi, def.rule.index, def.di, def.decl, { extraText: `${uses}곳에서 씀 · ${def.rule.selector} · ${lineOf(S.styles[def.bi], def.decl.start)}행` }));
    }
    box.append(list); root.append(box);
  }

  root.append(sectHead(matches.length ? "걸린 규칙" : "걸린 규칙 없음", "rules", matches.length ? "걸린 규칙\n이 요소에 걸린 CSS 규칙입니다. 위쪽이 우선합니다.\n줄 앞 체크를 끄면 /* 주석 */으로 남습니다." : "걸린 규칙 없음\n이 요소에 걸린 CSS 규칙이 없습니다."));
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
    card.append(el("button", { type: "button", class: "add", "data-tip": "속성 추가\n이 규칙에 CSS 속성을 더합니다.", onclick: (e) => {
      const row = declRow(m.bi, m.rule.index, -1, { name: "", value: "", disabled: false }, {});
      list.append(row); row.querySelector(".nm").focus(); e.currentTarget.hidden = true;
    } }, uiIcon("plus"), "속성 추가"));
    root.append(card);
  }

  if (target.hasAttribute("style")) {
    root.append(el("p", { class: "note-chip", tabindex: "0", "data-tip": `style 속성\n${target.getAttribute("style")}\nstyle 속성은 화면에서 고치지 않습니다. 필요하면 에이전트에게 말로 요청하세요.` }, uiIcon("info"), "style 속성 있음"));
  }

  if (keep) { const k = root.querySelector(`[data-key="${CSS.escape(keep)}"]`); if (k) { k.focus(); if (k.setSelectionRange) k.setSelectionRange(k.value.length, k.value.length); } }
}
/** 스타일 탭 구역 머리: 아이콘 + 짧은 이름, 설명은 툴팁 */
function sectHead(title, ic, tip) { return el("h3", { class: "sect pane-head", tabindex: tip ? "0" : null, "data-tip": tip || null }, uiIcon(ic), el("span", { text: title })); }
const fmt = (n) => { const r = Math.round(n * 10) / 10; return r === 0 ? "–" : String(r); };

/** 선언 한 줄. di가 -1이면 새로 더하는 줄 */
function declRow(bi, ri, di, decl, { over = false, cs = null, extraText = "" }) {
  const keyBase = `${bi}:${ri}:${di}`;
  const li = el("li", { class: `decl${decl.disabled ? " off" : ""}${over ? " over" : ""}` });
  const cb = el("input", { type: "checkbox", "aria-label": `${decl.name || "새 속성"} 켜기/끄기`, "data-tip": "켜기/끄기\n끄면 /* 주석 */으로 남습니다." });
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
    if (comp) extra.append(el("span", { class: "clip", "data-tip": `계산값\n${comp.length > 600 ? comp.slice(0, 600) + "…" : comp}`, text: `계산값 ${comp}` }));
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
  pane: $("pane-export"), overlay: $("xp-overlay"), api, currentHtml, isDirty: () => isDirty(), record: recordExport, showState: (key) => setPreviewState(key), animNow: () => S.anim, onAnimationChange: () => refreshAnim(),
  selected: () => (S.selected && S.selected.isConnected ? S.selected : null),
  pathOf, label, resolve: (p) => (doc ? resolvePath(p) : null),
  frameDoc: () => doc, frameWin: () => win,
}) : null;
$("pick").onclick = () => { S.pick = !S.pick; $("pick").setAttribute("aria-pressed", String(S.pick)); S.hovered = null; needDraw = true; applyPickCss(); };
$("all").onclick = () => { S.all = !S.all; $("all").setAttribute("aria-pressed", String(S.all)); needDraw = true; };
$("undo").onclick = undo; $("redo").onclick = redo; $("save").onclick = () => save();

// 글자 칸에 포커스가 들어온 때의 값. 그 뒤로 고친 게 없으면 Ctrl+Z는 칸이 아니라 편집기 기록을 되돌린다.
const TEXT_INPUT = /^(text|search|number|url|email|tel)$/;
const isTextField = (t) => t?.tagName === "TEXTAREA" || (t?.tagName === "INPUT" && TEXT_INPUT.test(t.type));
document.addEventListener("focusin", (e) => { if (isTextField(e.target)) e.target._focusValue = e.target.value; }, true);

// 계층 빈 곳 오른쪽 클릭과 + 버튼: 최상위(body)에 만들기·붙여넣기
$("tree").addEventListener("contextmenu", (e) => { if (e.defaultPrevented) return; e.preventDefault(); openMenu(e.clientX, e.clientY, doc?.body); });
$("tree-add").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  openMenu(r.left, r.bottom + 4, S.selected && S.selected.isConnected ? S.selected : doc?.body);
});

/** 계층 단축키(유니티와 같은 조합). 글자 칸에서 고치는 중이거나 화면 글자를 드래그해 골랐으면 브라우저 기본 동작을 둔다. */
function hierarchyKey(e, typing) {
  if (typing || menuEl) return false;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  const textSelected = String(getSelection?.() || "").length > 0 || String(win?.getSelection?.() || "").length > 0;
  if (mod && !e.shiftKey && !e.altKey && k === "c") { if (textSelected) return false; copySelected(false); return true; }
  if (mod && !e.shiftKey && !e.altKey && k === "x") { if (textSelected) return false; copySelected(true); return true; }
  if (mod && !e.altKey && k === "v") { paste(e.shiftKey); return true; }
  if (mod && !e.shiftKey && !e.altKey && k === "d") { duplicateSelected(); return true; }
  if (mod && e.shiftKey && !e.altKey && k === "g") { wrapInParent(); return true; }
  if (!mod && e.altKey && e.shiftKey && k === "n") { createElement("empty", S.selected && S.selected !== doc?.body ? S.selPath : null); return true; }
  if (!mod && !e.altKey && e.key === "Delete") { deleteSelected(); return true; }
  if (!mod && !e.altKey && e.key === "F2" && S.selected && S.selected !== doc?.body) { startRename(S.selPath); return true; }
  return false;
}

function onKey(e) {
  const mod = e.ctrlKey || e.metaKey;
  const active = e.target.ownerDocument === document ? document.activeElement : e.target;
  const typing = isTextField(active);
  if (hierarchyKey(e, typing)) { e.preventDefault(); return; }
  // 칸 안에서 고치던 글자가 있으면 그 칸의 되돌리기를 쓰고, 없으면 편집기 기록으로 넘긴다
  const fieldHasEdits = typing && active.value !== active._focusValue;
  const historyKey = mod && !e.altKey && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y");
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
  else if (historyKey && !fieldHasEdits) {
    e.preventDefault();
    if (typing) active.blur();
    e.key.toLowerCase() === "y" || e.shiftKey ? redo() : undo();
  }
  else if (e.key === "Escape" && !typing && S.selected) { S.selected = null; S.selPath = null; needDraw = true; renderTree(); renderPanel(); }
}
document.addEventListener("keydown", onKey);

// ---------- 메뉴 바 ----------
// 메뉴·단축키·버튼·오른쪽 클릭이 같은 함수를 부른다. 메뉴는 열 때마다 지금 상태(선택·저장 여부·상태 목록)를 다시 읽는다.
const LIB = { folders: [], atlases: [], history: [] };
async function refreshLibInfo() {
  const get = async (url) => { try { const r = await fetch(url, { cache: "no-store", headers: TOKEN ? { "x-webd-token": TOKEN } : {} }); return r.ok ? r.json() : null; } catch { return null; } };
  const [h, f, a] = await Promise.all([api("/history").then((r) => (r.ok ? r.json() : null)).catch(() => null), $("back").hidden ? null : get("/folders"), $("back").hidden ? null : get("/atlas/")]);
  LIB.history = h?.versions || []; LIB.folders = f?.folders || []; LIB.atlases = a?.atlases || [];
}
async function postJson(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(TOKEN ? { "x-webd-token": TOKEN } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `실패 (${r.status})`);
  return j;
}
/** "…으로/로": 받침이 없거나 ㄹ이면 "로"(folders.mjs의 ro와 같음) */
function josaRo(word) {
  const c = String(word).trim().slice(-1).charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return "(으)로";
  const j = (c - 0xac00) % 28; return j === 0 || j === 8 ? "로" : "으로";
}
const selLive = () => (S.selected && S.selected.isConnected && S.selected !== doc?.body ? S.selected : null);
function copyText(text, msg) { navigator.clipboard?.writeText(text).then(() => flash(msg), () => flash("복사하지 못했습니다.")); }
/** 고른 요소에 걸린 CSS 규칙(켜진 선언만)을 글로 */
function selectedCssText() {
  const t = selLive(); if (!t) return "";
  const parsed = S.styles.map((x) => parseCss(x));
  return matchedRules(t, parsed).map((m) => `${m.state ? `/* ${m.state} 상태 */\n` : ""}${m.rule.selector} {\n${m.rule.decls.filter((d) => !d.disabled).map((d) => `  ${d.name}: ${d.value};`).join("\n")}\n}`).join("\n\n");
}
async function duplicatePreset() {
  let html; try { html = currentHtml(); } catch (e) { flash(e.message); return; }
  try {
    const j = await postJson(`/api/${encodeURIComponent(ID)}/duplicate`, { html });
    flash(`새 프리셋을 만들었습니다: ${j.meta.name}`);
    window.open(`/edit/${encodeURIComponent(j.meta.id)}`, "_blank", "noopener");
  } catch (e) { banner(`복제하지 못했습니다: ${e.message}`); }
}
async function restoreVersion(v) {
  const lost = isDirty() ? "\n저장하지 않은 화면 변경은 사라집니다." : "";
  if (!confirm(`${v.at} 버전으로 되돌릴까요?\n지금 파일은 이전 버전 기록에 남으므로 다시 되돌릴 수 있습니다.${lost}`)) return;
  try {
    await postJson(`/api/${encodeURIComponent(ID)}/restore`, { file: v.file });
    await discardAndReload(); await refreshLibInfo();
    flash(`${v.at} 버전으로 되돌렸습니다.`);
  } catch (e) { banner(`되돌리지 못했습니다: ${e.message}`); }
}
async function moveToFolder(folder) {
  try {
    await postJson("/folders/move", { ids: [ID], folder });
    S.meta = { ...S.meta, folder }; flash(`${folder || "폴더 없음"}${josaRo(folder || "폴더 없음")} 옮겼습니다.`);
  } catch (e) { flash(e.message); }
}
async function addToAtlas(a) {
  if (a.members.includes(ID)) { flash(`이미 ‘${a.name}’에 들어 있습니다.`); return; }
  try {
    await postJson(`/atlas/${encodeURIComponent(a.name)}`, { atlas: { ...a, members: [...a.members, ID] } });
    await refreshLibInfo(); flash(`‘${a.name}’ 묶음 시트에 넣었습니다.`);
  } catch (e) { flash(e.message); }
}
function showHelp() {
  let dlg = $("help");
  if (!dlg) {
    const rows = [["Ctrl+S", "저장"], ["Ctrl+Z · Ctrl+Shift+Z", "되돌리기 · 다시 실행"], ["Ctrl+E", "지금 설정으로 내보내기"], ["V", "요소 선택 켜기·끄기"],
      ["Ctrl+C · Ctrl+X · Ctrl+V", "요소 복사 · 잘라내기 · 붙여넣기(Shift: 자식으로)"], ["Ctrl+D · Delete · F2", "복제 · 삭제 · 이름 바꾸기"], ["Ctrl+Shift+G", "빈 부모 만들기"],
      ["Esc", "선택 해제"], ["F10 · Alt", "메뉴 바로 이동"],
      ["왼쪽 클릭", "요소 선택"], ["오른쪽 끌기 · 휠 · Space+끌기", "캔버스 이동"], ["오른쪽 클릭", "요소 메뉴"],
      ["Ctrl+휠 · Ctrl+= · Ctrl+−", "확대·축소"], ["Ctrl+0 · Shift+1", "100% · 화면에 맞춤"]];
    dlg = el("dialog", { id: "help", class: "help", "aria-labelledby": "help-title" },
      el("h2", { id: "help-title" }, uiIcon("info"), "단축키"),
      el("dl", {}, ...rows.flatMap(([k, t]) => [el("dt", {}, el("kbd", { text: k })), el("dd", { text: t })])),
      el("form", { method: "dialog" }, el("button", { class: "ui-control", text: "닫기" })));
    document.body.append(dlg);
  }
  dlg.showModal();
}
const inLibrary = () => !$("back").hidden;
const EDITOR_MENUS = [
  { label: "파일", items: () => [
    { label: "저장", icon: "save", key: "Ctrl+S", disabled: !isDirty() || !S.editable, run: () => save() },
    { label: "복제해서 새 프리셋으로", icon: "plus", disabled: !inLibrary(), tip: "복제해서 새 프리셋으로\n지금 화면 내용(저장 안 한 변경 포함)으로 새 프리셋을 만들어 새 탭에서 엽니다. 폴더·종류·태그·내보내기 설정을 따라갑니다.", run: duplicatePreset },
    { label: "이전 버전", icon: "undo", disabled: !LIB.history.length, sub: () => LIB.history.map((v) => ({ label: v.at, tip: `${v.at} 버전으로 되돌리기\n새 버전으로 다시 저장합니다.`, run: () => restoreVersion(v) })) },
    { label: "폴더로 옮기기", icon: "folder-move", disabled: !inLibrary(), sub: () => [{ label: "폴더 없음", icon: "inbox", checked: !S.meta?.folder, run: () => moveToFolder("") }, ...LIB.folders.map((f) => ({ label: "　".repeat(f.split("/").length - 1) + f.split("/").pop(), checked: S.meta?.folder === f, tip: f, run: () => moveToFolder(f) }))] },
    null,
    { label: "원본 새 탭에서 열기", icon: "external", run: () => window.open(`/lib/${encodeURIComponent(ID)}/component.html`, "_blank", "noopener") },
    { label: "라이브러리로", icon: "arrow-left", disabled: !inLibrary(), run: () => { location.href = "/lib/"; } },
  ] },
  { label: "편집", items: () => {
    const sel = selLive(), can = S.struct.ok, clip = readClip();
    return [
      { label: "되돌리기", icon: "undo", key: "Ctrl+Z", disabled: !S.undo.length, run: undo },
      { label: "다시 실행", icon: "redo", key: "Ctrl+Shift+Z", disabled: !S.redo.length, run: redo },
      null,
      { label: "잘라내기", key: "Ctrl+X", disabled: !sel || !can, run: () => copySelected(true) },
      { label: "복사", key: "Ctrl+C", disabled: !sel, run: () => copySelected(false) },
      { label: "붙여넣기", key: "Ctrl+V", disabled: !clip?.html || !can, run: () => paste(false) },
      { label: "자식으로 붙여넣기", key: "Ctrl+Shift+V", disabled: !clip?.html || !can, run: () => paste(true) },
      { label: "복제", key: "Ctrl+D", disabled: !sel || !can, run: duplicateSelected },
      { label: "삭제", key: "Delete", disabled: !sel || !can, run: deleteSelected },
      null,
      { label: "요소 만들기", icon: "plus", disabled: !can, sub: () => Object.entries(CREATE).map(([k, d]) => ({ label: sel ? `자식 ${d.label}` : d.label, run: () => createElement(k, sel ? S.selPath : null) })) },
      { label: "빈 부모 만들기", key: "Ctrl+Shift+G", disabled: !sel || !can, run: wrapInParent },
      { label: "이름 바꾸기", icon: "edit", key: "F2", disabled: !sel || !can, run: () => startRename(S.selPath) },
      null,
      { label: "요소 이름 복사", icon: "hash", disabled: !sel, tip: "요소 이름 복사\n고른 요소의 태그·id·클래스(예: span.ash-slot__rim)를 복사합니다.", run: () => copyText(label(sel), `복사함: ${label(sel)}`) },
      { label: "요소 CSS 복사", icon: "code", disabled: !sel, tip: "요소 CSS 복사\n고른 요소에 걸린 규칙과 켜진 속성을 글로 복사합니다(AI에게 물어볼 때 붙여 넣기 좋게).", run: () => copyText(`/* ${label(sel)} */\n${selectedCssText()}`, `CSS를 복사했습니다: ${label(sel)}`) },
    ];
  } },
  { label: "보기", items: () => [
    { label: "요소 선택", icon: "pick", key: "V", checked: S.pick, tip: "요소 선택\n켜면 미리보기에서 왼쪽 클릭으로 요소를 고릅니다. 끄면 컴포넌트를 직접 조작합니다.", run: () => $("pick").click() },
    null,
    { label: "확대", icon: "zoom", key: "Ctrl+=", run: () => zoomStep(1) },
    { label: "축소", key: "Ctrl+−", run: () => zoomStep(-1) },
    { label: "100%", key: "Ctrl+0", checked: Math.abs(S.view.z - 1) < 1e-3, run: () => zoomTo(1) },
    { label: "화면에 맞춤", icon: "size-compact", key: "Shift+1", run: () => fitView(false) },
    null,
    { label: "전체 간격 보기", icon: "spacing", checked: S.all, run: () => $("all").click() },
    { label: "미리보기 폭", icon: "viewport", sub: () => [...$("vp").options].map((o) => ({ label: o.textContent, checked: $("vp").value === o.value, run: () => { $("vp").value = o.value; $("vp").dispatchEvent(new Event("change")); } })) },
    null,
    { label: "스타일 탭", icon: "rules", checked: currentTab === "rules", run: () => showTab("rules") },
    { label: "CSS 원문 탭", icon: "code", checked: currentTab === "css", run: () => showTab("css") },
    { label: "내보내기 탭", icon: "download", checked: currentTab === "export", run: () => showTab("export") },
  ] },
  { label: "상태", items: () => {
    const times = animTimes().times, has = S.anim.length > 0;
    return [
      { label: "기본", icon: "state-base", checked: S.stateKey === "normal", run: () => setPreviewState("normal") },
      ...S.states.map((s) => ({ label: s.label, checked: S.stateKey === s.key, tip: `${s.label}\n미리보기에만 걸고 저장하지 않습니다.`, run: () => setPreviewState(s.key) })),
      null,
      { label: S.playing ? "멈춤" : "재생", icon: S.playing ? "pause" : "play", disabled: !has, run: togglePlay },
      { label: "이전 프레임", disabled: !has, run: () => seekFrame(((S.playing ? currentFrame() : S.frame) - 1 + times.length) % times.length) },
      { label: "다음 프레임", disabled: !has, run: () => seekFrame(((S.playing ? currentFrame() : S.frame) + 1) % times.length) },
      { label: "초당 프레임", icon: "film", disabled: !exp?.ready(), sub: () => FPS_CHOICES.map((v) => ({ label: `${v} fps`, checked: animFps() === v, run: () => { exp.setAnimationFps(v); S.frame = 0; refreshAnim(); } })) },
    ];
  } },
  { label: "내보내기", items: () => [
    { label: "지금 설정으로 내보내기", icon: "download", key: "Ctrl+E", disabled: !exp?.ready(), tip: "지금 설정으로 내보내기\n내보내기 탭의 설정대로 PNG·JSON을 씁니다. 저장하지 않은 CSS 변경도 화면 그대로 내보냅니다.", run: () => { showTab("export"); exp.exportNow(); } },
    { label: "내보내기 설정 열기", icon: "rules", run: () => showTab("export") },
    { label: "배율", icon: "scale-2", disabled: !exp?.ready(), sub: () => [1, 2, 3, 4].map((s) => ({ label: `${s}x`, icon: `scale-${s}`, checked: exp.scale() === s, run: () => exp.setScale(s) })) },
    { label: "내보낸 폴더 열기", icon: "folder-open", disabled: !exp?.hasExport(), run: () => exp.reveal() },
    null,
    { label: "묶음 시트에 넣기", icon: "layers", disabled: !inLibrary() || !LIB.atlases.length, tip: "묶음 시트에 넣기\n저장한 묶음 시트에 이 프리셋을 더합니다. 새 묶음 시트는 라이브러리 목록의 내보내기 메뉴에서 만듭니다.", sub: () => LIB.atlases.map((a) => ({ label: `${a.name} · ${a.members.length}개`, checked: a.members.includes(ID), run: () => addToAtlas(a) })) },
  ] },
  { label: "도움말", items: () => [{ label: "단축키", icon: "info", run: showHelp }] },
];
if ($("menubar")) createMenubar($("menubar"), EDITOR_MENUS, { icon: uiIcon });
document.addEventListener("keydown", (e) => {
  const t = document.activeElement;
  if (isTextField(t) || t?.tagName === "SELECT" || document.querySelector(".mb-menu, .ctx-menu, dialog[open]")) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "e") { e.preventDefault(); if (exp?.ready()) { showTab("export"); exp.exportNow(); } }
  else if (!mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "v") { e.preventDefault(); $("pick").click(); }
  else if (mod && !e.altKey && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomStep(1); }
  else if (mod && !e.altKey && (e.key === "-" || e.key === "_")) { e.preventDefault(); zoomStep(-1); }
  else if (mod && !e.altKey && e.key === "0") { e.preventDefault(); zoomTo(1); }
  else if (!mod && e.shiftKey && (e.code === "Digit1")) { e.preventDefault(); fitView(false); }
});
$("zoom")?.addEventListener("click", () => fitView(false));
initTooltips();
for (const n of document.querySelectorAll("[data-icon]")) n.prepend(uiIcon(n.dataset.icon));
addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });

if (!ID) banner("주소에 편집할 항목이 없습니다. library.mjs open으로 연 목록에서 카드를 고르세요.");
else {
  load().then(() => { if (location.hash === "#export") showTab("export"); refreshLibInfo(); });
  listen();
}
