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
import { iconSvg } from "../editor/icons.mjs";
import { KINDS, KIND_LABEL, folderOf, kindOf, ro } from "./folders.mjs";

const UI_THEME = readFileSync(new URL("../editor/theme.css", import.meta.url), "utf8");
// 편집기와 같은 툴팁: 설명은 화면에 늘어놓지 않고 data-tip 툴팁으로만(목록 페이지는 file://로도 열리므로 코드를 그대로 넣는다)
const TOOLTIP_JS = readFileSync(new URL("../editor/tooltip.mjs", import.meta.url), "utf8").replace(/^export /gm, "");
// 편집기와 같은 메뉴 바(파일·편집·보기·내보내기·도움말)
const MENUBAR_JS = readFileSync(new URL("../editor/menubar.mjs", import.meta.url), "utf8").replace(/^export /gm, "");
const MENUBAR_CSS = readFileSync(new URL("../editor/menubar.css", import.meta.url), "utf8");
const ICON_LIST = ["search", "folder", "tag", "calendar", "sort", "reset", "bg-original", "bg-neutral", "layers", "save", "eye", "download",
  "clear", "pot", "trim", "edit", "code", "hash", "external", "terminal", "info", "warn", "folder-open", "spinner", "check",
  "folder-plus", "folder-move", "trash", "inbox", "library", "select", "wand", "chevron-right", "chevron-down", "rules", "plus"];
