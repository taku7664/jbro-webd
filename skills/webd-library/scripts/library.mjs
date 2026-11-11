#!/usr/bin/env node
// library.mjs — WebD 프리셋 라이브러리. 의존성 없음, Node 18+.
//
// 라이브러리 폴더(기본 ~/.webd/library, 바꾸려면 --lib 또는 WEBD_LIBRARY):
//   <id>/component.html     단독으로 열리는 HTML (프리셋 + 필요한 CSS·토큰)
//   <id>/meta.json          이름, 종류(kind), 가상 폴더(folder), 분류, 태그, 저장·수정 시각, 출처, 원래 배경색(background) 등
//   <id>/history/*.html     덮어쓰기 전 버전
//   .folders.json           사용자가 만든 가상 폴더 목록(빈 폴더 포함). 실제 <id>/ 폴더는 옮기지 않는다(folders.mjs)
//   .trash/                 remove로 옮긴 항목 (바로 지우지 않음)
//   index.html              목록 갤러리 (save·remove 때마다 다시 만듦)
//
// 명령:
//   save   --file <html> --name <이름> [--id <id>] [--kind component|screen|pattern|token|effect] [--folder "잿빛 등대/대사창"]
//          [--category <분류>] [--tags a,b] [--desc <설명>]
//          [--project <프로젝트>] [--source <원본 파일>] [--style <디자인 근거>] [--viewport 1200x720]
//   list   [--sort created|updated|name|category] [--order asc|desc] [--since YYYY-MM-DD] [--until YYYY-MM-DD]
//          [--folder <폴더>(하위 포함, ""는 폴더 없음)] [--kind <종류>] [--category <분류>] [--tag <태그>] [--q <검색어>] [--json]
//   move   <id> [<id>…] --folder <폴더>        가상 폴더로 옮긴다(--folder ""는 폴더 없음). 내용·버전은 그대로
//   folder list | add <폴더> | rename <폴더> <새 경로> | remove <폴더> | suggest [--apply]
//          remove는 안의 프리셋·하위 폴더를 한 단계 위로 올린다. suggest는 이름이 태그로 시작하는 프리셋에 그 태그 폴더를 제안
//   show   <id>
//   remove <id>
//   index
//   path
//   open   [--port <번호>] [--no-open] [--no-watch] [--lan]   라이브러리 서버를 열고 목록을 띄움. 카드를 누르면 편집기, 편집기에서 내보내기 (Ctrl+C로 닫음)
//   edit   <id> [--port <번호>] [--no-open] [--no-watch] [--lan]   같은 서버를 열고 그 항목의 편집기를 바로 띄움
//          스킬 코드(scripts/·editor/)가 바뀌면 서버를 같은 포트·토큰으로 다시 띄운다(열린 탭은 새로 고침만). --no-watch로 끔.
//          --lan: 같은 와이파이의 폰·태블릿에서 열 수 있게 사설 IP로도 연다(토큰을 아는 사람만 접속). 공용 와이파이에서는 쓰지 않는다.
//   atlas  <이름> [--members id,id] [--max 512|1024|2048|4096] [--pot] [--padding n] [--extrude n] [--no-trim] [--scales 1,2]
//          묶음 시트: 컴포넌트 여러 개를 각자의 export.json대로 찍어 한 장(넘치면 여러 장)에 빽빽하게 모아 쓴다.
//          --members 등을 주면 묶음 정의(<라이브러리>/.atlases/<이름>.json)를 고친 뒤 내보낸다. atlas --list는 목록.
//
// 종료 코드: 0 성공 · 1 사용 오류 · 3 대상 없음

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync, copyFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn, fork } from "node:child_process";
import { watch } from "node:fs";
import { randomBytes } from "node:crypto";
import { renderGallery } from "./gallery.mjs";
import { KINDS, ro, normFolder, folderOf, kindOf, addFolder, moveItems, renameFolder, removeFolder, suggestFolders, applySuggestions, folderTree } from "./folders.mjs";

export const CATEGORIES = ["hero", "nav", "button", "form", "table", "chart", "card", "list", "section", "footer", "feedback", "other"];
const SORT_KEYS = ["created", "updated", "name", "category"];

