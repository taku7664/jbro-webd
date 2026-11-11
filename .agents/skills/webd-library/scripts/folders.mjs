// folders.mjs — 프리셋 라이브러리의 가상 폴더와 프리셋 종류. 의존성 없음, Node 18+.
//
// 가상 폴더: 실제 <id>/ 폴더는 옮기지 않고 meta.json의 folder("잿빛 등대/대사창")에 경로만 적는다.
//   그래서 편집기 주소(/edit/<id>), 묶음 시트 구성원, 내보내기 기록(export/<id>/)이 폴더를 바꿔도 그대로다.
//   빈 폴더와 사용자가 만든 폴더 목록은 <라이브러리>/.folders.json { version, folders: [경로…] }에 둔다.
//   폴더를 지우면 안의 프리셋과 하위 폴더는 한 단계 위로 올린다(프리셋은 지우지 않는다).
// 폴더를 옮겨도 프리셋의 updatedAt·versions는 바꾸지 않는다(정리일 뿐 내용 변경이 아니다).
//
// 프리셋 종류(kind): 정리는 폴더로 하고, 종류는 무엇을 저장했는지만 나타낸다.
//   component 컴포넌트 · screen 화면 · pattern 무늬·아이콘 · token 토큰 · effect 효과
//   예전 항목은 kind가 없으므로 분류·태그로 추정해 보여 준다(meta는 고치지 않는다).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const KINDS = ["component", "screen", "pattern", "token", "effect"];
export const KIND_LABEL = { component: "컴포넌트", screen: "화면", pattern: "무늬·아이콘", token: "토큰", effect: "효과" };

const MAX_DEPTH = 8, MAX_SEGMENT = 60;
const FILE = ".folders.json";

/** "…으로/로": 받침이 없거나 ㄹ이면 "로". 한글이 아니면 "(으)로" */
export function ro(word) {
  const c = String(word ?? "").trim().slice(-1).charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return /[0-9a-z]$/i.test(String(word ?? "").trim()) ? "(으)로" : "로";
  const jong = (c - 0xac00) % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}

function fail(msg, status = 400) { const e = new Error(msg); e.code = 1; e.status = status; return e; }

