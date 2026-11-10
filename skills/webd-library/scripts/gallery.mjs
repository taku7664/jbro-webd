// gallery.mjs — 라이브러리 목록 페이지(index.html)를 만든다.
// 외부 의존성 없이 file:// 로 열린다. 미리보기는 각 컴포넌트를 iframe으로 띄워 CSS가 섞이지 않게 한다.
// sandbox는 쓰지 않는다: 별도 출처가 된 iframe은 file:// 에서 로드가 막힐 수 있고, 라이브러리에는 사용자가 직접 저장한 파일만 들어간다.
// 대신 미리보기 iframe은 pointer-events: none, tabindex=-1 로 조작되지 않게 한다.
//
// 배경 전환(원래 / 중립): file:// 에서는 Chromium이 iframe의 contentDocument를 null로 돌려줘서(Edge 헤드리스로 확인)
// 바깥에서 CSS를 넣을 수 없다. 그래서 중립일 때만 같은 HTML에 배경 덮어쓰기 스타일과 <base>를 넣어 srcdoc으로 띄우고,
// 원래로 돌아가면 srcdoc을 떼서 component.html(src)을 다시 불러온다. 저장된 component.html은 건드리지 않으므로
// "HTML 복사"·재사용 때 전환용 코드가 따라가지 않는다. srcdoc 문서는 목록 페이지와 같은 출처가 된다
// (라이브러리에는 사용자가 직접 저장한 파일만 들어간다는 위 전제와 같다).

import { readFileSync } from "node:fs";

const UI_THEME = readFileSync(new URL("../editor/theme.css", import.meta.url), "utf8");

export const NEUTRAL_BG = { light: "#E2E6E8", dark: "#2C3236" };