// ---------- 시간 ----------

/** 로컬 시간대 오프셋을 붙인 ISO 문자열. 예: 2026-11-09T14:03:00+09:00 */
export function localIso(d = new Date()) {
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}
const datePart = (iso) => iso.slice(0, 10);

// ---------- 라이브러리 접근 ----------

export function libDir(opt) {
  return resolve(opt || process.env.WEBD_LIBRARY || join(homedir(), ".webd", "library"));
}

export function loadEntries(lib) {
  if (!existsSync(lib)) return [];
  const out = [];
  for (const name of readdirSync(lib)) {
    if (name.startsWith(".")) continue;
    const metaPath = join(lib, name, "meta.json");
    if (!existsSync(metaPath)) continue;
    try { out.push(JSON.parse(readFileSync(metaPath, "utf8"))); }
    catch { process.stderr.write(`경고: meta.json을 읽지 못함 — ${metaPath}\n`); }
  }
  return out;
}

export function slugify(name) {
  // 한글 음절은 남긴다. NFKD는 한글을 자모로 쪼개므로 NFC로 맞춘다.
  const s = name.normalize("NFC").toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "component";
}

function uniqueId(lib, base) {
  let id = base, n = 2;
  while (existsSync(join(lib, id))) id = `${base}-${n++}`;
  return id;
}