/** 폴더 경로를 정리한다. "" = 맨 위(폴더 없음). 잘못된 이름이면 예외. */
export function normFolder(path) {
  if (path == null) return "";
  const segs = String(path).normalize("NFC").replace(/\\/g, "/").split("/").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (segs.length > MAX_DEPTH) throw fail(`폴더는 ${MAX_DEPTH}단계까지 만들 수 있습니다.`);
  for (const s of segs) {
    if (s.startsWith(".")) throw fail("폴더 이름은 점(.)으로 시작할 수 없습니다.");
    if (s.length > MAX_SEGMENT) throw fail(`폴더 이름은 ${MAX_SEGMENT}자까지입니다.`);
    if (/[\u0000-\u001f<>:"|?*]/.test(s)) throw fail(`폴더 이름에 쓸 수 없는 글자가 있습니다: ${s}`);
  }
  return segs.join("/");
}

const parentOf = (p) => p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
const inside = (p, root) => p === root || p.startsWith(root + "/");
/** 경로와 그 위 폴더들 */
function withAncestors(p) { const out = []; let cur = p; while (cur) { out.push(cur); cur = parentOf(cur); } return out; }

/** 예전 항목(kind 없음)은 분류·태그로 종류를 추정한다 */
export function kindOf(meta) {
  if (KINDS.includes(meta?.kind)) return meta.kind;
  const tags = meta?.tags ?? [];
  if (meta?.category === "section" || tags.includes("조립")) return "screen";
  if (tags.includes("무늬") || tags.includes("아이콘")) return "pattern";
  if (tags.includes("애니메이션")) return "effect";
  return "component";
}

export function readFolderFile(lib) {
  const p = join(lib, FILE);
  if (!existsSync(p)) return [];
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(j?.folders) ? j.folders.map((f) => { try { return normFolder(f); } catch { return ""; } }).filter(Boolean) : [];
  } catch { return []; }
}
function writeFolderFile(lib, folders) {
  mkdirSync(lib, { recursive: true });
  const list = [...new Set(folders.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  writeFileSync(join(lib, FILE), JSON.stringify({ version: 1, folders: list }, null, 2) + "\n");
}

/** 프리셋의 폴더(정리된 값). 잘못 적힌 값은 폴더 없음으로 본다. */
export function folderOf(meta) { try { return normFolder(meta?.folder ?? ""); } catch { return ""; } }

/**
 * 폴더 트리 정보: 만든 폴더 + 프리셋이 들어 있는 폴더(위 폴더 포함).
 * @returns {{ folders: string[], counts: Record<string, number>, direct: Record<string, number>, unfiled: number, total: number }}
 *   counts는 하위 폴더까지 합친 수, direct는 그 폴더 바로 안의 수.
 */
export function folderTree(lib, entries) {
  const set = new Set();
  for (const f of readFolderFile(lib)) for (const a of withAncestors(f)) set.add(a);
  const counts = {}, direct = {};
  let unfiled = 0;
  for (const e of entries) {
    const f = folderOf(e);
    if (!f) { unfiled++; continue; }
    direct[f] = (direct[f] ?? 0) + 1;
    for (const a of withAncestors(f)) { set.add(a); counts[a] = (counts[a] ?? 0) + 1; }
  }
  const folders = [...set].sort((a, b) => a.localeCompare(b, "ko"));
  return { folders, counts, direct, unfiled, total: entries.length };
}

function readMeta(lib, id) {
  const p = join(lib, id, "meta.json");
  if (!id || id.startsWith(".") || /[\\/]/.test(id) || !existsSync(p)) throw fail(`없는 프리셋: ${id}`, 404);
  return { p, meta: JSON.parse(readFileSync(p, "utf8")) };
}
function writeMeta(p, meta) { writeFileSync(p, JSON.stringify(meta, null, 2) + "\n"); }

export function addFolder(lib, path) {
  const f = normFolder(path);
  if (!f) throw fail("폴더 이름이 필요합니다.");
  const list = readFolderFile(lib);
  if (list.includes(f)) return { folder: f, created: false };
  writeFolderFile(lib, [...list, f]);
  return { folder: f, created: true };
}

/** 프리셋 여러 개를 한 폴더로 옮긴다. folder ""는 폴더 없음. 바뀐 id 목록을 돌려준다. */
export function moveItems(lib, ids, folder) {
  const f = normFolder(folder);
  if (!Array.isArray(ids) || !ids.length) throw fail("옮길 프리셋이 없습니다.");
  const metas = ids.map((id) => readMeta(lib, id));   // 하나라도 없으면 아무것도 바꾸지 않는다
  const moved = [];
  for (const { p, meta } of metas) {
    if (folderOf(meta) === f) continue;
    if (f) meta.folder = f; else delete meta.folder;
    writeMeta(p, meta);
    moved.push(meta.id);
  }
  if (f) { const list = readFolderFile(lib); if (!list.includes(f)) writeFolderFile(lib, [...list, f]); }
  return { folder: f, moved };
}

/** 폴더 이름 바꾸기·옮기기: from 아래 모든 폴더와 프리셋의 경로 앞부분을 to로 바꾼다. */
export function renameFolder(lib, entries, from, to) {
  const a = normFolder(from), b = normFolder(to);
  if (!a || !b) throw fail("바꿀 폴더와 새 이름이 필요합니다.");
  if (a === b) return { from: a, to: b, moved: [] };
  if (inside(b, a)) throw fail("폴더를 자기 안으로 옮길 수 없습니다.");
  const tree = folderTree(lib, entries);
  if (!tree.folders.includes(a)) throw fail(`없는 폴더: ${a}`, 404);
  if (tree.folders.includes(b)) throw fail(`이미 있는 폴더: ${b}`, 409);
  const swap = (p) => b + p.slice(a.length);
  const moved = [];
  for (const e of entries) {
    const f = folderOf(e);
    if (!f || !inside(f, a)) continue;
    const { p, meta } = readMeta(lib, e.id);
    meta.folder = swap(f);
    writeMeta(p, meta);
    moved.push(e.id);
  }
  writeFolderFile(lib, readFolderFile(lib).map((p) => inside(p, a) ? swap(p) : p).concat(b));
  return { from: a, to: b, moved };
}

/** 폴더 지우기: 안의 프리셋과 하위 폴더는 한 단계 위로 올린다. */
export function removeFolder(lib, entries, path) {
  const a = normFolder(path);
  if (!a) throw fail("지울 폴더가 필요합니다.");
  const up = parentOf(a);
  const lift = (p) => (up ? up + "/" : "") + p.slice(a.length + 1);   // a/x/y → up/x/y
  const moved = [];
  for (const e of entries) {
    const f = folderOf(e);
    if (!f || !inside(f, a)) continue;
    const next = f === a ? up : lift(f);
    const { p, meta } = readMeta(lib, e.id);
    if (next) meta.folder = next; else delete meta.folder;
    writeMeta(p, meta);
    moved.push(e.id);
  }
  writeFolderFile(lib, readFolderFile(lib).filter((p) => p !== a).map((p) => inside(p, a) ? lift(p) : p));
  return { folder: a, parent: up, moved };
}

/**
 * 폴더가 없는 프리셋에 폴더를 제안한다: 이름이 어떤 태그로 시작하면 그 태그를 폴더로(예: 태그 "잿빛 등대" + 이름 "잿빛 등대 슬롯 버튼").
 * @returns {{ folder: string, ids: string[] }[]} 많은 순
 */
export function suggestFolders(entries) {
  const by = new Map();
  for (const e of entries) {
    if (folderOf(e)) continue;
    const name = String(e.name ?? "").normalize("NFC").toLowerCase();
    const tag = [...(e.tags ?? [])].sort((x, y) => y.length - x.length)
      .find((t) => { const s = String(t).normalize("NFC").toLowerCase(); return s && name.startsWith(s) && (name.length === s.length || /[\s\-_·]/.test(name[s.length])); });
    if (!tag) continue;
    let f; try { f = normFolder(tag); } catch { continue; }
    if (!f) continue;
    if (!by.has(f)) by.set(f, []);
    by.get(f).push(e.id);
  }
  return [...by].map(([folder, ids]) => ({ folder, ids })).sort((a, b) => b.ids.length - a.ids.length || a.folder.localeCompare(b.folder, "ko"));
}

export function applySuggestions(lib, entries) {
  const out = [];
  for (const s of suggestFolders(entries)) out.push(moveItems(lib, s.ids, s.folder));
  return out;
}
