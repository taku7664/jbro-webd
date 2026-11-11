// editor-server.mjs — 라이브러리 목록·편집기·내보내기를 내주는 로컬 서버. 의존성 없음, Node 18+.
//
// 왜 서버인가: file:// 로 연 페이지는 iframe 안쪽 문서를 만질 수 없고(Chromium에서 contentDocument가 null), 파일도 쓸 수 없다.
// 그래서 127.0.0.1에만 열리는 작은 서버가 목록·편집 화면·컴포넌트를 같은 출처로 내주고, 저장은 library.mjs의 save 경로로 한다.
//
// 두 가지로 연다:
//   startLibrary({ lib })     라이브러리 전체. 목록(/lib/)에서 카드를 누르면 편집기(/edit/<id>)가 열린다.  ← library.mjs open·edit
//   startEditor({ lib, id })  항목 하나만 읽고 쓴다(예전 방식, 다른 id는 404).
//
// 안전:
//   - 127.0.0.1에만 바인딩하고, Host 머리글이 127.0.0.1:<포트> 또는 localhost:<포트>가 아니면 거절(DNS 리바인딩 차단).
//     lan: true(library.mjs open --lan)일 때만 모든 주소(0.0.0.0)에 열고, 이 PC의 사설 IPv4 주소(192.168.x 등):<포트>도 Host로 받는다.
//     같은 와이파이의 다른 기기가 접속할 수 있게 되므로 토큰을 아는 사람만 들어온다. 공용 와이파이에서는 쓰지 않는다.
//   - 실행마다 새로 만드는 토큰이 있어야 한다. 주소의 ?t= 로 처음 열면 같은 토큰을 HttpOnly·SameSite=Strict 쿠키로 남겨
//     목록 → 편집기 이동에 토큰을 다시 붙이지 않는다. API는 x-webd-token 머리글이나 쿠키로 확인한다.
//   - POST는 Origin이 있으면 같은 서버여야 한다.
//
// 경로:
//   GET  /                         → /lib/ (라이브러리) 또는 /edit/<id> (항목 하나)
//   GET  /lib/                     목록(라이브러리 모드)
//   GET  /edit/<id>                편집 화면
//   GET  /assets/<파일>            편집 화면 코드(editor/ 폴더)
//   GET  /lib/<id>/<파일>          컴포넌트 파일(미리보기 iframe용, 읽기 전용, 점으로 시작하는 파일 제외)
//   GET  /api/<id>                 { meta, html, hash, draft, library }
//   POST /api/<id>/save            { html, baseHash, force? } → 새 버전 저장(history 유지). 파일이 그새 바뀌었으면 409
//   POST /api/<id>/draft           { …변경 내역 } 또는 null → <id>/.draft.json 쓰기/지우기
//   GET  /api/<id>/events          SSE. component.html이 바뀌면 { hash } 를 보냄
//   GET  /api/<id>/export-spec     { spec, saved, dir, defaultDir }
//   POST /api/<id>/export-spec     { spec } → <id>/export.json 저장
//   POST /api/<id>/export          { spec, html?, write } → write면 폴더에 PNG·JSON을 쓰고, 아니면 미리보기(data URL)만
//   POST /api/<id>/reveal          내보낸 폴더를 파일 탐색기로 연다
//   GET  /api/<id>/history         이전 버전 목록 { versions: [{ file, at, bytes }] } (새것부터)
//   POST /api/<id>/restore         { file } 그 버전을 새 버전으로 다시 저장(지금 파일은 history에 남음)
//   POST /api/<id>/duplicate       { html?, name? } 새 프리셋으로 복제(폴더·종류·태그·내보내기 설정 따라감, 라이브러리 모드만)
//   POST /items/remove             { ids } 휴지통(<라이브러리>/.trash/)으로 옮기기(라이브러리 모드만)
//   GET  /folders                  가상 폴더 트리 { folders, counts, direct, unfiled, total, suggestions }
//   POST /folders/add              { path } 빈 폴더 만들기
//   POST /folders/rename           { from, to } 폴더 이름 바꾸기·옮기기(안의 프리셋 경로도 함께)
//   POST /folders/remove           { path } 폴더 지우기(안의 프리셋·하위 폴더는 한 단계 위로)
//   POST /folders/move             { ids, folder } 프리셋을 폴더로 옮기기(folder ""는 폴더 없음)
//   POST /folders/suggest          이름이 태그로 시작하는 폴더 없는 프리셋을 그 태그 폴더로 옮기기
//   GET  /atlas/                   묶음 시트 목록 { atlases, maxSizes }  (라이브러리 모드만)
//   POST /atlas/<이름>             { atlas } → <라이브러리>/.atlases/<이름>.json 저장
//   POST /atlas/<이름>/remove      묶음 정의 지우기(내보낸 파일은 그대로)
//   POST /atlas/<이름>/export      { atlas?, write } → write면 폴더에 쓰고, 아니면 미리보기(data URL)만
//   POST /atlas/<이름>/reveal      묶음 출력 폴더 열기

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, watch, statSync, readdirSync } from "node:fs";
import { join, dirname, normalize, extname, sep } from "node:path";
import { tmpdir, networkInterfaces } from "node:os";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { save, remove, loadEntries, detectBackground, CATEGORIES, localIso, writeIndex } from "./library.mjs";
import { folderTree, suggestFolders, addFolder, renameFolder, removeFolder, moveItems, applySuggestions } from "./folders.mjs";
import { renderGallery } from "./gallery.mjs";
import { normalizeSpec, defaultSpec, outputDir, defaultExportRoot } from "./export/spec.mjs";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "editor");
const CLI = join(dirname(fileURLToPath(import.meta.url)), "library.mjs");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".woff": "font/woff", ".woff2": "font/woff2",
};
const MAX_BODY = 5 * 1024 * 1024;
const RENDER_PREFIX = "__webd_render_";