const ic = (n) => `<span class="ic" aria-hidden="true">${iconSvg(n)}</span>`;
/** data-tip 속성 값: 줄바꿈은 &#10;로 */
const tip = (s) => esc(s).replace(/\n/g, "&#10;");

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
export function renderGallery(entries, { libPath, generatedAt, categories, cli = "library.mjs", server = false, tree = null, suggestions = [] }) {
  const data = entries.map((e) => ({
    id: e.id, name: e.name, description: e.description, category: e.category, kind: kindOf(e), folder: folderOf(e), tags: e.tags,
    createdAt: e.createdAt, updatedAt: e.updatedAt, versions: e.versions, source: e.source, style: e.style,
    viewport: e.viewport, background: e.background ?? null, html: e.html, path: e.path,
  }));
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebD 프리셋 라이브러리</title>
<style>${UI_THEME}</style>
<style>${MENUBAR_CSS}</style>
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

  /* 아이콘·툴팁 규칙: 설명은 data-tip 툴팁으로만, 화면에는 아이콘 + 짧은 이름 */
  .where { display: flex; align-items: center; gap: 8px; }
  .info { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: var(--chrome-muted); cursor: help; }
  .info:hover { color: var(--chrome-text); background: var(--bg); }
  .bar .lb { display: inline-flex; align-items: center; gap: 5px; }
  .bar .lb .ic svg, .bar .lb .ic { width: 14px; height: 14px; }
  .bar label[data-tip] { cursor: help; }
  .serve-note .warn-chip { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text); cursor: help; }
  .serve-note button, .atlas-row button, .actions a, .actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .bgswitch span { display: inline-flex; align-items: center; gap: 5px; }
  .bgswitch .ic svg { width: 14px; height: 14px; }
  .ibtn { width: 34px; min-height: 32px; padding: 0 !important; display: inline-grid !important; place-items: center; }
  .status .ibtn { color: var(--muted); }
  .status .ibtn:hover { color: var(--text); }
  .actions { gap: 6px; padding-top: 10px !important; border-top: 1px solid var(--line); }
  .actions .spacer { flex: 1; }
  .actions .ibtn { color: var(--muted); }
  .actions .ibtn:hover { color: var(--text); }
  .pick input, .atlas-row label.chk input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .pick, .atlas-row label.chk { position: relative; }
  .pick > span, .atlas-row label.chk > span { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 10px 4px 8px; border: 1px solid var(--line); border-radius: 5px;
    background: var(--panel); color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .pick input:checked + span, .atlas-row label.chk input:checked + span { color: var(--text); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--panel)); }
  .pick input:checked + span .ic, .atlas-row label.chk input:checked + span .ic { color: var(--accent); }
  .pick input:focus-visible + span, .atlas-row label.chk input:focus-visible + span { outline: 2px solid var(--focus); outline-offset: 2px; }
  .atlas-row label.chk { padding-bottom: 0 !important; }
  .atlas h2 { display: inline-flex; align-items: center; gap: 8px; justify-self: start; cursor: help; }
  .atlas h2 .ic { color: var(--accent); }
  .atlas-row .lb { display: inline-flex; }
  .atlas-row input:not([type="checkbox"]), .atlas-row select { min-height: 32px; padding: 4px 8px; font: inherit; font-size: 13px; }
  .atlas-row #atlas-name { width: 180px; }
  .atlas-out .busy { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); cursor: help; }
  .atlas-out .busy .ic svg { animation: ui-spin .9s linear infinite; }
  @keyframes ui-spin { to { transform: rotate(360deg); } }
  .origbg { cursor: help; }
  .empty { cursor: help; }
  .empty strong { margin: 0; }

  /* 메뉴 바 · 선택 · 묶음 시트 서랍 */
  header.top { align-items: center; }
  .sel-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px; border: 1px solid var(--accent); border-radius: 999px;
              background: color-mix(in srgb, var(--accent) 12%, var(--panel)); color: var(--text); font-size: 12.5px; font-weight: 600; }
  .sel-chip[hidden] { display: none; }
  .sel-chip .ibtn { width: 24px; min-height: 24px; border: 0; background: none; color: var(--muted); cursor: pointer; border-radius: 50%; }
  .sel-chip .ibtn .ic svg { width: 13px; height: 13px; }
  .status { justify-content: flex-start; }
  .item.in-sheet { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); }
  .item.in-sheet.is-selected { box-shadow: 0 0 0 2px var(--accent); }
  .drawer { position: fixed; top: var(--appbar-h, 32px); right: 0; bottom: 0; z-index: 40; width: min(400px, 100vw); display: grid; grid-template-rows: auto minmax(0, 1fr) auto;
            border-radius: 0; border-width: 0 0 0 1px; box-shadow: -10px 0 30px rgba(0,0,0,.18); }
  .drawer[hidden] { display: none; }
  body.drawer-open .page { margin-right: 400px; }
  .drawer-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 12px; border-bottom: 1px solid var(--line); }
  .drawer-head h2 { display: inline-flex; align-items: center; gap: 8px; margin: 0 auto 0 0; font-size: 15px; font-weight: 700; cursor: help; }
  .drawer-head h2 .ic { color: var(--accent); }
  .drawer-body { overflow: auto; padding: 14px 16px; display: grid; gap: 12px; align-content: start; }
  .dr-field { display: grid; gap: 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .dr-field input, .dr-field select { min-height: 32px; padding: 4px 8px; font: inherit; font-size: 13px; font-weight: 400; color: var(--text); }
  .dr-row { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
  .dr-row .chk { position: relative; }
  .dr-row .chk input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .dr-row .chk > span { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 10px 4px 8px; border: 1px solid var(--line); border-radius: 5px;
    background: var(--panel); color: var(--muted); font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .dr-row .chk input:checked + span { color: var(--text); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--panel)); }
  .dr-row .chk input:checked + span .ic { color: var(--accent); }
  .dr-row .chk input:focus-visible + span { outline: 2px solid var(--focus); outline-offset: 2px; }
  .dr-members-head { display: flex; align-items: center; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
  .dr-members-head .count { margin-right: auto; font-size: 13px; font-weight: 700; color: var(--text); }
  .dr-members-head button { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12.5px; font-weight: 600; padding: 4px 10px; min-height: 30px; }
  .dr-members { margin: 0; padding: 0 0 0 22px; display: grid; gap: 2px; font-size: 13px; }
  .dr-members li { padding: 1px 0; }
  .dr-members li > * { vertical-align: middle; }
  .dr-members li { display: list-item; }
  .dr-members .nm { display: inline-block; max-width: calc(100% - 34px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dr-members .ibtn { width: 26px; min-height: 26px; margin-left: 4px; border: 0; background: none; color: var(--muted); cursor: pointer; border-radius: 4px; }
  .dr-members .ibtn:hover { color: var(--text); background: var(--bg); }
  .dr-members .ibtn .ic svg { width: 13px; height: 13px; }
  .drawer-foot { display: flex; gap: 8px; padding: 12px 16px 14px; border-top: 1px solid var(--line); }
  .drawer-foot button { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 600; padding: 6px 12px; min-height: 34px; }
  .drawer-foot button.primary { margin-left: auto; background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .drawer-foot button:disabled { opacity: .5; cursor: progress; }
  .help { max-width: 420px; padding: 18px 20px; color: var(--text); }
  .help::backdrop { background: rgba(0,0,0,.35); }
  .help h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 16px; }
  .help dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; margin: 0 0 16px; font-size: 13px; }
  .help dt { margin: 0; } .help dd { margin: 0; color: var(--muted); }
  .help kbd { font: 11.5px var(--mono); padding: 2px 6px; border: 1px solid var(--line); border-radius: 4px; background: var(--bg); }
  .help form { text-align: right; } .help button { font: inherit; font-size: 13px; padding: 6px 14px; }
  @media (max-width: 1100px) { body.drawer-open .page { margin-right: 0; } }

  /* 가상 폴더: 왼쪽 트리, 오른쪽 카드 */
  .shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); gap: 20px; align-items: start; margin-top: 18px; }
  .shell .group:first-child { margin-top: 0; }
  .tree { position: sticky; top: 48px; max-height: calc(100vh - 64px); overflow: auto; padding: 10px 8px 12px; display: grid; gap: 8px; }
  .tree-head { display: flex; align-items: center; gap: 6px; padding: 2px 4px 8px; border-bottom: 1px solid var(--line); }
  .tree-head h2 { display: inline-flex; align-items: center; gap: 7px; margin: 0 auto 0 0; font-size: 14px; font-weight: 700; }
  .tree-head h2 .ic { color: var(--accent); }
  .tree-tools { display: inline-flex; gap: 2px; }
  .tree-tools .ibtn { width: 28px; min-height: 28px; border-color: transparent; background: transparent; color: var(--muted); }
  .tree-tools .ibtn:hover:not(:disabled) { border-color: var(--line); color: var(--text); background: var(--bg); }
  .tree-tools .ibtn:disabled { opacity: .35; cursor: default; }
  .tree-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
  .tree-node { display: flex; align-items: center; padding-left: calc(var(--d, 0) * 12px); border-radius: 5px; }
  .tree-node .tw { flex: 0 0 18px; height: 30px; display: inline-grid; place-items: center; padding: 0; border: 0; background: none; color: var(--muted); cursor: pointer; }
  .tree-node .tw .ic svg { width: 13px; height: 13px; }
  .tree-btn { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; min-height: 30px; padding: 4px 8px 4px 4px; border: 0; border-radius: 5px; background: none; color: var(--text); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
  .tree-btn .ic { color: var(--muted); }
  .tree-btn .tn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tree-btn .tc { font: 11.5px/1 var(--mono); color: var(--muted); }
  .tree-node:hover .tree-btn { background: var(--bg); }
  .tree-node.is-on .tree-btn { background: var(--accent); color: var(--on-accent); font-weight: 700; }
  .tree-node.is-on .tree-btn .ic, .tree-node.is-on .tree-btn .tc { color: var(--on-accent); }
  .tree-node.drop .tree-btn { outline: 2px dashed var(--accent); outline-offset: -2px; background: color-mix(in srgb, var(--accent) 14%, var(--panel)); }
  body.dragging .tree-node:not(:first-child) .tree-btn { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent); }
  .tree-edit { display: flex; align-items: center; gap: 6px; padding: 0 4px; color: var(--accent); }
  .tree-edit input { flex: 1; min-width: 0; min-height: 30px; padding: 4px 8px; font: inherit; font-size: 13px; border-color: var(--accent); }
  .suggest { justify-self: start; display: inline-flex; align-items: center; gap: 6px; margin: 4px 4px 0; padding: 5px 10px; font: inherit; font-size: 12.5px; font-weight: 600; border-style: dashed; }
  .suggest .ic { color: var(--accent); }
  .item { position: relative; }
  .quick-edit { position: absolute; top: 8px; left: 8px; z-index: 2; display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 4px 12px 4px 10px;
                border-radius: 6px; font-size: 13px; font-weight: 700; text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,.25);
                opacity: 0; transform: translateY(-2px); transition: opacity .12s ease-out, transform .12s ease-out; }
  .item:hover .quick-edit, .item:focus-within .quick-edit, .quick-edit:focus-visible { opacity: 1; transform: none; }
  @media (hover: none) { .quick-edit { opacity: 1; transform: none; } }
  .item .sel { position: absolute; top: 8px; right: 8px; z-index: 2; display: inline-grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 6px;
               background: color-mix(in srgb, var(--panel) 88%, transparent); color: var(--muted); cursor: pointer; opacity: 0; transition: opacity .12s ease-out; }
  .item:hover .sel, .item .sel:focus-visible, .item.is-selected .sel, body.has-selection .item .sel { opacity: 1; }
  .item .sel[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .item.is-selected { box-shadow: 0 0 0 2px var(--accent); }
  .item[draggable="true"] { cursor: grab; }
  .facts .fold { display: inline-flex; align-items: center; gap: 4px; }
  .facts .fold .ic svg { width: 13px; height: 13px; }
  .move-menu { position: fixed; z-index: 60; min-width: 200px; max-width: 300px; max-height: 60vh; overflow: auto; padding: 4px; display: grid; gap: 1px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
  .move-menu .mm-head { margin: 4px 8px 6px; font-size: 11.5px; font-weight: 700; color: var(--muted); }
  .move-menu button { display: flex; align-items: center; gap: 7px; padding: 6px 10px 6px calc(10px + var(--d, 0) * 12px); border: 0; border-radius: 4px; background: none; color: var(--text); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
  .move-menu button .ic { color: var(--muted); }
  .move-menu button:hover, .move-menu button:focus-visible { background: var(--accent); color: var(--on-accent); outline: none; }
  .move-menu button:hover .ic, .move-menu button:focus-visible .ic { color: var(--on-accent); }

  @media (max-width: 900px) {
    .shell { grid-template-columns: 1fr; }
    .tree { position: static; max-height: none; }
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
<div class="appbar"><nav id="menubar" aria-label="메뉴"></nav></div>
<div class="page">
  <header class="top ui-top">
    <h1 class="ui-title">프리셋 라이브러리</h1>
    <p class="where ui-meta"><span id="total"></span><span class="info" tabindex="0" data-tip="${tip(`라이브러리\n생성 ${generatedAt.slice(0, 16).replace("T", " ")}\n${libPath}`)}">${ic("info")}<span class="sr">라이브러리 정보</span></span></p>
  </header>
${server ? "" : `  <p class="serve-note ui-surface" id="serve-note"><span class="warn-chip" tabindex="0" data-tip="${tip(`파일로 연 목록\n카드를 눌러 바로 편집할 수 없습니다. 명령을 복사해 터미널에서 실행하면 편집기가 열립니다.\nnode "${cli}" open`)}">${ic("warn")}파일로 연 목록</span><button type="button" class="ui-control" id="copy-open" data-tip="${tip(`편집기 여는 명령 복사\nnode "${cli}" open`)}">${ic("terminal")}명령 복사</button></p>
`}
  <form class="bar ui-surface" id="bar" role="search" onsubmit="return false">
    <label class="q"><span class="lb">${ic("search")}검색</span><input id="q" class="ui-control" type="search" placeholder="이름, 설명, 태그" autocomplete="off"></label>
    <label data-tip="종류&#10;컴포넌트·화면·무늬·아이콘·토큰·효과 중 무엇을 저장했는지로 거릅니다. 정리는 왼쪽 폴더로 합니다."><span class="lb">${ic("rules")}종류</span><select id="kind" class="ui-control"><option value="">전체</option>${KINDS.map((k) => `<option value="${k}">${KIND_LABEL[k]}</option>`).join("")}</select></label>
    <label><span class="lb">${ic("tag")}태그</span><select id="tag" class="ui-control"><option value="">전체</option></select></label>
    <div class="period-wrap"><label data-tip="기간&#10;정렬 기준 날짜(저장일·수정일)로 거릅니다."><span class="lb">${ic("calendar")}기간</span>
      <span class="period"><input id="from" class="ui-control" type="date" aria-label="시작일"><span>~</span><input id="to" class="ui-control" type="date" aria-label="종료일"></span></label></div>
    <label><span class="lb">${ic("sort")}정렬</span><select id="sort" class="ui-control">
      <option value="created:desc">저장일 최신순</option>
      <option value="created:asc">저장일 오래된순</option>
      <option value="updated:desc">수정일 최신순</option>
      <option value="updated:asc">수정일 오래된순</option>
      <option value="name:asc">이름 가나다순</option>
      <option value="name:desc">이름 역순</option>
      <option value="kind:asc">종류별</option>
    </select></label>
  </form>
  <div class="status"><span id="count" aria-live="polite"></span>
    <span class="sel-chip" id="sel-chip" hidden><span id="sel-count"></span><button type="button" id="sel-clear" class="ibtn" aria-label="선택 해제" data-tip="선택 해제&#10;Esc">${ic("clear")}</button></span>
  </div>
  <div class="shell">
    <aside class="tree ui-surface" id="tree" aria-label="폴더"></aside>
    <main id="list"></main>
  </div>
</div>
${server ? `<aside class="drawer ui-surface" id="atlas" aria-labelledby="atlas-title" hidden>
  <div class="drawer-head">
    <h2 id="atlas-title" tabindex="0" data-tip="묶음 시트&#10;프리셋 여러 개를 각자의 내보내기 설정대로 렌더해 한 장에 모읍니다. 서랍을 연 채로 카드를 더 고르고 ‘선택 추가’를 누르면 됩니다.">${ic("layers")}묶음 시트</h2>
    <button type="button" class="ibtn ui-control" id="atlas-close" aria-label="닫기" data-tip="닫기&#10;Esc">${ic("clear")}</button>
  </div>
  <div class="drawer-body">
    <label class="dr-field" data-tip="묶음 이름&#10;파일 이름과 저장한 묶음 목록에 쓰입니다."><span class="lb">이름</span><input id="atlas-name" class="ui-control" value="묶음" autocomplete="off" spellcheck="false"></label>
    <div class="dr-row">
      <label class="dr-field" data-tip="최대 크기&#10;시트 한 장의 최대 픽셀 크기입니다. 넘치면 여러 장으로 나눕니다."><span class="lb">최대 크기</span><select id="atlas-max" class="ui-control"><option>512</option><option>1024</option><option selected>2048</option><option>4096</option></select></label>
      <label class="chk" data-tip="2의 거듭제곱&#10;시트 크기를 256·512·1024처럼 2의 거듭제곱으로 맞춥니다."><input type="checkbox" id="atlas-pot"><span>${ic("pot")}2의 거듭제곱</span></label>
      <label class="chk" data-tip="투명 여백 다듬기&#10;칸마다 투명한 가장자리를 잘라 빽빽하게 배치합니다. 9·3-slice는 다듬지 않습니다."><input type="checkbox" id="atlas-trim" checked><span>${ic("trim")}여백 다듬기</span></label>
    </div>
    <div class="dr-members-head">
      <span class="count" id="atlas-count" aria-live="polite">0개</span>
      <button type="button" class="ui-control" id="atlas-add" data-tip="선택 추가&#10;목록에서 고른 카드를 이 시트에 더합니다.">${ic("plus")}선택 추가</button>
      <button type="button" class="ui-control ibtn" id="atlas-clear" aria-label="구성 비우기" data-tip="구성 비우기&#10;이 시트에서 프리셋을 모두 뺍니다.">${ic("trash")}</button>
    </div>
    <ol class="dr-members" id="atlas-members" aria-label="시트에 들어갈 프리셋"></ol>
    <div class="atlas-out" id="atlas-out" aria-live="polite"></div>
  </div>
  <div class="drawer-foot">
    <button type="button" class="ui-control" id="atlas-save" data-tip="묶음 저장&#10;구성과 설정을 이 이름으로 저장합니다.">${ic("save")}저장</button>
    <button type="button" class="ui-control" id="atlas-preview" data-tip="미리보기&#10;가장 큰 배율 한 가지만 렌더해 봅니다. 내보내기는 모든 배율을 씁니다.">${ic("eye")}미리보기</button>
    <button type="button" class="ui-control primary" id="atlas-export" data-tip="내보내기&#10;저장한 뒤 PNG·JSON을 폴더에 씁니다.">${ic("download")}내보내기</button>
  </div>
</aside>
` : ""}<div class="toast" id="toast" role="status"></div>

<script id="data" type="application/json">${embed(data)}</script>
<script>
${TOOLTIP_JS}
${MENUBAR_JS}
initTooltips();
(() => {
  const IC = ${embed(Object.fromEntries(ICON_LIST.map((n) => [n, iconSvg(n)])))};
  const ic = (n) => { const s = document.createElement("span"); s.className = "ic"; s.setAttribute("aria-hidden", "true"); s.innerHTML = IC[n] || ""; return s; };
  const DATA = JSON.parse(document.getElementById("data").textContent);
  const LABEL = ${JSON.stringify(KIND_LABEL)};
  const josaRo = ${ro.toString()};
  const TREE = ${embed(tree ?? { folders: [] })};
  const SUGGEST = ${embed(suggestions ?? [])};
  const SERVER = ${server ? "true" : "false"};
  const EDIT_CMD = (id) => ${embed(`node "${cli}" edit `)} + JSON.stringify(id) + ${embed(` --lib "${libPath}"`)};
  const OPEN_CMD = ${embed(`node "${cli}" open --lib "${libPath}"`)};
  const LIB_PATH = ${embed(libPath)};
  const editHref = (id) => "/edit/" + encodeURIComponent(id);
  const $ = (id) => document.getElementById(id);
  const els = { q: $("q"), kind: $("kind"), tag: $("tag"), from: $("from"), to: $("to"), sort: $("sort") };
  const KEY = "webd-library-view";
  const BG_KEY = "webd-library-bg";
  const neutralDoc = ${neutralDoc.toString()};
  let bgMode = "original";
  try { if (localStorage.getItem(BG_KEY) === "neutral") bgMode = "neutral"; } catch {}
  document.body.classList.toggle("neutral", bgMode === "neutral");
  function setBg(mode) {
    bgMode = mode === "neutral" ? "neutral" : "original";
    try { localStorage.setItem(BG_KEY, bgMode); } catch {}
    document.body.classList.toggle("neutral", bgMode === "neutral");
    update();
  }

  // 태그 목록
  [...new Set(DATA.flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b, "ko"))
    .forEach((t) => els.tag.append(new Option("#" + t, t)));
  $("total").textContent = "전체 " + DATA.length + "개";

  // 보기 설정 복원 (이 브라우저에만 남음)
  try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); for (const k in els) if (s[k] != null) els[k].value = s[k]; } catch {}
  if (!els.sort.value) els.sort.value = "created:desc";

  // ---------- 가상 폴더 ----------
  // cur: null = 모든 프리셋, "" = 폴더 없음, "a/b" = 그 폴더(하위 폴더 포함)
  const FOLDER_KEY = "webd-library-folder", CLOSED_KEY = "webd-library-folders-closed";
  let cur = null;
  try { const v = localStorage.getItem(FOLDER_KEY); if (v != null) cur = JSON.parse(v); } catch {}
  let closed = new Set();
  try { closed = new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) || "[]")); } catch {}
  const saveCur = () => { try { localStorage.setItem(FOLDER_KEY, JSON.stringify(cur)); } catch {} };
  const saveClosed = () => { try { localStorage.setItem(CLOSED_KEY, JSON.stringify([...closed])); } catch {} };
  const parentOf = (f) => f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
  const ancestors = (f) => { const out = []; let x = f; while (x) { out.push(x); x = parentOf(x); } return out; };
  const inFolder = (d, f) => f === null ? true : f === "" ? !d.folder : (d.folder === f || d.folder.startsWith(f + "/"));
  const realFolder = () => typeof cur === "string" && cur !== "";
  function allFolders() {
    const s = new Set();
    for (const f of TREE.folders || []) for (const a of ancestors(f)) s.add(a);
    for (const d of DATA) for (const a of ancestors(d.folder)) s.add(a);
    return [...s].sort((a, b) => a.localeCompare(b, "ko"));
  }
  const selected = new Set();   // 폴더로 옮길 프리셋(카드 왼쪽 위 선택)
  let dragIds = null, editing = null;
  // 폴더를 바꾸면 페이지를 다시 읽는다. 알림은 다시 읽은 뒤 보여 준다.
  const reloadWith = (msg) => { try { sessionStorage.setItem("webd-library-toast", msg); } catch {} location.reload(); };
  async function post(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok) { toast(j.error || ("실패 (" + r.status + ")")); throw new Error(j.error || "실패"); }
    return j;
  }
  function moveTo(ids, f) {
    const to = f || "폴더 없음";
    post("/folders/move", { ids, folder: f }).then((j) => reloadWith(to + josaRo(to) + " " + j.moved.length + "개 옮겼습니다.")).catch(() => {});
  }
  function ibtn(icn, label, tipText, onclick, disabled) {
    const b = el("button", { type: "button", class: "ibtn ui-control", "aria-label": label, "data-tip": tipText, onclick }, ic(icn));
    if (disabled) b.disabled = true;
    return b;
  }
  function node(f, label, icn, n, depth, hasKids) {
    const on = f === cur;
    const li = el("li", { role: "treeitem", "aria-selected": String(on), class: "tree-node" + (on ? " is-on" : ""), style: "--d:" + depth });
    if (hasKids) li.setAttribute("aria-expanded", String(!closed.has(f)));
    const tw = hasKids
      ? el("button", { type: "button", class: "tw", "aria-label": closed.has(f) ? "펼치기" : "접기", onclick: () => { closed.has(f) ? closed.delete(f) : closed.add(f); saveClosed(); renderTree(); } }, ic(closed.has(f) ? "chevron-right" : "chevron-down"))
      : el("span", { class: "tw", "aria-hidden": "true" });
    const btn = el("button", { type: "button", class: "tree-btn", "data-tip": f ? f + "\\n" + n + "개(하위 폴더 포함)" : null,
      onclick: () => { cur = f; saveCur(); renderTree(); update(); syncSel(); } }, ic(icn), el("span", { class: "tn", text: label }), el("span", { class: "tc", text: String(n) }));
    li.append(tw, btn);
    if (SERVER && f !== null) {
      li.addEventListener("dragover", (e) => { if (!dragIds) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; li.classList.add("drop"); });
      li.addEventListener("dragleave", () => li.classList.remove("drop"));
      li.addEventListener("drop", (e) => { e.preventDefault(); li.classList.remove("drop"); if (dragIds) moveTo(dragIds, f); });
    }
    return li;
  }
  function renderTree() {
    const box = $("tree"); if (!box) return;
    const folders = allFolders();
    if (realFolder() && !folders.includes(cur)) { cur = null; saveCur(); }
    const count = (f) => DATA.filter((d) => inFolder(d, f)).length;
    const head = el("div", { class: "tree-head" }, el("h2", {}, ic("folder"), "폴더"));
    if (SERVER) head.append(el("span", { class: "tree-tools" },
      ibtn("folder-plus", "새 폴더", "새 폴더\\n" + (realFolder() ? "‘" + cur + "’ 안에" : "맨 위에") + " 폴더를 만듭니다.", () => startEdit("new")),
      ibtn("edit", "폴더 이름 바꾸기", "이름 바꾸기\\n고른 폴더의 이름을 바꿉니다.", () => startEdit("rename"), !realFolder()),
      ibtn("trash", "폴더 지우기", "폴더 지우기\\n안의 프리셋과 하위 폴더는 한 단계 위로 올라갑니다. 프리셋은 지우지 않습니다.", removeCur, !realFolder()),
      ibtn("layers", "폴더를 묶음 시트로", "폴더를 묶음 시트로\\n고른 폴더(하위 포함)의 프리셋으로 묶음 시트 서랍을 엽니다.", folderToAtlas, !realFolder() || !$("atlas"))));
    const parts = [head];
    if (editing) {
      const base = editing.mode === "new" ? (realFolder() ? cur + "/" : "") : (parentOf(cur) ? parentOf(cur) + "/" : "");
      const inp = el("input", { id: "tree-edit-input", class: "ui-control", "aria-label": editing.mode === "new" ? "새 폴더 이름" : "폴더 새 이름", placeholder: editing.mode === "new" ? "새 폴더 이름" : "", spellcheck: "false", autocomplete: "off" });
      if (editing.mode === "rename") inp.value = cur.split("/").pop();
      const done = (ok) => {
        if (!editing) return;
        const m = editing.mode, v = inp.value.trim(); editing = null;
        if (!ok || !v) { renderTree(); return; }
        const path = base + v;
        const req = m === "new" ? post("/folders/add", { path }) : post("/folders/rename", { from: cur, to: path });
        req.then((j) => { cur = m === "new" ? j.folder : j.to; saveCur(); reloadWith(m === "new" ? "폴더를 만들었습니다: " + cur : "이름을 바꿨습니다: " + cur); }).catch(() => renderTree());
      };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); done(true); } else if (e.key === "Escape") { e.preventDefault(); done(false); } });
      inp.addEventListener("blur", () => done(true));
      parts.push(el("div", { class: "tree-edit", "data-tip": base ? "위치\\n" + base.slice(0, -1) : "위치\\n맨 위" }, ic(editing.mode === "new" ? "folder-plus" : "edit"), inp));
    }
    const ul = el("ul", { class: "tree-list", role: "tree", "aria-label": "폴더" });
    ul.append(node(null, "모든 프리셋", "library", count(null), 0, false));
    for (const f of folders) {
      if (ancestors(f).some((a) => a !== f && closed.has(a))) continue;
      ul.append(node(f, f.split("/").pop(), "folder", count(f), f.split("/").length, folders.some((x) => x.startsWith(f + "/"))));
    }
    ul.append(node("", "폴더 없음", "inbox", count(""), 0, false));
    parts.push(ul);
    if (SERVER && SUGGEST.length && DATA.some((d) => !d.folder)) {
      parts.push(el("button", { type: "button", class: "suggest ui-control", "data-tip": suggestTip(), onclick: applySuggest }, ic("wand"), "폴더 제안"));
    }
    box.replaceChildren(...parts);
    if (editing) { const i = $("tree-edit-input"); i.focus(); i.select(); }
  }
  function applySuggest() { post("/folders/suggest", {}).then((j) => reloadWith("폴더 제안을 적용했습니다: " + j.applied.map((a) => a.folder + " " + a.moved.length + "개").join(", "))).catch(() => {}); }
  function startEdit(mode) { if (mode === "rename" && !realFolder()) return; editing = { mode }; renderTree(); }
  function removeCur() {
    if (!realFolder()) return;
    const n = DATA.filter((d) => inFolder(d, cur)).length;
    if (!confirm("‘" + cur + "’ 폴더를 지울까요?\\n안의 프리셋 " + n + "개와 하위 폴더는 한 단계 위로 올라갑니다. 프리셋은 지우지 않습니다.")) return;
    const f = cur;
    post("/folders/remove", { path: f }).then((j) => { cur = j.parent || null; saveCur(); reloadWith("폴더를 지웠습니다: " + f); }).catch(() => {});
  }
  function folderToAtlas() {
    if (!realFolder() || !$("atlas")) return;
    openDrawer(DATA.filter((d) => inFolder(d, cur)).map((d) => d.id), cur.split("/").join("-"));
  }
  /** 카드의 ‘폴더로 옮기기’ 메뉴 */
  function openMoveMenu(anchor, ids) {
    document.querySelector(".move-menu")?.remove();
    const menu = el("div", { class: "move-menu ui-surface", role: "menu", "aria-label": "폴더로 옮기기" });
    const item = (f, label, depth) => el("button", { type: "button", role: "menuitem", style: "--d:" + depth, onclick: () => { menu.remove(); moveTo(ids, f); } }, ic(f ? "folder" : "inbox"), label);
    menu.append(el("p", { class: "mm-head", text: ids.length > 1 ? ids.length + "개 옮기기" : "옮기기" }), item("", "폴더 없음", 0));
    for (const f of allFolders()) menu.append(item(f, f.split("/").pop(), f.split("/").length));
    document.body.append(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(document.documentElement.clientWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth)) + "px";
    menu.style.top = (r.bottom + 6 + menu.offsetHeight > innerHeight ? Math.max(8, r.top - 6 - menu.offsetHeight) : r.bottom + 6) + "px";
    menu.querySelector("button")?.focus();
    const close = (e) => { if (e.type === "keydown" ? e.key === "Escape" : !menu.contains(e.target)) { menu.remove(); removeEventListener("pointerdown", close, true); removeEventListener("keydown", close, true); if (e.type === "keydown") anchor.focus(); } };
    setTimeout(() => { addEventListener("pointerdown", close, true); addEventListener("keydown", close, true); });
  }
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
      if (!inFolder(d, cur)) return false;
      if (els.kind.value && d.kind !== els.kind.value) return false;
      if (els.tag.value && !d.tags.includes(els.tag.value)) return false;
      if (q && ![d.name, d.description, d.id, ...d.tags].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    const val = { created: (d) => d.createdAt, updated: (d) => d.updatedAt, name: (d) => d.name, kind: (d) => d.kind + "\\u0000" + d.name }[key] || ((d) => d.createdAt);
    list.sort((a, b) => val(a).localeCompare(val(b), "ko") || a.id.localeCompare(b.id));
    if (order === "desc") list.reverse();
    return { list, key, dateKey };
  }

  function groups(list, key, dateKey) {
    if (key === "created" || key === "updated") return groupBy(list, (d) => monthLabel(d[dateKey]));
    if (key === "kind") return groupBy(list, (d) => LABEL[d.kind] || d.kind);
    return [["", list]];
  }
  function groupBy(list, f) { const m = new Map(); for (const d of list) { const k = f(d); if (!m.has(k)) m.set(k, []); m.get(k).push(d); } return [...m]; }

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "text") n.textContent = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); }
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
      el("li", {}, el("button", { type: "button", "data-kind": "kind", "data-tip": "종류\\n누르면 이 종류만 봅니다.", text: LABEL[d.kind] || d.kind, onclick: () => { els.kind.value = d.kind; update(); } })),
      ...d.tags.map((t) => el("li", {}, el("button", { type: "button", text: "#" + t, onclick: () => { els.tag.value = t; update(); } }))));
    const facts = el("ul", { class: "facts" },
      el("li", {}, "저장 ", el("time", { datetime: d.createdAt, text: stamp(d.createdAt) })),
      d.updatedAt !== d.createdAt ? el("li", {}, "수정 ", el("time", { datetime: d.updatedAt, text: stamp(d.updatedAt) })) : null,
      d.versions > 1 ? el("li", { text: "버전 " + d.versions }) : null,
      d.source && d.source.project ? el("li", { text: "출처 " + d.source.project }) : null,
      cur === null && d.folder ? el("li", { class: "fold", "data-tip": "폴더\\n" + d.folder }, ic("folder"), d.folder.split("/").join(" › ")) : null);
    const copyButtons = [
      el("button", { type: "button", class: "ui-control ibtn", "aria-label": "HTML 복사", "data-tip": "HTML 복사\\n컴포넌트 HTML 전체를 복사합니다.", onclick: () => copy(d.html, "HTML을 복사했습니다") }, ic("code")),
      el("button", { type: "button", class: "ui-control ibtn", "aria-label": "ID 복사", "data-tip": "ID 복사\\n" + d.id, onclick: () => copy(d.id, "ID를 복사했습니다: " + d.id) }, ic("hash"))];
    const actions = SERVER
      ? el("div", { class: "actions" },
          el("span", { class: "spacer" }),
          el("button", { type: "button", class: "ui-control ibtn", "aria-label": "폴더로 옮기기", "aria-haspopup": "menu", "data-tip": "폴더로 옮기기\\n고른 카드가 있으면 함께 옮깁니다. 카드를 왼쪽 폴더로 끌어도 됩니다.",
            onclick: (e) => openMoveMenu(e.currentTarget, selected.has(d.id) ? [...selected] : [d.id]) }, ic("folder-move")),
          ...copyButtons,
          el("a", { class: "ui-control ibtn", href, target: "_blank", rel: "noopener", "aria-label": "원본 열기", "data-tip": "원본 열기\\n저장된 component.html을 새 탭에서 엽니다." }, ic("external")),
          el("a", { class: "ui-control", href: editHref(d.id) + "#export", "data-tip": "내보내기\\n편집기의 내보내기 탭을 엽니다." }, ic("download"), "내보내기"))
      : el("div", { class: "actions" },
          el("span", { class: "spacer" }),
          ...copyButtons,
          el("button", { type: "button", class: "ui-control ibtn", "aria-label": "편집 명령 복사", "data-tip": "편집 명령 복사\\n편집기를 여는 명령을 복사합니다. 터미널에 붙여 넣으면 편집 화면이 열립니다.", onclick: () => copy(EDIT_CMD(d.id), "편집 명령을 복사했습니다.") }, ic("terminal")));
    // 썸네일 왼쪽 위: 편집(파일로 연 목록에서는 열기). 카드에 마우스를 올리거나 포커스하면 나온다
    const quick = SERVER
      ? el("a", { class: "quick-edit ui-primary", href: editHref(d.id), "data-tip": "편집\\n편집기에서 엽니다." }, ic("edit"), "편집")
      : el("a", { class: "quick-edit ui-primary", href, target: "_blank", rel: "noopener", "data-tip": "열기\\n새 탭에서 엽니다." }, ic("external"), "열기");
    const mainHref = SERVER ? editHref(d.id) : href;
    const linkAttrs = SERVER ? { href: mainHref } : { href: mainHref, target: "_blank", rel: "noopener" };
    const art = el("article", { class: "item ui-surface" + (selected.has(d.id) ? " is-selected" : "") + (picked.includes(d.id) ? " in-sheet" : ""), "data-id": d.id },
      SERVER ? el("button", { type: "button", class: "sel", "aria-pressed": String(selected.has(d.id)), "aria-label": d.name + " 선택", "data-tip": "선택\\n여러 개를 골라 옮기기·내보내기·묶음 시트에 씁니다. Ctrl+A로 이 폴더 전체.",
        onclick: () => { selected.has(d.id) ? selected.delete(d.id) : selected.add(d.id); syncSel(); } }, ic("select")) : null,
      quick,
      el("a", { class: "frame-link", ...linkAttrs, tabindex: "-1", "aria-hidden": "true" }, frame),
      el("div", { class: "body" },
        el("h3", { class: "name" }, el("a", { ...linkAttrs, text: d.name })),
        d.description ? el("p", { class: "desc", text: d.description }) : null,
        bgMode === "neutral" ? origBg(d.background) : null,
        chips, facts, actions));
    if (SERVER) {
      art.draggable = true;
      art.addEventListener("dragstart", (e) => {
        dragIds = selected.has(d.id) ? [...selected] : [d.id];
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragIds.join(","));
        document.body.classList.add("dragging");
      });
      art.addEventListener("dragend", () => { dragIds = null; document.body.classList.remove("dragging"); });
    }
    return art;
  }

  function origBg(value) {
    if (!value) return el("p", { class: "origbg", "data-tip": "원래 배경\\n지정 없음(브라우저 기본 흰색)" }, el("i", { "aria-hidden": "true", style: "background:#fff" }), el("code", { text: "기본" }));
    const sw = el("i", { "aria-hidden": "true" }); sw.style.background = value;
    return el("p", { class: "origbg", "data-tip": "원래 배경\\n" + value }, sw, el("code", { text: value }));
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
    const where = cur === null ? "" : cur === "" ? "폴더 없음 · " : cur.split("/").join(" › ") + " · ";
    $("count").textContent = where + (list.length === DATA.length ? list.length + "개 표시" : DATA.length + "개 중 " + list.length + "개 표시");
    if (!DATA.length) { root.append(el("p", { class: "empty", tabindex: "0", "data-tip": "비어 있음\\nwebd로 만든 화면에서 ‘이 부분 라이브러리에 저장해 줘’라고 하면 여기에 쌓입니다." }, el("strong", { text: "저장한 프리셋 없음" }))); return; }
    if (!list.length) { root.append(el("p", { class: "empty", tabindex: "0", "data-tip": "결과 없음\\n다른 폴더를 고르거나 기간·필터를 넓혀 보세요." }, el("strong", { text: realFolder() ? "이 폴더에 맞는 프리셋 없음" : "조건에 맞는 프리셋 없음" }))); return; }
    for (const [label, items] of groups(list, key, dateKey)) {
      const grid = el("div", { class: "grid" }, ...items.map(card));
      root.append(el("section", { class: "group" }, label ? el("h2", {}, label, el("small", { text: items.length + "개" })) : null, grid));
    }
    root.querySelectorAll(".frame").forEach((f) => { fit(f); ro.observe(f); });
    syncSel();
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

  // ---------- 선택(카드 왼쪽 위): 옮기기·내보내기·묶음 시트·휴지통이 같이 쓴다 ----------
  function syncSel() {
    for (const art of document.querySelectorAll(".item[data-id]")) {
      const on = selected.has(art.dataset.id);
      art.classList.toggle("is-selected", on);
      art.querySelector(".sel")?.setAttribute("aria-pressed", String(on));
      art.classList.toggle("in-sheet", picked.includes(art.dataset.id));
    }
    document.body.classList.toggle("has-selection", selected.size > 0);
    const chip = $("sel-chip");
    if (chip) { chip.hidden = !selected.size; $("sel-count").textContent = selected.size + "개 선택"; }
  }
  const visibleIds = () => filtered().list.map((d) => d.id);
  function selectAll() { for (const id of visibleIds()) selected.add(id); syncSel(); toast(selected.size + "개를 골랐습니다."); }
  function clearSel() { selected.clear(); syncSel(); }
  const nameOf = (id) => (DATA.find((d) => d.id === id) || {}).name || id;
  function trash(ids) {
    if (!SERVER || !ids.length) return;
    const head = ids.length === 1 ? "‘" + nameOf(ids[0]) + "’을" : ids.length + "개를";
    if (!confirm(head + " 휴지통으로 옮길까요?\\n라이브러리의 .trash 폴더로 옮겨지며 바로 지우지는 않습니다. 내보낸 파일은 그대로 남습니다.")) return;
    post("/items/remove", { ids }).then((j) => { selected.clear(); reloadWith(j.removed.length + "개를 휴지통으로 옮겼습니다."); }).catch(() => {});
  }
  /** 고른 프리셋을 각자 내보내기 설정(export.json)대로 하나씩 내보낸다 */
  async function exportEach(ids) {
    if (!SERVER || !ids.length) return;
    const fails = [];
    for (let i = 0; i < ids.length; i++) {
      toast("내보내는 중 " + (i + 1) + "/" + ids.length + " · " + nameOf(ids[i]));
      try {
        const base = "/api/" + encodeURIComponent(ids[i]);
        const s = await (await fetch(base + "/export-spec", { cache: "no-store" })).json();
        const r = await fetch(base + "/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ spec: s.spec, write: true }) });
        if (!r.ok) throw new Error(String(r.status));
      } catch { fails.push(nameOf(ids[i])); }
    }
    toast(fails.length ? (ids.length - fails.length) + "개 내보냄 · 실패 " + fails.length + "개: " + fails.join(", ") : ids.length + "개를 각자 설정대로 내보냈습니다.");
  }

  // ---------- 묶음 시트(오른쪽 서랍, 라이브러리 서버에서만) ----------
  const picked = [];   // 시트에 들어갈 순서
  function atlasCount() {
    if (!$("atlas-count")) return;
    $("atlas-count").textContent = picked.length + "개";
    const ul = $("atlas-members"); ul.replaceChildren();
    picked.forEach((id, i) => ul.append(el("li", {},
      el("span", { class: "nm", text: nameOf(id) }),
      el("button", { type: "button", class: "ibtn", "aria-label": nameOf(id) + " 빼기", "data-tip": "시트에서 빼기", onclick: () => { picked.splice(i, 1); atlasCount(); syncSel(); } }, ic("clear")))));
  }
  function openDrawer(ids, name, settings) {
    if (!$("atlas")) return;
    picked.splice(0, picked.length, ...ids.filter((id) => DATA.some((d) => d.id === id)));
    $("atlas-name").value = name || "묶음";
    if (settings) { $("atlas-max").value = String(settings.maxSize); $("atlas-pot").checked = Boolean(settings.pot); $("atlas-trim").checked = settings.trim !== false; }
    $("atlas-out").replaceChildren();
    $("atlas").hidden = false; document.body.classList.add("drawer-open");
    atlasCount(); syncSel();
    $("atlas-name").focus();
  }
  function closeDrawer() { if (!$("atlas") || $("atlas").hidden) return false; $("atlas").hidden = true; document.body.classList.remove("drawer-open"); picked.length = 0; syncSel(); return true; }
  function makeSheet() {
    let ids = DATA.filter((d) => selected.has(d.id)).map((d) => d.id);
    let name = "묶음";
    if (!ids.length && realFolder()) { ids = DATA.filter((d) => inFolder(d, cur)).map((d) => d.id); name = cur.split("/").join("-"); }
    else if (realFolder()) name = cur.split("/").join("-");
    if (!ids.length) { toast("카드를 고르거나 왼쪽에서 폴더를 고른 뒤 다시 여세요."); return; }
    openDrawer(ids, name);
  }
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
  async function loadAtlases() {
    try { const j = await (await fetch("/atlas/", { cache: "no-store" })).json(); atlases = j.atlases || []; } catch { atlases = []; }
  }
  const atlasTip = (a) => a.name + "\\n" + a.members.length + "개 · 최대 " + a.maxSize + (a.lastExport ? " · 마지막 내보내기 " + stamp(a.lastExport.at) : " · 아직 안 내보냄");
  function useAtlas(a) { openDrawer(a.members, a.name, a); }
  function busy(on, msg) {
    for (const id of ["atlas-save", "atlas-preview", "atlas-export"]) $(id).disabled = on;
    if (on) $("atlas-out").replaceChildren(el("p", { class: "busy", "data-tip": msg }, ic("spinner"), msg.split("\\n")[0]));
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
        el("div", { class: "atlas-row" }, el("button", { type: "button", class: "ui-control", "data-tip": "폴더 열기\\n" + j.dir, onclick: () => atlasCall(atlasUrl(name) + "/reveal", {}).catch((e) => toast(e.message)) }, ic("folder-open"), "폴더 열기")));
    }
    if (j.warnings && j.warnings.length) out.append(el("ul", { class: "warn" }, ...j.warnings.map((w) => el("li", { text: w }))));
  }
  async function atlasRun(kind) {
    const body = atlasBody();
    if (!picked.length) { toast("시트에 넣을 프리셋이 없습니다. 카드를 고르고 ‘선택 추가’를 누르세요."); return; }
    busy(true, kind === "save" ? "저장 중" : "렌더 중\\n컴포넌트 " + picked.length + "개 · 상태·프레임이 많으면 수십 초 걸립니다.");
    try {
      if (kind === "preview") { showResult(await atlasCall(atlasUrl(body.name) + "/export", { atlas: body, write: false }), false, body.name); return; }
      const saved = await atlasCall(atlasUrl(body.name), { atlas: body });
      $("atlas-name").value = saved.atlas.name;
      saved.warnings.forEach((w) => toast(w));
      if (kind === "save") $("atlas-out").replaceChildren(el("p", { text: "묶음 “" + saved.atlas.name + "”을 저장했습니다(" + saved.atlas.members.length + "개)." }));
      else showResult(await atlasCall(atlasUrl(saved.atlas.name) + "/export", { write: true }), true, saved.atlas.name);
      loadAtlases();
    } catch (e) { $("atlas-out").replaceChildren(el("p", { text: "실패: " + e.message })); }
    finally { busy(false); }
  }
  if (SERVER && $("atlas")) {
    $("atlas-save").addEventListener("click", () => atlasRun("save"));
    $("atlas-preview").addEventListener("click", () => atlasRun("preview"));
    $("atlas-export").addEventListener("click", () => atlasRun("export"));
    $("atlas-clear").addEventListener("click", () => { picked.length = 0; atlasCount(); syncSel(); });
    $("atlas-add").addEventListener("click", () => {
      const add = DATA.filter((d) => selected.has(d.id) && !picked.includes(d.id)).map((d) => d.id);
      if (!add.length) { toast(selected.size ? "고른 카드가 이미 시트에 있습니다." : "목록에서 카드를 먼저 고르세요."); return; }
      picked.push(...add); atlasCount(); syncSel(); toast(add.length + "개를 시트에 더했습니다.");
    });
    $("atlas-close").addEventListener("click", closeDrawer);
    loadAtlases();
  }

  function resetFilters() { els.q.value = ""; els.kind.value = ""; els.tag.value = ""; els.from.value = ""; els.to.value = ""; els.sort.value = "created:desc"; update(); }
  function showHelp() {
    let dlg = $("help");
    if (!dlg) {
      const rows = [["Ctrl+A", "이 폴더(지금 보이는 카드) 모두 선택"], ["Esc", "서랍 닫기 · 선택 해제"], ["Delete", "고른 카드를 휴지통으로"], ["F10 · Alt", "메뉴 바로 이동"], ["끌어 놓기", "카드를 왼쪽 폴더로 옮기기"]];
      dlg = el("dialog", { id: "help", class: "help ui-surface", "aria-labelledby": "help-title" },
        el("h2", { id: "help-title" }, ic("info"), "단축키"),
        el("dl", {}, ...rows.flatMap(([k, t]) => [el("dt", {}, el("kbd", { text: k })), el("dd", { text: t })])),
        el("form", { method: "dialog" }, el("button", { class: "ui-control", text: "닫기" })));
      document.body.append(dlg);
    }
    dlg.showModal();
  }
  const SORTS = [...els.sort.options].map((o) => [o.value, o.textContent]);
  const suggestTip = () => "폴더 제안 적용\\n이름이 태그로 시작하는 프리셋을 그 태그 폴더로 옮깁니다." + (SUGGEST.length ? "\\n" + SUGGEST.map((s) => s.folder + " · " + s.ids.length + "개").join("\\n") : "");
  const menuAnchor = (label) => [...document.querySelectorAll("#menubar .mb-top")].find((b) => b.textContent === label) || $("menubar");
  const menus = [
    { label: "파일", items: () => [
      { label: "새 폴더", icon: "folder-plus", disabled: !SERVER, tip: "새 폴더\\n고른 폴더 안에(없으면 맨 위에) 만듭니다.", run: () => startEdit("new") },
      { label: "폴더 이름 바꾸기", icon: "edit", disabled: !SERVER || !realFolder(), run: () => startEdit("rename") },
      { label: "폴더 지우기", icon: "trash", disabled: !SERVER || !realFolder(), tip: "폴더 지우기\\n안의 프리셋과 하위 폴더는 한 단계 위로 올라갑니다. 프리셋은 지우지 않습니다.", run: removeCur },
      { label: "폴더 제안 적용", icon: "wand", disabled: !SERVER || !SUGGEST.length || !DATA.some((d) => !d.folder), tip: suggestTip(), run: applySuggest },
      null,
      { label: "라이브러리 경로 복사", icon: "folder-open", tip: "라이브러리 경로 복사\\n" + LIB_PATH, run: () => copy(LIB_PATH, "라이브러리 경로를 복사했습니다.") },
      { label: "편집기 여는 명령 복사", icon: "terminal", disabled: SERVER, tip: "편집기 여는 명령 복사\\n파일로 연 목록에서는 카드를 눌러 바로 편집할 수 없습니다. 이 명령을 터미널에서 실행하세요.", run: () => copy(OPEN_CMD, "명령을 복사했습니다. 터미널에 붙여 넣으세요.") },
    ] },
    { label: "편집", items: () => [
      { label: "이 폴더 모두 선택", icon: "select", key: "Ctrl+A", run: selectAll },
      { label: "선택 해제", key: "Esc", disabled: !selected.size, run: clearSel },
      null,
      { label: "선택 항목 폴더로 옮기기…", icon: "folder-move", disabled: !SERVER || !selected.size, run: () => openMoveMenu(menuAnchor("편집"), [...selected]) },
      { label: "HTML 복사", icon: "code", disabled: selected.size !== 1, tip: "HTML 복사\\n고른 프리셋 하나의 HTML 전체를 복사합니다.", run: () => { const d = DATA.find((x) => selected.has(x.id)); copy(d.html, "HTML을 복사했습니다"); } },
      { label: "ID 복사", icon: "hash", disabled: !selected.size, run: () => copy([...selected].join("\\n"), selected.size + "개 ID를 복사했습니다.") },
      null,
      { label: "휴지통으로", icon: "trash", key: "Delete", disabled: !SERVER || !selected.size, run: () => trash([...selected]) },
    ] },
    { label: "보기", items: () => [
      { label: "미리보기 배경", icon: "bg-original", sub: () => [
        { label: "원래 배경", checked: bgMode === "original", run: () => setBg("original") },
        { label: "중립 배경", checked: bgMode === "neutral", tip: "중립 배경\\n모든 카드를 같은 중립 회색 위에서 비교합니다. 저장된 파일은 바뀌지 않습니다.", run: () => setBg("neutral") }] },
      { label: "정렬", icon: "sort", sub: () => SORTS.map(([v, t]) => ({ label: t, checked: els.sort.value === v, run: () => { els.sort.value = v; update(); } })) },
      { label: "종류", icon: "rules", sub: () => [["", "전체"], ...Object.entries(LABEL)].map(([v, t]) => ({ label: t, checked: els.kind.value === v, run: () => { els.kind.value = v; update(); } })) },
      null,
      { label: "필터 초기화", icon: "reset", tip: "필터 초기화\\n검색·종류·태그·기간·정렬을 처음으로 되돌립니다. 고른 폴더는 그대로입니다.", run: resetFilters },
      { label: "폴더 모두 펼치기", icon: "chevron-down", run: () => { closed.clear(); saveClosed(); renderTree(); } },
      { label: "폴더 모두 접기", icon: "chevron-right", run: () => { allFolders().forEach((f) => closed.add(f)); saveClosed(); renderTree(); } },
    ] },
    { label: "내보내기", items: () => [
      { label: "선택 항목 내보내기", icon: "download", disabled: !SERVER || !selected.size, tip: "선택 항목 내보내기\\n고른 프리셋을 각자의 내보내기 설정대로 PNG·JSON으로 씁니다.", run: () => exportEach(DATA.filter((d) => selected.has(d.id)).map((d) => d.id)) },
      { label: "묶음 시트 만들기…", icon: "layers", disabled: !SERVER, tip: "묶음 시트 만들기\\n고른 카드(없으면 고른 폴더)로 오른쪽 서랍을 엽니다.", run: makeSheet },
      { label: "저장한 묶음 시트", icon: "layers", disabled: !SERVER || !atlases.length, sub: () => atlases.map((a) => ({ label: a.name + " · " + a.members.length + "개", tip: atlasTip(a), run: () => useAtlas(a) })) },
    ] },
    { label: "도움말", items: () => [{ label: "단축키", icon: "info", key: "?", run: showHelp }] },
  ];
  createMenubar($("menubar"), menus, { icon: ic });
  $("sel-clear")?.addEventListener("click", clearSel);
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (typing || document.querySelector(".mb-menu, .move-menu, dialog[open]")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") { e.preventDefault(); selectAll(); }
    else if (e.key === "Escape") { if (!closeDrawer() && selected.size) clearSel(); }
    else if (e.key === "Delete" && selected.size && SERVER) { e.preventDefault(); trash([...selected]); }
    else if (e.key === "?" && !mod) { e.preventDefault(); showHelp(); }
  });

  for (const k in els) els[k].addEventListener(k === "q" ? "input" : "change", update);
  renderTree();
  update();
  try { const m = sessionStorage.getItem("webd-library-toast"); if (m) { sessionStorage.removeItem("webd-library-toast"); toast(m); } } catch {}
})();
</script>
</body>
</html>
`;
}