/** 조각(fragment)이면 단독으로 열리는 문서로 감싼다. */
export function ensureDocument(html, title) {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body>
${html.trim()}
</body>
</html>
`;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

// ---------- 원래 배경색 ----------

/**
 * 문서의 원래 페이지 배경(body, 없으면 html·:root)을 찾는다.
 * 최상위 규칙만 본다(@media 안은 건너뜀). var(--x)는 :root·html의 값으로 푼다. body의 style 속성이 가장 우선.
 * 색 하나를 찾으면 그 색, 그라디언트·이미지면 값 그대로(최대 120자), 지정이 없거나 transparent면 null.
 */
export function detectBackground(html) {
  const src = String(html).replace(/<!--[\s\S]*?-->/g, "");
  const css = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = topLevelRules(css);
  const vars = {};
  const pick = { body: null, html: null };
  for (const { sel, body } of rules) {
    const sels = sel.split(",").map((s) => s.trim().toLowerCase());
    const decls = declarations(body);
    if (sels.some((s) => s === ":root" || s === "html")) for (const [k, v] of decls) if (k.startsWith("--")) vars[k] = v;
    for (const [k, v] of decls) {
      if (k !== "background" && k !== "background-color") continue;
      if (sels.includes("body")) pick.body = v;
      else if (sels.includes("html") || sels.includes(":root")) pick.html = v;
    }
  }
  const inline = /<body\b[^>]*\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(src);
  if (inline) for (const [k, v] of declarations(inline[2] ?? inline[3])) if (k === "background" || k === "background-color") pick.body = v;
  let value = pick.body ?? pick.html;
  if (!value) return null;
  for (let i = 0; i < 8 && /var\(/.test(value); i++) {
    value = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name, fb) => vars[name] ?? (fb ?? "").trim());
  }
  value = value.replace(/!important/i, "").trim();
  if (!value || /^(transparent|none|inherit|initial|unset|revert)$/i.test(value)) return null;
  if (!/gradient\(|url\(/i.test(value)) {
    const color = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/i.exec(value);
    if (color) return color[0];
    if (/^[a-z]+$/i.test(value)) return value.toLowerCase();
  }
  return value.slice(0, 120);
}

function topLevelRules(css) {
  const out = [];
  let depth = 0, start = 0, sel = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") { if (depth === 0) { sel = css.slice(start, i).trim(); start = i + 1; } depth++; }
    else if (c === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) { if (!sel.startsWith("@")) out.push({ sel, body: css.slice(start, i) }); start = i + 1; }
    } else if (c === ";" && depth === 0) start = i + 1; // @import 같은 최상위 문장
  }
  return out;
}

function declarations(body) {
  const out = [];
  for (const part of body.split(/;(?![^(]*\))/)) {
    const k = part.indexOf(":");
    if (k < 0) continue;
    out.push([part.slice(0, k).trim().toLowerCase(), part.slice(k + 1).trim()]);
  }
  return out;
}

function parseViewport(v) {
  const m = /^(\d{3,4})x(\d{2,4})$/.exec(v || "");
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

// 버튼 분류의 정적 경계 검사. 실제 가시성·스크립트로 바뀌는 DOM은 브라우저에서 확인한다.
const TAG_ATTRS = String.raw`(?=[\s/>])((?:[^<>"']|"[^"]*"|'[^']*')*)`;
function buttonAttributes(raw) {
  return new Map([...raw.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map(([, name, double, single, bare]) => [name.toLowerCase(), double ?? single ?? bare ?? ""]));
}

// 규칙: 조작 요소(버튼·링크·입력·role/tabindex로 조작되는 요소)가 문서 전체에서 정확히 하나이고,
// 그 하나가 버튼처럼 누르는 컨트롤(button, a[href], input 버튼형, role=button|link)이며 숨겨져 있지 않아야 한다.
// 글자·배지·장식 요소는 버튼 안팎 어디에 있어도 된다. 버튼을 여러 개 늘어놓은 상태 비교 화면만 막는다.
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const isHiddenAttrs = (attrs) => attrs.has("hidden") || attrs.has("inert") || attrs.get("aria-hidden")?.toLowerCase() === "true";
/** 조작 요소의 종류: "press"(버튼처럼 누르는 것), "other"(그 밖의 조작), null(조작 요소 아님) */
function controlKind(tag, attrs) {
  const role = (attrs.get("role") ?? "").toLowerCase();
  if (tag === "button") return "press";
  if (tag === "a") return attrs.has("href") ? "press" : null;
  if (tag === "input") {
    const type = (attrs.get("type") ?? "text").toLowerCase();
    if (type === "hidden") return null;
    return ["button", "submit", "reset", "image"].includes(type) ? "press" : "other";
  }
  if (["select", "textarea", "summary", "iframe"].includes(tag)) return "other";
  if (role === "button" || role === "link") return "press";
  if (/^(checkbox|radio|switch|menuitem|option|tab|slider|textbox|combobox)$/.test(role)) return "other";
  if (attrs.has("tabindex") || attrs.has("contenteditable") && attrs.get("contenteditable") !== "false") return "other";
  return null;
}
function isSingleButton(html) {
  // 속성값 속의 <button>이나 CSS·JS 예제 문자열, <template> 견본은 조작 요소로 세지 않는다.
  const source = html.replace(new RegExp(
    String.raw`<!--[\s\S]*?(?:-->|$)|<(script|style|title|template)${TAG_ATTRS}>[\s\S]*?</\1\s*>|</?[a-z][\w:-]*${TAG_ATTRS}>`, "gi",
  ), (tag, inert) => inert || tag.startsWith("<!--") ? "" : tag);
  const controls = [];
  const stack = [];   // [{ tag, hidden }] 열린 요소. 숨긴 조상 아래 컨트롤은 숨겨진 것으로 본다.
  for (const [, slash, rawName, raw] of source.matchAll(new RegExp(String.raw`<(/?)([a-z][\w:-]*)${TAG_ATTRS}>`, "gi"))) {
    const tag = rawName.toLowerCase();
    if (slash) {   // 닫는 태그: 짝이 되는 열린 요소까지 닫는다(짝이 없으면 무시)
      const at = stack.map((e) => e.tag).lastIndexOf(tag);
      if (at >= 0) stack.length = at;
      continue;
    }
    const attrs = buttonAttributes(raw);
    const hidden = isHiddenAttrs(attrs) || stack.some((e) => e.hidden);
    const kind = controlKind(tag, attrs);
    if (kind) controls.push({ kind, hidden });
    if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(raw)) stack.push({ tag, hidden });
  }
  return controls.length === 1 && controls[0].kind === "press" && !controls[0].hidden;
}

// ---------- 명령 ----------

export function save(lib, o) {
  if (!o.file) throw usage("save에는 --file이 필요합니다.");
  if (!o.name && !o.id) throw usage("save에는 --name이 필요합니다.");
  if (!existsSync(o.file)) throw usage(`파일이 없음: ${o.file}`);
  if (![".html", ".htm"].includes(extname(o.file).toLowerCase())) throw usage("라이브러리에는 HTML 파일(.html 또는 .htm)을 저장합니다. PNG·스프라이트 시트·JSON은 별도 산출물입니다.");
  if (o.category && !CATEGORIES.includes(o.category)) throw usage(`분류는 ${CATEGORIES.join(", ")} 중 하나입니다.`);
  if (o.kind && !KINDS.includes(o.kind)) throw usage(`종류는 ${KINDS.join(", ")} 중 하나입니다.`);
  const folder = o.folder != null ? normFolder(o.folder) : null;
  const viewport = o.viewport ? parseViewport(o.viewport) : null;
  if (o.viewport && !viewport) throw usage("--viewport는 1200x720 형식입니다.");

  const existing = o.id && existsSync(join(lib, o.id, "meta.json"))
    ? JSON.parse(readFileSync(join(lib, o.id, "meta.json"), "utf8")) : null;
  const category = o.category ?? existing?.category ?? "other";
  const name = o.name || existing?.name;
  const bytes = readFileSync(o.file);
  let source;
  try { source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw Object.assign(usage("라이브러리에는 UTF-8 HTML만 저장합니다."), { status: 422 }); }
  if (source.includes("\0")) throw Object.assign(usage("라이브러리에는 UTF-8 HTML만 저장합니다."), { status: 422 });
  const html = ensureDocument(source, name);
  if (category === "button" && !isSingleButton(html)) {
    throw Object.assign(usage("button 분류는 조작 컨트롤 하나만 저장합니다(버튼·링크 하나). 글자·배지·장식 요소는 함께 둘 수 있지만, 버튼을 여러 개 늘어놓은 상태 비교 화면이나 입력칸이 섞인 컴포넌트는 다른 분류로 저장하세요."), { status: 422 });
  }

  mkdirSync(lib, { recursive: true });
  const now = localIso();
  const id = existing ? existing.id : uniqueId(lib, o.id || `${now.slice(0, 10).replace(/-/g, "")}-${slugify(o.name)}`);
  const dir = join(lib, id);
  mkdirSync(dir, { recursive: true });

  let versions = existing?.versions ?? 1;
  if (existing) {
    const hist = join(dir, "history");
    mkdirSync(hist, { recursive: true });
    // 같은 초에 여러 번 저장해도 이전 버전이 덮이지 않게 이름이 겹치면 번호를 붙인다.
    const stem = existing.updatedAt.replace(/[:+]/g, "");
    let histName = `${stem}.html`, k = 2;
    while (existsSync(join(hist, histName))) histName = `${stem}-${k++}.html`;
    copyFileSync(join(dir, "component.html"), join(hist, histName));
    versions += 1;
  }
  writeFileSync(join(dir, "component.html"), html);

  const meta = {
    id,
    name,
    description: o.desc ?? existing?.description ?? "",
    category,
    ...((o.kind ?? existing?.kind) ? { kind: o.kind ?? existing.kind } : {}),
    ...((folder ?? existing?.folder) ? { folder: folder ?? existing.folder } : {}),
    tags: o.tags ? o.tags.split(",").map((t) => t.trim()).filter(Boolean) : (existing?.tags ?? []),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    versions,
    source: {
      project: o.project ?? existing?.source?.project ?? "",
      file: o.source ?? existing?.source?.file ?? "",
    },
    style: o.style ?? existing?.style ?? "",
    viewport: viewport ?? existing?.viewport ?? { width: 1200, height: 720 },
    background: detectBackground(html),
    bytes: Buffer.byteLength(html),
  };
  if (folder === "") delete meta.folder;   // --folder ""는 폴더 없음으로
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  if (meta.folder) addFolder(lib, meta.folder);
  writeIndex(lib);
  return { meta, updated: Boolean(existing), dir };
}

export function query(entries, o = {}) {
  const sort = o.sort || "created";
  if (!SORT_KEYS.includes(sort)) throw usage(`정렬은 ${SORT_KEYS.join(", ")} 중 하나입니다.`);
  const order = o.order || (sort === "name" || sort === "category" ? "asc" : "desc");
  if (!["asc", "desc"].includes(order)) throw usage("순서는 asc 또는 desc입니다.");
  for (const d of [o.since, o.until]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw usage("기간은 YYYY-MM-DD 형식입니다.");

  const dateKey = sort === "updated" ? "updatedAt" : "createdAt";
  const q = (o.q || "").toLowerCase();
  if (o.kind && !KINDS.includes(o.kind)) throw usage(`종류는 ${KINDS.join(", ")} 중 하나입니다.`);
  // --folder "잿빛 등대"는 하위 폴더까지, --folder ""는 폴더 없는 것만
  const folderFilter = o.folder != null ? normFolder(o.folder) : null;
  let list = entries.filter((e) => {
    const day = datePart(e[dateKey]);
    if (o.since && day < o.since) return false;
    if (o.until && day > o.until) return false;
    if (o.category && e.category !== o.category) return false;
    if (o.kind && kindOf(e) !== o.kind) return false;
    if (folderFilter != null) { const f = folderOf(e); if (folderFilter === "" ? f !== "" : !(f === folderFilter || f.startsWith(folderFilter + "/"))) return false; }
    if (o.tag && !e.tags.includes(o.tag)) return false;
    if (q && ![e.name, e.description, e.id, ...e.tags].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
  const key = { created: (e) => e.createdAt, updated: (e) => e.updatedAt, name: (e) => e.name, category: (e) => `${e.category}\u0000${e.name}` }[sort];
  list.sort((a, b) => key(a).localeCompare(key(b), "ko") || a.id.localeCompare(b.id));
  if (order === "desc") list.reverse();
  return list;
}

export function remove(lib, id) {
  const dir = join(lib, id);
  if (!id || !existsSync(join(dir, "meta.json"))) return null;
  const trash = join(lib, ".trash");
  mkdirSync(trash, { recursive: true });
  const dest = join(trash, `${id}-${localIso().replace(/[:+]/g, "")}`);
  renameSync(dir, dest);
  writeIndex(lib);
  return dest;
}

export function writeIndex(lib) {
  mkdirSync(lib, { recursive: true });
  const entries = loadEntries(lib).map((e) => {
    const html = readFileSync(join(lib, e.id, "component.html"), "utf8");
    // 배경 기록이 없는 예전 항목은 meta를 고치지 않고 여기서만 계산해 목록에 쓴다.
    const background = "background" in e ? e.background : detectBackground(html);
    return { ...e, background, html, path: join(lib, e.id, "component.html") };
  });
  const out = join(lib, "index.html");
  writeFileSync(out, renderGallery(entries, { libPath: lib, generatedAt: localIso(), categories: CATEGORIES, cli: fileURLToPath(import.meta.url), tree: folderTree(lib, entries), suggestions: suggestFolders(entries) }));
  return out;
}

// ---------- CLI ----------

function usage(msg) { const e = new Error(msg); e.code = 1; return e; }

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const o = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--json") o.json = true;
    else if (a === "--no-open") o.noOpen = true;
    else if (a === "--pot") o.pot = true;
    else if (a === "--no-trim") o.trim = false;
    else if (a === "--list") o.list = true;
    else if (a === "--no-watch") o.noWatch = true;
    else if (a === "--lan") o.lan = true;
    else if (a === "--apply") o.apply = true;
    else if (a.startsWith("--")) {
      const [k, v] = a.includes("=") ? [a.slice(2, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a.slice(2), rest[++i]];
      if (v === undefined) throw usage(`${a}에 값이 없습니다.`);
      o[k] = v;
    } else o._.push(a);
  }
  return { cmd, o };
}

function fmtDate(iso) { return iso.slice(0, 16).replace("T", " "); }
/** 터미널 표시 폭 기준으로 채운다. 한글·전각 문자는 2칸. */
function padWide(s, width) {
  const w = [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
  return s + " ".repeat(Math.max(1, width - w));
}

function openBrowser(url) {
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(cmd, args, { stdio: "ignore", detached: true, windowsVerbatimArguments: false }).unref(); } catch {}
}

/**
 * 라이브러리 서버를 자식 프로세스(serve.mjs)로 띄운다. watch면 스킬 코드가 바뀔 때 같은 포트·토큰으로 다시 띄운다.
 * 토큰은 환경변수로만 넘긴다(명령줄에 남지 않게).
 */
function serveLibrary(lib, { port, id, open, watch: watching, lan }) {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const token = randomBytes(16).toString("hex");
  let child = null, fixedPort = port, first = true, restarting = false, timer = null, quitting = false;
  const urls = (p) => {
    const q = `?t=${token}`;
    const list = { lib: `http://127.0.0.1:${p}/lib/${q}`, edit: id ? `http://127.0.0.1:${p}/edit/${encodeURIComponent(id)}${q}` : null };
    return list;
  };
  const start = (attempt = 0) => {
    child = fork(join(here, "serve.mjs"), [], { env: { ...process.env, WEBD_SERVE_LIB: lib, WEBD_SERVE_PORT: String(fixedPort), WEBD_SERVE_TOKEN: token, WEBD_SERVE_LAN: lan ? "1" : "0" }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
    child.on("message", (m) => {
      if (m?.error) {
        if (/EADDRINUSE/.test(m.error) && attempt < 10 && !first) { setTimeout(() => start(attempt + 1), 300); return; }   // 앞 서버가 포트를 아직 놓지 않음
        console.error(`서버를 열지 못함: ${m.error}`); process.exit(m.code === 3 ? 3 : 1);
      }
      if (!m?.ready) return;
      fixedPort = m.port;
      if (first) {
        first = false;
        const u = urls(m.port);
        console.log(`라이브러리 서버: ${u.lib}`);
        if (u.edit) console.log(`편집기: ${u.edit}`);
        for (const h of m.lanHosts) console.log(`같은 와이파이(폰·태블릿): http://${h}/lib/?t=${token}`);
        if (lan && !m.lanHosts.length) console.log("같은 와이파이 주소를 찾지 못했습니다(사설 IPv4 주소 없음).");
        console.log(`  목록에서 카드를 누르면 편집기가 열립니다. 저장하면 새 버전이 되고 이전 파일은 history/에 남습니다.${watching ? " 스킬 코드가 바뀌면 서버를 다시 띄웁니다(탭은 새로 고침)." : ""} 닫으려면 Ctrl+C.`);
        if (open) openBrowser(u.edit ?? u.lib);
      } else {
        console.log(`[${new Date().toLocaleTimeString()}] 스킬 코드가 바뀌어 서버를 다시 띄웠습니다(같은 주소). 열린 탭은 새로 고침하세요.`);
      }
      restarting = false;
    });
    child.on("exit", (code) => {
      if (quitting) return;
      if (restarting) return start();
      if (!first) { console.error(`서버가 멈췄습니다(코드 ${code}). 다시 띄웁니다.`); setTimeout(() => start(), 500); }
    });
  };
  const restart = () => {
    if (!child || restarting) return;
    restarting = true;
    child.send?.("stop");
    const c = child; setTimeout(() => { if (c.exitCode === null) c.kill(); }, 5000);
  };
  if (watching) {
    const dirs = [here, join(here, "..", "editor"), join(here, "..", "..", "webd", "scripts")];
    for (const d of dirs) {
      try {
        watch(d, { recursive: true }, (_ev, name) => {
          if (!name || !/\.(mjs|js|css|html)$/.test(name)) return;
          clearTimeout(timer); timer = setTimeout(restart, 300);
        });
      } catch {}
    }
  }
  const quit = () => { quitting = true; if (child && child.exitCode === null) { child.send?.("stop"); child.once("exit", () => { console.log("서버를 닫았습니다."); process.exit(0); }); setTimeout(() => process.exit(0), 5000); } else process.exit(0); };
  process.on("SIGINT", quit); process.on("SIGTERM", quit);
  start();
}

/** 묶음 시트: 서버를 잠깐 열어 같은 경로(POST /atlas/…)로 저장·내보내기를 하고 닫는다. */
async function runAtlas(lib, o) {
  const A = await import("./export/atlas.mjs");
  if (o.list) {
    const list = A.listAtlases(lib);
    if (!list.length) console.log("묶음이 없습니다. 예: atlas 대화-UI --members <id>,<id>");
    for (const a of list) console.log(`${a.name}  컴포넌트 ${a.members.length}개  최대 ${a.maxSize}${a.pot ? " (2의 거듭제곱)" : ""}  ${a.lastExport ? "마지막 내보내기 " + fmtDate(a.lastExport.at) : "아직 안 내보냄"}`);
    return 0;
  }
  const name = o._[0];
  if (!name) throw usage("묶음 이름이 필요합니다. 예: atlas 대화-UI --members <id>,<id>");
  const prev = A.readAtlas(lib, name);
  const patch = {};
  if (o.members) patch.members = String(o.members).split(",").map((x) => x.trim()).filter(Boolean);
  if (o.max) patch.maxSize = Number(o.max);
  if (o.pot) patch.pot = true;
  if (o.padding != null) patch.padding = Number(o.padding);
  if (o.extrude != null) patch.extrude = Number(o.extrude);
  if (o.trim === false) patch.trim = false;
  if (o.scales) patch.scales = String(o.scales).split(",").map(Number);
  if (!prev && !patch.members) throw usage(`없는 묶음: ${name}. 처음 만들 때는 --members <id>,<id>가 필요합니다.`);
  const { startLibrary } = await import("./editor-server.mjs");
  const srv = await startLibrary({ lib });
  try {
    const call = async (path, body) => {
      const r = await fetch(`http://127.0.0.1:${srv.port}${path}`, { method: "POST", headers: { "x-webd-token": srv.token, "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({ error: r.statusText }));
      if (!r.ok) throw Object.assign(new Error(j.error || `실패 (${r.status})`), { code: r.status === 404 ? 3 : 1 });
      return j;
    };
    const base = `/atlas/${encodeURIComponent(A.normalizeAtlas({ name }).atlas.name)}`;
    if (Object.keys(patch).length) {
      const s = await call(base, { atlas: { ...(prev ?? {}), ...patch } });
      s.warnings.forEach((w) => console.log(`경고: ${w}`));
    }
    const r = await call(`${base}/export`, { write: true });
    console.log(`묶음 시트: ${r.dir}`);
    for (const f of r.files) console.log(`  ${f.name}${f.size ? `  ${f.size.w}×${f.size.h}` : ""}`);
    r.warnings.forEach((w) => console.log(`경고: ${w}`));
    return 0;
  } finally { await srv.close(); }
}

function main() {
  let cmd, o;
  try { ({ cmd, o } = parseArgs(process.argv.slice(2))); } catch (e) { console.error(e.message); return 1; }
  const lib = libDir(o.lib);
  try {
    switch (cmd) {
      case "save": {
        const r = save(lib, o);
        console.log(`${r.updated ? "갱신" : "저장"}: ${r.meta.id} (${r.meta.name})`);
        console.log(`  파일: ${join(r.dir, "component.html")}`);
        console.log(`  목록: ${join(lib, "index.html")}`);
        return 0;
      }
      case "list": {
        const list = query(loadEntries(lib), o);
        if (o.json) { console.log(JSON.stringify(list, null, 2)); return 0; }
        console.log(`라이브러리: ${lib}  (${list.length}개)`);
        for (const e of list) {
          console.log(`${padWide(e.id, 40)}${kindOf(e).padEnd(10)} 저장 ${fmtDate(e.createdAt)}  수정 ${fmtDate(e.updatedAt)}  ${e.name}${folderOf(e) ? `  [${folderOf(e)}]` : ""}${e.tags.length ? `  #${e.tags.join(" #")}` : ""}`);
        }
        return 0;
      }
      case "move": {
        if (o.folder == null) throw usage("move에는 --folder가 필요합니다(폴더 없음은 --folder \"\").");
        const r = moveItems(lib, o._, o.folder);
        writeIndex(lib);
        console.log(`${r.folder || "폴더 없음"}${ro(r.folder || "폴더 없음")} 옮김:${r.moved.length}개${r.moved.length < o._.length ? ` (이미 그 폴더: ${o._.length - r.moved.length}개)` : ""}`);
        return 0;
      }
      case "folder": {
        const [sub, a, b] = o._;
        const entries = loadEntries(lib);
        if (!sub || sub === "list") {
          const t = folderTree(lib, entries);
          if (o.json) { console.log(JSON.stringify(t, null, 2)); return 0; }
          console.log(`폴더 ${t.folders.length}개 · 프리셋 ${t.total}개 (폴더 없음 ${t.unfiled}개)`);
          for (const f of t.folders) console.log(`${"  ".repeat(f.split("/").length - 1)}${f.split("/").pop()}  ${t.counts[f] ?? 0}개`);
          return 0;
        }
        if (sub === "add") { const r = addFolder(lib, a); writeIndex(lib); console.log(r.created ? `만듦: ${r.folder}` : `이미 있음: ${r.folder}`); return 0; }
        if (sub === "rename") { const r = renameFolder(lib, entries, a, b); writeIndex(lib); console.log(`${r.from} → ${r.to} (프리셋 ${r.moved.length}개)`); return 0; }
        if (sub === "remove") { const r = removeFolder(lib, entries, a); writeIndex(lib); console.log(`지움: ${r.folder} · 안의 프리셋 ${r.moved.length}개는 ${r.parent || "폴더 없음"}${ro(r.parent || "폴더 없음")}`); return 0; }
        if (sub === "suggest") {
          const s = suggestFolders(entries);
          if (!s.length) { console.log("제안할 폴더가 없습니다(폴더 없는 프리셋 중 이름이 태그로 시작하는 것이 없음)."); return 0; }
          for (const x of s) console.log(`${x.folder}  ${x.ids.length}개`);
          if (o.apply) { applySuggestions(lib, entries); writeIndex(lib); console.log("적용했습니다."); }
          else console.log("적용하려면 folder suggest --apply");
          return 0;
        }
        throw usage("folder 명령: list | add <폴더> | rename <폴더> <새 경로> | remove <폴더> | suggest [--apply]");
      }
      case "show": {
        const id = o._[0];
        const p = join(lib, id ?? "", "meta.json");
        if (!id || !existsSync(p)) { console.error(`없는 항목: ${id ?? "(id 없음)"}`); return 3; }
        const meta = JSON.parse(readFileSync(p, "utf8"));
        console.log(JSON.stringify({ ...meta, file: join(lib, id, "component.html") }, null, 2));
        return 0;
      }
      case "remove": {
        const dest = remove(lib, o._[0]);
        if (!dest) { console.error(`없는 항목: ${o._[0] ?? "(id 없음)"}`); return 3; }
        console.log(`휴지통으로 옮김: ${dest}`);
        return 0;
      }
      case "index": console.log(writeIndex(lib)); return 0;
      case "path": console.log(lib); return 0;
      case "open":
      case "edit": {
        const id = cmd === "edit" ? o._[0] : null;
        if (cmd === "edit" && (!id || !existsSync(join(lib, id, "meta.json")))) { console.error(`없는 항목: ${id ?? "(id 없음)"}`); return 3; }
        const port = o.port ? Number(o.port) : 0;
        if (!Number.isInteger(port) || port < 0 || port > 65535) throw usage("--port는 0~65535 정수입니다.");
        serveLibrary(lib, { port, id, open: !o.noOpen, watch: !o.noWatch, lan: Boolean(o.lan) });
        return 0;
      }
      case "atlas": {
        // 비동기로 끝나므로 종료 코드는 끝날 때 정한다(main의 반환값은 쓰지 않음)
        runAtlas(lib, o).then((code) => { process.exitCode = code; }, (e) => { console.error(e.message); process.exitCode = e.code ?? 1; });
        return undefined;
      }
      default:
        console.error("명령: save | list | move <id…> --folder <폴더> | folder … | show <id> | remove <id> | index | path | open | edit <id> | atlas <이름>  (자세한 옵션은 파일 머리 주석)");
        return 1;
    }
  } catch (e) { console.error(e.message); return e.code ?? 1; }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