/** 중립 배경 미리보기용 문서. 브라우저 쪽 스크립트에도 그대로 들어가므로 바깥 변수를 쓰지 않는다. */
export function neutralDoc(html, baseHref) {
  const style = '<style id="webd-neutral-bg">html,body{background:#E2E6E8 !important}' +
    '@media (prefers-color-scheme: dark){html,body{background:#2C3236 !important}}</style>';
  const base = /<base[\s>]/i.test(html) ? "" : '<base href="' + baseHref.replace(/"/g, "%22") + '">';
  const head = /<head(\s[^>]*)?>/i.exec(html);
  let out = head ? html.slice(0, head.index + head[0].length) + base + html.slice(head.index + head[0].length) : base + html;
  const end = out.search(/<\/head>/i);
  out = end >= 0 ? out.slice(0, end) + style + out.slice(end) : out + style;
  return out;
}

const CATEGORY_LABEL = {
  hero: "히어로", nav: "내비게이션", button: "버튼", form: "폼", table: "표", chart: "차트",
  card: "카드", list: "목록", section: "섹션", footer: "푸터", feedback: "피드백", other: "기타",
};

/** JSON을 <script> 안에 안전하게 넣는다. */
const ESC = { "<": "\\u003c", "\u2028": "\\u2028", "\u2029": "\\u2029" };
function embed(obj) { return JSON.stringify(obj).replace(/[<\u2028\u2029]/g, (c) => ESC[c]); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

/**
 * @param {object} o
 * @param {boolean} [o.server]  라이브러리 서버(/lib/)가 내주는 목록이면 true: 카드를 누르면 편집기가 열린다.
 *                              false(파일로 연 index.html)면 편집은 명령 복사로 하고, 서버로 여는 방법을 위에 알린다.
 */
export function renderGallery(entries, { libPath, generatedAt, categories, cli = "library.mjs", server = false }) {
  const data = entries.map((e) => ({
    id: e.id, name: e.name, description: e.description, category: e.category, tags: e.tags,
    createdAt: e.createdAt, updatedAt: e.updatedAt, versions: e.versions, source: e.source, style: e.style,
    viewport: e.viewport, background: e.background ?? null, html: e.html, path: e.path,
  }));
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebD 컴포넌트 라이브러리</title>
<style>${UI_THEME}</style>
<style>
  body { margin: 0; font: 400 15px/1.6 var(--font); }
  a { color: inherit; text-underline-offset: 3px; }

  .page { max-width: 1440px; margin: 0 auto; padding: 24px 24px 64px; }
  header.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px 24px;
               padding: 20px 24px; border-radius: 6px; }
  h1 { font-size: 26px; font-weight: 700; }
  .where { font-size: 12px; }
  .where code { font-family: var(--mono); font-size: 12px; }

  .bar { display: grid; grid-template-columns: minmax(200px, 2fr) repeat(2, minmax(120px, 1fr)) minmax(260px, 2fr) minmax(160px, 1fr);
         gap: 12px; align-items: end; padding: 18px; margin-top: 18px; }
  .bar label { display: grid; gap: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .bar input, .bar select { font: inherit; font-size: 14px; padding: 7px 9px; min-height: 38px; width: 100%; }
  .period { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; align-items: center; }
  .period span { color: var(--muted); }
  .status { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0 0; font-size: 13px; color: var(--muted); }
  .status { align-items: center; }
  .status .right { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
  .bgswitch { display: inline-flex; align-items: center; gap: 0; margin: 0; padding: 0; border: 0; }
  .bgswitch legend { float: left; margin-right: 8px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .bgswitch label { position: relative; }
  .bgswitch input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  .bgswitch span { display: inline-block; padding: 4px 12px; font-size: 13px; color: var(--text); background: var(--panel);
                   border: 1px solid var(--line); min-height: 30px; line-height: 20px; }
  .bgswitch label:first-of-type span { border-radius: 3px 0 0 3px; }
  .bgswitch label:last-of-type span { border-radius: 0 3px 3px 0; border-left: 0; }
  .bgswitch input:checked + span { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
  .bgswitch input:focus-visible + span { outline: 2px solid var(--focus); outline-offset: 2px; }
  .origbg { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; color: var(--muted); }
  .origbg i { display: inline-block; width: 16px; height: 16px; border-radius: 2px; border: 1px solid var(--line); flex: none; }
  .origbg code { font-family: var(--mono); color: var(--text); overflow-wrap: anywhere; }
  body.neutral .frame { background: ${NEUTRAL_BG.light}; }
  @media (prefers-color-scheme: dark) { body.neutral .frame { background: ${NEUTRAL_BG.dark}; } }
  .status button { font: inherit; font-size: 13px; background: none; border: 0; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline; text-underline-offset: 3px; }

  .group { margin-top: 28px; }
  .group h2 { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; font-size: 18px; font-weight: 700; }
  .group h2 small { font-size: 13px; font-weight: 400; color: var(--muted); font-family: var(--mono); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }

  .item { display: flex; flex-direction: column; min-width: 0; }
  .item:hover { border-color: var(--muted); }
  .frame { position: relative; overflow: hidden; border-bottom: 1px solid var(--line); border-radius: 4px 4px 0 0; }
  .frame:not(.ui-checkerboard) { background: var(--panel); }
  .frame iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; pointer-events: none; }
  .frame.ui-checkerboard iframe { color-scheme: light; }
  .body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .body > .actions { margin-top: auto; padding-top: 8px; }
  .name { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.35; }
  .name a { text-decoration: none; }
  .name a:hover { text-decoration: underline; }
  .desc { margin: 0; color: var(--muted); font-size: 14px; }
  .facts { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; padding: 0; list-style: none; font-size: 12px; color: var(--muted); }
  .facts time { font-family: var(--mono); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 0; padding: 0; list-style: none; }
  .chips button { font: inherit; font-size: 12px; border: 1px solid var(--line); background: transparent; color: var(--text);
                  border-radius: 3px; padding: 1px 7px; cursor: pointer; }
  .chips button[data-kind="category"] { border-color: var(--accent); color: var(--accent); }
  .chips button:hover { background: var(--bg); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .actions a, .actions button { font: inherit; font-size: 13px; font-weight: 600; padding: 6px 12px; text-decoration: none; }
  .actions .primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .frame-link { display: block; color: inherit; cursor: pointer; }
  .frame-link:hover .frame { box-shadow: inset 0 0 0 2px var(--accent); }
  .frame-link:focus-visible { outline-offset: -2px; }
  .actions .quiet { margin-left: auto; align-self: center; padding: 6px 2px; font-weight: 400; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
  .serve-note { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 12px; padding: 10px 14px; font-size: 13px; }
  .serve-note code { font-family: var(--mono); font-size: 12px; overflow-wrap: anywhere; }
  .serve-note button { font: inherit; font-size: 12px; font-weight: 600; padding: 4px 10px; }
  .empty { margin: 48px 0; color: var(--muted); }
  .empty strong { display: block; color: var(--text); font-size: 18px; margin-bottom: 4px; }
  .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--text); color: var(--bg);
           padding: 8px 14px; border-radius: 3px; font-size: 13px; opacity: 0; transition: opacity .2s ease-out; pointer-events: none; }
  .toast.on { opacity: 1; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  /* 묶음 시트(라이브러리 서버에서만) */
  .atlas { margin-top: 16px; padding: 14px 18px; display: grid; gap: 10px; }
  .atlas h2 { margin: 0; font-size: 15px; font-weight: 700; }
  .atlas h2 small { font-size: 12px; font-weight: 400; color: var(--muted); margin-left: 8px; }
  .atlas-row { display: flex; flex-wrap: wrap; align-items: end; gap: 10px 14px; }
  .atlas-row label { display: grid; gap: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .atlas-row label.chk { display: flex; align-items: center; gap: 6px; padding-bottom: 6px; }
  .atlas-row .count { padding-bottom: 7px; font-size: 13px; color: var(--muted); }
  .atlas-row button { font: inherit; font-size: 13px; font-weight: 600; padding: 6px 12px; }
  .atlas-row button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .atlas-row button:disabled { opacity: .5; cursor: progress; }
  .atlas-saved { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 12px; }
  .atlas-saved:empty { display: none; }
  .atlas-saved button { font: inherit; font-size: 12px; border: 1px solid var(--line); background: transparent; color: var(--text); border-radius: 999px; padding: 3px 10px; cursor: pointer; }
  .atlas-saved button[aria-current="true"] { border-color: var(--accent); color: var(--accent); }
  .atlas-out { display: grid; gap: 8px; font-size: 13px; }
  .atlas-out:empty { display: none; }
  .atlas-out figure { margin: 0; display: grid; gap: 4px; }
  .atlas-out .sheet { max-width: 100%; max-height: 520px; overflow: auto; border: 1px solid var(--line); border-radius: 4px; }
  .atlas-out img { display: block; image-rendering: pixelated; }
  .atlas-out figcaption, .atlas-out .files { margin: 0; color: var(--muted); font-size: 12px; font-family: var(--mono); overflow-wrap: anywhere; }
  .atlas-out ul.warn { margin: 0; padding-left: 18px; color: var(--muted); font-size: 12px; }
  .pick { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .pick input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); }

  @media (max-width: 900px) {
    .bar { grid-template-columns: 1fr 1fr; }
    .bar .q, .bar .period-wrap { grid-column: 1 / -1; }
  }
  @media (max-width: 480px) {
    .page { padding: 20px 16px 48px; }
    .grid { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
</style>
</head>
<body>
<div class="page">
  <header class="top ui-top">
    <h1 class="ui-title">컴포넌트 라이브러리</h1>
    <p class="where ui-meta"><span id="total"></span> · 생성 <time>${esc(generatedAt.slice(0, 16).replace("T", " "))}</time> · <code>${esc(libPath)}</code></p>
  </header>
${server ? "" : `  <p class="serve-note ui-surface" id="serve-note">파일로 연 목록이라 카드를 눌러 바로 편집할 수 없습니다. 터미널에서 이 명령을 실행하면 카드를 누르는 대로 편집기가 열립니다.
    <code>${esc(`node "${cli}" open`)}</code><button type="button" class="ui-control" id="copy-open">명령 복사</button></p>
`}
  <form class="bar ui-surface" id="bar" role="search" onsubmit="return false">
    <label class="q">검색<input id="q" class="ui-control" type="search" placeholder="이름, 설명, 태그" autocomplete="off"></label>
    <label>분류<select id="category" class="ui-control"><option value="">전체</option>${categories.map((c) => `<option value="${c}">${CATEGORY_LABEL[c] ?? c}</option>`).join("")}</select></label>
    <label>태그<select id="tag" class="ui-control"><option value="">전체</option></select></label>
    <div class="period-wrap"><label>기간 <span class="sr">(정렬 기준 날짜로 거름)</span>
      <span class="period"><input id="from" class="ui-control" type="date" aria-label="시작일"><span>~</span><input id="to" class="ui-control" type="date" aria-label="종료일"></span></label></div>
    <label>정렬<select id="sort" class="ui-control">
      <option value="created:desc">저장일 최신순</option>
      <option value="created:asc">저장일 오래된순</option>
      <option value="updated:desc">수정일 최신순</option>
      <option value="updated:asc">수정일 오래된순</option>
      <option value="name:asc">이름 가나다순</option>
      <option value="name:desc">이름 역순</option>
      <option value="category:asc">분류별</option>
    </select></label>
  </form>
  <div class="status"><span id="count" aria-live="polite"></span>
    <div class="right">
      <fieldset class="bgswitch" id="bgswitch"><legend>미리보기 배경</legend>
        <label><input type="radio" name="bg" value="original" checked><span>원래</span></label><label><input type="radio" name="bg" value="neutral"><span>중립</span></label>
      </fieldset>
      <button type="button" id="reset">필터 초기화</button>
    </div>
  </div>
${server ? `  <section class="atlas ui-surface" id="atlas" aria-labelledby="atlas-title">
    <h2 id="atlas-title">묶음 시트<small>카드의 "묶음"을 체크한 컴포넌트를 각자의 내보내기 설정대로 찍어 한 장에 모읍니다</small></h2>
    <div class="atlas-row">
      <label>이름<input id="atlas-name" class="ui-control" value="묶음" autocomplete="off" spellcheck="false"></label>
      <label>최대 크기<select id="atlas-max" class="ui-control"><option>512</option><option>1024</option><option selected>2048</option><option>4096</option></select></label>
      <label class="chk"><input type="checkbox" id="atlas-pot">2의 거듭제곱</label>
      <label class="chk"><input type="checkbox" id="atlas-trim" checked>투명 여백 다듬기</label>
      <span class="count" id="atlas-count" aria-live="polite">0개 선택</span>
      <button type="button" class="ui-control" id="atlas-save">묶음 저장</button>
      <button type="button" class="ui-control" id="atlas-preview">미리보기</button>
      <button type="button" class="ui-control primary" id="atlas-export">내보내기</button>
      <button type="button" class="ui-control" id="atlas-clear">선택 비우기</button>
    </div>
    <ul class="atlas-saved" id="atlas-saved" aria-label="저장한 묶음"></ul>
    <div class="atlas-out" id="atlas-out" aria-live="polite"></div>
  </section>
` : ""}  <main id="list"></main>
</div>
<div class="toast" id="toast" role="status"></div>

<script id="data" type="application/json">${embed(data)}</script>
<script>
(() => {
  const DATA = JSON.parse(document.getElementById("data").textContent);
  const LABEL = ${JSON.stringify(CATEGORY_LABEL)};
  const SERVER = ${server ? "true" : "false"};
  const EDIT_CMD = (id) => ${embed(`node "${cli}" edit `)} + JSON.stringify(id) + ${embed(` --lib "${libPath}"`)};
  const OPEN_CMD = ${embed(`node "${cli}" open --lib "${libPath}"`)};
  const editHref = (id) => "/edit/" + encodeURIComponent(id);
  const $ = (id) => document.getElementById(id);
  const els = { q: $("q"), category: $("category"), tag: $("tag"), from: $("from"), to: $("to"), sort: $("sort") };
  const KEY = "webd-library-view";
  const BG_KEY = "webd-library-bg";
  const neutralDoc = ${neutralDoc.toString()};
  let bgMode = "original";
  try { if (localStorage.getItem(BG_KEY) === "neutral") bgMode = "neutral"; } catch {}
  document.querySelector('#bgswitch input[value="' + bgMode + '"]').checked = true;
  document.body.classList.toggle("neutral", bgMode === "neutral");

  // 태그 목록
  [...new Set(DATA.flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b, "ko"))
    .forEach((t) => els.tag.append(new Option("#" + t, t)));
  $("total").textContent = "전체 " + DATA.length + "개";

  // 보기 설정 복원 (이 브라우저에만 남음)
  try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); for (const k in els) if (s[k] != null) els[k].value = s[k]; } catch {}
  const persist = () => { try { const s = {}; for (const k in els) s[k] = els[k].value; localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

  const day = (iso) => iso.slice(0, 10);
  const stamp = (iso) => iso.slice(0, 16).replace("T", " ");
  const monthLabel = (iso) => iso.slice(0, 4) + "년 " + Number(iso.slice(5, 7)) + "월";

  function filtered() {
    const [key, order] = els.sort.value.split(":");
    const dateKey = key === "updated" ? "updatedAt" : "createdAt";
    const q = els.q.value.trim().toLowerCase();
    const list = DATA.filter((d) => {
      const dd = day(d[dateKey]);
      if (els.from.value && dd < els.from.value) return false;
      if (els.to.value && dd > els.to.value) return false;
      if (els.category.value && d.category !== els.category.value) return false;
      if (els.tag.value && !d.tags.includes(els.tag.value)) return false;
      if (q && ![d.name, d.description, d.id, ...d.tags].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    const val = { created: (d) => d.createdAt, updated: (d) => d.updatedAt, name: (d) => d.name, category: (d) => d.category + "\\u0000" + d.name }[key];
    list.sort((a, b) => val(a).localeCompare(val(b), "ko") || a.id.localeCompare(b.id));
    if (order === "desc") list.reverse();
    return { list, key, dateKey };
  }

  function groups(list, key, dateKey) {
    if (key === "created" || key === "updated") return groupBy(list, (d) => monthLabel(d[dateKey]));
    if (key === "category") return groupBy(list, (d) => LABEL[d.category] || d.category);
    return [["", list]];
  }
  function groupBy(list, f) { const m = new Map(); for (const d of list) { const k = f(d); if (!m.has(k)) m.set(k, []); m.get(k).push(d); } return [...m]; }

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === "text") n.textContent = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  }

  function card(d) {
    const href = "./" + encodeURIComponent(d.id) + "/component.html";
    const vp = d.viewport || { width: 1200, height: 720 };
    const iframe = el("iframe", { src: href, title: d.name + " 미리보기", loading: "lazy", tabindex: "-1",
                                  width: String(vp.width), height: String(vp.height) });
    if (bgMode === "neutral") iframe.srcdoc = neutralDoc(d.html, "./" + encodeURIComponent(d.id) + "/");
    const frame = el("div", { class: d.background ? "frame" : "frame ui-checkerboard", "data-w": vp.width, "data-h": vp.height }, iframe);
    const chips = el("ul", { class: "chips", "aria-label": "분류와 태그" },
      el("li", {}, el("button", { type: "button", "data-kind": "category", text: LABEL[d.category] || d.category, onclick: () => { els.category.value = d.category; update(); } })),
      ...d.tags.map((t) => el("li", {}, el("button", { type: "button", text: "#" + t, onclick: () => { els.tag.value = t; update(); } }))));
    const facts = el("ul", { class: "facts" },
      el("li", {}, "저장 ", el("time", { datetime: d.createdAt, text: stamp(d.createdAt) })),
      d.updatedAt !== d.createdAt ? el("li", {}, "수정 ", el("time", { datetime: d.updatedAt, text: stamp(d.updatedAt) })) : null,
      d.versions > 1 ? el("li", { text: "버전 " + d.versions }) : null,
      d.source && d.source.project ? el("li", { text: "출처 " + d.source.project }) : null);
    const copyButtons = [
      el("button", { type: "button", class: "ui-control", text: "HTML 복사", onclick: () => copy(d.html, "HTML을 복사했습니다") }),
      el("button", { type: "button", class: "ui-control", text: "ID 복사", onclick: () => copy(d.id, "ID를 복사했습니다: " + d.id) })];
    const actions = SERVER
      ? el("div", { class: "actions" },
          pickBox(d),
          el("a", { class: "primary ui-primary ui-control", href: editHref(d.id), text: "편집" }),
          el("a", { class: "ui-control", href: editHref(d.id) + "#export", text: "내보내기" }),
          ...copyButtons,
          el("a", { class: "quiet", href, target: "_blank", rel: "noopener", text: "원본" }))
      : el("div", { class: "actions" },
          el("a", { class: "primary ui-primary ui-control", href, target: "_blank", rel: "noopener", text: "열기" }),
          el("button", { type: "button", class: "ui-control", text: "편집 명령 복사", title: "CSS 편집 서버를 여는 명령을 복사합니다", onclick: () => copy(EDIT_CMD(d.id), "편집 명령을 복사했습니다. 터미널에 붙여 넣으면 편집 화면이 열립니다.") }),
          ...copyButtons);
    const mainHref = SERVER ? editHref(d.id) : href;
    const linkAttrs = SERVER ? { href: mainHref } : { href: mainHref, target: "_blank", rel: "noopener" };
    return el("article", { class: "item ui-surface" },
      el("a", { class: "frame-link", ...linkAttrs, tabindex: "-1", "aria-hidden": "true" }, frame),
      el("div", { class: "body" },
        el("h3", { class: "name" }, el("a", { ...linkAttrs, text: d.name, title: SERVER ? "편집기에서 열기" : "새 탭에서 열기" })),
        d.description ? el("p", { class: "desc", text: d.description }) : null,
        bgMode === "neutral" ? origBg(d.background) : null,
        chips, facts, actions));
  }

  function origBg(value) {
    if (!value) return el("p", { class: "origbg" }, el("i", { "aria-hidden": "true", style: "background:#fff" }), "원래 배경 지정 없음(브라우저 기본 흰색)");
    const sw = el("i", { "aria-hidden": "true" }); sw.style.background = value;
    return el("p", { class: "origbg" }, sw, "원래 배경 ", el("code", { text: value }));
  }

  const ro = new ResizeObserver((entries) => { for (const e of entries) fit(e.target); });
  function fit(frame) {
    const w = Number(frame.dataset.w), h = Number(frame.dataset.h), s = frame.clientWidth / w;
    frame.style.height = Math.round(h * s) + "px";
    frame.firstChild.style.transform = "scale(" + s + ")";
  }

  function update() {
    persist();
    const { list, key, dateKey } = filtered();
    const root = $("list"); root.replaceChildren();
    $("count").textContent = list.length === DATA.length ? list.length + "개 표시" : DATA.length + "개 중 " + list.length + "개 표시";
    if (!DATA.length) { root.append(el("p", { class: "empty" }, el("strong", { text: "아직 저장한 컴포넌트가 없습니다." }), "webd로 만든 화면에서 \\"이 부분 라이브러리에 저장해 줘\\"라고 하면 여기에 쌓입니다.")); return; }
    if (!list.length) { root.append(el("p", { class: "empty" }, el("strong", { text: "조건에 맞는 컴포넌트가 없습니다." }), "기간이나 필터를 넓혀 보세요.")); return; }
    for (const [label, items] of groups(list, key, dateKey)) {
      const grid = el("div", { class: "grid" }, ...items.map(card));
      root.append(el("section", { class: "group" }, label ? el("h2", {}, label, el("small", { text: items.length + "개" })) : null, grid));
    }
    root.querySelectorAll(".frame").forEach((f) => { fit(f); ro.observe(f); });
  }

  let timer;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(timer); timer = setTimeout(() => t.classList.remove("on"), 1800); }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); return; } catch {}
    const ta = el("textarea", { readonly: "" }); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.append(ta); ta.select();
    const ok = document.execCommand && document.execCommand("copy"); ta.remove();
    toast(ok ? msg : "복사하지 못했습니다. 열기에서 소스를 확인하세요.");
  }

  // ---------- 묶음 시트(라이브러리 서버에서만) ----------
  const picked = [];   // 체크한 순서 = 묶음 안 순서
  function pickBox(d) {
    const box = el("input", { type: "checkbox", "data-id": d.id, "aria-label": d.name + " 묶음에 넣기" });
    box.checked = picked.includes(d.id);
    box.addEventListener("change", () => {
      const i = picked.indexOf(d.id);
      if (box.checked && i < 0) picked.push(d.id);
      if (!box.checked && i >= 0) picked.splice(i, 1);
      atlasCount();
    });
    return el("label", { class: "pick", title: "묶음 시트에 넣기" }, box, "묶음");
  }
  function atlasCount() { if ($("atlas-count")) $("atlas-count").textContent = picked.length + "개 선택"; }
  let atlases = [];
  function atlasBody() {
    const name = $("atlas-name").value.trim() || "묶음";
    const prev = atlases.find((x) => x.name === name);
    const keep = prev ? { padding: prev.padding, extrude: prev.extrude, scales: prev.scales, data: prev.data, dir: prev.dir } : {};
    return Object.assign(keep, { name, members: picked.slice(), maxSize: Number($("atlas-max").value), pot: $("atlas-pot").checked, trim: $("atlas-trim").checked });
  }
  async function atlasCall(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok) throw new Error(j.error || ("실패 (" + r.status + ")"));
    return j;
  }
  const atlasUrl = (name) => "/atlas/" + encodeURIComponent(name);
  async function loadAtlases(current) {
    try { const j = await (await fetch("/atlas/")).json(); atlases = j.atlases || []; } catch { atlases = []; }
    const ul = $("atlas-saved"); ul.replaceChildren();
    for (const a of atlases) {
      const tip = a.members.length + "개 · 최대 " + a.maxSize + (a.lastExport ? " · 마지막 내보내기 " + stamp(a.lastExport.at) : " · 아직 안 내보냄");
      ul.append(el("li", {}, el("button", { type: "button", "aria-current": String(a.name === current), title: tip, text: a.name + " · " + a.members.length + "개", onclick: () => useAtlas(a) })));
    }
  }
  function useAtlas(a) {
    $("atlas-name").value = a.name; $("atlas-max").value = String(a.maxSize); $("atlas-pot").checked = a.pot; $("atlas-trim").checked = a.trim !== false;
    picked.splice(0, picked.length, ...a.members.filter((id) => DATA.some((d) => d.id === id)));
    atlasCount(); update(); loadAtlases(a.name);
    toast("묶음 “" + a.name + "”을 불러왔습니다: " + picked.length + "개");
  }
  function busy(on, msg) {
    for (const id of ["atlas-save", "atlas-preview", "atlas-export"]) $(id).disabled = on;
    if (on) $("atlas-out").replaceChildren(el("p", { text: msg }));
  }
  function showResult(j, wrote, name) {
    const out = $("atlas-out"); out.replaceChildren();
    for (const p of j.previews) {
      const img = el("img", { src: p.url, alt: p.png, width: String(p.size.w), height: String(p.size.h) });
      const cap = p.png + " · " + p.size.w + "×" + p.size.h + " · 칸 " + p.frames + "개 · 컴포넌트 " + p.members.length + "개";
      out.append(el("figure", {}, el("div", { class: "sheet ui-checkerboard" }, img), el("figcaption", { text: cap })));
    }
    if (wrote) {
      out.append(el("p", { class: "files", text: "→ " + j.dir }), el("p", { class: "files", text: j.files.map((f) => f.name).join("  ") }),
        el("div", { class: "atlas-row" }, el("button", { type: "button", class: "ui-control", text: "폴더 열기", onclick: () => atlasCall(atlasUrl(name) + "/reveal", {}).catch((e) => toast(e.message)) })));
    } else out.append(el("p", { class: "files", text: "미리보기는 가장 큰 배율 한 가지만 찍습니다. 내보내기는 모든 배율을 씁니다." }));
    if (j.warnings && j.warnings.length) out.append(el("ul", { class: "warn" }, ...j.warnings.map((w) => el("li", { text: w }))));
  }
  async function atlasRun(kind) {
    const body = atlasBody();
    if (!picked.length) { toast("카드의 “묶음”을 먼저 체크하세요."); return; }
    busy(true, kind === "save" ? "저장 중…" : "렌더 중… 컴포넌트 " + picked.length + "개(상태·프레임이 많으면 수십 초 걸립니다)");
    try {
      if (kind === "preview") { showResult(await atlasCall(atlasUrl(body.name) + "/export", { atlas: body, write: false }), false, body.name); return; }
      const saved = await atlasCall(atlasUrl(body.name), { atlas: body });
      $("atlas-name").value = saved.atlas.name;
      saved.warnings.forEach((w) => toast(w));
      if (kind === "save") $("atlas-out").replaceChildren(el("p", { text: "묶음 “" + saved.atlas.name + "”을 저장했습니다(" + saved.atlas.members.length + "개)." }));
      else showResult(await atlasCall(atlasUrl(saved.atlas.name) + "/export", { write: true }), true, saved.atlas.name);
      loadAtlases(saved.atlas.name);
    } catch (e) { $("atlas-out").replaceChildren(el("p", { text: "실패: " + e.message })); }
    finally { busy(false); }
  }
  if (SERVER && $("atlas")) {
    $("atlas-save").addEventListener("click", () => atlasRun("save"));
    $("atlas-preview").addEventListener("click", () => atlasRun("preview"));
    $("atlas-export").addEventListener("click", () => atlasRun("export"));
    $("atlas-clear").addEventListener("click", () => { picked.length = 0; atlasCount(); update(); });
    loadAtlases();
  }

  for (const k in els) els[k].addEventListener(k === "q" ? "input" : "change", update);
  $("bgswitch").addEventListener("change", (ev) => {
    bgMode = ev.target.value === "neutral" ? "neutral" : "original";
    try { localStorage.setItem(BG_KEY, bgMode); } catch {}
    document.body.classList.toggle("neutral", bgMode === "neutral");
    update();
  });
  if ($("copy-open")) $("copy-open").addEventListener("click", () => copy(OPEN_CMD, "명령을 복사했습니다. 터미널에 붙여 넣으세요."));
  $("reset").addEventListener("click", () => { els.q.value = ""; els.category.value = ""; els.tag.value = ""; els.from.value = ""; els.to.value = ""; els.sort.value = "created:desc"; update(); });
  update();
})();
</script>
</body>
</html>
`;
}