export const hashOf = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** 항목 하나만 편집하는 서버(예전 방식). 반환: Promise<{ url, port, token, close() }> */
export function startEditor({ lib, id, port = 0, token, capturer }) {
  if (!existsSync(join(lib, id, "meta.json")) || !existsSync(join(lib, id, "component.html"))) {
    const e = new Error(`없는 항목: ${id}`); e.code = 3; return Promise.reject(e);
  }
  return startServer({ lib, only: id, port, token, capturer });
}

/** 라이브러리 전체 서버. 반환: Promise<{ url(목록), editUrl(id), port, token, close() }> */
export function startLibrary({ lib, port = 0, token, capturer, lan = false, listenHost }) {
  return startServer({ lib, only: null, port, token, capturer, lan, listenHost });
}

/** 이 PC의 사설 IPv4 주소들(같은 와이파이에서 폰이 접속할 주소) */
export function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) {
    if (a.family !== "IPv4" || a.internal) continue;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) out.push(a.address);
  }
  return out;
}

function startServer({ lib, only, port, token = randomBytes(16).toString("hex"), capturer: injected, lan = false, listenHost }) {
  const lanIps = lan ? lanAddresses() : [];
  const host = listenHost ?? (lan ? "0.0.0.0" : "127.0.0.1");   // listenHost는 시험용(127.0.0.1에 묶은 채 lan 동작 확인)
  const exists = (id) => typeof id === "string" && id && !id.startsWith(".") && !/[\\/]/.test(id) && existsSync(join(lib, id, "meta.json")) && existsSync(join(lib, id, "component.html"));
  const allowed = (id) => (only ? id === only : true) && exists(id);
  const watchers = new Map();   // id → { clients:Set, lastHash, watcher, timer }
  const renders = new Map();    // key → { id, html, at }
  let capturer = injected ?? null;
  let capturerLoading = null;
  const getCapturer = () => capturer ? Promise.resolve(capturer)
    : capturerLoading ??= import("./export/capture.mjs").then((m) => (capturer = m.createCapturer()));

  function channel(id) {
    let ch = watchers.get(id);
    if (ch) return ch;
    const dir = join(lib, id), file = join(dir, "component.html");
    ch = { clients: new Set(), lastHash: hashOf(readFileSync(file, "utf8")), timer: null };
    ch.watcher = watch(dir, (_ev, name) => {
      if (name && name !== "component.html") return;
      clearTimeout(ch.timer);
      ch.timer = setTimeout(() => {
        let h; try { h = hashOf(readFileSync(file, "utf8")); } catch { return; }
        if (h === ch.lastHash) return;
        ch.lastHash = h;
        for (const res of ch.clients) res.write(`data: ${JSON.stringify({ hash: h })}\n\n`);
      }, 150);
    });
    watchers.set(id, ch);
    return ch;
  }
  if (only) channel(only);
  const ping = setInterval(() => { for (const ch of watchers.values()) for (const res of ch.clients) res.write(": ping\n\n"); }, 25000);

  const server = createServer(async (req, res) => {
    const addr = server.address();
    const okHosts = [`127.0.0.1:${addr.port}`, `localhost:${addr.port}`, ...lanIps.map((ip) => `${ip}:${addr.port}`)];
    if (!okHosts.includes(req.headers.host)) return send(res, 403, "잘못된 Host");
    const url = new URL(req.url, `http://${req.headers.host}`);
    const parts = url.pathname.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return "\0"; } });
    const cookieName = `webd_${addr.port}`;
    const same = (t) => { const a = Buffer.from(String(t ?? "")), b = Buffer.from(token); return a.length === b.length && timingSafeEqual(a, b); };
    const cookieToken = () => (req.headers.cookie || "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === cookieName)?.[1];
    const authed = () => same(req.headers["x-webd-token"]) || same(url.searchParams.get("t")) || same(cookieToken());
    const page = (file) => {
      const headers = {};
      if (same(url.searchParams.get("t"))) headers["set-cookie"] = `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict`;
      return sendFile(res, file, headers);
    };
    try {
      if (req.method === "GET" && parts.length === 0) {
        res.writeHead(302, { location: only ? `/edit/${encodeURIComponent(only)}${url.search}` : `/lib/${url.search}`, "cache-control": "no-store" }).end();
        return;
      }
      if (req.method === "GET" && parts[0] === "edit" && parts.length === 2) {
        if (!authed()) return send(res, 403, "토큰이 없거나 다릅니다. 터미널에 나온 주소로 여세요.");
        if (!allowed(parts[1])) return send(res, 404, "없는 항목");
        return page(join(ASSETS, "editor.html"));
      }
      if (req.method === "GET" && parts[0] === "assets" && parts.length === 2) return sendInside(res, ASSETS, parts[1]);
      if (req.method === "GET" && parts[0] === "lib" && parts.length === 1) {
        if (only) return send(res, 404, "이 서버는 항목 하나만 엽니다. library.mjs open으로 여세요.");
        if (!authed()) return send(res, 403, "토큰이 없거나 다릅니다. 터미널에 나온 주소로 여세요.");
        if (!url.pathname.endsWith("/")) { res.writeHead(301, { location: `/lib/${url.search}` }).end(); return; }
        const html = galleryHtml(lib);
        const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
        if (same(url.searchParams.get("t"))) headers["set-cookie"] = `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict`;
        res.writeHead(200, headers).end(html);
        return;
      }
      if (req.method === "GET" && parts[0] === "lib" && parts.length >= 3) {
        // 같은 와이파이로 연 경우, 이 PC 밖에서 온 요청은 컴포넌트 파일도 토큰(쿠키)이 있어야 준다(내보내기용 브라우저는 127.0.0.1)
        const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
        if (lan && !local && !authed()) return send(res, 403, "토큰이 없거나 다릅니다.");
        const id = parts[1];
        if (!allowed(id)) return send(res, 404, "없음");
        const rest = parts.slice(2);
        if (rest.length === 1 && rest[0].startsWith(RENDER_PREFIX)) {
          const r = renders.get(rest[0].slice(RENDER_PREFIX.length).replace(/\.html$/, ""));
          if (!r || r.id !== id) return send(res, 404, "없음");
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(r.html);
          return;
        }
        if (rest.some((p) => p.startsWith("."))) return send(res, 404, "없음");
        return sendInside(res, join(lib, id), rest.join("/"));
      }
      if (parts[0] === "items" && parts[1] === "remove" && parts.length === 2) {
        // 휴지통으로(라이브러리 모드만): <라이브러리>/.trash/로 옮긴다. 바로 지우지 않는다.
        if (only) return send(res, 404, "이 서버는 항목 하나만 엽니다.");
        if (!authed()) return send(res, 403, "토큰이 없거나 다릅니다.");
        if (req.method !== "POST") return send(res, 404, "없음");
        const origin = req.headers.origin;
        if (origin && !okHosts.some((h) => origin === `http://${h}`)) return send(res, 403, "다른 출처");
        const body = (await readJson(req)) ?? {};
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        if (!ids.length) return json(res, 400, { error: "지울 프리셋이 없습니다." });
        if (ids.some((x) => !x || x.startsWith(".") || /[\\/]/.test(x) || !existsSync(join(lib, x, "meta.json")))) return json(res, 404, { error: "없는 프리셋이 섞여 있습니다." });
        const moved = ids.map((x) => ({ id: x, trash: remove(lib, x) }));
        return json(res, 200, { removed: moved.map((m) => m.id) });
      }
      if (parts[0] === "folders") {
        // 가상 폴더(라이브러리 모드만). 바꾼 뒤에는 파일로 여는 index.html도 다시 만든다.
        if (only) return send(res, 404, "이 서버는 항목 하나만 엽니다.");
        if (!authed()) return send(res, 403, "토큰이 없거나 다릅니다.");
        if (req.method === "GET" && parts.length === 1) { const entries = loadEntries(lib); return json(res, 200, { ...folderTree(lib, entries), suggestions: suggestFolders(entries) }); }
        if (req.method !== "POST" || parts.length !== 2) return send(res, 404, "없음");
        const origin = req.headers.origin;
        if (origin && !okHosts.some((h) => origin === `http://${h}`)) return send(res, 403, "다른 출처");
        const body = (await readJson(req)) ?? {};
        const entries = loadEntries(lib);
        let out;
        try {
          if (parts[1] === "add") out = addFolder(lib, body.path);
          else if (parts[1] === "rename") out = renameFolder(lib, entries, body.from, body.to);
          else if (parts[1] === "remove") out = removeFolder(lib, entries, body.path);
          else if (parts[1] === "move") out = moveItems(lib, body.ids, body.folder ?? "");
          else if (parts[1] === "suggest") out = { applied: applySuggestions(lib, entries) };
          else return send(res, 404, "없음");
        } catch (e) { return json(res, e.status ?? 400, { error: e.message }); }
        writeIndex(lib);
        const after = loadEntries(lib);
        return json(res, 200, { ...out, tree: folderTree(lib, after) });
      }
      if (parts[0] === "atlas") {
        if (only) return send(res, 404, "이 서버는 항목 하나만 엽니다.");
        if (!authed()) return send(res, 403, "토큰이 없거나 다릅니다.");
        if (req.method === "POST") {
          const origin = req.headers.origin;
          if (origin && !okHosts.some((h) => origin === `http://${h}`)) return send(res, 403, "다른 출처");
        }
        const A = await import("./export/atlas.mjs");
        const withDir = (a) => ({ ...a, outDir: A.atlasOutputDir(a, lib) });
        if (req.method === "GET" && parts.length === 1) return json(res, 200, { atlases: A.listAtlases(lib).map(withDir), maxSizes: A.MAX_SIZES });
        const name = parts[1], action = parts[2] ?? "";
        if (!name || name.startsWith(".") || /[\/]/.test(name)) return send(res, 404, "없음");
        const load = (input) => {
          const prev = A.readAtlas(lib, name);
          const { atlas, warnings } = A.normalizeAtlas({ ...(input ?? prev ?? {}), name }, { exists });
          if (prev?.lastExport && !atlas.lastExport) atlas.lastExport = prev.lastExport;
          return { atlas, warnings, prev };
        };
        if (req.method === "POST" && action === "") {
          const body = await readJson(req);
          const { atlas, warnings } = load(body?.atlas ?? {});
          A.writeAtlas(lib, atlas);
          return json(res, 200, { atlas: withDir(atlas), warnings });
        }
        if (req.method === "POST" && action === "remove") { A.removeAtlas(lib, name); return json(res, 200, { ok: true }); }
        if (req.method === "POST" && action === "reveal") {
          const { atlas } = load(null);
          const out = A.atlasOutputDir(atlas, lib);
          if (!existsSync(out)) return json(res, 404, { error: "아직 내보낸 파일이 없습니다.", dir: out });
          revealFolder(out);
          return json(res, 200, { ok: true, dir: out });
        }
        if (req.method === "POST" && action === "export") {
          const body = await readJson(req);
          const { atlas, warnings: aw, prev } = load(body?.atlas ?? null);
          if (!prev && !body?.atlas) return json(res, 404, { error: "없는 묶음입니다." });
          const preview = !body?.write;
          const { writeExport } = await import("./export/run.mjs");
          const cap = await getCapturer();
          const run = await A.buildAtlas({
            capture: cap.capture, atlas, scales: preview ? [atlas.scales[atlas.scales.length - 1]] : atlas.scales, fastPng: preview,
            member: (mid) => ({ url: `http://127.0.0.1:${addr.port}/lib/${encodeURIComponent(mid)}/component.html`, spec: A.memberSpec(lib, mid), meta: JSON.parse(readFileSync(join(lib, mid, "meta.json"), "utf8")) }),
          });
          const warnings = [...aw, ...run.warnings];
          const pngData = (n) => "data:image/png;base64," + run.files.find((f) => f.name === n).bytes.toString("base64");
          const previews = run.previews.map((p) => ({ ...p, url: pngData(p.png) }));
          if (preview) return json(res, 200, { preview: true, previews, warnings, files: run.files.map(fileInfo) });
          const out = A.atlasOutputDir(atlas, lib);
          writeExport(out, run.files);
          const lastExport = { at: localIso(), dir: out, files: run.files.map((f) => f.name) };
          A.writeAtlas(lib, { ...atlas, lastExport });
          return json(res, 200, { preview: false, dir: out, previews, warnings, files: run.files.map(fileInfo), lastExport });
        }
        return send(res, 404, "없음");
      }
      if (parts[0] === "api" && parts.length >= 2) {
        const id = parts[1];
        if (!authed()) return send(res, 403, "토큰이 없거나 다릅니다.");
        if (!allowed(id)) return send(res, 404, "없음");
        if (req.method === "POST") {
          // 다른 출처 페이지가 보낸 요청은 거절(Origin이 있으면 같은 서버여야 함)
          const origin = req.headers.origin;
          if (origin && !okHosts.some((h) => origin === `http://${h}`)) return send(res, 403, "다른 출처");
        }
        const dir = join(lib, id), file = join(dir, "component.html"), draftPath = join(dir, ".draft.json"), specPath = join(dir, "export.json");
        const action = parts[2] ?? "";
        if (req.method === "GET" && action === "") {
          const html = readFileSync(file, "utf8");
          const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
          let draft = null;
          if (existsSync(draftPath)) { try { draft = JSON.parse(readFileSync(draftPath, "utf8")); } catch {} }
          return json(res, 200, { meta, html, hash: hashOf(html), draft, library: !only });
        }
        if (req.method === "GET" && action === "events") {
          const ch = channel(id);
          res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
          res.write(`data: ${JSON.stringify({ hash: ch.lastHash, hello: true })}\n\n`);
          ch.clients.add(res);
          req.on("close", () => ch.clients.delete(res));
          return;
        }
        if (req.method === "POST" && action === "save") {
          const body = await readJson(req);
          if (typeof body?.html !== "string" || !/<html[\s>]/i.test(body.html)) return json(res, 400, { error: "html이 없거나 완성된 문서가 아닙니다." });
          const current = readFileSync(file, "utf8");
          if (!body.force && body.baseHash !== hashOf(current)) return json(res, 409, { error: "편집을 시작한 뒤 파일이 바뀌었습니다.", hash: hashOf(current) });
          const tmp = mkdtempSync(join(tmpdir(), "webd-edit-"));
          try {
            const p = join(tmp, "component.html");
            writeFileSync(p, body.html);
            const r = save(lib, { file: p, id });
            const html = readFileSync(file, "utf8");
            const ch = watchers.get(id); if (ch) ch.lastHash = hashOf(html);
            if (existsSync(draftPath)) rmSync(draftPath, { force: true });
            return json(res, 200, { meta: r.meta, html, hash: hashOf(html) });
          } finally { rmSync(tmp, { recursive: true, force: true }); }
        }
        if (req.method === "POST" && action === "draft") {
          const body = await readJson(req);
          if (body === null) { rmSync(draftPath, { force: true }); return json(res, 200, { ok: true, removed: true }); }
          if (typeof body !== "object" || !Array.isArray(body.styles)) return json(res, 400, { error: "styles 배열이 필요합니다." });
          writeFileSync(draftPath, JSON.stringify({ ...body, id }, null, 2) + "\n");
          return json(res, 200, { ok: true });
        }
        if (req.method === "GET" && action === "history") {
          // 이전 버전 목록(새것부터). 파일 이름은 저장 시각이다.
          const hist = join(dir, "history");
          const files = existsSync(hist) ? readdirSync(hist).filter((f) => /\.html$/i.test(f) && !f.startsWith(".")).sort().reverse() : [];
          return json(res, 200, { versions: files.map((f) => ({ file: f, at: historyTime(f), bytes: statSync(join(hist, f)).size })) });
        }
        if (req.method === "POST" && action === "restore") {
          // 이전 버전을 새 버전으로 다시 저장한다(지금 파일도 history에 남으므로 되돌릴 수 있다)
          const body = await readJson(req);
          const name = String(body?.file ?? "");
          if (!/^[^\\/]+\.html$/i.test(name) || name.startsWith(".")) return json(res, 400, { error: "버전 파일 이름이 잘못됐습니다." });
          const p = join(dir, "history", name);
          if (!existsSync(p)) return json(res, 404, { error: "없는 버전입니다." });
          const r = save(lib, { file: p, id });
          const html = readFileSync(file, "utf8");
          const ch = watchers.get(id); if (ch) ch.lastHash = hashOf(html);
          if (existsSync(draftPath)) rmSync(draftPath, { force: true });
          return json(res, 200, { meta: r.meta, html, hash: hashOf(html), restored: name });
        }
        if (req.method === "POST" && action === "duplicate") {
          // 복제해서 새 프리셋으로: 지금 화면 내용(html)이 오면 그것으로, 없으면 저장된 파일로. 폴더·종류·태그·내보내기 설정을 따라간다.
          if (only) return json(res, 400, { error: "항목 하나만 여는 서버에서는 복제할 수 없습니다." });
          const body = (await readJson(req)) ?? {};
          const html = typeof body.html === "string" && /<html[\s>]/i.test(body.html) ? body.html : readFileSync(file, "utf8");
          const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
          const tmp = mkdtempSync(join(tmpdir(), "webd-dup-"));
          try {
            const p = join(tmp, "component.html");
            writeFileSync(p, html);
            const name = String(body.name || `${meta.name} 사본`).trim().slice(0, 120);
            const vp = meta.viewport ? `${meta.viewport.width}x${meta.viewport.height}` : undefined;
            const r = save(lib, { file: p, name, category: meta.category, kind: meta.kind, folder: meta.folder ?? "", tags: (meta.tags || []).join(","), desc: meta.description, style: meta.style, viewport: vp, project: meta.source?.project, source: meta.source?.file });
            if (existsSync(specPath)) {
              try { const s = JSON.parse(readFileSync(specPath, "utf8")); delete s.lastExport; writeFileSync(join(lib, r.meta.id, "export.json"), JSON.stringify(s, null, 2) + "\n"); } catch {}
            }
            return json(res, 200, { meta: r.meta });
          } finally { rmSync(tmp, { recursive: true, force: true }); }
        }
        if (action === "export-spec") {
          if (req.method === "GET") {
            let saved = null;
            if (existsSync(specPath)) { try { saved = JSON.parse(readFileSync(specPath, "utf8")); } catch {} }
            let spec;
            try { spec = saved ? normalizeSpec(saved, id).spec : defaultSpec(id); } catch { spec = defaultSpec(id); }
            return json(res, 200, { spec, saved: Boolean(saved), dir: outputDir(spec, lib, id), defaultDir: join(defaultExportRoot(lib), id), lastExport: saved?.lastExport ?? null });
          }
          if (req.method === "POST") {
            const body = await readJson(req);
            const { spec, warnings } = normalizeSpec(body?.spec, id);
            writeSpec(specPath, spec);
            return json(res, 200, { spec, warnings, dir: outputDir(spec, lib, id) });
          }
        }
        if (req.method === "POST" && action === "export") {
          const body = await readJson(req);
          const { spec, warnings } = normalizeSpec(body?.spec, id);
          const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
          let key = null, docUrl = `http://127.0.0.1:${addr.port}/lib/${encodeURIComponent(id)}/component.html`;
          if (typeof body?.html === "string") {
            if (!/<html[\s>]/i.test(body.html)) return json(res, 400, { error: "html이 완성된 문서가 아닙니다." });
            key = randomBytes(12).toString("hex");
            renders.set(key, { id, html: body.html, at: Date.now() });
            docUrl = `http://127.0.0.1:${addr.port}/lib/${encodeURIComponent(id)}/${RENDER_PREFIX}${key}.html`;
          }
          const preview = !body?.write;
          try {
            const { buildExport, writeExport } = await import("./export/run.mjs");
            const cap = await getCapturer();
            const run = await buildExport({
              capture: cap.capture, url: docUrl, viewport: meta.viewport, warnings,
              spec: preview ? { ...spec, scales: [spec.scales[spec.scales.length - 1]] } : spec,
              source: { id, name: meta.name, version: meta.versions }, fastPng: preview,
            });
            const { encodePng } = await import("./export/png.mjs");
            const pngData = (name) => "data:image/png;base64," + run.files.find((f) => f.name === name).bytes.toString("base64");
            // 상태별 프레임도 한 장씩 보여 준다(시트 한 장으로는 어느 칸이 무슨 상태인지 알기 어렵다)
            // 애니메이션이면 프레임 그림을 모두 보내 편집기에서 재생해 본다
            const previews = run.previews.map((p) => ({ ...p, url: pngData(p.png), frames: (p.frames || []).map((f) => ({
              key: f.key, label: f.label, fps: f.fps, size: { w: f.images[0].width, h: f.images[0].height },
              urls: f.images.map((im) => "data:image/png;base64," + encodePng(im, { fast: true }).toString("base64")),
            })) }));
            if (preview) return json(res, 200, { preview: true, previews, warnings: run.warnings, files: run.files.map(fileInfo) });
            const out = outputDir(spec, lib, id);
            writeExport(out, run.files);
            const lastExport = { at: localIso(), dir: out, files: run.files.map((f) => f.name), version: meta.versions };
            writeSpec(specPath, { ...spec, lastExport });
            return json(res, 200, { preview: false, dir: out, previews, warnings: run.warnings, files: run.files.map(fileInfo), lastExport });
          } finally { if (key) renders.delete(key); }
        }
        if (req.method === "POST" && action === "reveal") {
          let spec = defaultSpec(id);
          if (existsSync(specPath)) { try { spec = normalizeSpec(JSON.parse(readFileSync(specPath, "utf8")), id).spec; } catch {} }
          const out = outputDir(spec, lib, id);
          if (!existsSync(out)) return json(res, 404, { error: "아직 내보낸 파일이 없습니다.", dir: out });
          revealFolder(out);
          return json(res, 200, { ok: true, dir: out });
        }
      }
      return send(res, 404, "없음");
    } catch (e) {
      return json(res, e.status ?? 500, { error: e.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", (e) => { closeWatchers(); clearInterval(ping); reject(e); });
    server.listen(port, host, () => {
      const p = server.address().port;
      const base = `http://127.0.0.1:${p}`;
      resolve({
        port: p, token, lanHosts: lanIps.map((ip) => `${ip}:${p}`),
        url: only ? `${base}/edit/${encodeURIComponent(only)}?t=${token}` : `${base}/lib/?t=${token}`,
        editUrl: (id) => `${base}/edit/${encodeURIComponent(id)}?t=${token}`,
        close: () => new Promise((r) => {
          closeWatchers(); clearInterval(ping);
          server.close(() => r());
          server.closeAllConnections?.();
        }).then(() => capturer?.close()),
      });
    });
  });

  function closeWatchers() {
    for (const ch of watchers.values()) { ch.watcher.close(); clearTimeout(ch.timer); for (const c of ch.clients) c.end(); }
    watchers.clear();
  }
}

function galleryHtml(lib) {
  const entries = loadEntries(lib).map((e) => {
    const html = readFileSync(join(lib, e.id, "component.html"), "utf8");
    const background = "background" in e ? e.background : detectBackground(html);
    return { ...e, background, html, path: join(lib, e.id, "component.html") };
  });
  return renderGallery(entries, { libPath: lib, generatedAt: localIso(), categories: CATEGORIES, cli: CLI, server: true, tree: folderTree(lib, entries), suggestions: suggestFolders(entries) });
}

/** history 파일 이름(2026-11-11T115032+0900.html, 같은 초면 -2)을 읽기 쉬운 시각으로 */
function historyTime(f) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})/.exec(f);
  return m ? `${m[1]} ${m[2]}:${m[3]}:${m[4]}` : f.replace(/\.html$/i, "");
}
function writeSpec(path, spec) { writeFileSync(path, JSON.stringify(spec, null, 2) + "\n"); }
function fileInfo(f) { return { name: f.name, kind: f.kind, scale: f.scale, size: f.size ?? null, bytes: f.bytes.length }; }

function revealFolder(dir) {
  const [cmd, args] = process.platform === "win32" ? ["explorer.exe", [dir]] : process.platform === "darwin" ? ["open", [dir]] : ["xdg-open", [dir]];
  try { spawn(cmd, args, { stdio: "ignore", detached: true }).unref(); } catch {}
}

function send(res, status, text) { res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }).end(text); }
function json(res, status, obj) { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(obj)); }
function sendFile(res, p, headers = {}) {
  res.writeHead(200, { "content-type": TYPES[extname(p).toLowerCase()] || "application/octet-stream", "cache-control": "no-store", ...headers });
  res.end(readFileSync(p));
}
function sendInside(res, root, rel) {
  const p = normalize(join(root, rel));
  if (!(p + sep).startsWith(normalize(root) + sep) || p === normalize(root)) return send(res, 403, "범위 밖");
  if (!existsSync(p) || !statSync(p).isFile()) return send(res, 404, "없음");
  return sendFile(res, p);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { const e = new Error("요청이 너무 큽니다."); e.status = 413; reject(e); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null")); } catch { const e = new Error("JSON이 아닙니다."); e.status = 400; reject(e); } });
    req.on("error", reject);
  });
}
